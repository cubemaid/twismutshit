import { api } from './api.js';
import { icons, icon } from './icons.js';
import { isShotMode, setShotMode } from './screenshot.js';
import { acting, state, setNickname, nickname, emit, on } from './store.js';
import { socketAct, socketId } from './socket.js';
import {
  describeOffset,
  fullDate,
  isAltered,
  isFrozen,
  longDate,
  now,
  offsetMs,
  onClockChange,
  timeOfDay,
} from './time.js';
import {
  avatarHTML,
  el,
  esc,
  errorToast,
  fmtCount,
  onDetach,
  openMenu,
  openModal,
  route,
  toast,
} from './ui.js';

/* ------------------------------------------------------------------ *
 * clock helpers
 * ------------------------------------------------------------------ */
export async function pushClock(payload, message) {
  try {
    const clock = await api('/clock', { method: 'POST', body: payload });
    if (message) toast(message);
    return clock;
  } catch (err) {
    errorToast(err);
    return null;
  }
}

export function openJumpDialog() {
  return import('./composer.js').then(({ openTimePicker }) =>
    openTimePicker(now(), { title: 'Jump the whole timeline to…' }).then((ms) => {
      if (ms === null) return;
      return pushClock({ iso: new Date(ms).toISOString() }, `Timeline jumped to ${fullDate(ms)}`);
    })
  );
}

/* ------------------------------------------------------------------ *
 * clock widget
 * ------------------------------------------------------------------ */
const BACK_STEPS = [
  ['−1y', -31557600000],
  ['−1mo', -2629800000],
  ['−1w', -604800000],
  ['−1d', -86400000],
  ['−1h', -3600000],
  ['−10m', -600000],
];
const FWD_STEPS = [
  ['+10m', 600000],
  ['+1h', 3600000],
  ['+1d', 86400000],
  ['+1mo', 2629800000],
  ['+1y', 31557600000],
];

export function clockCard({ compact = false } = {}) {
  const card = el(`<div class="card clock-card">
    <div class="card-head sm">${icons.clock}<span>Time machine</span></div>
    <div class="card-body">
      <div class="clock-now" data-live-date></div>
      <div class="clock-time"><span data-live-time></span> <span class="muted tiny" data-live-offset></span></div>
      <div class="clock-btn-row">
        ${BACK_STEPS.map(([label, delta]) => `<button class="clock-chip" data-delta="${delta}">${label}</button>`).join('')}
      </div>
      <div class="clock-btn-row">
        ${FWD_STEPS.map(([label, delta]) => `<button class="clock-chip" data-delta="${delta}">${label}</button>`).join('')}
      </div>
      <div class="clock-btn-row">
        <button class="clock-chip" data-jump>Jump to a date…</button>
        <button class="clock-chip" data-freeze></button>
        <button class="clock-chip now" data-live>Back to live</button>
      </div>
      ${
        compact
          ? ''
          : `<div class="hint">Everything — timelines, "3m ago", notifications — runs on this clock. Both of you share it, so you always see the same moment.</div>`
      }
    </div>
  </div>`);

  const set = (sel, value) => {
    const node = card.querySelector(sel);
    if (node) node.textContent = value;
  };
  const paint = () => {
    const n = now();
    set('[data-live-date]', longDate(n));
    set('[data-live-time]', timeOfDay(n));
    const off = offsetMs();
    const frozen = isFrozen();
    const bits = [];
    if (off) bits.push(describeOffset(off));
    if (frozen) bits.push('frozen');
    bits.push(`real time ${timeOfDay(Date.now())}`);
    set('[data-live-offset]', `· ${bits.join(' · ')}`);
    const freezeBtn = card.querySelector('[data-freeze]');
    if (!freezeBtn) return;
    freezeBtn.textContent = frozen ? 'Unfreeze' : 'Freeze';
    freezeBtn.classList.toggle('on', frozen);
  };

  card.querySelectorAll('[data-delta]').forEach((b) =>
    b.addEventListener('click', () => {
      const delta = Number(b.dataset.delta);
      const n = now() + delta;
      pushClock({ deltaMs: delta }, `Timeline moved to ${fullDate(n)} ${timeOfDay(n)}`);
    })
  );
  card.querySelector('[data-jump]').addEventListener('click', openJumpDialog);
  card.querySelector('[data-freeze]').addEventListener('click', () => {
    pushClock({ frozen: !isFrozen() }, isFrozen() ? 'Clock running again' : 'Clock frozen — time stands still');
  });
  card.querySelector('[data-live]').addEventListener('click', () => {
    pushClock({ offsetMs: 0, frozen: false }, 'Back to real time');
  });

  paint();
  const timer = setInterval(paint, 1000);
  const unsubscribe = onClockChange(paint);
  onDetach(card, () => {
    clearInterval(timer);
    unsubscribe();
  });
  return card;
}

