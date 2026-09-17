/**
 * The slim, phone-style status bar.
 *
 * It replaces the old chunky column header + filter-chip row with one 30px
 * strip across the top of the app. What lives inside it is up to the reader:
 * tap the strip (or the empty space between the two clusters) to open the
 * picker and choose which pieces show up.
 */
import { icons } from './icons.js';
import { acting, emit, state } from './store.js';
import { avatarHTML, el, esc, openModal, route } from './ui.js';
import { isAltered, isFrozen, now, onClockChange, timeOfDay } from './time.js';
import { openAccountMenu, openClockModal, openMobileDrawer } from './shell.js';
import { setShotMode } from './screenshot.js';

const KEY = 'chirper:statusbar';

/* Everything that can sit in the bar. `side` decides which cluster it joins. */
const ITEMS = [
  { key: 'menu', side: 'left', label: 'Menu button', hint: 'Opens the nav drawer. Phones only.' },
  { key: 'clock', side: 'left', label: 'Time', hint: 'The shared fictional clock. Tapping it opens the time machine.' },
  { key: 'character', side: 'left', label: 'Acting character', hint: 'Who you are posting as — tap to swap.' },
  { key: 'page', side: 'left', label: 'Section name', hint: 'The page you are looking at.' },
  { key: 'feed', side: 'right', label: 'Feed switcher', hint: 'Following / Everything, without leaving the top (home only).' },
  { key: 'search', side: 'right', label: 'Search', hint: 'Jump straight to Explore.' },
  { key: 'notifications', side: 'right', label: 'Notifications', hint: 'Bell plus your unread count.' },
  { key: 'messages', side: 'right', label: 'Messages', hint: 'Envelope plus your unread count.' },
  { key: 'shot', side: 'right', label: 'Screenshot mode', hint: 'Toggle clean view from anywhere.' },
  { key: 'phone', side: 'right', label: 'Signal · Wi-Fi · battery', hint: 'Purely decorative. Completes the look.' },
];

const DEFAULTS = ['menu', 'clock', 'character', 'search', 'notifications', 'phone'];

/* ------------------------------------------------------------------ *
 * preferences
 * ------------------------------------------------------------------ */
function readPrefs() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== 'object') return { items: [...DEFAULTS], clock24: false };
  const known = new Set(ITEMS.map((i) => i.key));
  // an empty array is a legitimate choice ("bare bar"), so only fall back when
  // the stored value is unusable.
  const items = Array.isArray(raw.items)
    ? ITEMS.filter((i) => raw.items.includes(i.key) && known.has(i.key)).map((i) => i.key)
    : [...DEFAULTS];
  return { items, clock24: Boolean(raw.clock24) };
}

function writePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode — the bar just forgets */
  }
}

/* ------------------------------------------------------------------ *
 * the live clock
 *
 * Status bars come and go on every navigation, so instead of one listener per
 * bar we keep a registry of clock nodes and prune the dead ones on each tick.
 * ------------------------------------------------------------------ */
const clockNodes = new Set();
let wired = false;

function wireClocks() {
  if (wired) return;
  wired = true;
  onClockChange(paintClocks);
}

const two = (n) => String(n).padStart(2, '0');

function paintClock(node) {
  if (!node) return;
  const d = new Date(now());
  node.textContent = node.dataset.clock24 === '1' ? `${two(d.getHours())}:${two(d.getMinutes())}` : timeOfDay(now());
  const dot = node.closest('.sb-item')?.querySelector('.sb-dot');
  if (dot) {
    const status = isFrozen() ? 'frozen' : isAltered() ? 'shifted' : 'live';
    dot.dataset.state = status;
    dot.title = status === 'live' ? 'Running on real time' : status === 'frozen' ? 'Clock frozen' : 'Clock shifted';
  }
}

function paintClocks() {
  for (const node of [...clockNodes]) {
    if (!node.isConnected) clockNodes.delete(node);
    else paintClock(node);
  }
}

/* ------------------------------------------------------------------ *
 * building
 * ------------------------------------------------------------------ */
let lastRoute = null;

function act(html, title, cls = '') {
  const b = el(`<button class="sb-item ${cls}" data-sb-act title="${esc(title)}">${html}</button>`);
  return b;
}

function countBadge(n) {
  const v = Number(n) || 0;
  return v ? `<span class="sb-badge">${v > 99 ? '99+' : v}</span>` : '';
}

/** A short human name for wherever we are. */
function sectionLabel(here) {
  if (!here) return '';
  switch (here.name) {
    case 'home':
      return 'Home';
    case 'explore':
      return 'Explore';
    case 'search':
      return 'Search';
    case 'notifications':
      return 'Notifications';
    case 'messages':
      return here.params?.id ? 'Message' : 'Messages';
    case 'bookmarks':
      return 'Bookmarks';
    case 'me':
      return 'Profile';
    case 'profile':
      return here.params?.handle ? `@${here.params.handle}` : 'Profile';
    case 'post':
      return 'Post';
    case 'admin':
      return 'Admin';
    case 'settings':
      return 'Settings';
    default:
      return '';
  }
}

