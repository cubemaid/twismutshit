import { api } from '../api.js';
import { icons } from '../icons.js';
import { acting, on } from '../store.js';
import { stamp, fullDate, timeOfDay, relative } from '../time.js';
import { avatarHTML, el, emptyState, errorToast, esc, fmtCount, linkify, nameHTML, handleHTML, openMenu, toast } from '../ui.js';
import { colHead } from '../shell.js';
import { postCard, toggleReaction } from '../post-card.js';
import { createComposer, openComposer } from '../composer.js';

export function postView({ id }) {
  const root = el('<div></div>');
  let feedNode = null;
  let current = null;

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

    const main = postCard(post, { showReplyTo: false, clickable: false });
    main.style.borderBottom = 'none';
    main.style.cursor = 'default';
    root.appendChild(main);

    const stats = el(`<div class="small muted" style="padding:6px 16px 0">${esc(stamp(post.createdAt))} · <span title="Views">${fmtCount(post.viewCount)} Views</span></div>`);
    root.appendChild(stats);

    const bar = el(`<div style="padding:12px 16px;border-top:1px solid var(--border-soft);border-bottom:1px solid var(--border-soft)">
      <div class="row small muted" data-counts></div>
    </div>`);
    root.appendChild(bar);
    paintCounts(bar, post);

    const composer = createComposer({ replyTo: post, placeholder: 'Post your reply', compact: true });
    root.appendChild(composer);

    root.appendChild(el(`<div class="divider" style="margin:0"></div>`));

    feedNode = el('<div></div>');
    if (!res.replies.length) feedNode.appendChild(emptyState('No replies yet', 'Be the first to reply.'));
    res.replies.forEach((r) => feedNode.appendChild(postCard(r)));
    root.appendChild(feedNode);
  }

  function paintCounts(node, post) {
    node.querySelector('[data-counts]').innerHTML = [
      `${fmtCount(post.likeCount)} <span>Likes</span>`,
      `${fmtCount(post.repostCount)} <span>Reposts</span>`,
      `${fmtCount(post.bookmarkCount)} <span>Bookmarks</span>`,
    ].join(' &nbsp; ');
  }

  function openPostMenu(ev, post) {
    openMenu(
      ev.currentTarget,
      [
        { label: 'Copy link', icon: 'link', onClick: () => navigator.clipboard?.writeText(location.href).then(() => toast('Link copied')) },
        { label: 'Edit text', icon: 'edit', onClick: () => openComposer({ editPost: post }) },
        { label: 'Reply', icon: 'reply', onClick: () => openComposer({ replyTo: post }) },
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
