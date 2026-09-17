import express from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';

import { db, setSetting, seedIfEmpty } from './db.js';
import { UPLOAD_DIR, MAX_UPLOAD_BYTES } from './config.js';
import { checkPassword, setAuthCookie, clearAuthCookie, requireAuth } from './auth.js';
import { clockState, setClock } from './clock.js';
import {
  accountRow,
  accountByHandle,
  allAccountRows,
  decorateAccount,
  decorateAccounts,
  decoratePost,
  decoratePosts,
  timeline,
  postRow,
  parseDateInput,
  normaliseHandle,
  pushNotification,
  notificationDTO,
  mentionHandles,
  conversationDTO,
  messageDTO,
  ensureDirectConversation,
  isParticipant,
  publicSettings,
} from './model.js';
import { broadcast } from './realtime.js';

export const api = express.Router();

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

function actorId(req, { required = true } = {}) {
  const raw = req.body?.as ?? req.query?.as ?? req.auth?.actingAccountId;
  if (raw === undefined || raw === null || raw === '') return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || !accountRow(id)) return null;
  return id;
}

function requireActor(req, res) {
  const id = actorId(req);
  if (!id) bad(res, 'No acting account selected', 400);
  return id;
}

/** Unread counts used for the sidebar badges. */
function badges(accountId) {
  if (!accountId) return { notifications: 0, messages: 0 };
  const notifications = db
    .prepare('SELECT COUNT(*) n FROM notifications WHERE account_id = ? AND is_read = 0')
    .get(accountId).n;
  const messages = db
    .prepare(
      `SELECT COUNT(*) n FROM messages m
       JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.account_id = ?
       LEFT JOIN conversation_reads cr ON cr.conversation_id = m.conversation_id AND cr.account_id = ?
       WHERE m.is_deleted = 0 AND m.sender_id <> ? AND m.id > COALESCE(cr.last_read_id, 0)`
    )
    .get(accountId, accountId, accountId).n;
  return { notifications, messages };
}

function sessionPayload(auth) {
  const accounts = decorateAccounts(allAccountRows(), auth.actingAccountId || null);
  const acting = auth.actingAccountId && accounts.find((a) => a.id === auth.actingAccountId);
  const id = acting ? acting.id : null;
  return {
    authenticated: true,
    actingAccountId: id,
    accounts,
    settings: publicSettings(),
    clock: clockState(),
    badges: badges(id),
  };
}

/* ------------------------------------------------------------------ *
 * auth + session
 * ------------------------------------------------------------------ */
api.get('/health', (_req, res) => res.json({ ok: true, at: Date.now() }));

api.post('/login', (req, res) => {
  if (!checkPassword(req.body?.password)) return bad(res, 'Wrong password', 401);
  setAuthCookie(res, { accountId: null });
  res.json({ ok: true });
});

api.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

api.get('/session', (req, res) => {
  if (!req.auth.authenticated) {
    return res.json({ authenticated: false, needsSetup: allAccountRows().length === 0 });
  }
  res.json(sessionPayload(req.auth));
});

api.post('/session/act', requireAuth, (req, res) => {
  const raw = req.body?.accountId;
  if (raw === null || raw === '' || raw === undefined) {
    setAuthCookie(res, { accountId: null });
    return res.json(sessionPayload({ actingAccountId: null }));
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || !accountRow(id)) return bad(res, 'Unknown account');
  setAuthCookie(res, { accountId: id });
  res.json(sessionPayload({ actingAccountId: id }));
});

/* ------------------------------------------------------------------ *
 * clock / time machine
 * ------------------------------------------------------------------ */
api.get('/clock', (_req, res) => res.json(clockState()));

api.post('/clock', requireAuth, (req, res) => {
  try {
    const { offsetMs, iso, deltaMs, frozen } = req.body || {};
    const next = setClock({ offsetMs, iso, deltaMs, frozen });
    broadcast('clock', next);
    res.json(next);
  } catch (err) {
    bad(res, err.message);
  }
});

/* ------------------------------------------------------------------ *
 * settings
 * ------------------------------------------------------------------ */
api.get('/settings', (_req, res) => res.json(publicSettings()));

