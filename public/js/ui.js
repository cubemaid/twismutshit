import { icons, badgeSvg, icon } from './icons.js';
import { state } from './store.js';
import { relative } from './time.js';

/* ------------------------------------------------------------------ *
 * tiny dom helpers
 * ------------------------------------------------------------------ */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}

export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content;
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtCount(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 10000) return v.toLocaleString();
  if (v < 1000000) return `${(v / 1000).toFixed(v < 100000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(v / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** escapes, then linkifies urls / @mentions / #hashtags */
export function linkify(raw) {
  const text = String(raw ?? '');
  const re = /(https?:\/\/[^\s<]+)|@([A-Za-z0-9_]{1,15})|#([A-Za-z0-9_]+)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    const prev = m.index > 0 ? text[m.index - 1] : '';
    const atBoundary = !/[\w@#/]/.test(prev);
    out += esc(text.slice(last, m.index));
    if (m[1]) {
      let url = m[1];
      let tail = '';
      const trimmed = url.replace(/[.,;:!?)\]]+$/, '');
      tail = url.slice(trimmed.length);
      out += `<a href="${esc(trimmed)}" target="_blank" rel="noopener noreferrer">${esc(trimmed)}</a>${esc(tail)}`;
    } else if (m[2] && atBoundary) {
      out += `<a href="#/u/${esc(m[2])}">@${esc(m[2])}</a>`;
    } else if (m[3] && atBoundary) {
      out += `<a href="#/search?q=${encodeURIComponent('#' + m[3])}">#${esc(m[3])}</a>`;
    } else {
      out += esc(m[0]);
    }
    last = re.lastIndex;
  }
  out += esc(text.slice(last));
  return out;
}

export function initialOf(account) {
  const base = account?.displayName || account?.handle || '?';
  return esc(base.trim().charAt(0).toUpperCase() || '?');
}

export function avatarHTML(account, size = 'a48', cls = '') {
  if (!account) return `<div class="avatar ${size} ${cls}">?</div>`;
  const style = account.avatar ? ` style="background-image:url('${esc(account.avatar)}')"` : '';
  const inner = account.avatar ? '' : initialOf(account);
  return `<div class="avatar ${size} ${cls}"${style}>${inner}</div>`;
}

export function nameHTML(account, { link = true, badge = true } = {}) {
  if (!account) return 'Unknown';
  const name = esc(account.displayName || account.handle);
  const tag = account.verified && badge ? badgeSvg(account.badge || 'blue') : '';
  return link ? `<a href="#/u/${esc(account.handle)}" class="name">${name}</a>${tag}` : `<span class="name">${name}</span>${tag}`;
}

export function handleHTML(account) {
  return `<span class="handle">@${esc(account?.handle || 'unknown')}</span>`;
}

export function timeHTML(ms, cls = 'time') {
  return `<span class="${cls}" data-rel="${ms}" title="${esc(new Date(ms).toLocaleString())}">${relative(ms)}</span>`;
}

export const route = {
  go(path) {
    if (location.hash === `#${path}`) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = path;
  },
};

/* ------------------------------------------------------------------ *
 * toast
 * ------------------------------------------------------------------ */
export function toast(message, type = '') {
  const root = document.getElementById('toast-root');
  const node = el(`<div class="toast ${type}">${esc(message)}</div>`);
  root.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 300);
  }, type === 'error' ? 4200 : 2200);
}

export function errorToast(err) {
  console.error(err);
  toast(err?.message || 'Something went wrong', 'error');
}

/* ------------------------------------------------------------------ *
 * menu
 * ------------------------------------------------------------------ */
let openMenuNode = null;
export function closeMenu() {
  if (openMenuNode) {
    openMenuNode.remove();
    openMenuNode = null;
  }
}
// capture phase: this runs *before* the click that opens a menu, so a menu
// never gets closed by its own opening click.
document.addEventListener(
  'click',
  (e) => {
    if (!openMenuNode) return;
    if (openMenuNode.contains(e.target)) return;
    closeMenu();
  },
  true
);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});

/**
 * items: array of { label, icon, danger, onClick, disabled } | { sep: true } | { title }
 */
