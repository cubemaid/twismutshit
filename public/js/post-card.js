import { api } from './api.js';
import { icons, icon } from './icons.js';
import { accountById, acting, emit, on, state } from './store.js';
import { relative, now, stamp, fullDate, timeOfDay } from './time.js';
import {
  avatarHTML,
  el,
  esc,
  errorToast,
  fmtCount,
  linkify,
  nameHTML,
  handleHTML,
  openMenu,
  openModal,
  confirmDialog,
  pickAccount,
  toast,
  timeHTML,
} from './ui.js';
import { openEditComposer, openQuoteComposer, openReplyComposer, openTimePicker } from './composer.js';
import { setShotMode } from './screenshot.js';

/* ------------------------------------------------------------------ *
 * live registry so realtime updates can patch cards in place
 * ------------------------------------------------------------------ */
const registry = new Map();

export function registerPost(id, updater) {
  if (!registry.has(id)) registry.set(id, new Set());
  registry.get(id).add(updater);
}

export function unregisterPost(id, updater) {
  registry.get(id)?.delete(updater);
}

/**
 * Posts that arrive over the socket are decorated from the *sender's* point of
 * view, so re-derive "did I like this?" against whoever this browser is
 * currently posting as.
 */
export function normalizeForViewer(dto) {
  if (!dto) return dto;
  const me = acting()?.id ?? null;
  return {
    ...dto,
    liked: me ? (dto.likedBy || []).includes(me) : false,
    reposted: me ? (dto.repostedBy || []).includes(me) : false,
    bookmarked: me ? (dto.bookmarkedBy || []).includes(me) : false,
  };
}

export function patchPost(dto) {
  const post = normalizeForViewer(dto);
  if (!post) return;
  registry.get(post.id)?.forEach((fn) => {
    try {
      fn(post);
    } catch (err) {
      console.error(err);
    }
  });
}

export function clearRegistry() {
  registry.clear();
}

/* realtime: keep every visible card in sync with the other writer */
on('reaction', (payload) => {
  if (payload?.post) patchPost(payload.post);
});
on('post', (payload) => {
  if (payload?.action === 'update' && payload.post) patchPost(payload.post);
});

/* ------------------------------------------------------------------ *
 * pieces
 * ------------------------------------------------------------------ */
const isFuture = (ms) => ms > now() + 1000;

function mediaHTML(post) {
  if (!post.media?.length) return '';
  const n = Math.min(post.media.length, 4);
  return `<div class="post-media n${n}" data-media>
    ${post.media
      .slice(0, 4)
      .map((m) => `<img src="${esc(m.url)}" alt="${esc(m.alt || '')}" loading="lazy">`)
      .join('')}
  </div>`;
}

function quoteHTML(post) {
  const q = post.quoteOf;
  if (!q) return '';
  return `<div class="quote-card" data-quote>
    <div style="width:20px;flex:none">${avatarHTML(q.author, 'a24')}</div>
    <div class="grow">
      <div class="post-head" style="font-size:14px">
        ${nameHTML(q.author)}
        ${handleHTML(q.author)}
        <span class="dot">·</span>
        ${timeHTML(q.createdAt)}
      </div>
      <div class="qtext">${linkify(q.text)}</div>
      ${mediaHTML(q)}
    </div>
  </div>`;
}

function actionsHTML(post) {
  return `
    <div class="post-actions">
      <button class="act reply" data-act="reply" title="Reply">${icons.reply}<span>${post.replyCount ? fmtCount(post.replyCount) : ''}</span></button>
      <button class="act repost${post.reposted ? ' on' : ''}" data-act="repost" title="Repost">
        ${post.reposted ? icons.retweetFilled : icons.retweet}<span>${post.repostCount ? fmtCount(post.repostCount) : ''}</span>
      </button>
      <button class="act like${post.liked ? ' on' : ''}" data-act="like" title="Like">
        ${post.liked ? icons.heartFilled : icons.heart}<span>${post.likeCount ? fmtCount(post.likeCount) : ''}</span>
      </button>
      <button class="act bookmark${post.bookmarked ? ' on' : ''}" data-act="bookmark" title="Bookmark">
        ${post.bookmarked ? icons.bookmarkFilled : icons.bookmark}
      </button>
      <button class="act share" data-act="share" title="Share">${icons.share}</button>
    </div>`;
}