api.patch('/settings', requireAuth, (req, res) => {
  const body = req.body || {};
  const map = { siteName: 'site_name', accent: 'accent', theme: 'theme', welcomeNote: 'welcome_note' };
  for (const [key, setting] of Object.entries(map)) {
    if (key in body) setSetting(setting, body[key]);
  }
  if ('showFuturePosts' in body) setSetting('show_future_posts', body.showFuturePosts ? '1' : '0');
  if ('hideRepliesDefault' in body) setSetting('hide_replies_default', body.hideRepliesDefault ? '1' : '0');
  if ('readReceipts' in body) setSetting('read_receipts', body.readReceipts ? '1' : '0');
  const payload = publicSettings();
  broadcast('settings', payload);
  res.json(payload);
});

/* ------------------------------------------------------------------ *
 * accounts
 * ------------------------------------------------------------------ */
api.get('/accounts', (req, res) => {
  res.json(decorateAccounts(allAccountRows(), req.auth.actingAccountId || null));
});

api.post('/accounts', requireAuth, (req, res) => {
  const body = req.body || {};
  const handle = normaliseHandle(body.handle || body.displayName || 'user');
  if (!handle) return bad(res, 'Handle is required');
  if (accountByHandle(handle)) return bad(res, 'That handle is taken');
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) m FROM accounts').get().m;
  const info = db
    .prepare(
      `INSERT INTO accounts (handle, display_name, bio, avatar, banner, location, website, verified, badge,
                             account_created_at, follower_boost, following_boost, color, sort_order, real_created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      handle,
      body.displayName || handle,
      body.bio || '',
      body.avatar || '',
      body.banner || '',
      body.location || '',
      body.website || '',
      body.verified ? 1 : 0,
      body.badge || (body.verified ? 'blue' : ''),
      parseDateInput(body.createdAt, clockState().now),
      Number(body.followerBoost) || 0,
      Number(body.followingBoost) || 0,
      body.color || '',
      maxSort + 1,
      Date.now()
    );
  const dto = decorateAccount(accountRow(info.lastInsertRowid));
  broadcast('account', { action: 'create', account: dto });
  res.status(201).json(dto);
});

api.get('/accounts/:key', (req, res) => {
  const key = /^\d+$/.test(req.params.key) ? Number(req.params.key) : null;
  const row = key ? accountRow(key) : accountByHandle(req.params.key);
  if (!row) return bad(res, 'Account not found', 404);
  const viewer = req.auth.actingAccountId || null;
  const followers = db
    .prepare('SELECT follower_id FROM follows WHERE followee_id = ?')
    .all(row.id)
    .map((r) => decorateAccount(accountRow(r.follower_id), viewer))
    .filter(Boolean);
  const following = db
    .prepare('SELECT followee_id FROM follows WHERE follower_id = ?')
    .all(row.id)
    .map((r) => decorateAccount(accountRow(r.followee_id), viewer))
    .filter(Boolean);
  res.json({ account: decorateAccount(row, viewer), followers, following });
});

api.patch('/accounts/:id', requireAuth, (req, res) => {
  const row = accountRow(Number(req.params.id));
  if (!row) return bad(res, 'Account not found', 404);
  const body = req.body || {};
  const fields = {
    display_name: body.displayName,
    bio: body.bio,
    avatar: body.avatar,
    banner: body.banner,
    location: body.location,
    website: body.website,
    badge: body.badge,
    color: body.color,
    account_created_at: body.createdAt !== undefined ? parseDateInput(body.createdAt, row.account_created_at) : undefined,
    follower_boost: body.followerBoost !== undefined ? Number(body.followerBoost) || 0 : undefined,
    following_boost: body.followingBoost !== undefined ? Number(body.followingBoost) || 0 : undefined,
    pinned_post_id: body.pinnedPostId !== undefined ? (body.pinnedPostId ? Number(body.pinnedPostId) : null) : undefined,
    sort_order: body.sortOrder !== undefined ? Number(body.sortOrder) || 0 : undefined,
  };
  if (body.handle !== undefined) {
    const handle = normaliseHandle(body.handle);
    if (handle) {
      const clash = accountByHandle(handle);
      if (clash && clash.id !== row.id) return bad(res, 'That handle is taken');
      fields.handle = handle;
    }
  }
  if (body.verified !== undefined) fields.verified = body.verified ? 1 : 0;

  const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  if (keys.length) {
    db.prepare(`UPDATE accounts SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
      ...keys.map((k) => fields[k]),
      row.id
    );
  }
  const dto = decorateAccount(accountRow(row.id), req.auth.actingAccountId || null);
  broadcast('account', { action: 'update', account: dto });
  res.json(dto);
});

