import { db, getSetting, bool } from './db.js';
import { clockState } from './clock.js';

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */
const groupBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row[key])) map.set(row[key], []);
    map.get(row[key]).push(row);
  }
  return map;
};

function likePattern(q) {
  return `%${String(q).replace(/[%_\\]/g, (m) => '\\' + m)}%`;
}

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */
export function accountRow(id) {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
}

export function accountByHandle(handle) {
  return db.prepare('SELECT * FROM accounts WHERE handle = ? COLLATE NOCASE').get(String(handle).replace(/^@/, ''));
}

export function allAccountRows() {
  return db.prepare('SELECT * FROM accounts ORDER BY sort_order, id').all();
}

/**
 * Turns raw account rows into API objects with follower / following / post
 * counts (real numbers plus your optional fake boosts) and viewer relations.
 */
export function decorateAccounts(rows, viewerId = null) {
  const followerCounts = new Map(
    db.prepare('SELECT followee_id id, COUNT(*) n FROM follows GROUP BY followee_id').all().map((r) => [r.id, r.n])
  );
  const followingCounts = new Map(
    db.prepare('SELECT follower_id id, COUNT(*) n FROM follows GROUP BY follower_id').all().map((r) => [r.id, r.n])
  );
  const postCounts = new Map(
    db
      .prepare('SELECT author_id id, COUNT(*) n FROM posts WHERE is_deleted = 0 GROUP BY author_id')
      .all()
      .map((r) => [r.id, r.n])
  );
  const viewerFollows = viewerId
    ? new Set(db.prepare('SELECT followee_id FROM follows WHERE follower_id = ?').all(viewerId).map((r) => r.followee_id))
    : new Set();
  const followsViewer = viewerId
    ? new Set(db.prepare('SELECT follower_id FROM follows WHERE followee_id = ?').all(viewerId).map((r) => r.follower_id))
    : new Set();

  return rows.map((row) => ({
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    avatar: row.avatar,
    banner: row.banner,
    location: row.location,
    website: row.website,
    verified: Boolean(row.verified),
    badge: row.badge || (row.verified ? 'blue' : ''),
    color: row.color || '',
    createdAt: row.account_created_at,
    followerCount: (followerCounts.get(row.id) || 0) + (row.follower_boost || 0),
    followingCount: (followingCounts.get(row.id) || 0) + (row.following_boost || 0),
    postCount: postCounts.get(row.id) || 0,
    pinnedPostId: row.pinned_post_id || null,
    archived: Boolean(row.archived),
    sortOrder: row.sort_order,
    isFollowedByViewer: viewerFollows.has(row.id),
    followsViewer: followsViewer.has(row.id),
  }));
}

export function decorateAccount(row, viewerId = null) {
  if (!row) return null;
  return decorateAccounts([row], viewerId)[0];
}

export function accountMap(viewerId = null) {
  const map = new Map();
  for (const acc of decorateAccounts(allAccountRows(), viewerId)) map.set(acc.id, acc);
  return map;
}

/* ------------------------------------------------------------------ *
 * Posts
 * ------------------------------------------------------------------ */
export function postRow(id) {
  return db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
}

/**
 * Batched hydration for a list of post rows.
 * `noQuotes` guards against infinite recursion on quote chains.
 */
