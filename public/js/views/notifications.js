import { api } from '../api.js';
import { icons } from '../icons.js';
import { acting, on, state, setBadges } from '../store.js';
import { now, relative, stamp, toLocalInput, fromLocalInput } from '../time.js';
import {
  avatarHTML,
  el,
  emptyState,
  errorToast,
  esc,
  linkify,
  openMenu,
  openModal,
  confirmDialog,
  toast,
} from '../ui.js';
import { colHead } from '../shell.js';
import { postCard } from '../post-card.js';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'verified', label: 'Verified' },
];

const NOTE_ICON = {
  like: 'heart',
  repost: 'retweet',
  follow: 'user',
  mention: 'at',
  reply: 'reply',
  quote: 'edit',
  dm: 'mail',
  custom: 'sparkle',
};

export function notificationsView({ tab = 'all' } = {}) {
  const root = el('<div></div>');
  let editing = false;
  let items = [];
  let listNode = null;

  function render() {
    root.innerHTML = '';
    const me = acting();

    const head = colHead({
      title: 'Notifications',
      tabs: TABS,
      activeTab: tab,
      onTab: (key) => (location.hash = `/notifications/${key}`),
      right: `<button class="btn sm ghost" data-edit>${editing ? 'Done' : 'Edit'}</button>`,
    });
    head.querySelector('[data-edit]').addEventListener('click', () => {
      editing = !editing;
      render();
    });
    root.appendChild(head);

    if (!me) {
      root.appendChild(emptyState('Pick an account first', 'Notifications belong to whoever you are posting as.'));
      return;
    }

    if (editing) {
      const bar = el(`<div class="row" style="padding:12px 16px;border-bottom:1px solid var(--border-soft)">
        <button class="btn sm" data-add>${icons.plus} New notification</button>
        <button class="btn sm ghost" data-read>Mark all read</button>
        <button class="btn sm ghost" data-clear>Clear all</button>
      </div>`);
      bar.querySelector('[data-add]').addEventListener('click', () => openNotificationEditor(null, me.id, load));
      bar.querySelector('[data-read]').addEventListener('click', async () => {
        const res = await api('/notifications/read', { method: 'POST', body: { accountId: me.id } });
        setBadges(res.badges);
        load();
      });
      bar.querySelector('[data-clear]').addEventListener('click', async () => {
        if (!(await confirmDialog({ title: `Clear all notifications for @${me.handle}?`, message: 'Every notification in this tab disappears.', confirmLabel: 'Clear' }))) return;
        await api('/notifications/clear', { method: 'POST', body: { accountId: me.id } });
        load();
      });
      root.appendChild(bar);
    }

    listNode = el('<div></div>');
    root.appendChild(listNode);
    paint();
  }

  function paint() {
    if (!listNode) return;
    listNode.innerHTML = '';
    if (!items.length) {
      listNode.appendChild(emptyState('Nothing here yet', editing ? 'Use “New notification” to invent one.' : 'Likes, reposts, follows, replies and mentions all land here.'));
      return;
    }
    items.forEach((note) => listNode.appendChild(notificationRow(note, editing, load)));
  }

  async function load() {
    const me = acting();
    if (!me) return;
    try {
      const res = await api(`/notifications?accountId=${me.id}&filter=${tab}`);
      items = res.items;
      setBadges(res.badges);
      paint();
      if (!editing) {
        const unread = items.some((n) => !n.isRead);
        if (unread) {
          const read = await api('/notifications/read', { method: 'POST', body: { accountId: me.id } });
          setBadges(read.badges);
          items.forEach((n) => (n.isRead = true));
          paint();
        }
      }
    } catch (err) {
      errorToast(err);
    }
  }

  render();
  load();

  on('notification', (payload) => {
    if (payload.action === 'create' && payload.notification?.accountId === acting()?.id) {
      items.unshift(payload.notification);
      paint();
      api('/notifications/read', { method: 'POST', body: { accountId: acting().id, only: payload.notification.id } })
        .then((r) => setBadges(r.badges))
        .catch(() => {});
    } else if (payload.action === 'update' || payload.action === 'delete' || payload.action === 'clear' || payload.action === 'read') {
      load();
    }
  });
  on('session', load);
  on('clock', load);
  on('world', load);

  return { element: root, refresh: load };
}