/** thin sticky bar shown in the column whenever the timeline is off real time */
export function clockBanner() {
  const bar = el(`<div class="clock-banner" style="display:none">
    ${icons.clock}
    <span class="grow" data-text></span>
    <button data-live>back to live</button>
    <button data-open>open time machine</button>
  </div>`);
  const paint = () => {
    const altered = isAltered();
    bar.style.display = altered ? 'flex' : 'none';
    if (!altered) return;
    const n = now();
    const parts = [`Timeline: ${fullDate(n)} · ${timeOfDay(n)}`];
    if (offsetMs()) parts.push(describeOffset(offsetMs()));
    if (isFrozen()) parts.push('frozen');
    bar.querySelector('[data-text]').textContent = parts.join(' · ');
  };
  bar.querySelector('[data-live]').addEventListener('click', () => pushClock({ offsetMs: 0, frozen: false }, 'Back to real time'));
  bar.querySelector('[data-open]').addEventListener('click', () => openClockModal());
  paint();
  const timer = setInterval(paint, 1000);
  const unsubscribe = onClockChange(paint);
  onDetach(bar, () => {
    clearInterval(timer);
    unsubscribe();
  });
  return bar;
}

export function openClockModal() {
  // nothing Chirper-only may appear in a clean screenshot
  if (isShotMode()) return null;
  const body = el('<div></div>');
  body.appendChild(clockCard());
  body.insertAdjacentHTML(
    'beforeend',
    `<div class="hint" style="margin-top:14px">Tip: hover the clock button in a composer and right-click it to snap back to "now".</div>`
  );
  const modal = openModal({ title: 'Time machine', body, slim: true });
  modal.modal.closest('.modal-backdrop')?.classList.add('clock-modal');
  clockModal = modal;
  shotWatch();
  return modal;
}

/* the time machine is tracked so screenshot mode can shut it on its way in */
let clockModal = null;
let clockWatchWired = false;

function shotWatch() {
  if (clockWatchWired) return;
  clockWatchWired = true;
  on('shot-mode', (on) => {
    if (!on || !clockModal) return;
    const instance = clockModal;
    clockModal = null;
    instance.close();
  });
}

/* ------------------------------------------------------------------ *
 * column header
 * ------------------------------------------------------------------ */
export function colHead({ title, subtitle = '', backTo = null, tabs = null, activeTab = null, onTab = null, right = '' }) {
  const head = el(`<div class="col-head">
    <div class="col-head-top">
      ${backTo ? `<button class="icon-btn" data-back>${icons.back}</button>` : ''}
      <div class="grow">
        <div class="col-head-title">${esc(title)}</div>
        ${subtitle ? `<div class="col-head-sub">${subtitle}</div>` : ''}
      </div>
      ${right}
    </div>
  </div>`);
  if (backTo !== null) {
    head.querySelector('[data-back]')?.addEventListener('click', () => route.go(backTo));
  }
  if (tabs) {
    const bar = el('<div class="tabs"></div>');
    tabs.forEach((t) => {
      const b = el(`<button class="tab${t.key === activeTab ? ' active' : ''}">${esc(t.label)}</button>`);
      b.addEventListener('click', () => onTab?.(t.key));
      bar.appendChild(b);
    });
    head.appendChild(bar);
  }
  return head;
}

/** "Writer 2 is writing a post…" */
export function composingBar(context = 'post') {
  const bar = el('<div class="small" style="padding:8px 16px;color:var(--text-dim);display:none"></div>');
  const paint = () => {
    const me = socketId();
    const others = Object.entries(state.composing)
      .filter(([id, v]) => v && id !== me && (v.context || 'post') === context)
      .map(([, v]) => v.label);
    if (!others.length) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'block';
    bar.innerHTML = `${icon('edit')} ${esc(others.join(', '))} ${others.length > 1 ? 'are' : 'is'} writing a post…`;
    bar.querySelector('svg').style.width = '15px';
    bar.querySelector('svg').style.verticalAlign = '-3px';
  };
  on('composing', paint);
  paint();
  return bar;
}

/* ------------------------------------------------------------------ *
 * account switcher
 * ------------------------------------------------------------------ */
