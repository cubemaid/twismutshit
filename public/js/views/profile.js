import { api } from '../api.js';
import { icons, badgeSvg } from '../icons.js';
import { accountById, acting, emit, on, state } from '../store.js';
import { fullDate, stamp, describeOffset } from '../time.js';
import {
  avatarHTML,
  el,
  emptyState,
  errorToast,
  esc,
  fmtCount,
  openMenu,
  openModal,
  confirmDialog,
  pickAccount,
  toast,
} from '../ui.js';
import { colHead } from '../shell.js';
import { postCard, timelineItem } from '../post-card.js';
import { openAccountEditor } from './account-editor.js';
import { feedList } from './feed.js';

const TABS = [
  { key: 'posts', label: 'Posts' },
  { key: 'replies', label: 'Replies' },
  { key: 'media', label: 'Media' },
  { key: 'likes', label: 'Likes' },
];

export function profileView({ handle, tab: initialTab = 'posts' }) {
  const root = el('<div></div>');
  let data = null;
  let tab = initialTab;
  let feed = null;

  async function load() {
    root.innerHTML = '';
    root.appendChild(el('<div class="skeleton" style="height:200px"></div>'));
    try {
      data = await api(`/accounts/${encodeURIComponent(handle)}`);
    } catch (err) {
      root.innerHTML = '';
      root.appendChild(emptyState('Account not found', `Nothing here for @${handle}`));
      return;
    }
    render();
  }

  function render() {
    root.innerHTML = '';
    const acc = data.account;
    const me = acting();
    const isMe = me?.id === acc.id;

    const head = colHead({
      title: acc.displayName,
      subtitle: `${fmtCount(acc.postCount)} posts`,
      backTo: '/home',
      right: `<button class="icon-btn" data-edit title="Edit profile">${icons.edit}</button>
              <button class="icon-btn" data-more title="More">${icons.moreH}</button>`,
    });
    head.querySelector('[data-edit]').addEventListener('click', () =>
      openAccountEditor(acc, { onSaved: (saved) => { load(); } })
    );
    head.querySelector('[data-more]').addEventListener('click', (e) => openProfileMenu(e, acc, load));
    root.appendChild(head);

    const bannerStyle = acc.banner ? ` style="background-image:url('${esc(acc.banner)}')"` : '';
    const profileHead = el(`<div class="profile-head">
      <div class="profile-banner"${bannerStyle}></div>
      <div class="profile-avatar-row">
        <div class="profile-avatar">${avatarHTML(acc, 'a96')}</div>
        <div class="row tight" style="padding-top:8px">
          ${isMe
            ? `<button class="btn ghost" data-edit2>Edit profile</button>`
            : `<button class="btn ${acc.isFollowedByViewer ? 'outline-follow' : ''}" data-follow>${acc.isFollowedByViewer ? 'Following' : 'Follow'}</button>
               <button class="icon-btn" data-followas title="Follow as someone else">${icons.users}</button>`}
          <button class="icon-btn" data-bell title="Notifications for this account">${icons.bell}</button>
        </div>
      </div>
      <div class="profile-name">${esc(acc.displayName)}${acc.verified ? badgeSvg(acc.badge || 'blue') : ''}</div>
      <div class="profile-handle">@${esc(acc.handle)}</div>
      ${acc.bio ? `<div class="profile-bio">${esc(acc.bio)}</div>` : ''}
      <div class="profile-meta">
        ${acc.location ? `<span class="item">${icons.pin}${esc(acc.location)}</span>` : ''}
        ${acc.website ? `<span class="item">${icons.link}<a href="${esc(withProtocol(acc.website))}" target="_blank" rel="noopener">${esc(shortUrl(acc.website))}</a></span>` : ''}
        <span class="item">${icons.calendar}Joined ${esc(fullDate(acc.createdAt))}</span>
      </div>
      <div class="profile-counts">
        <span><b data-count="following">${fmtCount(acc.followingCount)}</b> <span>Following</span></span>
        <span><b data-count="followers">${fmtCount(acc.followerCount)}</b> <span>Followers</span></span>
      </div>
    </div>`);

    profileHead.querySelectorAll('[data-edit2]').forEach((b) =>
      b.addEventListener('click', () => openAccountEditor(acc, { onSaved: () => load() }))
    );
    profileHead.querySelector('[data-follow]')?.addEventListener('click', async (e) => {
      if (!me) return toast('Pick an account first', 'error');
      try {
        await api(`/accounts/${acc.id}/follow`, { method: 'POST', body: { on: !acc.isFollowedByViewer } });
        acc.isFollowedByViewer = !acc.isFollowedByViewer;
        e.currentTarget.textContent = acc.isFollowedByViewer ? 'Following' : 'Follow';
        e.currentTarget.classList.toggle('outline-follow', acc.isFollowedByViewer);
        refreshCounts(acc.id);
      } catch (err) {
        errorToast(err);
      }
    });
    profileHead.querySelector('[data-followas]')?.addEventListener('click', () =>
      openFollowAsModal(acc, () => refreshCounts(acc.id))
    );
    profileHead.querySelector('[data-bell]').addEventListener('click', () => {
      location.hash = '/notifications';
    });
    profileHead.querySelector('[data-count="followers"]').parentElement.addEventListener('click', () => openFollowList(acc, 'followers'));
    profileHead.querySelector('[data-count="following"]').parentElement.addEventListener('click', () => openFollowList(acc, 'following'));
    root.appendChild(profileHead);

    /* tabs */
    const tabs = el('<div class="tabs profile-tabs"></div>');
    TABS.forEach((t) => {
      const b = el(`<button class="tab${t.key === tab ? ' active' : ''}">${t.label}</button>`);
      b.addEventListener('click', () => {
        tab = t.key;
        location.hash = `/u/${acc.handle}/${tab}`;
      });
      tabs.appendChild(b);
    });
    root.appendChild(tabs);

    /* pinned post */
    if (tab === 'posts' && acc.pinnedPostId) {
      api(`/posts/${acc.pinnedPostId}`)
        .then((res) => {
          if (!res?.post) return;
          root.appendChild(postCard(res.post, { showReplyTo: false }));
        })
        .catch(() => {});
    }

    const params = () => {
      if (tab === 'likes') return { type: 'likes', accountId: acc.id, filter: 'all' };
      if (tab === 'replies') return { type: 'account', accountId: acc.id, filter: 'replies', includeReposts: '0' };
      if (tab === 'media') return { type: 'account', accountId: acc.id, filter: 'media', includeReposts: '0' };
      return { type: 'account', accountId: acc.id, filter: 'all' };
    };

    feed = feedList(params, {
      emptyTitle: tab === 'likes' ? 'No likes yet' : tab === 'media' ? 'No media posts' : 'No posts yet',
      emptySub: 'Everything posted as this account shows up here.',
    });
    root.appendChild(feed);
  }

  async function refreshCounts(id) {
    try {
      const fresh = await api(`/accounts/${id}`);
      const node = root.querySelector('[data-count="followers"]');
      if (node) node.textContent = fmtCount(fresh.account.followerCount);
      const fnode = root.querySelector('[data-count="following"]');
      if (fnode) fnode.textContent = fmtCount(fresh.account.followingCount);
    } catch {
      /* ignore */
    }
  }

  load();
  on('account', (payload) => {
    if (payload.action === 'delete' && payload.accountId === data?.account?.id) {
      root.innerHTML = '';
      root.appendChild(emptyState('Account deleted'));
      return;
    }
    if (payload.account && data?.account && payload.account.id === data.account.id) {
      data.account = { ...data.account, ...payload.account };
      render();
    }
  });
  on('follow', ({ followeeId }) => {
    if (followeeId === data?.account?.id) refreshCounts(followeeId);
  });
  on('world', () => load());
  on('clock', () => feed?.refresh?.());

  return { element: root, refresh: () => feed?.refresh?.() };
}