function buildBar(prefs, here) {
  const has = (k) => prefs.items.includes(k);
  const active = here?.active ?? null;
  const bar = el(
    `<div class="statusbar" title="Tap the bar to choose what shows up here">${'<div class="sb-inner"><div class="sb-side"></div><div class="sb-side sb-right"></div></div>'}</div>`
  );
  const [left, right] = bar.querySelectorAll('.sb-side');

  /* ---------------------------------------------------------- left */
  if (has('menu')) {
    const b = act(icons.moreH, 'Menu', 'sb-menu');
    b.addEventListener('click', () => openMobileDrawer(active));
    left.appendChild(b);
  }

  if (has('clock')) {
    const b = act('<span class="sb-dot" data-state="live"></span><span class="sb-clock"></span>', 'Time machine', 'sb-time');
    const clock = b.querySelector('.sb-clock');
    clock.dataset.clock24 = prefs.clock24 ? '1' : '0';
    clockNodes.add(clock);
    paintClock(clock);
    b.addEventListener('click', () => openClockModal());
    left.appendChild(b);
  }

  if (has('character')) {
    const me = acting();
    const b = act(
      `${avatarHTML(me, 'a18')}<span class="sb-name">${esc(me ? me.displayName : 'Pick account')}</span>`,
      me ? `Posting as @${me.handle} — tap to swap character` : 'Pick who you are posting as',
      'sb-char'
    );
    b.addEventListener('click', () => openAccountMenu(b));
    left.appendChild(b);
  }

  if (has('page')) {
    const label = sectionLabel(here);
    if (label) left.appendChild(el(`<span class="sb-item sb-plain sb-page">${esc(label)}</span>`));
  }

  /* --------------------------------------------------------- right */
  if (has('feed') && here?.name === 'home') {
    const tab = localStorage.getItem('chirper:homeTab') || 'following';
    const wrap = el(`<span class="sb-feed" data-sb-act>
      <button data-k="following" class="${tab === 'following' ? 'on' : ''}">Following</button>
      <button data-k="all" class="${tab === 'all' ? 'on' : ''}">Everything</button>
    </span>`);
    wrap.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        localStorage.setItem('chirper:homeTab', b.dataset.k);
        emit('rerender');
      })
    );
    right.appendChild(wrap);
  }

  if (has('search')) {
    const b = act(icons.search, 'Search');
    b.addEventListener('click', () => route.go('/explore'));
    right.appendChild(b);
  }

  if (has('notifications')) {
    const b = act(`${icons.bell}${countBadge(state.badges.notifications)}`, 'Notifications');
    b.addEventListener('click', () => route.go('/notifications'));
    right.appendChild(b);
  }

  if (has('messages')) {
    const b = act(`${icons.mail}${countBadge(state.badges.messages)}`, 'Messages');
    b.addEventListener('click', () => route.go('/messages'));
    right.appendChild(b);
  }

  if (has('shot')) {
    const b = act(icons.image, 'Screenshot mode');
    b.addEventListener('click', () => setShotMode(true));
    right.appendChild(b);
  }

  if (has('phone')) {
    right.appendChild(el(`<span class="sb-item sb-plain sb-phone">${icons.signal}${icons.wifi}${icons.battery}</span>`));
  }

  return bar;
}

/** Mounted by app.js on every route change; returns the bar element. */
export function renderStatusbar(here = null) {
  lastRoute = here ?? lastRoute;
  wireClocks();
  const bar = buildBar(readPrefs(), lastRoute);
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-sb-act]')) return;
    openStatusBarSettings();
  });
  return bar;
}

/* ------------------------------------------------------------------ *
 * the picker — tap the bar to open this
 * ------------------------------------------------------------------ */
export function openStatusBarSettings() {
  const body = el(`<div class="sb-set">
    <div class="sb-preview">
      <div class="sb-preview-cap">Preview</div>
      <div class="sb-preview-bar" data-preview></div>
      <div class="hint">Tap any line below to add or remove it. The bar is only yours — your co-writer gets their own.</div>
    </div>
    <div class="sb-opts" data-opts></div>
    <div class="sb-set-foot">
      <span class="muted tiny grow">Saved in this browser only.</span>
      <button class="btn ghost sm" data-reset>${icons.refresh} Reset</button>
    </div>
  </div>`);

  const previewEl = body.querySelector('[data-preview]');
  const optsEl = body.querySelector('[data-opts]');
  let draft = readPrefs();

  const paintPreview = () => {
    previewEl.innerHTML = '';
    previewEl.appendChild(buildBar(draft, lastRoute));
  };

  function apply({ rebuild = true } = {}) {
    writePrefs(draft);
    if (rebuild) paintOpts();
    paintPreview();
    emit('statusbar');
  }

  function optRow({ key, label, hint, on }) {
    const row = el(`<button class="sb-opt${on ? ' on' : ''}">
      <span class="grow">
        <span class="sb-opt-label">${esc(label)}</span>
        <span class="sb-opt-hint">${esc(hint)}</span>
      </span>
      <span class="sb-switch"></span>
    </button>`);
    row.addEventListener('click', () => {
      if (key === '__clock24') draft.clock24 = !draft.clock24;
      else {
        const set = new Set(draft.items);
        if (set.has(key)) set.delete(key);
        else set.add(key);
        draft.items = ITEMS.filter((i) => set.has(i.key)).map((i) => i.key);
      }
      apply();
    });
    return row;
  }

  function paintOpts() {
    optsEl.innerHTML = '';
    ITEMS.forEach((item) => {
      optsEl.appendChild(
        optRow({ key: item.key, label: item.label, hint: item.hint, on: draft.items.includes(item.key) })
      );
    });
    optsEl.appendChild(
      optRow({ key: '__clock24', label: '24-hour time', hint: 'Show 21:07 instead of 9:07 PM.', on: draft.clock24 })
    );
  }

  body.querySelector('[data-reset]').addEventListener('click', () => {
    draft = { items: [...DEFAULTS], clock24: false };
    apply();
  });

  paintOpts();
  paintPreview();
  return openModal({ title: 'Status bar', body, slim: true });
}