export async function switchAccount(accountId) {
  try {
    const session = await api('/session/act', { method: 'POST', body: { accountId } });
    state.actingId = session.actingAccountId;
    state.accounts = session.accounts;
    state.badges = session.badges;
    socketAct(session.actingAccountId);
    emit('session', session);
    toast(accountId ? `Now posting as @${accountByIdLocal(accountId)?.handle}` : 'Not posting as anyone yet');
    emit('rerender');
  } catch (err) {
    errorToast(err);
  }
}

function accountByIdLocal(id) {
  return state.accounts.find((a) => a.id === Number(id));
}

export function openAccountMenu(anchor) {
  const me = acting();
  const items = [
    { title: 'Post as' },
    ...state.accounts.map((acc) => ({
      label: `${acc.id === me?.id ? '✓ ' : ''}@${acc.handle}`,
      icon: 'user',
      onClick: () => switchAccount(acc.id),
    })),
    { sep: true },
    { label: 'New account…', icon: 'plus', onClick: () => emit('create-account') },
    { label: 'Manage accounts', icon: 'sliders', onClick: () => route.go('/admin/accounts') },
    { sep: true },
    { label: `Nickname: ${nickname() || 'not set'}`, icon: 'at', onClick: openNicknameDialog },
    { label: 'Settings', icon: 'settings', onClick: () => route.go('/settings') },
    ...(me ? [{ label: `Add a post as @${me.handle}`, icon: 'edit', onClick: () => emit('open-composer') }] : []),
    { sep: true },
    { label: 'Sign out', icon: 'logout', danger: true, onClick: async () => {
      await api('/logout', { method: 'POST' });
      location.reload();
    } },
  ];
  openMenu(anchor, items, { align: 'left' });
}

function openNicknameDialog() {
  const body = el(`<div>
    <p class="muted small" style="margin-top:0">A nickname only you see — it shows up next to your cursor of activity so you know who is who.</p>
    <label class="field"><span>Your nickname</span><input class="input" data-name value="${esc(nickname())}" placeholder="e.g. Riley"></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-save>Save</button></div>
  </div>`);
  const modal = openModal({ title: 'Nickname', body, slim: true });
  body.querySelector('[data-save]').addEventListener('click', () => {
    setNickname(body.querySelector('[data-name]').value.trim());
    emit('presence', state.presence);
    modal.close();
    toast('Nickname saved');
  });
}

/* ------------------------------------------------------------------ *
 * sidebar + rail
 * ------------------------------------------------------------------ */
const NAV = [
  { key: 'home', label: 'Home', icon: 'home', path: '/home' },
  { key: 'explore', label: 'Explore', icon: 'search', path: '/explore' },
  { key: 'notifications', label: 'Notifications', icon: 'bell', path: '/notifications', badge: 'notifications' },
  { key: 'messages', label: 'Messages', icon: 'mail', path: '/messages', badge: 'messages' },
  { key: 'bookmarks', label: 'Bookmarks', icon: 'bookmark', path: '/bookmarks' },
  { key: 'profile', label: 'Profile', icon: 'user', path: '/me' },
  { key: 'settings', label: 'Settings', icon: 'settings', path: '/settings' },
  { key: 'admin', label: 'Admin', icon: 'sliders', path: '/admin', appOnly: true },
];

export function renderSidebar(active) {
  const me = acting();
  const side = el(`<aside class="sidebar">
    <nav class="nav"></nav>
  </aside>`);
  const nav = side.querySelector('.nav');
  NAV.filter((item) => item.key !== 'settings').forEach((item) => {
    const count = item.badge ? state.badges[item.badge] : 0;
    const node = el(`<a class="nav-item${active === item.key ? ' active' : ''}${item.appOnly ? ' nav-apponly' : ''}" href="#${item.path}">
      <span class="ico">${icon(item.icon)}</span>
      <span class="label">${esc(item.label)}</span>
      ${count ? `<span class="nav-badge">${count > 99 ? '99+' : count}</span>` : ''}
    </a>`);
    nav.appendChild(node);
  });

  side.appendChild(el(`<button class="post-btn" data-post>${esc('Post')}<span class="post-btn-icon">${icons.plus}</span></button>`));
  side.appendChild(el('<div class="sidebar-spacer"></div>'));

  const chip = el(`<button class="account-chip">
    ${avatarHTML(me, 'a40')}
    <div class="who">
      <div class="name">${esc(me ? me.displayName : 'Pick an account')}</div>
      <div class="handle">${me ? '@' + esc(me.handle) : 'nobody selected'}</div>
    </div>
    <span class="dots">${icons.moreH}</span>
  </button>`);
  chip.addEventListener('click', () => openAccountMenu(chip));
  side.appendChild(chip);
  side.querySelector('[data-post]').addEventListener('click', () => emit('open-composer'));
  return side;
}