api.delete('/accounts/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!accountRow(id)) return bad(res, 'Account not found', 404);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  broadcast('account', { action: 'delete', accountId: id });
  res.json({ ok: true });
});

api.post('/accounts/:id/follow', requireAuth, (req, res) => {
  const target = accountRow(Number(req.params.id));
  if (!target) return bad(res, 'Account not found', 404);
  const as = requireActor(req, res);
  if (!as) return undefined;
  if (as === target.id) return bad(res, "You can't follow yourself");
  const on = req.body?.on !== false;
  if (on) {
    db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)').run(
      as,
      target.id,
      clockState().now
    );
    const note = pushNotification({ accountId: target.id, actorId: as, type: 'follow', text: 'followed you' });
    if (note) broadcast('notification', { action: 'create', notification: note });
  } else {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(as, target.id);
  }
  const payload = { followerId: as, followeeId: target.id, on };
  broadcast('follow', payload);
  res.json({
    ...payload,
    account: decorateAccount(accountRow(target.id), as),
    actor: decorateAccount(accountRow(as), as),
  });
});

/* ------------------------------------------------------------------ *
 * posts
 * ------------------------------------------------------------------ */
function notifyMentions(text, authorId, postId, at) {
  for (const handle of mentionHandles(text)) {
    const target = accountByHandle(handle);
    if (!target || target.id === authorId) continue;
    const note = pushNotification({
      accountId: target.id,
      actorId: authorId,
      type: 'mention',
      postId,
      text: 'mentioned you',
      createdAt: at,
    });
    if (note) broadcast('notification', { action: 'create', notification: note });
  }
}

api.get('/timeline', (req, res) => {
  const viewer = Number(req.query.accountId) || req.auth.actingAccountId || null;
  res.json(
    timeline({
      type: req.query.type || 'all',
      accountId: viewer,
      filter: req.query.filter || 'all',
      cursor: req.query.cursor || null,
      limit: Math.min(Number(req.query.limit) || 25, 60),
      includeReposts: req.query.includeReposts !== '0',
      q: req.query.q || null,
    })
  );
});