export function openMenu(anchor, items, { align = 'left' } = {}) {
  closeMenu();
  const menu = el('<div class="menu"></div>');
  const html = items
    .map((item) => {
      if (item.sep) return '<div class="menu-sep"></div>';
      if (item.title) return `<div class="menu-title">${esc(item.title)}</div>`;
      const cls = `menu-item${item.danger ? ' danger' : ''}`;
      const ic = item.icon ? icon(item.icon) : '';
      return `<button class="${cls}" ${item.disabled ? 'disabled' : ''}>${ic}<span>${esc(item.label)}</span></button>`;
    })
    .join('');
  menu.innerHTML = html;
  const buttons = [...menu.querySelectorAll('.menu-item')];
  let i = 0;
  items.forEach((item) => {
    if (item.sep || item.title) return;
    const btn = buttons[i++];
    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
      item.onClick?.(e);
    });
  });

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = align === 'right' ? rect.right - mw : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  let top = rect.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, rect.top - mh - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  openMenuNode = menu;
  return menu;
}

/* ------------------------------------------------------------------ *
 * modal
 * ------------------------------------------------------------------ */
export function openModal({ title = '', body, wide = false, slim = false, actions = '', onClose } = {}) {
  const root = document.getElementById('modal-root');
  const backdrop = el('<div class="modal-backdrop"></div>');
  const modal = el(`<div class="modal${wide ? ' wide' : ''}${slim ? ' slim' : ''}"></div>`);
  modal.innerHTML = `
    <div class="modal-head">
      <button class="icon-btn js-close" aria-label="Close">${icons.close}</button>
      <h2>${esc(title)}</h2>
      ${actions}
    </div>
    <div class="modal-body"></div>`;
  const bodyEl = modal.querySelector('.modal-body');
  if (body instanceof Node) bodyEl.appendChild(body);
  else bodyEl.innerHTML = body || '';
  backdrop.appendChild(modal);
  root.appendChild(backdrop);

  function close() {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  modal.querySelector('.js-close').addEventListener('click', close);

  return { close, modal, body: bodyEl };
}

export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = true } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      modal.close();
    };
    const body = el(`<div>
      <p style="margin:0 0 18px">${esc(message)}</p>
      <div class="row" style="justify-content:flex-end">
        <button class="btn ghost" data-no>Cancel</button>
        <button class="btn ${danger ? 'danger' : ''}" data-yes>${esc(confirmLabel)}</button>
      </div>
    </div>`);
    const modal = openModal({
      title,
      body,
      slim: true,
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
    body.querySelector('[data-no]').addEventListener('click', () => finish(false));
    body.querySelector('[data-yes]').addEventListener('click', () => finish(true));
  });
}

/* ------------------------------------------------------------------ *
 * tabs
 * ------------------------------------------------------------------ */
export function tabBar(items, activeKey, onSelect) {
  const bar = el('<div class="tabs"></div>');
  items.forEach((item) => {
    const b = el(`<button class="tab${item.key === activeKey ? ' active' : ''}">${esc(item.label)}</button>`);
    b.addEventListener('click', () => onSelect(item.key));
    bar.appendChild(b);
  });
  return bar;
}

export function chipRow(items, activeKey, onSelect) {
  const row = el('<div class="chip-row"></div>');
  items.forEach((item) => {
    const b = el(`<button class="chip${item.key === activeKey ? ' active' : ''}">${esc(item.label)}</button>`);
    b.addEventListener('click', () => onSelect(item.key));
    row.appendChild(b);
  });
  return row;
}

/* ------------------------------------------------------------------ *
 * shared widgets
 * ------------------------------------------------------------------ */
export function emptyState(title, sub = '') {
  return el(`<div class="empty"><h3>${esc(title)}</h3>${sub ? `<div>${esc(sub)}</div>` : ''}</div>`);
}

export function loadingState() {
  return el('<div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>');
}

/** picker of accounts, returns a Promise of the chosen account id */
export function pickAccount({ title = 'Pick an account', allowCancel = true } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      modal.close();
    };
    const list = el('<div></div>');
    state.accounts.forEach((acc) => {
      const row = el(`<button class="acc-row">
        ${avatarHTML(acc, 'a40')}
        <div class="who">
          <div class="name">${esc(acc.displayName)}</div>
          <div class="handle">@${esc(acc.handle)}</div>
        </div>
      </button>`);
      row.addEventListener('click', () => finish(acc.id));
      list.appendChild(row);
    });
    const modal = openModal({
      title,
      body: list,
      slim: true,
      onClose: () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
    });
    if (!allowCancel) modal.modal.querySelector('.js-close').style.visibility = 'hidden';
  });
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Full-screen image viewer. */
export function openLightbox(url) {
  const box = el(`<div class="lightbox"><img src="${esc(url)}" alt=""></div>`);
  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey);
  };
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  box.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
  return { close };
}

/** Run `fn` once this node leaves the document (cleanup for intervals/listeners). */
export function onDetach(node, fn) {
  const observer = new MutationObserver(() => {
    if (!node.isConnected) {
      observer.disconnect();
      fn();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
