/**
 * Post links, shared by posts and DMs.
 *
 * A link to this site's own posts is more useful as the post itself, so the
 * text keeps whatever you wrote around it (the caption) and the link becomes an
 * embed. Anything that resolves to /p/<id> counts: a full URL, a hash route
 * (#/p/12) or a bare path (/p/12).
 */
import { api } from './api.js';

const POST_LINK = /(?:https?:\/\/\S*?)?#?\/p\/(\d+)(?![0-9])/g;

/** how many posts one message or post may pull in */
export const MAX_EMBEDS = 2;

/** the post ids linked in this text, at most MAX_EMBEDS of them, in order */
export function postIdsIn(text) {
  const ids = [];
  for (const match of String(text || '').matchAll(POST_LINK)) {
    const id = Number(match[1]);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, MAX_EMBEDS);
}

/**
 * The text minus the links we are about to embed, tidied up. Links beyond
 * MAX_EMBEDS are left alone so nothing silently disappears.
 */
export function stripPostLinks(text, ids) {
  const wanted = new Set(ids || []);
  return String(text || '')
    .replace(POST_LINK, (match, id) => (wanted.has(Number(id)) ? '' : match))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* one fetch per post, ever — the same link twice must not hit the network */
const cache = new Map();
const pending = new Map();

export function fetchPost(id) {
  const key = Number(id);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (pending.has(key)) return pending.get(key);
  const job = api(`/posts/${key}`)
    .then((res) => {
      cache.set(key, res.post);
      return res.post;
    })
    .catch(() => {
      cache.set(key, null); // deleted or unreachable — remember that too
      return null;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