api.get('/posts/:id', (req, res) => {
  const id = Number(req.params.id);
  const viewer = req.auth.actingAccountId || null;
  const row = postRow(id);
  if (!row) return bad(res, 'Post not found', 404);

  const ancestors = [];
  let parentId = row.reply_to_id;
  let guard = 0;
  while (parentId && guard++ < 30) {
    const parent = postRow(parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    parentId = parent.reply_to_id;
  }
  const replies = db
    .prepare('SELECT * FROM posts WHERE reply_to_id = ? AND is_deleted = 0 ORDER BY created_at ASC')
    .all(id);

  res.json({
    post: decoratePost(row, viewer),
    ancestors: decoratePosts(ancestors, viewer),
    replies: decoratePosts(replies, viewer),
  });
});

api.get('/posts/:id/replies', (req, res) => {
  const id = Number(req.params.id);
  const viewer = req.auth.actingAccountId || null;
  const rows = db.prepare('SELECT * FROM posts WHERE reply_to_id = ? AND is_deleted = 0 ORDER BY created_at ASC').all(id);
  res.json({ items: decoratePosts(rows, viewer) });
});

api.post('/posts', requireAuth, (req, res) => {
  const as = requireActor(req, res);
  if (!as) return undefined;
  const body = req.body || {};
  const text = String(body.text ?? '');
  const media = Array.isArray(body.media) ? body.media.filter((m) => m && m.url).slice(0, 4) : [];
  if (!text.trim() && !media.length && !body.repostOf) return bad(res, 'Nothing to post');

  const at = parseDateInput(body.createdAt, clockState().now);

  // a plain repost is a row in `reposts`, not a new post
  if (body.repostOf) {
    const target = postRow(Number(body.repostOf));
    if (!target) return bad(res, 'Original post not found', 404);
    db.prepare('INSERT OR REPLACE INTO reposts (account_id, post_id, created_at) VALUES (?, ?, ?)').run(as, target.id, at);
    const note = pushNotification({
      accountId: target.author_id,
      actorId: as,
      type: 'repost',
      postId: target.id,
      text: 'reposted your post',
      createdAt: at,
    });
    if (note) broadcast('notification', { action: 'create', notification: note });
    broadcast('post', { action: 'repost', postId: target.id, accountId: as, createdAt: at });
    return res.status(201).json({ repost: true, post: decoratePost(target, as) });
  }

  const info = db
    .prepare(
      `INSERT INTO posts (author_id, text, created_at, reply_to_id, quote_of_id, pinned, real_created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(as, text, at, body.replyTo ? Number(body.replyTo) : null, body.quoteOf ? Number(body.quoteOf) : null, body.pinned ? 1 : 0, Date.now());
  const postId = info.lastInsertRowid;

  const insertMedia = db.prepare('INSERT INTO post_media (post_id, url, alt, position) VALUES (?, ?, ?, ?)');
  media.forEach((m, i) => insertMedia.run(postId, m.url, m.alt || '', i));

  if (body.pinned) db.prepare('UPDATE accounts SET pinned_post_id = ? WHERE id = ?').run(postId, as);

  if (body.replyTo) {
    const parent = postRow(Number(body.replyTo));
    if (parent) {
      const note = pushNotification({
        accountId: parent.author_id,
        actorId: as,
        type: 'reply',
        postId,
        text: 'replied to your post',
        createdAt: at,
      });
      if (note) broadcast('notification', { action: 'create', notification: note });
    }
  }
  if (body.quoteOf) {
    const quoted = postRow(Number(body.quoteOf));
    if (quoted) {
      const note = pushNotification({
        accountId: quoted.author_id,
        actorId: as,
        type: 'quote',
        postId,
        text: 'quoted your post',
        createdAt: at,
      });
      if (note) broadcast('notification', { action: 'create', notification: note });
    }
  }
  notifyMentions(text, as, postId, at);

  const dto = decoratePost(postRow(postId), as);
  broadcast('post', { action: 'create', post: dto });
  res.status(201).json(dto);
});

api.patch('/posts/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = postRow(id);
  if (!row) return bad(res, 'Post not found', 404);
  const body = req.body || {};
  const fields = {};
  if (body.text !== undefined) fields.text = String(body.text);
  if (body.createdAt !== undefined) fields.created_at = parseDateInput(body.createdAt, row.created_at);
  if (body.likeBoost !== undefined) fields.like_boost = Number(body.likeBoost) || 0;
  if (body.repostBoost !== undefined) fields.repost_boost = Number(body.repostBoost) || 0;
  if (body.viewBoost !== undefined) fields.view_boost = Number(body.viewBoost) || 0;
  if (body.pinned !== undefined) fields.pinned = body.pinned ? 1 : 0;
  if (body.editedAt !== false) fields.edited_at = Date.now();

  const keys = Object.keys(fields);
  if (keys.length) {
    db.prepare(`UPDATE posts SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  }
  if (Array.isArray(body.media)) {
    db.prepare('DELETE FROM post_media WHERE post_id = ?').run(id);
    const insertMedia = db.prepare('INSERT INTO post_media (post_id, url, alt, position) VALUES (?, ?, ?, ?)');
    body.media.filter((m) => m && m.url).slice(0, 4).forEach((m, i) => insertMedia.run(id, m.url, m.alt || '', i));
  }
  if (body.pinned !== undefined) {
    db.prepare('UPDATE accounts SET pinned_post_id = ? WHERE id = ?').run(body.pinned ? id : null, row.author_id);
  }
  const dto = decoratePost(postRow(id), req.auth.actingAccountId || null);
  broadcast('post', { action: 'update', post: dto });
  res.json(dto);
});

api.delete('/posts/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!postRow(id)) return bad(res, 'Post not found', 404);
  db.prepare('UPDATE posts SET is_deleted = 1 WHERE id = ?').run(id);
  db.prepare('UPDATE accounts SET pinned_post_id = NULL WHERE pinned_post_id = ?').run(id);
  broadcast('post', { action: 'delete', postId: id });
  res.json({ ok: true });
});

