import { icons } from './icons.js';
import { el, openModal } from './ui.js';

/**
 * "Clean view" — strips the app chrome so a post (or a profile) can be
 * screenshotted and passed off as the real thing.
 *
 * Press `S` or the camera button to toggle. The little control bar fades away
 * on its own so it never ends up in the shot.
 */
let active = false;
let bar = null;
let fadeTimer = null;

function wake() {
  if (!active || !bar) return;
  const node = bar;
  node.classList.add('visible');
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => node?.classList.remove('visible'), 2200);
}

function setFlag(name, on) {
  document.documentElement.classList.toggle(name, on);
  const btn = bar?.querySelector(`[data-flag="${name}"]`);
  btn?.classList.toggle('on', on);
  wake();
}

export function isShotMode() {
  return active;
}

export function setShotMode(on) {
  active = on;
  document.documentElement.classList.toggle('shot', on);
  if (!on) {
    clearTimeout(fadeTimer);
    document.documentElement.classList.remove('hide-head', 'hide-stats');
    bar?.remove();
    bar = null;
  } else {
    bar = el(`<div class="shot-bar">
      <span class="label">${'Screenshot mode'}</span>
      <button data-flag="hide-head">Header</button>
      <button data-flag="hide-stats">Stats</button>
      <button data-exit>Exit (S)</button>
    </div>`);
    bar.querySelector('[data-flag="hide-head"]').addEventListener('click', () => {
      setFlag('hide-head', !document.documentElement.classList.contains('hide-head'));
    });
    bar.querySelector('[data-flag="hide-stats"]').addEventListener('click', () => {
      setFlag('hide-stats', !document.documentElement.classList.contains('hide-stats'));
    });
    bar.querySelector('[data-exit]').addEventListener('click', () => setShotMode(false));
    document.body.appendChild(bar);
    wake();
  }
}

export function initScreenshotMode() {
  const toggle = el(`<button class="shot-toggle" title="Clean view for screenshots (S)">${icons.image}</button>`);
  toggle.addEventListener('click', () => {
    setShotMode(true);
    // the toggle itself is hidden while active, so nothing else to do
  });
  document.body.appendChild(toggle);

  document.addEventListener('mousemove', wake);
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

/** small helper used from the "more" menus */
export function openShotHelp() {
  const body = el(`<div>
    <p style="margin-top:0">Screenshot mode hides the sidebar, the right column, tabs, the composer and every
    app-only badge, leaving just the posts — so your characters' posts look like real tweets.</p>
    <ul class="muted small" style="padding-left:18px;line-height:1.7">
      <li>Press <b>S</b> (or the camera button) to turn it on and off.</li>
      <li><b>Header</b> hides the column title and tabs too.</li>
      <li><b>Stats</b> hides the reply / repost / like / bookmark row.</li>
      <li>The little control bar fades out on its own after a couple of seconds, so it won't be in your shot.</li>
    </ul>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-go>Try it</button></div>
  </div>`);
  const modal = openModal({ title: 'Screenshot mode', body, slim: true });
  body.querySelector('[data-go]').addEventListener('click', () => {
    modal.close();
    setShotMode(true);
  });
}
