import { api } from './api.js';

export const state = {
  loaded: false,
  accounts: [],
  actingId: null,
  settings: {},
  badges: { notifications: 0, messages: 0 },
  presence: [],
  composing: {},
  typing: {},
  trends: [],
};

/* tiny event bus ---------------------------------------------------- */
const handlers = new Map();

export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => handlers.get(event)?.delete(fn);
}

export function emit(event, payload) {
  handlers.get(event)?.forEach((fn) => {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[bus:${event}]`, err);
    }
  });
}

/* helpers ----------------------------------------------------------- */
export function acting() {
  return state.accounts.find((a) => a.id === state.actingId) || null;
}

export function accountById(id) {
  return state.accounts.find((a) => a.id === Number(id)) || null;
}

export function accountByHandle(handle) {
  const h = String(handle || '').replace(/^@/, '').toLowerCase();
  return state.accounts.find((a) => a.handle.toLowerCase() === h) || null;
}

export function visibleAccounts() {
  return state.accounts.filter((a) => !a.archived);
}

export function upsertAccount(dto) {
  if (!dto) return;
  const idx = state.accounts.findIndex((a) => a.id === dto.id);
  if (idx === -1) state.accounts.push(dto);
  else state.accounts[idx] = { ...state.accounts[idx], ...dto };
}

export function removeAccount(id) {
  state.accounts = state.accounts.filter((a) => a.id !== Number(id));
  if (state.actingId === Number(id)) state.actingId = null;
}

export function applySession(payload) {
  state.accounts = payload.accounts || [];
  state.actingId = payload.actingAccountId ?? null;
  state.settings = payload.settings || {};
  state.badges = payload.badges || { notifications: 0, messages: 0 };
  state.loaded = true;
}

export function setBadges(badges) {
  if (!badges) return;
  state.badges = { ...state.badges, ...badges };
  emit('badges', state.badges);
}

export async function refreshAccounts() {
  const list = await api('/accounts');
  state.accounts = list;
  emit('accounts', list);
  return list;
}

export function nickname() {
  return localStorage.getItem('chirper:nickname') || '';
}

export function setNickname(name) {
  if (name) localStorage.setItem('chirper:nickname', name);
  else localStorage.removeItem('chirper:nickname');
}
