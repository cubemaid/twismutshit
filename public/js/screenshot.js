import { icons } from './icons.js';
import { emit } from './store.js';
import { el, openModal } from './ui.js';

/**
 * "Clean view" — hides the Chirper-only furniture (time machine, who's-here,
 * admin, status bar, app badges) so a post looks like a real screenshot.
 * The optional toggles strip more if you want them gone.
 *
 * Press `S`, the camera button, or the post ⋯ menu to toggle.
 */
let active = false;
let bar = null;
let hideTimer = null;

/** the bar only lives near the bottom edge of the screen */
function show() {
  if (!active || !bar) return;
  const node = bar;
  node.classList.add('visible');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => node.classList.remove('visible'), 2400);
}

function hideSoon() {
  if (!bar) return;
  const node = bar;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => node.classList.remove('visible'), 500);
}

function setFlag(name, on) {
  document.documentElement.classList.toggle(name, on);
  bar?.querySelector(`[data-flag="${name}"]`)?.classList.toggle('on', on);
  show();
}

const FLAGS = [
  ['hide-chrome', 'Sidebar'],
  ['hide-head', 'Header'],
  ['hide-stats', 'Stats'],
];

export function isShotMode() {
  return active;
}

export function setShotMode(on) {
  if (on === active) return;
  active = on;
  document.documentElement.classList.toggle('shot', on);
  // the time machine is Chirper furniture, so it must not survive into a shot
  emit('shot-mode', on);

  if (!on) {
    clearTimeout(hideTimer);
    for (const [flag] of FLAGS) document.documentElement.classList.remove(flag);
    bar?.remove();
    bar = null;
    return;
  }

  bar = el(`<div class="shot-bar">
    <span class="label">Screenshot mode</span>
    ${FLAGS.map(([flag, label]) => `<button data-flag="${flag}">${label}</button>`).join('')}
    <button data-exit>Exit (S)</button>
  </div>`);
  bar.querySelectorAll('[data-flag]').forEach((btn) =>
    btn.addEventListener('click', () =>
      setFlag(btn.dataset.flag, !document.documentElement.classList.contains(btn.dataset.flag))
    )
  );
  bar.querySelector('[data-exit]').addEventListener('click', () => setShotMode(false));
  bar.addEventListener('mouseenter', show);
  document.body.appendChild(bar);
  show();
}

export function initScreenshotMode() {
  // Screenshot mode is reached from the drawer, Settings, a post's ⋯ menu or
  // the S key - no floating button, that spot belongs to the Post FAB.
  const onPointerMove = (e) => {
    if (!active || !bar) return;
    if (window.innerHeight - e.clientY < 130) show();
    else hideSoon();
  };
  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('touchstart', () => show(), { passive: true });

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      setShotMode(!active);
    } else if (e.key === 'Escape' && active) {
      setShotMode(false);
    }
  });
}

export function openShotHelp() {
  const body = el(`<div>
    <p style="margin-top:0">Screenshot mode hides the Chirper-only bits — the time machine, who's here,
    the Admin link and the app badges — so what's left looks like a real Twitter page.</p>
    <ul class="muted small" style="padding-left:18px;line-height:1.7">
      <li>Press <b>S</b>, or use the menu / Settings → Screenshots, to turn it on and off.</li>
      <li><b>Sidebar</b> also hides the left nav, the right column and the status bar, leaving just the posts.</li>
      <li><b>Header</b> hides the column title and tabs.</li>
      <li><b>Stats</b> hides the reply / repost / like / bookmark row.</li>
      <li>The control bar only appears when you move the mouse to the bottom of the window.</li>
    </ul>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-go>Try it</button></div>
  </div>`);
  const modal = openModal({ title: 'Screenshot mode', body, slim: true });
  body.querySelector('[data-go]').addEventListener('click', () => {
    modal.close();
    setShotMode(true);
  });
}
