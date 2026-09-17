import { api } from './api.js';
import { icons } from './icons.js';
import { acting } from './store.js';
import { socketComposing } from './socket.js';
import { now, relative, stamp, toLocalInput, fromLocalInput, describeOffset, offsetMs } from './time.js';
import { avatarHTML, el, esc, errorToast, openModal, toast } from './ui.js';

const MAX_SOFT = 280;

/* ------------------------------------------------------------------ *
 * time picker
 * ------------------------------------------------------------------ */
export function openTimePicker(currentMs, { title = 'Choose when this was posted' } = {}) {
  return new Promise((resolve) => {
    let value = currentMs;
    let custom = true;

    const body = el(`<div>
      <div class="card" style="margin-bottom:14px">
        <div class="card-body">
          <div class="section-title" style="margin-top:0">Current moment</div>
          <div class="clock-now" data-now-label></div>
          <div class="clock-offset muted" data-offset-label></div>
        </div>
      </div>

      <div class="row tight" style="margin-bottom:14px">
        <button class="btn sm ghost" data-quick="-3600000">−1h</button>
        <button class="btn sm ghost" data-quick="-86400000">−1d</button>
        <button class="btn sm ghost" data-quick="-604800000">−1w</button>
        <button class="btn sm ghost" data-quick="-2629800000">−1mo</button>
        <button class="btn sm ghost" data-quick="-31557600000">−1y</button>
        <button class="btn sm" data-use-now>Use current moment</button>
      </div>

      <label class="field">
        <span>Or an exact date &amp; time</span>
        <input class="input" type="datetime-local" data-dt>
      </label>
      <div class="hint" data-hint></div>

      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn ghost" data-cancel>Cancel</button>
        <button class="btn" data-ok>Use this time</button>
      </div>
    </div>`);

    const dt = body.querySelector('[data-dt]');
    const hint = body.querySelector('[data-hint]');

    const sync = () => {
      dt.value = toLocalInput(value);
      const n = now();
      const diff = value - n;
      const when = diff < 0 ? `${describeOffset(diff)} from now` : diff > 0 ? `${describeOffset(diff)} ahead of now` : 'right now';
      hint.textContent = `${stamp(value)} — ${when}`;
      hint.style.color = diff > 0 ? 'var(--gold)' : 'var(--text-dim)';
    };

    const tickLabels = () => {
      body.querySelector('[data-now-label]').textContent = `${stamp(now())}`;
      const off = offsetMs();
      body.querySelector('[data-offset-label]').textContent = off
        ? `Timeline is ${describeOffset(off)} from real time`
        : 'Timeline is following real time';
    };

    tickLabels();
    sync();
    const iv = setInterval(tickLabels, 1000);

    dt.addEventListener('input', () => {
      const ms = fromLocalInput(dt.value);
      if (ms) {
        value = ms;
        sync();
      }
    });
    body.querySelector('[data-use-now]').addEventListener('click', () => {
      value = now();
      sync();
    });
    body.querySelectorAll('[data-quick]').forEach((b) =>
      b.addEventListener('click', () => {
        value = now() + Number(b.dataset.quick);
        sync();
      })
    );

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(iv);
      resolve(result);
      modal.close();
    };
    body.querySelector('[data-cancel]').addEventListener('click', () => finish(null));
    body.querySelector('[data-ok]').addEventListener('click', () => finish(value));

    const modal = openModal({
      title,
      body,
      slim: true,
      onClose: () => {
        if (settled) return;
        settled = true;
        clearInterval(iv);
        resolve(null);
      },
    });
  });
}

/* ------------------------------------------------------------------ *
 * media picker
 * ------------------------------------------------------------------ */
function mediaPicker(media, previews, inputEl) {
  const render = () => {
    previews.innerHTML = '';
    media.forEach((m, i) => {
      const item = el(`<div class="item">
        <img src="${esc(m.url)}" alt="">
        <button class="rm" title="Remove">${icons.close}</button>
      </div>`);
      item.querySelector('.rm').addEventListener('click', (e) => {
        e.stopPropagation();
        media.splice(i, 1);
        render();
      });
      previews.appendChild(item);
    });
    previews.className = `media-preview${media.length === 1 ? ' single' : ''}`;
    previews.style.display = media.length ? 'grid' : 'none';
  };
  inputEl.addEventListener('change', async () => {
    const files = [...(inputEl.files || [])].slice(0, 4 - media.length);
    inputEl.value = '';
    if (!files.length) return;
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    try {
      const res = await api('/upload', { method: 'POST', formData: fd });
      res.files.forEach((f) => media.push({ url: f.url, alt: '' }));
      render();
    } catch (err) {
      errorToast(err);
    }
  });
  render();
  return render;
}

/* ------------------------------------------------------------------ *
 * composer
 * ------------------------------------------------------------------ */
