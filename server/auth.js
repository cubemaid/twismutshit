import crypto from 'node:crypto';
import { SESSION_SECRET, SITE_PASSWORD } from './config.js';

const COOKIE = 'chirper_auth';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180; // 180 days

function hmac(data) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

export function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function checkPassword(password) {
  const given = Buffer.from(String(password ?? ''));
  const real = Buffer.from(SITE_PASSWORD);
  if (given.length !== real.length) {
    crypto.timingSafeEqual(real, real); // burn a comparison anyway
    return false;
  }
  return crypto.timingSafeEqual(given, real);
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: MAX_AGE_MS,
  path: '/',
};

export function setAuthCookie(res, { accountId = null } = {}) {
  res.cookie(
    COOKIE,
    signToken({ iat: Date.now(), exp: Date.now() + MAX_AGE_MS, actingAccountId: accountId }),
    cookieOptions
  );
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

/** Reads the cookie and attaches req.auth = { authenticated, actingAccountId } */
export function authContext(req, _res, next) {
  const payload = verifyToken(req.cookies?.[COOKIE]);
  req.auth = {
    authenticated: Boolean(payload),
    actingAccountId: payload?.actingAccountId ?? null,
  };
  next();
}

export function requireAuth(req, res, next) {
  if (!req.auth?.authenticated) return res.status(401).json({ error: 'Not signed in' });
  next();
}

export { COOKIE };
