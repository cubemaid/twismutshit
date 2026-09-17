import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';

import { PORT, DATA_DIR, UPLOAD_DIR, DB_PATH, SITE_PASSWORD, MAX_UPLOAD_BYTES } from './config.js';
import { seedIfEmpty, hasFts } from './db.js';
import { authContext } from './auth.js';
import { api } from './routes.js';
import { initRealtime } from './realtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

seedIfEmpty();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '32mb' }));
app.use(express.urlencoded({ extended: true, limit: '32mb' }));
app.use(cookieParser());
app.use(authContext);

app.use('/api', api);
// uploaded images are private: your browser sends the login cookie with every
// <img> request, so this works transparently while keeping the files off the
// open internet.
app.use(
  '/uploads',
  (req, res, next) => {
    if (!req.auth?.authenticated) return res.status(401).json({ error: 'Not signed in' });
    next();
  },
  express.static(UPLOAD_DIR, { maxAge: '30d', fallthrough: true })
);
// A file that is gone has to answer 404, never the app shell: an <img> that
// receives index.html silently renders as a broken sliver.
app.use('/uploads', (_req, res) => res.status(404).json({ error: 'No such image' }));
// max-age 0 + etag: the browser revalidates on every load, so a `git pull`
// on the VPS is picked up immediately instead of an hour later.
app.use(express.static(PUBLIC_DIR, { maxAge: 0, etag: true, lastModified: true }));

// SPA fallback - anything that is not an API route or a real file gets the app shell
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  const code = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  res.status(code).json({ error: err.message || 'Server error' });
});

const server = http.createServer(app);
initRealtime(server);

/* ------------------------------------------------------------------ *
 * "is my world actually on a volume?" check
 *
 * Everything the two of you make lives in DATA_DIR: chirper.db and
 * uploads/. In Docker that folder has to be a mount (`./data:/data` in
 * docker-compose.yml). If it is not, the database and every image sit in
 * the container's writable layer and the next
 * `docker compose up -d --build` silently throws the lot away. Shout
 * about it at boot instead.
 * ------------------------------------------------------------------ */
function looksContainerised() {
  try {
    if (fs.existsSync('/.dockerenv')) return true;
  } catch {
    /* not linux */
  }
  try {
    return /docker|containerd|kubepods|podman/.test(fs.readFileSync('/proc/1/cgroup', 'utf8'));
  } catch {
    return false;
  }
}

function isMountPoint(dir) {
  let info = '';
  try {
    info = fs.readFileSync('/proc/self/mountinfo', 'utf8');
  } catch {
    return true; // cannot tell — say nothing rather than cry wolf
  }
  let real = dir;
  try {
    real = fs.realpathSync(dir);
  } catch {
    /* keep the raw path */
  }
  return info.split('\n').some((line) => {
    const mount = line.split(' ')[4];
    return mount ? mount.replace(/\\040/g, ' ') === real : false;
  });
}

function dataWarning() {
  if (!looksContainerised() || isMountPoint(DATA_DIR)) return '';
  return [
    '  !! DANGER: the data folder is not on a mounted volume',
    `  !! ${DATA_DIR} lives inside this container, so ${path.basename(DB_PATH)} and every`,
    '  !! uploaded image disappear the moment the container is recreated.',
    '  !! Mount it:  docker-compose.yml ->  volumes:  - ./data:/data',
  ].join('\n');
}

function mediaSummary() {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    let bytes = 0;
    for (const f of files) {
      try {
        bytes += fs.statSync(path.join(UPLOAD_DIR, f)).size;
      } catch {
        /* vanished mid-scan */
      }
    }
    const mb = bytes / 1024 / 1024;
    return `${files.length} file${files.length === 1 ? '' : 's'} · ${mb < 1 ? `${Math.round(bytes / 1024)}KB` : `${mb.toFixed(1)}MB`}`;
  } catch {
    return 'unreadable';
  }
}

server.listen(PORT, () => {
  const weak = SITE_PASSWORD === 'letmein' ? '  ** using the default password - set SITE_PASSWORD in .env!' : '';
  console.log(
    [
      '',
      '  Chirper is running',
      '  ---------------------------------------------',
      `   url         http://localhost:${PORT}`,
      `   data dir    ${DATA_DIR}${looksContainerised() ? (isMountPoint(DATA_DIR) ? '  (mounted - safe to rebuild)' : '  (in the container!)') : ''}`,
      `   uploads     ${UPLOAD_DIR} · ${mediaSummary()}`,
      `   search      ${hasFts ? 'sqlite fts5' : 'LIKE fallback'}`,
      `   max upload  ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)}MB per image`,
      weak,
      dataWarning(),
      '',
    ]
      .filter(Boolean)
      .join('\n')
  );
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