export function decoratePosts(rows, viewerId = null, noQuotes = false) {
  const list = rows.filter(Boolean);
  if (!list.length) return [];

  const ids = list.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const accounts = accountMap(viewerId);

  const mediaByPost = groupBy(
    db.prepare(`SELECT * FROM post_media WHERE post_id IN (${ph}) ORDER BY position, id`).all(...ids),
    'post_id'
  );
  const likesByPost = groupBy(db.prepare(`SELECT * FROM likes WHERE post_id IN (${ph})`).all(...ids), 'post_id');
  const repostsByPost = groupBy(db.prepare(`SELECT * FROM reposts WHERE post_id IN (${ph})`).all(...ids), 'post_id');
  const bookmarksByPost = groupBy(db.prepare(`SELECT * FROM bookmarks WHERE post_id IN (${ph})`).all(...ids), 'post_id');
  const replyCounts = new Map(
    db
      .prepare(`SELECT reply_to_id id, COUNT(*) n FROM posts WHERE reply_to_id IN (${ph}) AND is_deleted = 0 GROUP BY reply_to_id`)
      .all(...ids)
      .map((r) => [r.id, r.n])
  );
  const quoteCounts = new Map(
    db
      .prepare(`SELECT quote_of_id id, COUNT(*) n FROM posts WHERE quote_of_id IN (${ph}) AND is_deleted = 0 GROUP BY quote_of_id`)
      .all(...ids)
      .map((r) => [r.id, r.n])
  );

  const quoteMap = new Map();
  if (!noQuotes) {
    const quoteIds = [...new Set(list.map((r) => r.quote_of_id).filter(Boolean))];
    if (quoteIds.length) {
      const quoteRows = quoteIds.map((id) => postRow(id)).filter(Boolean);
      for (const dto of decoratePosts(quoteRows, viewerId, true)) quoteMap.set(dto.id, dto);
    }
  }

  const parentHandles = new Map();
  const parentIds = [...new Set(list.map((r) => r.reply_to_id).filter(Boolean))];
  if (parentIds.length) {
    const ph2 = parentIds.map(() => '?').join(',');
    for (const row of db
      .prepare(`SELECT p.id, a.handle FROM posts p JOIN accounts a ON a.id = p.author_id WHERE p.id IN (${ph2})`)
      .all(...parentIds)) {
      parentHandles.set(row.id, row.handle);
    }
  }

  return list.map((row) => {
    const likes = likesByPost.get(row.id) || [];
    const reposts = repostsByPost.get(row.id) || [];
    const bookmarks = bookmarksByPost.get(row.id) || [];
    const likeCount = likes.length + (row.like_boost || 0);
    const repostCount = reposts.length + (row.repost_boost || 0);
    return {
      id: row.id,
      authorId: row.author_id,
      author: accounts.get(row.author_id) || null,
      text: row.text,
      createdAt: row.created_at,
      editedAt: row.edited_at || null,
      replyToId: row.reply_to_id || null,
      replyToHandle: row.reply_to_id ? parentHandles.get(row.reply_to_id) || null : null,
      quoteOfId: row.quote_of_id || null,
      quoteOf: row.quote_of_id ? quoteMap.get(row.quote_of_id) || null : null,
      media: (mediaByPost.get(row.id) || []).map((m) => ({ url: m.url, alt: m.alt })),
      likeCount,
      repostCount,
      bookmarkCount: bookmarks.length,
      replyCount: replyCounts.get(row.id) || 0,
      quoteCount: quoteCounts.get(row.id) || 0,
      viewCount: Math.max(likeCount * 24 + repostCount * 8, row.view_boost || 0),
      likedBy: likes.map((l) => l.account_id),
      repostedBy: reposts.map((r) => r.account_id),
      bookmarkedBy: bookmarks.map((b) => b.account_id),
      liked: viewerId ? likes.some((l) => l.account_id === viewerId) : false,
      reposted: viewerId ? reposts.some((r) => r.account_id === viewerId) : false,
      bookmarked: viewerId ? bookmarks.some((b) => b.account_id === viewerId) : false,
      pinned: Boolean(row.pinned),
      isDeleted: Boolean(row.is_deleted),
    };
  });
}

