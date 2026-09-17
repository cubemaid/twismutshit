import { api } from '../api.js';
import { timelineItem } from '../post-card.js';
import { on } from '../store.js';
import { el, emptyState, errorToast, loadingState } from '../ui.js';

/**
 * A live paginated list of timeline items.
 * Realtime inserts politely wait behind a "show new posts" pill unless
 * you are already at the top of the page.
 */
export function feedList(paramsFn, { emptyTitle = 'Nothing here yet', emptySub = '', limit = 25 } = {}) {
  const container = el('<div class="feed-list"></div>');
  let cursor = null;
  let loading = false;
  let pending = 0;
  let pill = null;

  const removePill = () => {
    pill?.remove();
    pill = null;
  };

  const showPill = () => {
    if (pill) {
      pill.querySelector('[data-n]').textContent = String(pending);
      return;
    }
    pill = el(`<button class="pill accent" style="display:block;margin:10px auto;padding:6px 16px">
      Show <span data-n>${pending}</span> new post${pending === 1 ? '' : 's'}
    </button>`);
    pill.addEventListener('click', () => {
      removePill();
      pending = 0;
      refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    container.prepend(pill);
  };

  async function fetchPage(cursorValue) {
    const params = new URLSearchParams({ limit: String(limit), ...paramsFn() });
    if (cursorValue) params.set('cursor', cursorValue);
    return api(`/timeline?${params.toString()}`);
  }

  async function refresh() {
    try {
      const res = await fetchPage(null);
      cursor = res.nextCursor;
      removePill();
      pending = 0;
      container.innerHTML = '';
      if (!res.items.length) {
        container.appendChild(emptyState(emptyTitle, emptySub));
        return;
      }
      res.items.forEach((item) => container.appendChild(timelineItem(item)));
      container.appendChild(sentinel());
    } catch (err) {
      container.innerHTML = '';
      container.appendChild(emptyState('Could not load this timeline', err.message));
      console.error(err);
    }
  }

  async function loadMore() {
    if (loading || !cursor) return;
    loading = true;
    btn.textContent = 'Loading…';
    try {
      const res = await fetchPage(cursor);
      cursor = res.nextCursor;
      res.items.forEach((item) => container.insertBefore(timelineItem(item), sentinelEl));
      btn.textContent = 'Load more';
    } catch (err) {
      errorToast(err);
      btn.textContent = 'Load more';
    } finally {
      loading = false;
      if (!cursor) btn.remove();
    }
  }

  const btn = el('<button class="btn ghost block" style="margin:16px 0">Load more</button>');
  btn.addEventListener('click', loadMore);
  let sentinelEl = null;

  function sentinel() {
    const wrap = el('<div></div>');
    wrap.appendChild(btn);
    sentinelEl = wrap;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '600px' });
    io.observe(wrap);
    return wrap;
  }

  /* realtime: new content from the other writer */
  on('post', (payload) => {
    if (payload.action === 'delete') {
      container.querySelector(`[data-post-id="${payload.postId}"]`)?.closest('.post,div')?.remove();
      return;
    }
    if (window.scrollY < 120) {
      refresh();
    } else {
      pending += 1;
      showPill();
    }
  });
  on('clock', () => {
    removePill();
    refresh();
  });
  on('world', () => refresh());

  container.refresh = refresh;
  container.prepend(loadingState());
  refresh();
  return container;
}

export { loadingState };