export function renderRail() {
  const rail = el('<aside class="rail"></aside>');

  /* search */
  const search = el(`<div class="search-box">${icons.search}<input placeholder="Search ${esc(state.settings.siteName || 'Chirper')}" data-search></div>`);
  const input = search.querySelector('input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) location.hash = `/search?q=${encodeURIComponent(input.value.trim())}`;
  });
  rail.appendChild(search);

  /* who is here */
  const writers = state.presence || [];
  if (writers.length) {
    const card = el('<div class="card presence-card"><div class="card-head sm">Who\'s here</div><div class="card-body" style="display:grid;gap:10px"></div></div>');
    const bodyEl = card.querySelector('.card-body');
    writers.forEach((w) => {
      const acc = state.accounts.find((a) => a.id === w.accountId);
      const isMe = w.id === socketId();
      const color = w.color || 'var(--accent)';
      const row = el(`<div class="row" style="gap:8px">
        <span style="width:9px;height:9px;border-radius:50%;background:${esc(color)};flex:none"></span>
        <div class="grow small nowrap">
          <b>${esc(nickname() && isMe ? nickname() : w.label)}</b>${isMe ? ' <span class="muted">(you)</span>' : ''}
          <div class="muted tiny">${acc ? 'posting as @' + esc(acc.handle) : 'no account selected'}</div>
        </div>
      </div>`);
      bodyEl.appendChild(row);
    });
    rail.appendChild(card);
  }

  /* time machine */
  rail.appendChild(clockCard());

  /* trends */
  const trends = state.trends || [];
  const trendCard = el(`<div class="card">
    <div class="card-head sm">Trends <span class="grow"></span><button class="icon-btn" data-manage title="Edit trends">${icons.settings}</button></div>
    <div class="card-body" style="padding:6px 0"></div>
  </div>`);
  const tBody = trendCard.querySelector('.card-body');
  if (!trends.length) {
    tBody.innerHTML = '<div class="muted small" style="padding:8px 16px">No trends yet — add some in Admin.</div>';
  } else {
    trends.slice(0, 8).forEach((t) => {
      const row = el(`<div class="card-row trend-item">
        <div>
          <div class="cat">${esc(t.category || 'Trending')}</div>
          <div class="name">${esc(t.name)}</div>
          <div class="count">${fmtCount(t.post_count)} posts</div>
        </div>
      </div>`);
      row.addEventListener('click', () => (location.hash = `/search?q=${encodeURIComponent(t.name)}`));
      tBody.appendChild(row);
    });
  }
  trendCard.querySelector('[data-manage]').addEventListener('click', () => route.go('/admin/trends'));
  rail.appendChild(trendCard);

  /* who to follow */
  const me = acting();
  const suggestions = state.accounts.filter((a) => !a.archived && a.id !== me?.id).slice(0, 4);
  if (suggestions.length) {
    const card = el('<div class="card"><div class="card-head sm">Who to follow</div><div class="card-body" style="padding:6px 0"></div></div>');
    const b = card.querySelector('.card-body');
    suggestions.forEach((acc) => {
      const row = el(`<div class="card-row row" style="align-items:center">
        ${avatarHTML(acc, 'a40')}
        <a class="grow nowrap" href="#/u/${esc(acc.handle)}" style="color:inherit">
          <div class="bold nowrap">${esc(acc.displayName)}</div>
          <div class="muted small nowrap">@${esc(acc.handle)}</div>
        </a>
        <button class="btn sm ${acc.isFollowedByViewer ? 'outline-follow' : ''}" data-follow>${acc.isFollowedByViewer ? 'Following' : 'Follow'}</button>
      </div>`);
      row.querySelector('[data-follow]').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!acting()) return toast('Pick an account first', 'error');
        const btn = e.currentTarget;
        try {
          await api(`/accounts/${acc.id}/follow`, { method: 'POST', body: { on: !acc.isFollowedByViewer } });
          acc.isFollowedByViewer = !acc.isFollowedByViewer;
          btn.textContent = acc.isFollowedByViewer ? 'Following' : 'Follow';
          btn.classList.toggle('outline-follow', acc.isFollowedByViewer);
        } catch (err) {
          errorToast(err);
        }
      });
      b.appendChild(row);
    });
    rail.appendChild(card);
  }

  rail.insertAdjacentHTML(
    'beforeend',
    `<div class="small faint rail-footer">${esc(state.settings.siteName || 'Chirper')} · running on your own server · <a href="#/settings">settings</a></div>`
  );
  return rail;
}