function headHTML(post, { showReplyTo = true, reposter = null } = {}) {
  const replyLine =
    showReplyTo && post.replyToHandle
      ? `<div class="small muted">Replying to <a href="#/u/${esc(post.replyToHandle)}">@${esc(post.replyToHandle)}</a></div>`
      : '';
  return `
    <div class="post-head">
      ${nameHTML(post.author)}
      ${handleHTML(post.author)}
      <span class="dot">·</span>
      ${timeHTML(post.createdAt)}
      ${post.pinned ? '<span class="pill">Pinned</span>' : ''}
      ${isFuture(post.createdAt) ? '<span class="pill warn" title="This post is dated after the current moment">⏱ future</span>' : ''}
      ${post.editedAt ? '<span class="pill edit-pill" title="Edited">edited</span>' : ''}
      <span class="spacer"></span>
      <button class="icon-btn" data-dots title="More">${icons.more}</button>
    </div>
    ${replyLine}`;
}

/* ------------------------------------------------------------------ *
 * engagement helpers
 * ------------------------------------------------------------------ */
export async function toggleReaction(post, kind, { as = null, on = null } = {}) {
  const current = kind === 'like' ? post.liked : kind === 'repost' ? post.reposted : post.bookmarked;
  const next = on === null ? !current : on;
  const dto = await api(`/posts/${post.id}/${kind}`, {
    method: 'POST',
    body: { on: next, ...(as ? { as } : {}) },
  });
  patchPost(dto);
  return dto;
}

function handleAction(kind, post) {
  if (kind === 'reply') return openReplyComposer(post);
  if (kind === 'like') return toggleReaction(post, 'like').catch(errorToast);
  if (kind === 'bookmark') return toggleReaction(post, 'bookmark').catch(errorToast);
  if (kind === 'share') return null;
  return null;
}

/* ------------------------------------------------------------------ *
 * menus
 * ------------------------------------------------------------------ */
export function openReactAsModal(post) {
  const body = el(`<div>
    <p class="muted small" style="margin-top:0">Make other characters react to this post. Everything you do here is instantly visible to both of you.</p>
    <div class="section-title">Who reacts?</div>
    <div data-list></div>
    <div class="divider"></div>
    <div class="section-title">What do they do?</div>
    <div class="row tight">
      <button class="btn sm" data-do="like">${icons.heart} Like</button>
      <button class="btn sm" data-do="unlike">Unlike</button>
      <button class="btn sm" data-do="repost">${icons.retweet} Repost</button>
      <button class="btn sm" data-do="unrepost">Undo repost</button>
      <button class="btn sm" data-do="bookmark">${icons.bookmark} Bookmark</button>
    </div>
    <div class="hint" data-status></div>
  </div>`);

  let selected = state.accounts.find((a) => a.id !== post.authorId)?.id ?? null;
  const list = body.querySelector('[data-list]');

  const renderList = () => {
    list.innerHTML = '';
    state.accounts.forEach((acc) => {
      const row = el(`<button class="acc-row${acc.id === selected ? ' current' : ''}">
        ${avatarHTML(acc, 'a32')}
        <div class="who"><div class="name">${esc(acc.displayName)}</div><div class="handle">@${esc(acc.handle)}</div></div>
        <div class="row tight small muted">
          ${post.likedBy.includes(acc.id) ? `<span class="pill accent">${icons.heartFilled}</span>` : ''}
          ${post.repostedBy.includes(acc.id) ? `<span class="pill accent">${icons.retweetFilled}</span>` : ''}
          ${post.bookmarkedBy.includes(acc.id) ? `<span class="pill accent">${icons.bookmarkFilled}</span>` : ''}
        </div>
      </button>`);
      row.addEventListener('click', () => {
        selected = acc.id;
        renderList();
      });
      list.appendChild(row);
    });
  };
  renderList();

  body.querySelectorAll('[data-do]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!selected) return toast('Pick an account first', 'error');
      const map = { like: ['like', true], unlike: ['like', false], repost: ['repost', true], unrepost: ['repost', false], bookmark: ['bookmark', true] };
      const [kind, on] = map[btn.dataset.do];
      try {
        const dto = await toggleReaction(post, kind, { as: selected, on });
        Object.assign(post, dto);
        renderList();
        body.querySelector('[data-status]').textContent = `Updated — likes ${dto.likeCount}, reposts ${dto.repostCount}`;
      } catch (err) {
        errorToast(err);
      }
    })
  );

  openModal({ title: 'React as…', body, slim: true });
}