function reactionHandler(kind) {
  const table = { like: 'likes', repost: 'reposts', bookmark: 'bookmarks' }[kind];
  const noteText = kind === 'like' ? 'liked your post' : 'reposted your post';
  return (req, res) => {
    const id = Number(req.params.id);
    const post = postRow(id);
    if (!post) return bad(res, 'Post not found', 404);
    const as = requireActor(req, res);
    if (!as) return undefined;
    const on = req.body?.on !== false;
    if (on) {
      db.prepare(`INSERT OR REPLACE INTO ${table} (account_id, post_id, created_at) VALUES (?, ?, ?)`).run(
        as,
        id,
        clockState().now
      );
      if (kind !== 'bookmark') {
        const note = pushNotification({
          accountId: post.author_id,
          actorId: as,
          type: kind,
          postId: id,
          text: noteText,
        });
        if (note) broadcast('notification', { action: 'create', notification: note });
      }
    } else {
      db.prepare(`DELETE FROM ${table} WHERE account_id = ? AND post_id = ?`).run(as, id);
    }
    const dto = decoratePost(postRow(id), as);
    broadcast('reaction', { kind, postId: id, accountId: as, on, post: dto });
    res.json(dto);
  };
}

api.post('/posts/:id/like', requireAuth, reactionHandler('like'));
api.post('/posts/:id/repost', requireAuth, reactionHandler('repost'));
api.post('/posts/:id/bookmark', requireAuth, reactionHandler('bookmark'));

/* ------------------------------------------------------------------ *
 * notifications
 * ------------------------------------------------------------------ */
api.get('/notifications', requireAuth, (req, res) => {
  const accountId = Number(req.query.accountId) || req.auth.actingAccountId;
  if (!accountId) return res.json({ items: [], badges: badges(null) });
  const filter = req.query.filter || 'all';
  let where = 'account_id = ?';
  if (filter === 'mentions') where += " AND type IN ('mention','reply','quote')";
  else if (filter === 'verified') where += ' AND actor_id IN (SELECT id FROM accounts WHERE verified = 1)';
  const rows = db.prepare(`SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT 120`).all(accountId);
  res.json({ items: rows.map(notificationDTO), badges: badges(accountId) });
});

api.post('/notifications', requireAuth, (req, res) => {
  const body = req.body || {};
  const accountId = Number(body.accountId) || req.auth.actingAccountId;
  if (!accountId) return bad(res, 'Pick a recipient account');
  const note = pushNotification({
    accountId,
    actorId: body.actorId ? Number(body.actorId) : null,
    type: body.type || 'custom',
    postId: body.postId ? Number(body.postId) : null,
    text: body.text || '',
    createdAt: parseDateInput(body.createdAt, clockState().now),
    isManual: true,
  });
  if (!note) return bad(res, 'Could not create notification');
  broadcast('notification', { action: 'create', notification: note });
  res.status(201).json(note);
});

