import { api } from '../api.js';
import { icons } from '../icons.js';
import { acting, on } from '../store.js';
import { stamp, fullDate, timeOfDay, relative } from '../time.js';
import { avatarHTML, el, emptyState, errorToast, esc, fmtCount, linkify, nameHTML, handleHTML, openMenu, openModal, toast } from '../ui.js';
import { colHead } from '../shell.js';
import { postCard, toggleReaction } from '../post-card.js';
import { createComposer, openComposer } from '../composer.js';

/* How the replies below can be ordered — the same three choices X offers. */
const SORTS = {
  relevant: { label: 'Relevant', cmp: (a, b) => b.likeCount + b.repostCount * 2 - (a.likeCount + a.repostCount * 2) },
  latest: { label: 'Latest', cmp: (a, b) => b.createdAt - a.createdAt },
  liked: { label: 'Liked', cmp: (a, b) => b.likeCount - a.likeCount },
};

export function postView({ id }) {
  const root = el('<div></div>');
  let feedNode = null;
  let replySlot = null;
  let current = null;
  let sort = 'relevant';
  let replies = [];

  async function load() {
    try {
      const res = await api(`/posts/${id}`);
      current = res;
      render(res);
    } catch (err) {
      root.innerHTML = '';
      root.appendChild(emptyState('Post not found', 'It may have been deleted.'));
    }
  }

  function render(res) {
    root.innerHTML = '';
    const post = res.post;
    const head = colHead({
      title: 'Post',
      backTo: '/home',
      right: `<button class="icon-btn" data-more>${icons.moreH}</button>`,
    });
    head.querySelector('[data-more]').addEventListener('click', (e) => openPostMenu(e, post));
    root.appendChild(head);

    res.ancestors.forEach((ancestor) => {
      const wrap = el('<div class="thread-line"></div>');
      wrap.appendChild(postCard(ancestor, { showReplyTo: false }));
      root.appendChild(wrap);
    });

    const main = postCard(post, { showReplyTo: false, clickable: false, onReply: () => focusReplyBox() });
    main.classList.add('detail');
    main.style.borderBottom = 'none';
    main.style.cursor = 'default';
    root.appendChild(main);

    /* X's order inside the post: text → date + views → action bar →
       reply sort / view quotes. The action bar already carries the reply,
       repost, like and bookmark counts, so there is no second stats row. */
    const actions = main.querySelector('.post-actions');
    actions.before(
      el(`<div class="post-meta-line">${esc(stamp(post.createdAt))} · <span title="Views">${fmtCount(post.viewCount)} Views</span></div>`)
    );
    actions.after(quotesRow(post));

    /* the reply box is always there, exactly like the real thing */
    replySlot = el('<div class="reply-slot"></div>');
    replySlot.appendChild(
      createComposer({ replyTo: post, placeholder: 'Post your reply', compact: true, submitLabel: 'Reply' })
    );
    root.appendChild(replySlot);

    root.appendChild(el(`<div class="divider" style="margin:0"></div>`));

    replies = res.replies;
    feedNode = el('<div class="reply-list"></div>');
    root.appendChild(feedNode);
    paintReplies();
  }

  function paintReplies() {
    if (!feedNode) return;
    feedNode.innerHTML = '';
    const list = [...replies].sort(SORTS[sort].cmp);
    if (!list.length) feedNode.appendChild(emptyState('No replies yet', 'Be the first to reply.'));
    list.forEach((r) => feedNode.appendChild(postCard(r)));
  }

  function quotesRow(post) {
    const row = el(`<div class="post-quotes">
      <button class="sort-btn" data-sort title="Order the replies">${esc(SORTS[sort].label)}${icons.caret}</button>
      <span class="grow"></span>
      ${post.quoteCount ? `<button class="link-btn" data-quotes>View quotes ›</button>` : ''}
    </div>`);
    const btn = row.querySelector('[data-sort]');
    btn.addEventListener('click', (e) =>
      openMenu(
        e.currentTarget,
        Object.entries(SORTS).map(([key, s]) => ({
          label: (key === sort ? '✓ ' : '') + s.label,
          onClick: () => {
            sort = key;
            btn.innerHTML = `${esc(s.label)}${icons.caret}`;
            paintReplies();
          },
        }))
      )
    );
    row.querySelector('[data-quotes]')?.addEventListener('click', () => openQuotesModal(post));
    return row;
  }

  async function openQuotesModal(post) {
    const body = el('<div class="quote-list"></div>');
    const modal = openModal({ title: 'Quotes', body, slim: true });
    try {
      const res = await api(`/posts/${post.id}/quotes`);
      if (!res.items.length) body.appendChild(emptyState('No quotes yet'));
      else res.items.forEach((q) => body.appendChild(postCard(q, { showReplyTo: false, clickable: false })));
    } catch (err) {
      errorToast(err);
    }
    return modal;
  }

  function focusReplyBox() {
    replySlot?.querySelector('textarea')?.focus();
  }

  function openPostMenu(ev, post) {
    openMenu(
      ev.currentTarget,
      [
        { label: 'Copy link', icon: 'link', onClick: () => navigator.clipboard?.writeText(location.href).then(() => toast('Link copied')) },
        { label: 'Edit text', icon: 'edit', onClick: () => openComposer({ editPost: post }) },
        { label: 'Reply', icon: 'reply', onClick: () => focusReplyBox() },
        { label: 'Quote', icon: 'edit', onClick: () => openComposer({ quoteOf: post }) },
        { label: 'Like', icon: 'heart', onClick: () => toggleReaction(post, 'like').catch(errorToast) },
        { label: 'Repost', icon: 'retweet', onClick: () => toggleReaction(post, 'repost').catch(errorToast) },
      ],
      { align: 'right' }
    );
  }

  load();
  on('post', (payload) => {
    if (payload.action === 'delete' && Number(payload.postId) === Number(id)) {
      root.innerHTML = '';
      root.appendChild(emptyState('This post was deleted'));
      return;
    }
    if (payload.post && Number(payload.post.id) === Number(id)) load();
    if (payload.action === 'create' && Number(payload.post?.replyToId) === Number(id)) load();
  });
  on('clock', load);

  return { element: root, refresh: load };
}