export function openEngagementModal(post) {
  const body = el(`<div>
    <p class="muted small" style="margin-top:0">Add invisible numbers on top of the real ones — good for making someone famous.</p>
    <div class="grid-2">
      <label class="field"><span>Extra likes</span><input class="input" type="number" data-like value="${post.likeCount - (post.likedBy?.length || 0)}"></label>
      <label class="field"><span>Extra reposts</span><input class="input" type="number" data-repost value="${post.repostCount - (post.repostedBy?.length || 0)}"></label>
      <label class="field"><span>Views (min)</span><input class="input" type="number" data-views value="0"></label>
    </div>
    <div class="row" style="justify-content:flex-end">
      <button class="btn ghost" data-cancel>Cancel</button>
      <button class="btn" data-save>Save</button>
    </div>
  </div>`);
  const modal = openModal({ title: 'Edit engagement', body, slim: true });
  body.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
  body.querySelector('[data-save]').addEventListener('click', async () => {
    try {
      const dto = await api(`/posts/${post.id}`, {
        method: 'PATCH',
        body: {
          editedAt: false,
          likeBoost: Number(body.querySelector('[data-like]').value) || 0,
          repostBoost: Number(body.querySelector('[data-repost]').value) || 0,
          viewBoost: Number(body.querySelector('[data-views]').value) || 0,
        },
      });
      patchPost(dto);
      modal.close();
      toast('Engagement updated');
    } catch (err) {
      errorToast(err);
    }
  });
}

export function openFakeNotificationModal(post, fixedActorId = null) {
  const body = el(`<div>
    <p class="muted small" style="margin-top:0">Craft a notification by hand — it shows up in their tab exactly like a real one.</p>
    <label class="field"><span>Who gets it</span><select class="select" data-recipient>
      ${state.accounts.map((a) => `<option value="${a.id}">@${esc(a.handle)} — ${esc(a.displayName)}</option>`).join('')}
    </select></label>
    <label class="field"><span>Who "did" it</span><select class="select" data-actor>
      <option value="">— nobody —</option>
      ${state.accounts.map((a) => `<option value="${a.id}" ${fixedActorId === a.id ? 'selected' : ''}>@${esc(a.handle)} — ${esc(a.displayName)}</option>`).join('')}
    </select></label>
    <label class="field"><span>Type</span><select class="select" data-type>
      <option value="like">liked your post</option>
      <option value="repost">reposted your post</option>
      <option value="follow">followed you</option>
      <option value="mention">mentioned you</option>
      <option value="reply">replied to your post</option>
      <option value="quote">quoted your post</option>
      <option value="dm">sent you a message</option>
      <option value="custom">custom…</option>
    </select></label>
    <label class="field"><span>Text (leave empty to use the default)</span><input class="input" data-text placeholder="e.g. liked your post"></label>
    <label class="field"><span>When</span><input class="input" type="datetime-local" data-when value="${new Date(now()).toISOString().slice(0, 16).replace('T', 'T')}"></label>
  </div>`);

  const dt = body.querySelector('[data-when]');
  const d = new Date(now());
  const pad = (n) => String(n).padStart(2, '0');
  dt.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const modal = openModal({ title: 'Add a notification', body, slim: true });
  const footer = el(`<div class="row" style="justify-content:flex-end;margin-top:8px">
    <button class="btn" data-save>Add it</button>
  </div>`);
  body.appendChild(footer);
  footer.querySelector('[data-save]').addEventListener('click', async () => {
    try {
      await api('/notifications', {
        method: 'POST',
        body: {
          accountId: Number(body.querySelector('[data-recipient]').value),
          actorId: body.querySelector('[data-actor]').value || null,
          type: body.querySelector('[data-type]').value,
          text: body.querySelector('[data-text]').value || '',
          postId: post?.id ?? null,
          createdAt: new Date(dt.value).toISOString(),
        },
      });
      modal.close();
      toast('Notification added');
    } catch (err) {
      errorToast(err);
    }
  });
}

