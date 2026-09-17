import { Server } from 'socket.io';
import { verifyToken, COOKIE } from './auth.js';

let io = null;
/** socket.id -> { label, accountId, color, joinedAt } */
const writers = new Map();

const COLORS = ['#1d9bf0', '#f91880', '#00ba7c', '#ffd400', '#7856ff', '#ff7a00'];

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function presenceList() {
  return [...writers.entries()].map(([id, w]) => ({ id, ...w }));
}

function broadcastPresence() {
  if (io) io.emit('presence', { writers: presenceList() });
}

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    maxHttpBufferSize: 1e6,
  });

  io.use((socket, next) => {
    const token = parseCookies(socket.handshake.headers.cookie)[COOKIE];
    if (!verifyToken(token)) return next(new Error('unauthorized'));
    socket.data.authenticated = true;
    next();
  });

  io.on('connection', (socket) => {
    const payload = verifyToken(parseCookies(socket.handshake.headers.cookie)[COOKIE]) || {};
    const n = writers.size;
    writers.set(socket.id, {
      label: `Writer ${n + 1}`,
      accountId: payload.actingAccountId ?? null,
      color: COLORS[n % COLORS.length],
      joinedAt: Date.now(),
    });

    socket.emit('hello', { id: socket.id, writers: presenceList() });
    broadcastPresence();

    socket.on('hello', ({ label, accountId } = {}) => {
      const w = writers.get(socket.id);
      if (!w) return;
      if (typeof label === 'string' && label.trim()) w.label = label.trim().slice(0, 24);
      if (accountId !== undefined) w.accountId = accountId ? Number(accountId) : null;
      broadcastPresence();
    });

    socket.on('act', ({ accountId } = {}) => {
      const w = writers.get(socket.id);
      if (!w) return;
      w.accountId = accountId ? Number(accountId) : null;
      broadcastPresence();
    });

    // "Riley is writing a post..." co-op signal
    socket.on('composing', ({ on, as, context } = {}) => {
      socket.broadcast.emit('composing', {
        writerId: socket.id,
        label: writers.get(socket.id)?.label || 'Someone',
        on: Boolean(on),
        as: as ? Number(as) : null,
        context: context || 'post',
      });
    });

    socket.on('typing', ({ conversationId, on, as } = {}) => {
      socket.broadcast.emit('typing', {
        conversationId: Number(conversationId),
        on: Boolean(on),
        as: as ? Number(as) : null,
        writerId: socket.id,
        label: writers.get(socket.id)?.label || 'Someone',
      });
    });

    socket.on('disconnect', () => {
      writers.delete(socket.id);
      broadcastPresence();
    });
  });

  return io;
}

/** Fire an event at everyone. */
export function broadcast(event, payload) {
  if (io) io.emit(event, payload);
}