export function createComposer({
  replyTo = null,
  quoteOf = null,
  editPost = null,
  initialText = '',
  initialTime = null,
  onDone = null,
  placeholder = "What's happening?",
  autoFocus = false,
  compact = false,
} = {}) {
  const me = acting();
  const media = editPost?.media ? editPost.media.map((m) => ({ ...m })) : [];
  let customTime = initialTime !== null;
  let timeValue = initialTime ?? now();

  const wrap = el(`<div class="composer">
    ${avatarHTML(me, compact ? 'a40' : 'a48')}
    <div class="composer-body">
      ${replyTo ? `<div class="reply-to-line">Replying to <a href="#/u/${esc(replyTo.author?.handle || '')}">@${esc(replyTo.author?.handle || '')}</a></div>` : ''}
      <textarea rows="1" placeholder="${esc(placeholder)}"></textarea>
      <div class="media-preview" style="display:none"></div>
      <div class="composer-tools">
        <button class="tool-btn" data-image title="Add photos">${icons.image}</button>
        <button class="tool-btn" data-time title="Set the post time">${icons.clock}</button>
        <input type="file" accept="image/*" multiple hidden data-file>
        <div class="grow"></div>
        <svg class="ring" viewBox="0 0 26 26">
          <circle class="bg" cx="13" cy="13" r="11"></circle>
          <circle class="fg" cx="13" cy="13" r="11" stroke-dasharray="69.1" stroke-dashoffset="69.1" transform="rotate(-90 13 13)"></circle>
        </svg>
        <button class="btn" data-submit disabled>${editPost ? 'Save' : 'Post'}</button>
      </div>
    </div>
  </div>`);

  const ta = wrap.querySelector('textarea');
  const submit = wrap.querySelector('[data-submit]');
  const ring = wrap.querySelector('.ring .fg');
  const timeBtn = wrap.querySelector('[data-time]');
  const previews = wrap.querySelector('.media-preview');
  const fileInput = wrap.querySelector('[data-file]');
  const renderPreviews = mediaPicker(media, previews, fileInput);

  ta.value = initialText;
  const CIRC = 69.1;

  function updateTimeChip() {
    const isPast = customTime && timeValue < now() - 1000;
    const isFuture = customTime && timeValue > now() + 1000;
    timeBtn.classList.toggle('past', customTime);
    timeBtn.title = customTime ? `Post time: ${stamp(timeValue)}` : 'Posting at the current moment';
    const label = customTime ? relative(timeValue) : 'now';
    timeBtn.innerHTML = `${icons.clock}<span>${esc(label)}</span>`;
    const chip = timeBtn;
    chip.style.color = customTime && isFuture ? 'var(--gold)' : '';
    void isPast;
  }

  function autosize() {
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, window.innerHeight * 0.45)}px`;
  }

  function refresh() {
    const len = [...ta.value].length;
    const pct = Math.min(len / MAX_SOFT, 1);
    ring.style.strokeDashoffset = String(CIRC * (1 - pct));
    ring.parentElement.classList.toggle('over', len > MAX_SOFT);
    submit.disabled = !ta.value.trim() && !media.length;
    autosize();
  }

  let composingSent = false;
  ta.addEventListener('input', () => {
    refresh();
    if (!composingSent && ta.value.trim()) {
      composingSent = true;
      socketComposing(true);
    }
  });
  ta.addEventListener('blur', () => {
    if (composingSent) {
      composingSent = false;
      socketComposing(false);
    }
  });
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!submit.disabled) submit.click();
    }
  });

  timeBtn.addEventListener('click', async () => {
    const picked = await openTimePicker(customTime ? timeValue : now());
    if (picked !== null) {
      customTime = true;
      timeValue = picked;
      updateTimeChip();
    }
  });
  timeBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    customTime = false;
    updateTimeChip();
    toast('Post time reset to the current moment');
  });
  wrap.querySelector('[data-image]').addEventListener('click', () => fileInput.click());

  submit.addEventListener('click', async () => {
    const text = ta.value;
    submit.disabled = true;
    try {
      let result;
      if (editPost) {
        result = await api(`/posts/${editPost.id}`, {
          method: 'PATCH',
          body: { text, media: media.map((m) => ({ url: m.url, alt: m.alt || '' })) },
        });
        toast('Post updated');
      } else {
        result = await api('/posts', {
          method: 'POST',
          body: {
            text,
            media,
            createdAt: customTime ? timeValue : undefined,
            replyTo: replyTo?.id ?? null,
            quoteOf: quoteOf?.id ?? null,
          },
        });
        toast(customTime ? `Posted as if it were ${stamp(timeValue)}` : 'Posted');
      }
      if (composingSent) {
        composingSent = false;
        socketComposing(false);
      }
      ta.value = '';
      media.length = 0;
      renderPreviews();
      refresh();
      onDone?.(result);
    } catch (err) {
      errorToast(err);
      submit.disabled = false;
    }
  });

  updateTimeChip();
  refresh();
  if (autoFocus) setTimeout(() => ta.focus(), 50);

  wrap.composerApi = {
    focus: () => ta.focus(),
    setText: (t) => {
      ta.value = t;
      refresh();
    },
    destroy: () => {
      if (composingSent) socketComposing(false);
    },
  };
  return wrap;
}

export function openComposer(opts = {}) {
  const node = createComposer({ ...opts, autoFocus: true });
  const modal = openModal({
    title: opts.editPost ? 'Edit post' : opts.quoteOf ? 'Quote post' : opts.replyTo ? 'Reply' : 'New post',
    body: node,
    onClose: () => node.composerApi?.destroy(),
  });
  return modal;
}

export function openReplyComposer(post) {
  return openComposer({ replyTo: post, placeholder: 'Post your reply' });
}

export function openQuoteComposer(post) {
  return openComposer({ quoteOf: post, placeholder: 'Add a comment' });
}

export function openEditComposer(post) {
  return openComposer({ editPost: post, initialText: post.text, placeholder: 'Edit your post' });
}

/** quick helper used by the admin screens to post as someone else */
export function openComposerAs(account, opts = {}) {
  const node = createComposer({ ...opts, autoFocus: true });
  return openModal({
    title: `Post as @${account.handle}`,
    body: node,
    onClose: () => node.composerApi?.destroy(),
  });
}