export function decoratePost(row, viewerId = null) {
  if (!row) return null;
  return decoratePosts([row], viewerId)[0] || null;
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */
/**
 * A timeline is a UNION of "posts by these accounts" and
 * "reposts made by these accounts", so a repost lands in the feed at the
 * moment it was reposted - exactly like the real thing.
 */
export function timeline({
  type = 'all',
  accountId = null,
  filter = 'all',
  limit = 30,
  cursor = null,
  q = null,
  includeReposts = true,
}) {
  const clock = clockState();
  const showFuture = bool(getSetting('show_future_posts'));

  const postWhere = ['p.is_deleted = 0'];
  const repostWhere = includeReposts ? ['p.is_deleted = 0', 'r.account_id <> p.author_id'] : ['0 = 1'];
  const postArgs = [];
  const repostArgs = [];

  if (type === 'home') {
    const following = db.prepare('SELECT followee_id FROM follows WHERE follower_id = ?').all(accountId).map((r) => r.followee_id);
    const set = [...new Set([...following, accountId])];
    if (!set.length) return { items: [], nextCursor: null };
    const ph = set.map(() => '?').join(',');
    postWhere.push(`p.author_id IN (${ph})`);
    postArgs.push(...set);
    repostWhere.push(`r.account_id IN (${ph})`);
    repostArgs.push(...set);
  } else if (type === 'account' && accountId) {
    postWhere.push('p.author_id = ?');
    postArgs.push(accountId);
    repostWhere.push('r.account_id = ?');
    repostArgs.push(accountId);
  } else if (type === 'bookmarks' && accountId) {
    postWhere.push('p.id IN (SELECT post_id FROM bookmarks WHERE account_id = ?)');
    postArgs.push(accountId);
    repostWhere.push('0 = 1');
  } else if (type === 'likes' && accountId) {
    postWhere.push('p.id IN (SELECT post_id FROM likes WHERE account_id = ?)');
    postArgs.push(accountId);
    repostWhere.push('0 = 1');
  }

  /* Comments belong in Replies, not in the main feeds or on a profile's Posts
     tab. Search still looks through everything, and your own likes/bookmarks
     still show what you saved. */
  const repliesOnly = filter === 'replies';
  const allowReplies = repliesOnly || Boolean(q) || type === 'likes' || type === 'bookmarks';
  if (repliesOnly) {
    postWhere.push('p.reply_to_id IS NOT NULL');
  } else if (!allowReplies) {
    postWhere.push('p.reply_to_id IS NULL');
    repostWhere.push('p.reply_to_id IS NULL');
  }

  if (filter === 'media') postWhere.push('EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id)');
  if (filter === 'verified') postWhere.push('EXISTS (SELECT 1 FROM accounts a WHERE a.id = p.author_id AND a.verified = 1)');
  if (q) {
    postWhere.push("p.text LIKE ? ESCAPE '\\'");
    postArgs.push(likePattern(q));
  }
  if (!showFuture) {
    postWhere.push('p.created_at <= ?');
    postArgs.push(clock.now);
    repostWhere.push('p.created_at <= ?');
    repostArgs.push(clock.now);
  }

  if (cursor) {
    const [atRaw, tieRaw] = String(cursor).split(':');
    const at = Number(atRaw);
    const tie = Number(tieRaw);
    if (Number.isFinite(at) && Number.isFinite(tie)) {
      postWhere.push('(p.created_at < ? OR (p.created_at = ? AND p.id < ?))');
      postArgs.push(at, at, tie);
      repostWhere.push('(r.created_at < ? OR (r.created_at = ? AND r.post_id < ?))');
      repostArgs.push(at, at, tie);
    }
  }

  const sql = `
    SELECT * FROM (
      SELECT p.id AS post_id, p.created_at AS at, p.id AS tie, NULL AS reposter_id
      FROM posts p
      WHERE ${postWhere.join(' AND ')}
      UNION ALL
      SELECT r.post_id AS post_id, r.created_at AS at, r.post_id AS tie, r.account_id AS reposter_id
      FROM reposts r JOIN posts p ON p.id = r.post_id
      WHERE ${repostWhere.join(' AND ')}
    )
    ORDER BY at DESC, tie DESC
    LIMIT ?
  `;
  const rows = db.prepare(sql).all(...postArgs, ...repostArgs, limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const postRows = [...new Set(page.map((r) => r.post_id))].map((id) => postRow(id)).filter(Boolean);
  const dtoById = new Map(decoratePosts(postRows, accountId).map((p) => [p.id, p]));
  const accounts = accountMap(accountId);

  const items = page
    .map((r) => {
      const post = dtoById.get(r.post_id);
      if (!post) return null;
      return {
        key: `${r.at}:${r.tie}`,
        at: r.at,
        kind: r.reposter_id ? 'repost' : 'post',
        post,
        reposter: r.reposter_id ? accounts.get(r.reposter_id) || null : null,
        repostedAt: r.reposter_id ? r.at : null,
      };
    })
    .filter(Boolean);

  const last = page[page.length - 1];
  return { items, nextCursor: hasMore && last ? `${last.at}:${last.tie}` : null };
}

/* ------------------------------------------------------------------ *
 * Input helpers
 * ------------------------------------------------------------------ */
export function parseDateInput(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw new Error('Invalid date: ' + value);
  return ms;
}

export function normaliseHandle(handle) {
  return String(handle || '')
    .trim()
    .replace(/^@/, '')
    .replace(/[^A-Za-z0-9_]/g, '')
    .slice(0, 15);
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */
export function pushNotification({
  accountId,
  actorId = null,
  type,
  postId = null,
  text = '',
  createdAt = null,
  isManual = false,
}) {
  if (!accountId) return null;
  if (actorId && actorId === accountId && !isManual) return null;
  const at = createdAt ?? clockState().now;
  const info = db
    .prepare(
      `INSERT INTO notifications (account_id, actor_id, type, post_id, text, created_at, is_read, is_manual)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    )
    .run(accountId, actorId, type, postId, text, at, isManual ? 1 : 0);
  return notificationDTO(db.prepare('SELECT * FROM notifications WHERE id = ?').get(info.lastInsertRowid));
}

export function notificationDTO(row) {
  if (!row) return null;
  const actor = row.actor_id ? accountRow(row.actor_id) : null;
  const post = row.post_id ? postRow(row.post_id) : null;
  return {
    id: row.id,
    accountId: row.account_id,
    actorId: row.actor_id,
    actor: actor ? decorateAccount(actor) : null,
    type: row.type,
    postId: row.post_id,
    post: post ? decoratePost(post) : null,
    text: row.text,
    createdAt: row.created_at,
    isRead: Boolean(row.is_read),
    isManual: Boolean(row.is_manual),
  };
}

export function mentionHandles(text) {
  const out = new Set();
  const re = /@([A-Za-z0-9_]{1,15})/g;
  let m;
  while ((m = re.exec(String(text || '')))) out.add(m[1].toLowerCase());
  return [...out];
}

/* ------------------------------------------------------------------ *
 * Direct messages
 * ------------------------------------------------------------------ */
export function conversationDTO(row, viewerId = null) {
  const participants = db
    .prepare(
      `SELECT a.* FROM conversation_participants cp
       JOIN accounts a ON a.id = cp.account_id
       WHERE cp.conversation_id = ? ORDER BY a.sort_order, a.id`
    )
    .all(row.id);
  const decorated = decorateAccounts(participants, viewerId);
  const last = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? AND is_deleted = 0 ORDER BY created_at DESC, id DESC LIMIT 1')
    .get(row.id);
  const lastRead = viewerId
    ? db
        .prepare('SELECT last_read_id FROM conversation_reads WHERE conversation_id = ? AND account_id = ?')
        .get(row.id, viewerId)?.last_read_id || 0
    : 0;
  const unread = viewerId
    ? db
        .prepare(
          'SELECT COUNT(*) n FROM messages WHERE conversation_id = ? AND is_deleted = 0 AND id > ? AND sender_id <> ?'
        )
        .get(row.id, lastRead, viewerId).n
    : 0;

  const others = decorated.filter((a) => a.id !== viewerId);
  const lastDto = last ? messageDTO(last, viewerId) : null;
  if (lastDto && !lastDto.text && lastDto.media?.length) lastDto.text = '📷 Photo';
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    avatar: row.avatar,
    createdAt: row.created_at,
    participants: decorated,
    displayName:
      row.type === 'group'
        ? row.title || others.map((a) => a.displayName).join(', ') || 'Group'
        : others[0]?.displayName || decorated[0]?.displayName || 'Unknown',
    displayHandle: row.type === 'group' ? others.map((a) => '@' + a.handle).join(' ') : others[0] ? '@' + others[0].handle : '',
    lastMessage: lastDto,
    unreadCount: unread,
  };
}

export function parseMedia(value) {
  if (Array.isArray(value)) return value.filter((m) => m && m.url).slice(0, 4);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((m) => m && m.url).slice(0, 4) : [];
  } catch {
    return [];
  }
}

export function messageDTO(row, viewerId = null) {
  if (!row) return null;
  const sender = accountRow(row.sender_id);
  const replyTo = row.reply_to_id ? db.prepare('SELECT * FROM messages WHERE id = ?').get(row.reply_to_id) : null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    sender: sender ? decorateAccount(sender, viewerId) : null,
    text: row.text,
    media: parseMedia(row.media),
    createdAt: row.created_at,
    editedAt: row.edited_at || null,
    replyToId: row.reply_to_id || null,
    replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, senderId: replyTo.sender_id } : null,
    isDeleted: Boolean(row.is_deleted),
  };
}

export function ensureDirectConversation(a, b) {
  const existing = db
    .prepare(
      `SELECT c.* FROM conversations c
       JOIN conversation_participants p1 ON p1.conversation_id = c.id AND p1.account_id = ?
       JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.account_id = ?
       WHERE c.type = 'direct' LIMIT 1`
    )
    .get(a, b);
  if (existing) return existing;

  const info = db
    .prepare("INSERT INTO conversations (type, title, avatar, created_at, real_created_at) VALUES ('direct', '', '', ?, ?)")
    .run(clockState().now, Date.now());
  const id = info.lastInsertRowid;
  const addP = db.prepare('INSERT OR IGNORE INTO conversation_participants (conversation_id, account_id) VALUES (?, ?)');
  addP.run(id, a);
  addP.run(id, b);
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

export function isParticipant(conversationId, accountId) {
  return Boolean(
    db
      .prepare('SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND account_id = ?')
      .get(conversationId, accountId)
  );
}

/* ------------------------------------------------------------------ *
 * Settings payload sent to the client
 * ------------------------------------------------------------------ */
export function publicSettings() {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return {
    siteName: out.site_name ?? 'Chirper',
    accent: out.accent ?? '#1d9bf0',
    theme: out.theme ?? 'dim',
    showFuturePosts: out.show_future_posts === '1',
    hideRepliesDefault: out.hide_replies_default === '1',
    readReceipts: out.read_receipts === '1',
    welcomeNote: out.welcome_note ?? '',
  };
}