api.patch('/notifications/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  if (!row) return bad(res, 'Notification not found', 404);
  const body = req.body || {};
  const fields = {};
  if (body.accountId !== undefined) fields.account_id = Number(body.accountId);
  if (body.actorId !== undefined) fields.actor_id = body.actorId ? Number(body.actorId) : null;
  if (body.type !== undefined) fields.type = body.type;
  if (body.postId !== undefined) fields.post_id = body.postId ? Number(body.postId) : null;
  if (body.text !== undefined) fields.text = body.text;
  if (body.createdAt !== undefined) fields.created_at = parseDateInput(body.createdAt, row.created_at);
  if (body.isRead !== undefined) fields.is_read = body.isRead ? 1 : 0;
  const keys = Object.keys(fields);
  if (keys.length) {
    db.prepare(`UPDATE notifications SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  }
  const dto = notificationDTO(db.prepare('SELECT * FROM notifications WHERE id = ?').get(id));
  broadcast('notification', { action: 'update', notification: dto });
  res.json(dto);
});

api.delete('/notifications/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
  broadcast('notification', { action: 'delete', notificationId: id });
  res.json({ ok: true });
});

api.post('/notifications/read', requireAuth, (req, res) => {
  const accountId = Number(req.body?.accountId) || req.auth.actingAccountId;
  if (!accountId) return bad(res, 'No account');
  if (req.body?.only) db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(Number(req.body.only));
  else db.prepare('UPDATE notifications SET is_read = 1 WHERE account_id = ?').run(accountId);
  broadcast('notification', { action: 'read', accountId });
  res.json({ ok: true, badges: badges(accountId) });
});

api.post('/notifications/clear', requireAuth, (req, res) => {
  const accountId = Number(req.body?.accountId) || req.auth.actingAccountId;
  db.prepare('DELETE FROM notifications WHERE account_id = ?').run(accountId);
  broadcast('notification', { action: 'clear', accountId });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * trends
 * ------------------------------------------------------------------ */
api.get('/trends', (_req, res) => {
  res.json(db.prepare('SELECT * FROM trends ORDER BY position, id').all());
});

api.post('/trends', requireAuth, (req, res) => {
  const body = req.body || {};
  const max = db.prepare('SELECT COALESCE(MAX(position), 0) m FROM trends').get().m;
  const info = db
    .prepare('INSERT INTO trends (name, category, post_count, position, location) VALUES (?, ?, ?, ?, ?)')
    .run(body.name || 'New trend', body.category || '', Number(body.postCount) || 0, Number(body.position) || max + 1, body.location || '');
  const dto = db.prepare('SELECT * FROM trends WHERE id = ?').get(info.lastInsertRowid);
  broadcast('trend', { action: 'create', trend: dto });
  res.status(201).json(dto);
});

api.patch('/trends/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM trends WHERE id = ?').get(id)) return bad(res, 'Trend not found', 404);
  const body = req.body || {};
  const fields = {};
  for (const [key, col] of Object.entries({ name: 'name', category: 'category', postCount: 'post_count', position: 'position', location: 'location' })) {
    if (body[key] !== undefined) fields[col] = typeof body[key] === 'number' ? body[key] : String(body[key]);
  }
  const keys = Object.keys(fields);
  if (keys.length) db.prepare(`UPDATE trends SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  const dto = db.prepare('SELECT * FROM trends WHERE id = ?').get(id);
  broadcast('trend', { action: 'update', trend: dto });
  res.json(dto);
});

api.delete('/trends/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM trends WHERE id = ?').run(id);
  broadcast('trend', { action: 'delete', trendId: id });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * direct messages
 * ------------------------------------------------------------------ */
api.get('/conversations', requireAuth, (req, res) => {
  const accountId = Number(req.query.accountId) || req.auth.actingAccountId;
  if (!accountId) return res.json({ items: [], badges: badges(null) });
  const rows = db
    .prepare(
      `SELECT c.* FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id
       WHERE cp.account_id = ?
       ORDER BY COALESCE((SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = c.id), c.created_at) DESC`
    )
    .all(accountId);
  res.json({ items: rows.map((r) => conversationDTO(r, accountId)), badges: badges(accountId) });
});

api.post('/conversations', requireAuth, (req, res) => {
  const as = requireActor(req, res);
  if (!as) return undefined;
  const body = req.body || {};
  const participantIds = [...new Set((body.participantIds || []).map(Number).filter((n) => n && accountRow(n)))];
  if (!participantIds.length) return bad(res, 'Pick at least one other account');
  if (participantIds.length === 1 && body.type !== 'group') {
    const conv = ensureDirectConversation(as, participantIds[0]);
    const dto = conversationDTO(conv, as);
    broadcast('conversation', { action: 'update', conversation: dto });
    return res.status(201).json(dto);
  }
  const info = db
    .prepare("INSERT INTO conversations (type, title, avatar, created_at, real_created_at) VALUES ('group', ?, ?, ?, ?)")
    .run(body.title || '', body.avatar || '', parseDateInput(body.createdAt, clockState().now), Date.now());
  const id = info.lastInsertRowid;
  const addP = db.prepare('INSERT OR IGNORE INTO conversation_participants (conversation_id, account_id) VALUES (?, ?)');
  addP.run(id, as);
  for (const pid of participantIds) addP.run(id, pid);
  const dto = conversationDTO(db.prepare('SELECT * FROM conversations WHERE id = ?').get(id), as);
  broadcast('conversation', { action: 'create', conversation: dto });
  res.status(201).json(dto);
});

api.patch('/conversations/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(id)) return bad(res, 'Conversation not found', 404);
  const body = req.body || {};
  const fields = {};
  if (body.title !== undefined) fields.title = String(body.title);
  if (body.avatar !== undefined) fields.avatar = String(body.avatar);
  const keys = Object.keys(fields);
  if (keys.length) db.prepare(`UPDATE conversations SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  if (Array.isArray(body.participantIds)) {
    db.prepare('DELETE FROM conversation_participants WHERE conversation_id = ?').run(id);
    const addP = db.prepare('INSERT OR IGNORE INTO conversation_participants (conversation_id, account_id) VALUES (?, ?)');
    for (const pid of body.participantIds.map(Number).filter((n) => accountRow(n))) addP.run(id, pid);
  }
  const dto = conversationDTO(db.prepare('SELECT * FROM conversations WHERE id = ?').get(id), req.auth.actingAccountId || null);
  broadcast('conversation', { action: 'update', conversation: dto });
  res.json(dto);
});

api.delete('/conversations/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  broadcast('conversation', { action: 'delete', conversationId: id });
  res.json({ ok: true });
});

api.get('/conversations/:id/messages', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const accountId = Number(req.query.accountId) || req.auth.actingAccountId;
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!row) return bad(res, 'Conversation not found', 404);
  const before = req.query.before ? Number(req.query.before) : null;
  const args = [id];
  let where = 'conversation_id = ? AND is_deleted = 0';
  if (before) {
    where += ' AND id < ?';
    args.push(before);
  }
  const rows = db.prepare(`SELECT * FROM messages WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT 60`).all(...args);
  res.json({
    conversation: conversationDTO(row, accountId),
    items: rows.reverse().map((r) => messageDTO(r, accountId)),
  });
});

api.post('/conversations/:id/messages', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!conv) return bad(res, 'Conversation not found', 404);
  const as = requireActor(req, res);
  if (!as) return undefined;
  if (!isParticipant(id, as)) return bad(res, 'You are not in this conversation', 403);
  const body = req.body || {};
  const text = String(body.text ?? '');
  if (!text.trim()) return bad(res, 'Message is empty');
  const at = parseDateInput(body.createdAt, clockState().now);
  const info = db
    .prepare(
      `INSERT INTO messages (conversation_id, sender_id, text, created_at, reply_to_id, real_created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, as, text, at, body.replyToId ? Number(body.replyToId) : null, Date.now());
  const msgId = info.lastInsertRowid;
  db.prepare(
    `INSERT INTO conversation_reads (conversation_id, account_id, last_read_id) VALUES (?, ?, ?)
     ON CONFLICT(conversation_id, account_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`
  ).run(id, as, msgId);

  const recipients = db
    .prepare('SELECT account_id FROM conversation_participants WHERE conversation_id = ? AND account_id <> ?')
    .all(id, as);
  for (const r of recipients) {
    const note = pushNotification({
      accountId: r.account_id,
      actorId: as,
      type: 'dm',
      text: conv.type === 'group' ? `sent a message in ${conv.title || 'a group chat'}` : 'sent you a message',
      createdAt: at,
    });
    if (note) broadcast('notification', { action: 'create', notification: note });
  }

  const dto = messageDTO(db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId), as);
  broadcast('message', { action: 'create', conversationId: id, message: dto });
  res.status(201).json(dto);
});