function withProtocol(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
function shortUrl(url) {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function openProfileMenu(ev, acc, reload) {
  openMenu(
    ev.currentTarget,
    [
      { title: `@${acc.handle}` },
      { label: 'Edit everything…', icon: 'edit', onClick: () => openAccountEditor(acc, { onSaved: () => reload() }) },
      { label: 'Show followers & following', icon: 'users', onClick: () => openFollowList(acc, 'followers') },
      { label: 'Follow as another account…', icon: 'users', onClick: () => openFollowAsModal(acc, () => reload()) },
      { sep: true },
      { label: 'Post as this account', icon: 'edit', onClick: async () => {
        const session = await api('/session/act', { method: 'POST', body: { accountId: acc.id } });
        state.actingId = session.actingAccountId;
        state.accounts = session.accounts;
        emit('session', session);
        emit('rerender');
        toast(`Now posting as @${acc.handle}`);
      } },
      { label: 'Add a post as them…', icon: 'plus', onClick: () => emit('compose-as', { account: acc }) },
      { label: 'Add a fake follower boost…', icon: 'sliders', onClick: () => openAccountEditor(acc, { onSaved: () => reload() }) },
      { sep: true },
      { label: 'Copy profile link', icon: 'link', onClick: () => {
        navigator.clipboard?.writeText(`${location.origin}/#/u/${acc.handle}`).then(() => toast('Link copied'));
      } },
      { label: 'Delete account', icon: 'trash', danger: true, onClick: async () => {
        if (!(await confirmDialog({
          title: `Delete @${acc.handle}?`,
          message: 'This removes the account and everything it posted. There is no undo.',
          confirmLabel: 'Delete account',
        }))) return;
        await api(`/accounts/${acc.id}`, { method: 'DELETE' });
        toast('Account deleted');
        location.hash = '/home';
      } },
    ],
    { align: 'right' }
  );
}

async function openFollowAsModal(acc, onDone) {
  const id = await pickAccount({ title: `Make … follow @${acc.handle}` });
  if (!id) return;
  try {
    await api(`/accounts/${acc.id}/follow`, { method: 'POST', body: { as: id, on: true } });
    toast(`@${accountById(id)?.handle} now follows @${acc.handle}`);
    onDone?.();
  } catch (err) {
    errorToast(err);
  }
}

async function openFollowList(acc, which = 'followers') {
  const body = el('<div><div class="spinner" style="margin:24px auto"></div></div>');
  const modal = openModal({ title: `@${acc.handle}`, body, slim: true });
  try {
    const res = await api(`/accounts/${acc.id}`);
    const list = which === 'followers' ? res.followers : res.following;
    body.innerHTML = '';
    const bar = el(`<div class="tabs" style="margin:-16px -16px 12px">
      <button class="tab${which === 'followers' ? ' active' : ''}" data-a>Followers ${res.followers.length}</button>
      <button class="tab${which === 'following' ? ' active' : ''}" data-b>Following ${res.following.length}</button>
    </div>`);
    bar.querySelector('[data-a]').addEventListener('click', () => {
      modal.close();
      openFollowList(acc, 'followers');
    });
    bar.querySelector('[data-b]').addEventListener('click', () => {
      modal.close();
      openFollowList(acc, 'following');
    });
    body.appendChild(bar);
    if (!list.length) body.appendChild(emptyState(`No ${which} yet`));
    list.forEach((item) => {
      const row = el(`<div class="acc-row">
        ${avatarHTML(item, 'a40')}
        <div class="who">
          <div class="name">${esc(item.displayName)}${item.verified ? badgeSvg(item.badge || 'blue') : ''}</div>
          <div class="handle">@${esc(item.handle)}</div>
        </div>
        <button class="btn sm" data-remove title="Remove this follow">${icons.trash}</button>
      </div>`);
      row.querySelector('.name').addEventListener('click', () => {
        modal.close();
        location.hash = `/u/${item.handle}`;
      });
      row.querySelector('[data-remove]').addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const targetId = which === 'followers' ? acc.id : item.id;
          const asId = which === 'followers' ? item.id : acc.id;
          await api(`/accounts/${targetId}/follow`, { method: 'POST', body: { as: asId, on: false } });
          row.remove();
          toast('Unfollowed');
        } catch (err) {
          errorToast(err);
        }
      });
      body.appendChild(row);
    });
  } catch (err) {
    errorToast(err);
    modal.close();
  }
}

export { timelineItem };
