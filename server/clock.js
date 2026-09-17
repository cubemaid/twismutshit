import { getSetting, setSetting, bool } from './db.js';

/**
 * The whole app runs on one shared, movable "now".
 * Both writers see the same clock, so a dragged timeline stays consistent
 * no matter who is looking at it or when.
 */
export function clockState() {
  const offsetMs = Number(getSetting('timeline_offset_ms')) || 0;
  const frozen = bool(getSetting('clock_frozen'));
  const frozenAt = Number(getSetting('clock_frozen_at')) || 0;
  const realNow = frozen && frozenAt ? frozenAt : Date.now();
  return {
    offsetMs,
    frozen,
    frozenAt: frozen ? frozenAt : 0,
    now: realNow + offsetMs,
    realNow: Date.now(),
  };
}

/**
 * offsetMs - set the offset absolutely (ms from real time)
 * deltaMs  - nudge the current offset by this much
 * iso      - jump so that "now" equals this date
 * frozen   - freeze / unfreeze the clock
 */
export function setClock({ offsetMs, iso, deltaMs, frozen }) {
  const current = clockState();

  let nextOffset = current.offsetMs;
  if (typeof offsetMs === 'number' && Number.isFinite(offsetMs)) nextOffset = Math.round(offsetMs);
  if (typeof deltaMs === 'number' && Number.isFinite(deltaMs)) nextOffset = current.offsetMs + Math.round(deltaMs);
  if (typeof iso === 'string' && iso) {
    const target = new Date(iso).getTime();
    if (!Number.isFinite(target)) throw new Error('Invalid date');
    const anchor = frozen ? Number(getSetting('clock_frozen_at')) || Date.now() : Date.now();
    nextOffset = target - anchor;
  }

  setSetting('timeline_offset_ms', nextOffset);
  if (typeof frozen === 'boolean') {
    setSetting('clock_frozen', frozen ? '1' : '0');
    setSetting('clock_frozen_at', frozen ? String(Date.now()) : '0');
  }
  return clockState();
}
