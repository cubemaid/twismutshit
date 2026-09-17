import { api } from './api.js';
import { connectSocket, socketAct } from './socket.js';
import { acting, applySession, emit, on, state } from './store.js';
import { setClockState, startTicking } from './time.js';
import { el, errorToast, openModal, toast, avatarHTML, esc } from './ui.js';
import { openComposer, createComposer } from './composer.js';
import { openAccountEditor } from './views/account-editor.js';
import { renderMobileNav, renderPostFab, renderRail, renderSidebar, switchAccount, openClockModal } from './shell.js';
import { renderStatusbar } from './statusbar.js';
import { initScreenshotMode } from './screenshot.js';

import { homeView } from './views/home.js';
import { exploreView } from './views/explore.js';
import { notificationsView } from './views/notifications.js';
import { messagesView } from './views/messages.js';
import { bookmarksView } from './views/bookmarks.js';
import { profileView } from './views/profile.js';
import { postView } from './views/post.js';
import { adminView } from './views/admin.js';
import { settingsView } from './views/settings.js';
import { loginView } from './views/login.js';

/* ------------------------------------------------------------------ *
 * router
 * ------------------------------------------------------------------ */
function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/home';
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));

  const seg = parts[0] || 'home';
  if (seg === 'home') return { name: 'home', active: 'home', query };
  if (seg === 'explore') return { name: 'explore', active: 'explore', query };
  if (seg === 'search') return { name: 'search', active: 'explore', query };
  if (seg === 'notifications') return { name: 'notifications', params: { tab: parts[1] || 'all' }, active: 'notifications', query };
  if (seg === 'messages') return { name: 'messages', params: { id: parts[1] || null }, active: 'messages', query };
  if (seg === 'bookmarks') return { name: 'bookmarks', active: 'bookmarks', query };
  if (seg === 'me') return { name: 'me', active: 'profile', query };
  if (seg === 'u') return { name: 'profile', params: { handle: parts[1], tab: parts[2] || 'posts' }, active: 'profile', query };
  if (seg === 'p') return { name: 'post', params: { id: parts[1] }, active: 'home', query };
  if (seg === 'admin') return { name: 'admin', params: { tab: parts[1] || 'accounts' }, active: 'admin', query };
  if (seg === 'settings') return { name: 'settings', active: 'admin', query };
  return { name: 'home', active: 'home', query };
}

function buildView(route) {
  switch (route.name) {
    case 'home':
      return homeView();
    case 'explore':
      return exploreView({});
    case 'search':
      return exploreView({ q: route.query.q || '', tab: route.query.tab || 'top' });
    case 'notifications':
      return notificationsView({ tab: route.params.tab });
    case 'messages':
      return messagesView({ id: route.params.id });
    case 'bookmarks':
      return bookmarksView();
    case 'me': {
      const me = acting();
      if (!me) return pickAccountView();
      return profileView({ handle: me.handle });
    }
    case 'profile':
      return profileView({ handle: route.params.handle, tab: route.params.tab });
    case 'post':
      return postView({ id: route.params.id });
    case 'admin':
      return adminView({ tab: route.params.tab });
    case 'settings':
      return settingsView();
    default:
      return homeView();
  }
}

function pickAccountView() {
  const anyAccounts = state.accounts.length > 0;
  const root = el(`<div class="empty">
    <h3>${anyAccounts ? 'Who are you posting as?' : 'Welcome to an empty world'}</h3>
    <div style="margin-bottom:16px">${
      anyAccounts
        ? 'Pick a character and everything — feeds, DMs, notifications — follows that choice.'
        : 'There are no accounts yet. Make the first character and the timeline is yours.'
    }</div>
    <div data-list style="max-width:360px;margin:0 auto;text-align:left"></div>
    <div style="margin-top:16px"><button class="btn" data-new>Create a new account</button></div>
  </div>`);
  const list = root.querySelector('[data-list]');
  state.accounts.forEach((acc) => {
    const row = el(`<button class="acc-row">
      ${avatarHTML(acc, 'a40')}
      <div class="who"><div class="name bold">${esc(acc.displayName)}</div><div class="handle">@${esc(acc.handle)}</div></div>
    </button>`);
    row.addEventListener('click', async () => {
      await switchAccount(acc.id);
      location.hash = '/home';
    });
    list.appendChild(row);
  });
  root.querySelector('[data-new]').addEventListener('click', () =>
    openAccountEditor(null, {
      onSaved: async (saved) => {
        await switchAccount(saved.id);
        location.hash = '/home';
      },
    })
  );
  return { element: root };
}

/* ------------------------------------------------------------------ *
 * mounting
 * ------------------------------------------------------------------ */
let layout = null;
let mainEl = null;
let sidebarEl = null;
let railEl = null;
let mobileNavEl = null;
let statusbarEl = null;
let currentView = null;

function ensureShell() {
  if (layout) return;
  const app = document.getElementById('app');
  app.className = '';
  app.innerHTML = '';

  layout = el('<div class="layout"></div>');
  mainEl = el('<main class="main"></main>');
  sidebarEl = el('<div></div>');
  railEl = el('<div></div>');
  layout.append(sidebarEl, mainEl, railEl);

  // The status bar has to come *before* the layout: it is position: sticky, so
  // it only pins itself to the top of the viewport if it sits above the content.
  statusbarEl = renderStatusbar(null);
  mobileNavEl = renderMobileNav('home');
  app.append(statusbarEl, layout, mobileNavEl, renderPostFab());
}

function paintStatusbar(route) {
  const fresh = renderStatusbar(route);
  statusbarEl.replaceWith(fresh);
  statusbarEl = fresh;
}

