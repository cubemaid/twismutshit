/* The shared, draggable "now". Every relative timestamp goes through here. */

let clock = { offsetMs: 0, frozen: false, frozenAt: 0 };
const listeners = new Set();

export function setClockState(next) {
  if (!next) return;
  clock = {
    offsetMs: Number(next.offsetMs) || 0,
    frozen: Boolean(next.frozen),
    frozenAt: Number(next.frozenAt) || 0,
  };
  listeners.forEach((fn) => fn(clock));
}

export function clockSnapshot() {
  return { ...clock };
}

export function offsetMs() {
  return clock.offsetMs;
}

export function isFrozen() {
  return clock.frozen;
}

export function isAltered() {
  return clock.offsetMs !== 0 || clock.frozen;
}

/** The fictional "right now", in ms. */
export function now() {
  const real = clock.frozen && clock.frozenAt ? clock.frozenAt : Date.now();
  return real + clock.offsetMs;
}

export function onClockChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ------------------------------------------------------------------ *
 * formatting
 * ------------------------------------------------------------------ */
const pad = (n) => String(n).padStart(2, '0');

/** Twitter style: now / 3s / 5m / 2h / Apr 3 / Apr 3, 2019 */
export function relative(ms) {
  const diff = now() - ms;
  if (diff < 0) return shortDate(ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 1) return 'now';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now()).getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function shortDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function timeOfDay(ms) {
  const d = new Date(ms);
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${ap}`;
}

export function fullDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function longDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** "4:12 PM · Apr 3, 2019" */
export function stamp(ms) {
  return `${timeOfDay(ms)} · ${fullDate(ms)}`;
}

export function dayLabel(ms) {
  const d = new Date(ms);
  const today = new Date(now());
  const isSameDay = (a, b) => a.toDateString() === b.toDateString();
  if (isSameDay(d, today)) return 'Today';
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (isSameDay(d, y)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

/** human offset description like "-1y 5mo" or "+3d" */
export function describeOffset(ms) {
  if (!ms) return 'live';
  const sign = ms < 0 ? '-' : '+';
  let rest = Math.abs(ms);
  const units = [
    ['y', 365.25 * 86400000],
    ['mo', 30.44 * 86400000],
    ['d', 86400000],
    ['h', 3600000],
    ['m', 60000],
    ['s', 1000],
  ];
  const parts = [];
  for (const [label, size] of units) {
    const n = Math.floor(rest / size);
    if (n > 0) {
      parts.push(`${n}${label}`);
      rest -= n * size;
    }
    if (parts.length === 2) break;
  }
  return sign + (parts.join(' ') || '0s');
}

/* ------------------------------------------------------------------ *
 * datetime-local helpers (values are in the viewer's local timezone)
 * ------------------------------------------------------------------ */
export function toLocalInput(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function toISO(ms) {
  return new Date(ms).toISOString();
}

/* ------------------------------------------------------------------ *
 * live ticking for [data-rel] elements
 * ------------------------------------------------------------------ */
let timer = null;
export function startTicking() {
  if (timer) return;
  timer = setInterval(() => {
    document.querySelectorAll('[data-rel]').forEach((el) => {
      const ms = Number(el.dataset.rel);
      if (Number.isFinite(ms)) el.textContent = relative(ms);
    });
    document.querySelectorAll('[data-live-clock]').forEach((el) => {
      el.textContent = timeOfDay(now());
    });
    listeners.forEach((fn) => fn(clock));
  }, 1000);
}
