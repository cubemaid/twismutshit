import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';

import { PORT, DATA_DIR, UPLOAD_DIR, SITE_PASSWORD, MAX_UPLOAD_BYTES } from './config.js';
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
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', fallthrough: true }));
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

server.listen(PORT, () => {
  const weak = SITE_PASSWORD === 'letmein' ? '  ** using the default password - set SITE_PASSWORD in .env!' : '';
  console.log(
    [
      '',
      '  Chirper is running',
      '  ---------------------------------------------',
      `   url         http://localhost:${PORT}`,
      `   data dir    ${DATA_DIR}`,
      `   uploads     ${UPLOAD_DIR}`,
      `   search      ${hasFts ? 'sqlite fts5' : 'LIKE fallback'}`,
      `   max upload  ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)}MB per image`,
      weak,
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
