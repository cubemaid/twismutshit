import { api } from '../api.js';
import { icons } from '../icons.js';
import { acting, emit, on, state } from '../store.js';
import { fullDate, now, relative, stamp } from '../time.js';
import {
  avatarHTML,
  chipRow,
  el,
  emptyState,
  errorToast,
  esc,
  fmtCount,
  openModal,
  confirmDialog,
  toast,
} from '../ui.js';
import { clockCard, colHead, openJumpDialog } from '../shell.js';
import { openAccountEditor } from './account-editor.js';
import { openNotificationEditor } from './notifications.js';
import { openComposerAs } from '../composer.js';

const TABS = [
  { key: 'accounts', label: 'Accounts' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'trends', label: 'Trends' },
  { key: 'world', label: 'World & time' },
  { key: 'data', label: 'Data' },
];

export function adminView({ tab = 'accounts' } = {}) {
  const root = el('<div></div>');

  const head = colHead({
    title: 'Admin',
    subtitle: 'Everything in this world is editable',
    tabs: TABS,
    activeTab: tab,
    onTab: (key) => (location.hash = `/admin/${key}`),
  });
  root.appendChild(head);

  const body = el('<div style="padding:16px"></div>');
  root.appendChild(body);

  const render = () => {
    body.innerHTML = '';
    if (tab === 'accounts') renderAccounts(body);
    else if (tab === 'notifications') renderNotifications(body);
    else if (tab === 'trends') renderTrends(body);
    else if (tab === 'world') renderWorld(body);
    else renderData(body);
  };

  render();
  on('accounts', render);
  on('account', render);
  on('world', render);

  return { element: root, refresh: render };
}

/* ------------------------------------------------------------------ *
 * accounts
 * ------------------------------------------------------------------ */
function renderAccounts(body) {
  const wrap = el(`<div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn" data-new>${icons.plus} New account</button>
      <span class="muted small">${state.accounts.length} account(s). You can post as any of them at any time.</span>
    </div>
    <div class="card"><div class="table-scroll"><table class="admin-table">
      <thead><tr>
        <th>Account</th><th>Verified</th><th>Followers</th><th>Following</th><th>Posts</th><th>Joined</th><th></th>
      </tr></thead>
      <tbody></tbody>
    </table></div></div>
  </div>`);

  const tbody = wrap.querySelector('tbody');
  state.accounts.forEach((acc) => {
    const row = el(`<tr>
      <td>
        <div class="row" style="gap:10px">
          ${avatarHTML(acc, 'a32')}
          <div>
            <div class="bold">${esc(acc.displayName)}</div>
            <div class="muted small">@${esc(acc.handle)}${acc.id === acting()?.id ? ' · <span class="pill accent">posting</span>' : ''}</div>
          </div>
        </div>
      </td>
      <td><input type="checkbox" data-verified ${acc.verified ? 'checked' : ''}></td>
      <td><input class="input" style="width:92px" type="number" data-followers value="${acc.followerCount}"></td>
      <td><input class="input" style="width:92px" type="number" data-following value="${acc.followingCount}"></td>
      <td class="muted">${fmtCount(acc.postCount)}</td>
      <td class="muted small nowrap">${esc(fullDate(acc.createdAt))}</td>
      <td>
        <div class="row tight nowrap">
          <button class="btn xs ghost" data-edit>Edit</button>
          <button class="btn xs ghost" data-act>Post as</button>
          <button class="btn xs ghost" data-message>Message</button>
          <button class="btn xs danger" data-delete>Delete</button>
        </div>
      </td>
    </tr>`);

    row.querySelector('[data-edit]').addEventListener('click', () => openAccountEditor(acc, { onSaved: () => emit('accounts', state.accounts) }));
    row.querySelector('[data-act]').addEventListener('click', async () => {
      const session = await api('/session/act', { method: 'POST', body: { accountId: acc.id } });
      state.actingId = session.actingAccountId;
      state.accounts = session.accounts;
      emit('session', session);
      toast(`Now posting as @${acc.handle}`);
      emit('rerender');
    });
    row.querySelector('[data-message]').addEventListener('click', () => openComposerAs(acc, { placeholder: `Post as @${acc.handle}` }));
    row.querySelector('[data-delete]').addEventListener('click', async () => {
      if (!(await confirmDialog({ title: `Delete @${acc.handle}?`, message: 'Everything they posted goes with them.', confirmLabel: 'Delete' }))) return;
      await api(`/accounts/${acc.id}`, { method: 'DELETE' });
      toast('Deleted');
      emit('accounts', state.accounts);
    });
    row.querySelector('[data-verified]').addEventListener('change', async (e) => {
      await api(`/accounts/${acc.id}`, { method: 'PATCH', body: { verified: e.target.checked } });
      toast(e.target.checked ? 'Verified' : 'Badge removed');
    });
    const saveNumber = async (key, value, field) => {
      const real = key === 'followers' ? acc.followerCount - (acc.followerBoost || 0) : acc.followingCount - (acc.followingBoost || 0);
      await api(`/accounts/${acc.id}`, { method: 'PATCH', body: { [field]: Math.max(0, Number(value) - real) } });
      toast('Saved');
    };
    row.querySelector('[data-followers]').addEventListener('change', (e) => saveNumber('followers', e.target.value, 'followerBoost'));
    row.querySelector('[data-following]').addEventListener('change', (e) => saveNumber('following', e.target.value, 'followingBoost'));

    tbody.appendChild(row);
  });

  wrap.querySelector('[data-new]').addEventListener('click', () => openAccountEditor(null, { onSaved: () => emit('accounts', state.accounts) }));
  body.appendChild(wrap);
}

