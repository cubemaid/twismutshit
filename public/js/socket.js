import { emit, state, acting, nickname, upsertAccount, removeAccount } from './store.js';
import { setClockState } from './time.js';

let socket = null;
const composingTimers = new Map();
const typingTimers = new Map();

export function connectSocket() {
  if (socket) return socket;
  // eslint-disable-next-line no-undef
  socket = window.io({ withCredentials: true, transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    socket.emit('hello', { label: nickname(), accountId: acting()?.id ?? null });
    emit('socket:status', 'online');
  });
  socket.on('disconnect', () => emit('socket:status', 'offline'));

  socket.on('hello', ({ writers }) => {
    state.presence = writers || [];
    emit('presence', state.presence);
  });
  socket.on('presence', ({ writers }) => {
    state.presence = writers || [];
    emit('presence', state.presence);
  });
  socket.on('clock', (clock) => {
    setClockState(clock);
    emit('clock', clock);
  });
  socket.on('post', (payload) => emit('post', payload));
  socket.on('reaction', (payload) => emit('reaction', payload));
  socket.on('account', (payload) => {
    if (payload.action === 'delete') removeAccount(payload.accountId);
    else upsertAccount(payload.account);
    emit('account', payload);
  });
  socket.on('follow', (payload) => emit('follow', payload));
  socket.on('notification', (payload) => emit('notification', payload));
  socket.on('message', (payload) => emit('message', payload));
  socket.on('conversation', (payload) => emit('conversation', payload));
  socket.on('trend', (payload) => emit('trend', payload));
  socket.on('settings', (payload) => {
    state.settings = payload;
    emit('settings', payload);
  });
  socket.on('world', (payload) => emit('world', payload));

  socket.on('composing', ({ writerId, label, on, as }) => {
    clearTimeout(composingTimers.get(writerId));
    state.composing[writerId] = on ? { label, as, at: Date.now() } : null;
    if (on) {
      composingTimers.set(
        writerId,
        setTimeout(() => {
          state.composing[writerId] = null;
          emit('composing', state.composing);
        }, 6000)
      );
    }
    emit('composing', state.composing);
  });

  socket.on('typing', ({ conversationId, on, label, writerId }) => {
    const key = `${conversationId}:${writerId}`;
    clearTimeout(typingTimers.get(key));
    state.typing[key] = on ? { conversationId, label, at: Date.now() } : null;
    if (on) {
      typingTimers.set(
        key,
        setTimeout(() => {
          state.typing[key] = null;
          emit('typing', state.typing);
        }, 5000)
      );
    }
    emit('typing', state.typing);
  });

  return socket;
}

export function socketAct(accountId) {
  setPresenceAccount(accountId);
  socket?.emit('act', { accountId });
}

export function setPresenceAccount(accountId) {
  const me = state.presence.find((w) => w.id === socket?.id);
  if (me) me.accountId = accountId ? Number(accountId) : null;
  emit('presence', state.presence);
}

let composingTimeout = null;
export function socketComposing(on, context = 'post') {
  clearTimeout(composingTimeout);
  socket?.emit('composing', { on, as: acting()?.id ?? null, context });
  if (on) {
    composingTimeout = setTimeout(() => socket?.emit('composing', { on: false, context }), 4000);
  }
}

export function socketTyping(conversationId, on) {
  socket?.emit('typing', { conversationId, on, as: acting()?.id ?? null });
}

export function othersComposing(exceptId) {
  return Object.entries(state.composing)
    .filter(([id, v]) => v && id !== exceptId)
    .map(([, v]) => v);
}

export function socketId() {
  return socket?.id || null;
}