function openPostMenu(ev, post) {
  const isMine = post.authorId === acting()?.id;
  const items = [
    { title: 'Post' },
    { label: 'Copy link', icon: 'link', onClick: () => copyPostLink(post) },
    { label: 'Copy text', icon: 'copy', onClick: () => copyText(post.text) },
    { sep: true },
    { title: 'Edit' },
    { label: 'Edit text', icon: 'edit', onClick: () => openEditComposer(post) },
    { label: 'Change timestamp', icon: 'clock', onClick: () => changeTimestamp(post) },
    { label: 'Edit engagement', icon: 'sliders', onClick: () => openEngagementModal(post) },
    { label: post.pinned ? 'Unpin from profile' : 'Pin to profile', icon: 'pin', onClick: () => pinPost(post) },
    { sep: true },
    { title: 'Drama tools' },
    { label: 'React as another account…', icon: 'users', onClick: () => openReactAsModal(post) },
    { label: 'Add a fake notification…', icon: 'bell', onClick: () => openFakeNotificationModal(post) },
    { label: 'Reply as another account…', icon: 'reply', onClick: () => replyAs(post) },
    { label: 'Screenshot mode', icon: 'image', onClick: () => setShotMode(true) },
    { sep: true },
    { label: 'Delete post', icon: 'trash', danger: true, onClick: () => deletePost(post) },
  ];
  if (isMine) items.splice(4, 0, { label: 'Edit as @' + (acting()?.handle || ''), icon: 'edit', onClick: () => openEditComposer(post) });
  openMenu(ev.currentTarget, items, { align: 'right' });
}

async function replyAs(post) {
  const id = await pickAccount({ title: 'Reply as…' });
  if (!id) return;
  const acc = accountById(id);
  emit('compose-as', { account: acc, replyTo: post });
}

async function changeTimestamp(post) {
  const ms = await openTimePicker(post.createdAt, { title: 'Change when this was posted' });
  if (ms === null) return;
  try {
    const dto = await api(`/posts/${post.id}`, { method: 'PATCH', body: { createdAt: new Date(ms).toISOString(), editedAt: false } });
    patchPost(dto);
    toast(`Now dated ${stamp(ms)}`);
  } catch (err) {
    errorToast(err);
  }
}

async function pinPost(post) {
  try {
    const dto = await api(`/posts/${post.id}`, { method: 'PATCH', body: { pinned: !post.pinned, editedAt: false } });
    patchPost(dto);
    toast(dto.pinned ? 'Pinned to profile' : 'Unpinned');
  } catch (err) {
    errorToast(err);
  }
}

async function deletePost(post) {
  if (!(await confirmDialog({ title: 'Delete post?', message: 'This removes it from every timeline.', confirmLabel: 'Delete' }))) return;
  try {
    await api(`/posts/${post.id}`, { method: 'DELETE' });
    toast('Post deleted');
  } catch (err) {
    errorToast(err);
  }
}

function copyPostLink(post) {
  const url = `${location.origin}/#/p/${post.id}`;
  navigator.clipboard?.writeText(url).then(() => toast('Link copied'), () => toast(url));
}

function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast('Text copied'), () => toast('Copy failed', 'error'));
}

function openShareMenu(ev, post) {
  openMenu(
    ev.currentTarget,
    [
      { label: 'Copy link to post', icon: 'link', onClick: () => copyPostLink(post) },
      { label: 'Copy post text', icon: 'copy', onClick: () => copyText(post.text) },
      { label: 'Open post', icon: 'eye', onClick: () => (location.hash = `/p/${post.id}`) },
      { label: 'Post time details', icon: 'clock', onClick: () => toast(`${stamp(post.createdAt)} (${relative(post.createdAt)})`) },
    ],
    { align: 'right' }
  );
}