/* ------------------------------------------------------------------ *
 * notifications
 * ------------------------------------------------------------------ */
function renderNotifications(body) {
  let accountId = acting()?.id ?? state.accounts[0]?.id ?? null;

  const wrap = el(`<div>
    <div class="row" style="margin-bottom:12px">
      <label class="field" style="margin:0;min-width:240px"><span>Notifications for</span>
        <select class="select" data-account>
          ${state.accounts.map((a) => `<option value="${a.id}">@${esc(a.handle)} — ${esc(a.displayName)}</option>`).join('')}
        </select>
      </label>
      <button class="btn" data-new>${icons.plus} New notification</button>
      <button class="btn ghost" data-clear>Clear all</button>
    </div>
    <p class="hint" style="margin-top:0">Notifications here are exactly what the other writer sees. Change the actor, the wording and the time to build a story.</p>
    <div class="card"><div data-list></div></div>
  </div>`);

  const list = wrap.querySelector('[data-list]');
  const select = wrap.querySelector('[data-account]');
  if (accountId) select.value = String(accountId);

  async function load() {
    if (!accountId) {
      list.innerHTML = '';
      list.appendChild(emptyState('No accounts yet'));
      return;
    }
    const res = await api(`/notifications?accountId=${accountId}`);
    list.innerHTML = '';
    if (!res.items.length) {
      list.appendChild(emptyState('No notifications'));
      return;
    }
    res.items.forEach((note) => {
      const row = el(`<div class="card-row row" style="gap:10px">
        ${avatarHTML(note.actor, 'a32')}
        <div class="grow">
          <div><b>${esc(note.actor ? '@' + note.actor.handle : 'nobody')}</b> ${esc(note.text || '')} <span class="pill">${esc(note.type)}</span> ${note.isManual ? '<span class="pill warn">manual</span>' : ''}</div>
          <div class="muted tiny">${esc(stamp(note.createdAt))} · ${esc(relative(note.createdAt))} ago${note.postId ? ` · post #${note.postId}` : ''}</div>
        </div>
        <button class="btn xs ghost" data-edit>Edit</button>
        <button class="btn xs danger" data-del>Delete</button>
      </div>`);
      row.querySelector('[data-edit]').addEventListener('click', () => openNotificationEditor(note, accountId, load));
      row.querySelector('[data-del]').addEventListener('click', async () => {
        await api(`/notifications/${note.id}`, { method: 'DELETE' });
        load();
      });
      list.appendChild(row);
    });
  }

  select.addEventListener('change', () => {
    accountId = Number(select.value);
    load();
  });
  wrap.querySelector('[data-new]').addEventListener('click', () => openNotificationEditor(null, accountId, load));
  wrap.querySelector('[data-clear]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Clear every notification?',
      message: 'This deletes the notifications of every account, not just the one selected above. There is no undo.',
      confirmLabel: 'Clear all',
    });
    if (!ok) return;
    const res = await api('/notifications/clear', { method: 'POST', body: { all: true } });
    await load();
    toast(res?.remaining === 0 ? 'All notifications cleared' : `${res?.remaining ?? 0} notifications left`);
  });

  load();
  body.appendChild(wrap);
}

/* ------------------------------------------------------------------ *
 * trends
 * ------------------------------------------------------------------ */
function renderTrends(body) {
  const wrap = el(`<div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn" data-new>${icons.plus} New trend</button>
      <span class="muted small">Trends show up on Explore and in the sidebar. Clicking one runs a search.</span>
    </div>
    <div class="card"><div class="table-scroll"><table class="admin-table">
      <thead><tr><th>#</th><th>Name</th><th>Category</th><th>Posts</th><th></th></tr></thead>
      <tbody></tbody>
    </table></div></div>
  </div>`);

  const tbody = wrap.querySelector('tbody');
  const render = async () => {
    const trends = await api('/trends');
    state.trends = trends;
    tbody.innerHTML = '';
    if (!trends.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted" style="padding:18px">No trends yet.</td></tr>';
      return;
    }
    trends.forEach((t) => {
      const row = el(`<tr>
        <td><input class="input" style="width:64px" type="number" value="${t.position}" data-pos></td>
        <td><input class="input" value="${esc(t.name)}" data-name></td>
        <td><input class="input" value="${esc(t.category)}" data-cat></td>
        <td><input class="input" style="width:110px" type="number" value="${t.post_count}" data-count></td>
        <td><div class="row tight nowrap">
          <button class="btn xs ghost" data-save>Save</button>
          <button class="btn xs ghost" data-search>Search</button>
          <button class="btn xs danger" data-del>Delete</button>
        </div></td>
      </tr>`);
      const save = async () => {
        await api(`/trends/${t.id}`, {
          method: 'PATCH',
          body: {
            name: row.querySelector('[data-name]').value,
            category: row.querySelector('[data-cat]').value,
            postCount: Number(row.querySelector('[data-count]').value) || 0,
            position: Number(row.querySelector('[data-pos]').value) || 0,
          },
        });
        toast('Trend saved');
        render();
      };
      row.querySelector('[data-save]').addEventListener('click', save);
      row.querySelector('[data-search]').addEventListener('click', () => (location.hash = `/search?q=${encodeURIComponent(t.name)}`));
      row.querySelector('[data-del]').addEventListener('click', async () => {
        await api(`/trends/${t.id}`, { method: 'DELETE' });
        render();
      });
      tbody.appendChild(row);
    });
  };

  wrap.querySelector('[data-new]').addEventListener('click', async () => {
    await api('/trends', { method: 'POST', body: { name: 'New trend', category: '', postCount: 1 } });
    render();
  });

  render();
  body.appendChild(wrap);
}

/* ------------------------------------------------------------------ *
 * world / time
 * ------------------------------------------------------------------ */
function renderWorld(body) {
  const wrap = el(`<div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-head sm">${icons.clock} The clock</div>
      <div class="card-body" data-clock></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-head sm">${icons.eye} Current state</div>
      <div class="card-body" data-stats></div>
    </div>

    <div class="card">
      <div class="card-head sm">${icons.warning} Danger zone</div>
      <div class="card-body">
        <p class="muted small" style="margin-top:0">These wipe data for both of you, immediately.</p>
        <div class="row">
          <button class="btn ghost" data-reset-dms>Delete all messages</button>
          <button class="btn ghost" data-reset-posts>Delete all posts</button>
          <button class="btn danger" data-reset-all>Wipe everything</button>
        </div>
        <div class="hint">
          <b>Wipe everything</b> leaves the world completely empty — zero accounts, posts, DMs,
          notifications and trends. Nothing is recreated afterwards, so you will be asked to make
          a new account the next time you open the app. The clock and site settings are kept.
        </div>
      </div>
    </div>
  </div>`);

  const clockHost = wrap.querySelector('[data-clock]');
  clockHost.appendChild(clockCard({ compact: true }));

  const stats = wrap.querySelector('[data-stats]');
  Promise.all([api('/timeline?type=all&limit=1'), api('/conversations').catch(() => ({ items: [] }))])
    .then(() => {
      const list = state.accounts;
      stats.innerHTML = `
        <div class="row" style="gap:24px">
          <div><div class="clock-now">${list.length}</div><div class="muted small">accounts</div></div>
          <div><div class="clock-now">${fmtCount(list.reduce((sum, a) => sum + a.postCount, 0))}</div><div class="muted small">posts</div></div>
          <div><div class="clock-now">${new Date(now()).toLocaleDateString()}</div><div class="muted small">today in the timeline</div></div>
        </div>`;
    })
    .catch(() => {});

  wrap.querySelector('[data-reset-dms]').addEventListener('click', () => doReset('dms'));
  wrap.querySelector('[data-reset-posts]').addEventListener('click', () => doReset('posts'));
  wrap.querySelector('[data-reset-all]').addEventListener('click', () => doReset('all'));

  body.appendChild(wrap);
}

async function doReset(scope) {
  const labels = { dms: 'all messages', posts: 'all posts', all: 'everything' };
  if (!(await confirmDialog({
    title: `Delete ${labels[scope]}?`,
    message:
      scope === 'all'
        ? 'Every account, post, DM, notification and trend is erased and nothing is recreated. Export a backup first!'
        : 'This cannot be undone.',
    confirmLabel: scope === 'all' ? 'Wipe everything' : 'Delete',
  }))) return;
  const res = await api('/admin/reset', { method: 'POST', body: { scope } });
  const left = res?.left;
  toast(left ? `Wiped — ${left.accounts} accounts, ${left.posts} posts left` : 'Done — reloading');
  setTimeout(() => location.reload(), 900);
}

/* ------------------------------------------------------------------ *
 * data
 * ------------------------------------------------------------------ */
function renderData(body) {
  const wrap = el(`<div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-head sm">${icons.download} Backup</div>
      <div class="card-body">
        <p class="muted small" style="margin-top:0">A single JSON file with every account, post, DM, like, follow, notification and trend.</p>
        <div class="row">
          <a class="btn" href="/api/export">${icons.download} Download a backup</a>
          <button class="btn ghost" data-import>${icons.upload} Restore from a backup</button>
        </div>
        <div class="hint">Restoring replaces the entire world with the contents of the file.</div>
        <input type="file" accept="application/json" hidden data-file>
      </div>
    </div>

    <div class="card">
      <div class="card-head sm">${icons.warning} Reset</div>
      <div class="card-body">
        <div class="row">
          <button class="btn ghost" data-reset-dms>Delete all messages</button>
          <button class="btn ghost" data-reset-posts>Delete all posts</button>
          <button class="btn danger" data-reset-all>Reset the whole world</button>
        </div>
      </div>
    </div>
  </div>`);

  const file = wrap.querySelector('[data-file]');
  wrap.querySelector('[data-import]').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      await api('/import', { method: 'POST', body: JSON.parse(await f.text()) });
      toast('Restored — reloading');
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      errorToast(err);
    }
  });
  wrap.querySelector('[data-reset-dms]').addEventListener('click', () => doReset('dms'));
  wrap.querySelector('[data-reset-posts]').addEventListener('click', () => doReset('posts'));
  wrap.querySelector('[data-reset-all]').addEventListener('click', () => doReset('all'));
  body.appendChild(wrap);
}