api.patch('/messages/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  if (!row) return bad(res, 'Message not found', 404);
  const body = req.body || {};
  const fields = {};
  if (body.text !== undefined) {
    fields.text = String(body.text);
    fields.edited_at = Date.now();
  }
  if (body.createdAt !== undefined) fields.created_at = parseDateInput(body.createdAt, row.created_at);
  const keys = Object.keys(fields);
  if (keys.length) db.prepare(`UPDATE messages SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  const dto = messageDTO(db.prepare('SELECT * FROM messages WHERE id = ?').get(id), req.auth.actingAccountId || null);
  broadcast('message', { action: 'update', conversationId: row.conversation_id, message: dto });
  res.json(dto);
});

api.delete('/messages/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  if (!row) return bad(res, 'Message not found', 404);
  db.prepare('UPDATE messages SET is_deleted = 1 WHERE id = ?').run(id);
  broadcast('message', { action: 'delete', conversationId: row.conversation_id, messageId: id });
  res.json({ ok: true });
});

api.post('/conversations/:id/read', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const as = requireActor(req, res);
  if (!as) return undefined;
  const last = db.prepare('SELECT COALESCE(MAX(id), 0) m FROM messages WHERE conversation_id = ?').get(id).m;
  db.prepare(
    `INSERT INTO conversation_reads (conversation_id, account_id, last_read_id) VALUES (?, ?, ?)
     ON CONFLICT(conversation_id, account_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`
  ).run(id, as, last);
  broadcast('conversation', { action: 'read', conversationId: id, accountId: as });
  res.json({ ok: true, badges: badges(as) });
});

/* ------------------------------------------------------------------ *
 * search
 * ------------------------------------------------------------------ */
api.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const viewer = req.auth.actingAccountId || null;
  if (!q) return res.json({ posts: [], people: [], query: q });

  const people = decorateAccounts(
    db
      .prepare(
        `SELECT * FROM accounts
         WHERE handle LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\' OR bio LIKE ? ESCAPE '\\'
         ORDER BY verified DESC, sort_order LIMIT 20`
      )
      .all(`%${q}%`, `%${q}%`, `%${q}%`),
    viewer
  );

  let rows = [];
  try {
    rows = db
      .prepare(
        `SELECT p.* FROM posts p
         JOIN posts_fts f ON f.rowid = p.id
         WHERE posts_fts MATCH ? AND p.is_deleted = 0
         ORDER BY p.created_at DESC LIMIT 40`
      )
      .all(q);
  } catch {
    rows = [];
  }
  if (!rows.length) {
    rows = db
      .prepare("SELECT * FROM posts WHERE is_deleted = 0 AND text LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 40")
      .all(`%${q}%`);
  }
  if ((req.query.tab || 'top') === 'people') return res.json({ posts: [], people, query: q });
  res.json({ posts: decoratePosts(rows, viewer), people, query: q });
});

/* ------------------------------------------------------------------ *
 * uploads
 * ------------------------------------------------------------------ */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only images can be uploaded'));
  },
});

api.post('/upload', requireAuth, upload.array('files', 4), (req, res) => {
  const files = req.files || [];
  res.json({ files: files.map((f) => ({ url: `/uploads/${f.filename}`, alt: '', name: f.originalname })) });
});

/* ------------------------------------------------------------------ *
 * export / import / reset
 * ------------------------------------------------------------------ */
const TABLES = [
  'settings',
  'accounts',
  'posts',
  'post_media',
  'likes',
  'reposts',
  'bookmarks',
  'follows',
  'notifications',
  'trends',
  'conversations',
  'conversation_participants',
  'messages',
  'conversation_reads',
];

api.get('/export', requireAuth, (_req, res) => {
  const dump = { version: 1, exportedAt: Date.now(), tables: {} };
  for (const t of TABLES) dump.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  res.setHeader('Content-Disposition', `attachment; filename="chirper-export-${Date.now()}.json"`);
  res.json(dump);
});

api.post('/import', requireAuth, (req, res) => {
  const dump = req.body;
  if (!dump?.tables) return bad(res, 'Bad export file');
  const tables = Object.keys(dump.tables).filter((t) => TABLES.includes(t));
  db.transaction(() => {
    db.exec('PRAGMA foreign_keys = OFF');
    for (const t of [...tables].reverse()) db.prepare(`DELETE FROM ${t}`).run();
    for (const t of tables) {
      const rows = dump.tables[t];
      if (!Array.isArray(rows) || !rows.length) continue;
      const cols = Object.keys(rows[0]);
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO ${t} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      );
      for (const row of rows) stmt.run(...cols.map((c) => row[c]));
    }
    db.exec('PRAGMA foreign_keys = ON');
  })();
  broadcast('world', { action: 'import' });
  res.json({ ok: true });
});

api.post('/admin/reset', requireAuth, (req, res) => {
  const scope = req.body?.scope || 'all';
  db.transaction(() => {
    if (scope === 'dms') {
      for (const t of ['messages', 'conversation_reads', 'conversation_participants', 'conversations']) {
        db.prepare(`DELETE FROM ${t}`).run();
      }
      return;
    }
    if (scope === 'posts') {
      db.prepare('DELETE FROM posts').run();
      db.prepare('DELETE FROM notifications').run();
      return;
    }
    for (const t of [
      'messages',
      'conversation_reads',
      'conversation_participants',
      'conversations',
      'notifications',
      'likes',
      'reposts',
      'bookmarks',
      'post_media',
      'posts',
      'follows',
      'accounts',
      'trends',
    ]) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
    db.prepare("DELETE FROM sqlite_sequence WHERE name <> 'settings'").run();
  })();
  if (scope === 'all') seedIfEmpty();
  broadcast('world', { action: 'reset', scope });
  res.json({ ok: true });
});