export function renderMobileNav(active) {
  const nav = el('<nav class="mobile-nav"></nav>');
  ['home', 'explore', 'notifications', 'messages'].forEach((key) => {
    const item = NAV.find((n) => n.key === key);
    const count = item.badge ? state.badges[item.badge] : 0;
    const node = el(`<a class="nav-item${active === key ? ' active' : ''}" href="#${item.path}">
      <span class="ico">${icon(item.icon)}</span>
      ${count ? `<span class="nav-badge">${count}</span>` : ''}
    </a>`);
    nav.appendChild(node);
  });
  const menu = el(`<button class="nav-item${['bookmarks', 'profile', 'admin', 'settings'].includes(active) ? ' active' : ''}" data-drawer><span class="ico">${icons.more}</span></button>`);
  menu.addEventListener('click', () => openMobileDrawer(active));
  nav.appendChild(menu);
  return nav;
}

/** The floating compose button - the only way to start a post on a phone. */
export function renderPostFab() {
  const fab = el(`<button class="post-fab" data-fab title="New post (n)">${icons.edit}</button>`);
  fab.addEventListener('click', () => emit('open-composer'));
  return fab;
}

/* ------------------------------------------------------------------ *
 * mobile drawer — the sidebar, for phones
 * ------------------------------------------------------------------ */
let drawerNode = null;

export function closeMobileDrawer() {
  drawerNode?.remove();
  drawerNode = null;
  document.documentElement.classList.remove('drawer-open');
}

export function openMobileDrawer(active = null) {
  closeMobileDrawer();
  const me = acting();
  const sheet = el(`<div class="drawer-wrap">
    <div class="drawer-overlay" data-overlay></div>
    <aside class="drawer">
      <div class="drawer-head">
        <button class="logo-btn" data-logo>${icons.bird}</button>
        <div class="grow bold">${esc(state.settings.siteName || 'Chirper')}</div>
        <button class="icon-btn" data-close>${icons.close}</button>
      </div>
      <div class="drawer-body"></div>
      <div class="drawer-foot"></div>
    </aside>
  </div>`);

  const current = active ?? parseActiveFromHash();
  const body = sheet.querySelector('.drawer-body');
  NAV.forEach((item) => {
    const count = item.badge ? state.badges[item.badge] : 0;
    const row = el(`<a class="drawer-item${current === item.key ? ' active' : ''}" href="#${item.path}">
      <span class="ico">${icon(item.icon)}</span>
      <span class="grow">${esc(item.label)}</span>
      ${count ? `<span class="nav-badge">${count > 99 ? '99+' : count}</span>` : ''}
    </a>`);
    row.addEventListener('click', () => closeMobileDrawer());
    body.appendChild(row);
  });

  const shotRow = el(`<a class="drawer-item" href="#">
    <span class="ico">${icons.image}</span>
    <span class="grow">Screenshot mode</span>
  </a>`);
  shotRow.addEventListener('click', (e) => {
    e.preventDefault();
    closeMobileDrawer();
    setShotMode(true);
  });
  body.appendChild(shotRow);

  const foot = sheet.querySelector('.drawer-foot');
  const post = el(`<button class="btn block" data-post>${esc('Post')}</button>`);
  post.addEventListener('click', () => {
    closeMobileDrawer();
    emit('open-composer');
  });
  const chip = el(`<button class="account-chip">
    ${avatarHTML(me, 'a40')}
    <div class="who">
      <div class="name">${esc(me ? me.displayName : 'Pick an account')}</div>
      <div class="handle">${me ? '@' + esc(me.handle) : 'nobody selected'}</div>
    </div>
    <span class="dots">${icons.moreH}</span>
  </button>`);
  chip.addEventListener('click', (e) => openAccountMenu(e.currentTarget));
  foot.append(post, chip);

  sheet.querySelector('[data-overlay]').addEventListener('click', closeMobileDrawer);
  sheet.querySelector('[data-close]').addEventListener('click', closeMobileDrawer);
  sheet.querySelector('[data-logo]').addEventListener('click', () => {
    closeMobileDrawer();
    location.hash = '/home';
  });

  document.body.appendChild(sheet);
  drawerNode = sheet;
  document.documentElement.classList.add('drawer-open');
  requestAnimationFrame(() => sheet.querySelector('.drawer').classList.add('open'));
}

function parseActiveFromHash() {
  const seg = (location.hash.replace(/^#/, '').split('/')[1] || 'home').split('?')[0];
  if (seg === 'u' || seg === 'me') return 'profile';
  if (seg === 'p') return 'home';
  if (seg === 'search') return 'explore';
  return seg;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMobileDrawer();
});