function paintChrome(route, title) {
  const freshSidebar = renderSidebar(route.active);
  sidebarEl.replaceWith(freshSidebar);
  sidebarEl = freshSidebar;

  const freshRail = renderRail();
  railEl.replaceWith(freshRail);
  railEl = freshRail;

  const freshNav = renderMobileNav(route.active);
  mobileNavEl.replaceWith(freshNav);
  mobileNavEl = freshNav;

  paintStatusbar(route);
}

async function renderRoute({ scroll = true } = {}) {
  if (!state.loaded) return;
  const route = parseRoute();
  ensureShell();

  if (route.name === 'me' && !acting()) {
    mainEl.innerHTML = '';
    mainEl.className = 'main';
    const view = pickAccountView();
    currentView = view;
    mainEl.appendChild(view.element);
    return;
  }

  const view = buildView(route);
  currentView = view;
  mainEl.innerHTML = '';
  mainEl.className = `main ${view.mainClass || ''}`.trim();
  mainEl.appendChild(view.element);
  // used to keep floating controls out of a DM composer's way
  document.documentElement.classList.toggle('dm-open', Boolean(route.name === 'messages' && route.params?.id));

  paintChrome(route, view.title?.() || '');
  if (scroll) window.scrollTo({ top: 0 });
  document.title = `${state.settings.siteName || 'Chirper'}`;
}

/* ------------------------------------------------------------------ *
 * boot
 * ------------------------------------------------------------------ */
async function boot() {
  startTicking();
  let session;
  try {
    session = await api('/session');
  } catch (err) {
    document.getElementById('app').innerHTML = `<div class="center-box"><div>Could not reach the server.<br><span class="muted small">${err.message}</span></div></div>`;
    return;
  }

  if (!session.authenticated) {
    const settings = await api('/settings').catch(() => ({}));
    state.settings = settings || {};
    const view = loginView({
      needsSetup: session.needsSetup,
      siteName: settings.siteName || 'Chirper',
      welcome: settings.welcomeNote,
    });
    const app = document.getElementById('app');
    app.classList.remove('boot');
    app.innerHTML = '';
    app.appendChild(view.element);
    return;
  }

  applySession(session);
  setClockState(session.clock);
  api('/trends')
    .then((trends) => {
      state.trends = trends;
      paintChrome(parseRoute(), '');
    })
    .catch(() => {});

  const app = document.getElementById('app');
  app.classList.remove('boot');
  app.innerHTML = '';

  connectSocket();
  socketAct(session.actingAccountId);

  await renderRoute();
  initScreenshotMode();

  window.addEventListener('hashchange', () => renderRoute());
  return null;
}

/* ------------------------------------------------------------------ *
 * global wiring
 * ------------------------------------------------------------------ */
on('rerender', () => renderRoute({ scroll: false }));

on('session', (session) => {
  applySession(session);
  paintChrome(parseRoute(), '');
});

on('presence', () => {
  if (!layout) return;
  const fresh = renderRail();
  railEl.replaceWith(fresh);
  railEl = fresh;
});

on('badges', () => {
  if (!layout) return;
  const route = parseRoute();
  const freshSidebar = renderSidebar(route.active);
  sidebarEl.replaceWith(freshSidebar);
  sidebarEl = freshSidebar;
  const freshNav = renderMobileNav(route.active);
  mobileNavEl.replaceWith(freshNav);
  mobileNavEl = freshNav;
  paintStatusbar(route);
});

on('statusbar', () => {
  if (!layout) return;
  paintStatusbar(parseRoute());
});

on('settings', (settings) => {
  state.settings = settings;
  if (settings.accent) document.documentElement.style.setProperty('--accent', settings.accent);
});

on('open-composer', () => {
  if (!acting()) {
    toast('Pick an account first', 'error');
    location.hash = '/me';
    return;
  }
  openComposer({});
});

on('create-account', () => {
  openAccountEditor(null, {
    onSaved: async (saved) => {
      await switchAccount(saved.id);
      toast(`Now posting as @${saved.handle}`);
    },
  });
});

on('compose-as', async ({ account, replyTo }) => {
  try {
    if (acting()?.id !== account.id) {
      const session = await api('/session/act', { method: 'POST', body: { accountId: account.id } });
      state.actingId = session.actingAccountId;
      state.accounts = session.accounts;
      socketAct(session.actingAccountId);
      emit('session', session);
    }
    const modal = openModal({
      title: replyTo ? `Reply as @${account.handle}` : `Post as @${account.handle}`,
      body: '<div></div>',
      onClose: () => modal.composerNode?.composerApi?.destroy(),
    });
    const node = createComposer({
      replyTo: replyTo || null,
      autoFocus: true,
      placeholder: `Post as @${account.handle}`,
      onDone: () => modal.close(),
    });
    modal.composerNode = node;
    modal.body.appendChild(node);
  } catch (err) {
    errorToast(err);
  }
});

on('clock', () => {
  const route = parseRoute();
  if (['post', 'messages'].includes(route.name)) currentView?.refresh?.();
});

/* keyboard shortcuts */
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (typing) return;
  if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    emit('open-composer');
  } else if (e.key === '/') {
    e.preventDefault();
    const box = document.querySelector('.rail .search-box input') || document.querySelector('.search-box input');
    box?.focus();
  } else if (e.key === 't' && !e.metaKey && !e.ctrlKey) {
    openClockModal();
  }
});

window.addEventListener('error', (e) => console.error('[app]', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[app:promise]', e.reason));

boot();