function openRepostMenu(ev, post) {
  openMenu(
    ev.currentTarget,
    [
      { label: post.reposted ? 'Undo repost' : 'Repost', icon: post.reposted ? 'retweet' : 'retweet', onClick: () => toggleReaction(post, 'repost').catch(errorToast) },
      { label: 'Quote post', icon: 'edit', onClick: () => openQuoteComposer(post) },
      { label: 'Repost as another account…', icon: 'users', onClick: async () => {
        const id = await pickAccount({ title: 'Repost as…' });
        if (!id) return;
        toggleReaction(post, 'repost', { as: id, on: true }).catch(errorToast);
      } },
    ]
  );
}

/* ------------------------------------------------------------------ *
 * card
 * ------------------------------------------------------------------ */
export function postCard(post, { showReplyTo = true, reposter = null, clickable = true, highlight = false, onReply = null } = {}) {
  const card = el(`<article class="post" data-post-id="${post.id}">
    <div class="post-avatar">${avatarHTML(post.author, 'a48')}</div>
    <div class="post-main">
      ${headHTML(post, { showReplyTo, reposter })}
      <div class="post-text">${linkify(post.text)}</div>
      ${mediaHTML(post)}
      ${quoteHTML(post)}
      ${actionsHTML(post)}
    </div>
  </article>`);
  if (highlight) card.style.background = 'rgba(29,155,240,.06)';

  /* An image whose file is gone must not leave an empty bordered box behind. */
  const mediaBox = card.querySelector('[data-media]');
  if (mediaBox) {
    const drop = (img) => {
      img.remove();
      if (!mediaBox.querySelector('img')) mediaBox.remove();
    };
    mediaBox.querySelectorAll('img').forEach((img) => {
      img.addEventListener('error', () => drop(img));
      // it may already have failed before this listener existed
      if (img.complete && img.naturalWidth === 0) drop(img);
    });
  }

  const update = (dto) => {
    const head = card.querySelector('.post-head');
    const freshHead = el(`<div>${headHTML({ ...dto }, { showReplyTo, reposter })}</div>`);
    head.replaceWith(freshHead.firstElementChild);
    const text = card.querySelector('.post-text');
    text.innerHTML = linkify(dto.text);
    const actions = card.querySelector('.post-actions');
    const fresh = el(`<div>${actionsHTML(dto)}</div>`);
    actions.replaceWith(fresh.querySelector('.post-actions'));
    const q = card.querySelector('[data-quote]');
    const freshQuote = quoteHTML(dto);
    if (q && !freshQuote) q.remove();
    else if (q && freshQuote) q.outerHTML = freshQuote;
    Object.assign(post, dto);
    wire();
  };

  function wire() {
    card.querySelector('[data-act="reply"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onReply) onReply(post);
      else handleAction('reply', post);
    });
    card.querySelector('[data-act="repost"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.shiftKey) return toggleReaction(post, 'repost').catch(errorToast);
      openRepostMenu(e, post);
    });
    card.querySelector('[data-act="like"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      handleAction('like', post);
    });
    card.querySelector('[data-act="bookmark"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      handleAction('bookmark', post);
    });
    card.querySelector('[data-act="share"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openShareMenu(e, post);
    });
    card.querySelector('[data-dots]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openPostMenu(e, post);
    });
  }
  wire();

  if (clickable) {
    card.addEventListener('click', (e) => {
      if (e.target.closest('a,button,[data-quote]')) return;
      location.hash = `/p/${post.id}`;
    });
  }

  registerPost(post.id, update);
  const observer = new MutationObserver(() => {
    if (!document.body.contains(card)) {
      unregisterPost(post.id, update);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return card;
}

export function timelineItem(item, opts = {}) {
  if (item.kind === 'repost' && item.reposter) {
    const wrap = el(`<div>
      <div class="repost-line">${icons.retweet}<span>${esc(item.reposter.displayName)} reposted</span></div>
    </div>`);
    wrap.appendChild(postCard(item.post, { ...opts, showReplyTo: false, reposter: item.reposter }));
    return wrap;
  }
  return postCard(item.post, opts);
}