function notificationRow(note, editing, reload) {
  const type = note.type || 'custom';
  const iconName = NOTE_ICON[type] || 'bell';
  const row = el(`<div class="notif${note.isRead ? '' : ' unread'}" data-id="${note.id}">
    <div class="notif-icon ${esc(type)}">${icons[iconName]}</div>
    <div class="notif-body">
      <div class="row" style="gap:8px;align-items:flex-start">
        ${avatarHTML(note.actor, 'a32')}
        <div class="grow">
          <div class="notif-text">
            ${note.actor ? `<a href="#/u/${esc(note.actor.handle)}" class="bold">${esc(note.actor.displayName)}</a>` : '<span class="bold">Someone</span>'}
            ${esc(note.text || defaultText(type))}
          </div>
          <div class="small muted" data-rel="${note.createdAt}">${relative(note.createdAt)}</div>
        </div>
        ${editing ? `<button class="icon-btn" data-edit>${icons.edit}</button><button class="icon-btn" data-del>${icons.trash}</button>` : ''}
      </div>
      ${note.post ? `<div class="notif-target">${esc(note.post.text || '(media post)')}</div>` : ''}
    </div>
  </div>`);

  if (note.post) {
    row.querySelector('.notif-target').addEventListener('click', () => (location.hash = `/p/${note.post.id}`));
  }
  row.querySelector('[data-edit]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openNotificationEditor(note, note.accountId, reload);
  });
  row.querySelector('[data-del]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await api(`/notifications/${note.id}`, { method: 'DELETE' });
    reload();
  });
  return row;
}

function defaultText(type) {
  return (
    {
      like: 'liked your post',
      repost: 'reposted your post',
      follow: 'followed you',
      mention: 'mentioned you',
      reply: 'replied to your post',
      quote: 'quoted your post',
      dm: 'sent you a message',
    }[type] || 'did something'
  );
}

export function openNotificationEditor(note, defaultAccountId, onSaved) {
  const editing = Boolean(note);
  const body = el(`<div>
    <p class="muted small" style="margin-top:0">Notifications are fully editable — invent them, change who they are from, or move them around in time.</p>
    <label class="field"><span>Who receives it</span>
      <select class="select" data-recipient>
        ${state.accounts.map((a) => `<option value="${a.id}" ${(note?.accountId ?? defaultAccountId) === a.id ? 'selected' : ''}>@${esc(a.handle)} — ${esc(a.displayName)}</option>`).join('')}
      </select>
    </label>
    <label class="field"><span>Who it is from</span>
      <select class="select" data-actor>
        <option value="">— nobody —</option>
        ${state.accounts.map((a) => `<option value="${a.id}" ${note?.actorId === a.id ? 'selected' : ''}>@${esc(a.handle)} — ${esc(a.displayName)}</option>`).join('')}
      </select>
    </label>
    <div class="grid-2">
      <label class="field"><span>Type</span>
        <select class="select" data-type>
          ${['like', 'repost', 'follow', 'mention', 'reply', 'quote', 'dm', 'custom'].map((t) => `<option value="${t}" ${note?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>When</span><input class="input" type="datetime-local" data-when></label>
    </div>
    <label class="field"><span>Text</span><input class="input" data-text value="${esc(note?.text || '')}" placeholder="liked your post"></label>
    <label class="field"><span>Attach a post id (optional)</span><input class="input" type="number" data-post value="${note?.postId ?? ''}" placeholder="e.g. 12"></label>
    <div class="row" style="justify-content:flex-end">
      <button class="btn ghost" data-cancel>Cancel</button>
      <button class="btn" data-save>${editing ? 'Save' : 'Add notification'}</button>
    </div>
  </div>`);

  body.querySelector('[data-when]').value = toLocalInput(note?.createdAt ?? now());
  const modal = openModal({ title: editing ? 'Edit notification' : 'New notification', body, slim: true });
  body.querySelector('[data-cancel]').addEventListener('click', () => modal.close());
  body.querySelector('[data-save]').addEventListener('click', async () => {
    const when = fromLocalInput(body.querySelector('[data-when]').value) ?? now();
    const payload = {
      accountId: Number(body.querySelector('[data-recipient]').value),
      actorId: body.querySelector('[data-actor]').value || null,
      type: body.querySelector('[data-type]').value,
      text: body.querySelector('[data-text]').value,
      postId: body.querySelector('[data-post]').value || null,
      createdAt: new Date(when).toISOString(),
    };
    try {
      if (editing) await api(`/notifications/${note.id}`, { method: 'PATCH', body: payload });
      else await api('/notifications', { method: 'POST', body: payload });
      modal.close();
      toast(editing ? 'Notification updated' : 'Notification added');
      onSaved?.();
    } catch (err) {
      errorToast(err);
    }
  });
}

export function openNotificationsMenu(anchor) {
  openMenu(anchor, [{ label: 'Mark all read', icon: 'check', onClick: () => toast('Open a notifications tab first') }]);
}

export { postCard, linkify };
