import Database from 'better-sqlite3';
import { DB_PATH } from './config.js';

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/* ------------------------------------------------------------------ *
 * Schema
 * ------------------------------------------------------------------ */
db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  handle             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name       TEXT NOT NULL DEFAULT '',
  bio                TEXT NOT NULL DEFAULT '',
  avatar             TEXT NOT NULL DEFAULT '',
  banner             TEXT NOT NULL DEFAULT '',
  location           TEXT NOT NULL DEFAULT '',
  website            TEXT NOT NULL DEFAULT '',
  verified           INTEGER NOT NULL DEFAULT 0,
  badge              TEXT NOT NULL DEFAULT '',      -- '', 'blue', 'gold', 'grey'
  account_created_at INTEGER NOT NULL,              -- fictional "joined" date, ms
  follower_boost     INTEGER NOT NULL DEFAULT 0,    -- fake followers added on top
  following_boost    INTEGER NOT NULL DEFAULT 0,
  pinned_post_id     INTEGER,
  archived           INTEGER NOT NULL DEFAULT 0,
  color              TEXT NOT NULL DEFAULT '',
  sort_order         INTEGER NOT NULL DEFAULT 0,
  real_created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  text         TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,     -- fictional ms
  edited_at    INTEGER,
  reply_to_id  INTEGER,
  quote_of_id  INTEGER,
  pinned       INTEGER NOT NULL DEFAULT 0,
  like_boost   INTEGER NOT NULL DEFAULT 0,
  repost_boost INTEGER NOT NULL DEFAULT 0,
  view_boost   INTEGER NOT NULL DEFAULT 0,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  real_created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author  ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_reply   ON posts(reply_to_id);

CREATE TABLE IF NOT EXISTS post_media (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url      TEXT NOT NULL,
  alt      TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_media_post ON post_media(post_id);

CREATE TABLE IF NOT EXISTS likes (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);

CREATE TABLE IF NOT EXISTS reposts (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_reposts_post ON reposts(post_id);

CREATE TABLE IF NOT EXISTS bookmarks (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, post_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,  -- recipient
  actor_id   INTEGER REFERENCES accounts(id) ON DELETE CASCADE,           -- who "did" it
  type       TEXT NOT NULL,       -- like | repost | follow | reply | mention | quote | dm | custom
  post_id    INTEGER,
  text       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  is_manual  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notif_acct ON notifications(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trends (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT '',
  post_count INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  location   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS conversations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL DEFAULT 'direct',   -- direct | group
  title        TEXT NOT NULL DEFAULT '',
  avatar       TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  real_created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, account_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  text            TEXT NOT NULL DEFAULT '',
  created_at      INTEGER NOT NULL,
  edited_at       INTEGER,
  reply_to_id     INTEGER,
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  real_created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  account_id      INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  last_read_id    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, account_id)
);
`);

/* ------------------------------------------------------------------ *
 * Tiny migrations — CREATE TABLE IF NOT EXISTS won't add columns to a
 * database that already exists, so new columns go here.
 * ------------------------------------------------------------------ */
export function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`[db] added ${table}.${column}`);
  return true;
}

ensureColumn('messages', 'media', "TEXT NOT NULL DEFAULT '[]'");

/* ------------------------------------------------------------------ *
 * Full text search (best effort - falls back to LIKE if unavailable)
 * ------------------------------------------------------------------ */
export let hasFts = false;
try {
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(text, content='posts', content_rowid='id');`);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS posts_fts_ai AFTER INSERT ON posts BEGIN
      INSERT INTO posts_fts(rowid, text) VALUES (new.id, new.text);
    END;
    CREATE TRIGGER IF NOT EXISTS posts_fts_ad AFTER DELETE ON posts BEGIN
      INSERT INTO posts_fts(posts_fts, rowid, text) VALUES('delete', old.id, old.text);
    END;
    CREATE TRIGGER IF NOT EXISTS posts_fts_au AFTER UPDATE ON posts BEGIN
      INSERT INTO posts_fts(posts_fts, rowid, text) VALUES('delete', old.id, old.text);
      INSERT INTO posts_fts(rowid, text) VALUES (new.id, new.text);
    END;
  `);
  hasFts = true;
} catch (err) {
  console.warn('[db] FTS5 unavailable, falling back to LIKE search:', err.message);
}

/* ------------------------------------------------------------------ *
 * Settings helpers
 * ------------------------------------------------------------------ */
export const DEFAULT_SETTINGS = {
  site_name: 'Chirper',
  accent: '#1d9bf0',
  timeline_offset_ms: '0',
  clock_frozen: '0',
  clock_frozen_at: '0',
  show_future_posts: '1',
  hide_replies_default: '0',
  read_receipts: '1',
  theme: 'dim',
  welcome_note: 'Two writers. One timeline. Go make drama.',
  // flips to 1 the first time we seed, so a deliberate wipe stays wiped
  seeded_once: '0',
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : DEFAULT_SETTINGS[key] ?? null;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

export function allSettings() {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return out;
}

export function bool(value) {
  return value === '1' || value === 1 || value === true;
}

/* ------------------------------------------------------------------ *
 * First run seed so the app is never empty
 * ------------------------------------------------------------------ */
/**
 * Seeds the two starter characters on a brand-new database only.
 * Once that has happened the flag stays set, so "wipe everything" leaves you
 * with genuinely zero accounts instead of quietly recreating them.
 */
export function seedIfEmpty() {
  if (getSetting('seeded_once') === '1') return false;
  const count = db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n;
  if (count > 0) {
    setSetting('seeded_once', '1');
    return false;
  }

  const insertAccount = db.prepare(`
    INSERT INTO accounts (handle, display_name, bio, avatar, banner, location, website,
                          verified, badge, account_created_at, follower_boost, following_boost,
                          sort_order, real_created_at)
    VALUES (@handle, @display_name, @bio, @avatar, @banner, @location, @website,
            @verified, @badge, @account_created_at, @follower_boost, @following_boost,
            @sort_order, @real_created_at)
  `);

  const makeSeed = (i, handle, name, bio, verified, followers) => ({
    handle,
    display_name: name,
    bio,
    avatar: '',
    banner: '',
    location: '',
    website: '',
    verified,
    badge: verified ? 'blue' : '',
    account_created_at: Date.UTC(2019, 0, 1 + i * 3, 12, 0, 0),
    follower_boost: followers,
    following_boost: 0,
    sort_order: i,
    real_created_at: Date.now(),
  });

  const now = Date.now();
  db.transaction(() => {
    const me = insertAccount.run(makeSeed(0, 'you', 'Your Character', 'Write a bio for this account.', 0, 0));
    insertAccount.run(makeSeed(1, 'them', 'Their Character', 'Write a bio for this account.', 0, 0));
    db.prepare('INSERT INTO posts (author_id, text, created_at, real_created_at) VALUES (?, ?, ?, ?)').run(
      me.lastInsertRowid,
      'Welcome to Chirper. 👋\n\nPost as anyone, set any date you like, drag the clock and watch the story unfold.',
      now - 60_000,
      now
    );
  })();

  setSetting('seeded_once', '1');
  return true;
}
