import { api } from '../api.js';
import { icons } from '../icons.js';
import { acting, state } from '../store.js';
import { avatarHTML, el, emptyState, errorToast, esc, fmtCount, openModal, toast } from '../ui.js';
import { colHead } from '../shell.js';
import { postCard } from '../post-card.js';
import { feedList } from './feed.js';

const TABS = [
  { key: 'top', label: 'Top' },
  { key: 'latest', label: 'Latest' },
  { key: 'people', label: 'People' },
];

export function exploreView({ q = '', tab = 'top' } = {}) {
  const root = el('<div></div>');

  if (!q) {
    root.appendChild(
      colHead({
        title: 'Explore',
        right: `<button class="icon-btn" data-search>${icons.search}</button>`,
      })
    );
    const searchInput = el(`<div style="padding:12px 16px">
      <div class="search-box">${icons.search}<input placeholder="Search posts and people" data-q></div>
    </div>`);
    searchInput.querySelector('input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
        location.hash = `/search?q=${encodeURIComponent(e.currentTarget.value.trim())}`;
      }
    });
    root.appendChild(searchInput);
    root.querySelector('[data-search]')?.addEventListener('click', () => root.querySelector('[data-q]').focus());

    const trendBody = el('<div></div>');
    const trends = state.trends || [];
    if (!trends.length) {
      trendBody.appendChild(emptyState('No trends yet', 'Add some in Admin → Trends. They show up here and in the sidebar.'));
    } else {
      const card = el('<div class="card" style="margin:12px 16px"><div class="card-head sm">Trending</div></div>');
      trends.forEach((t) => {
        const row = el(`<div class="card-row trend-item">
          <div>
            <div class="cat">${esc(t.category || 'Trending')}</div>
            <div class="name">${esc(t.name)}</div>
            <div class="count">${fmtCount(t.post_count)} posts</div>
          </div>
          <button class="icon-btn" data-go>${icons.search}</button>
        </div>`);
        row.addEventListener('click', () => (location.hash = `/search?q=${encodeURIComponent(t.name)}`));
        card.appendChild(row);
      });
      root.appendChild(card);
    }
    root.appendChild(trendBody);
    root.appendChild(suggestions());
    return { element: root };
  }

  root.appendChild(
    colHead({
      title: 'Search',
      subtitle: `Results for “${esc(q)}”`,
      backTo: '/explore',
      tabs: TABS,
      activeTab: tab,
      onTab: (key) => (location.hash = `/search?q=${encodeURIComponent(q)}&tab=${key}`),
    })
  );

  const searchWrap = el(`<div style="padding:12px 16px">
    <div class="search-box">${icons.search}<input data-q value="${esc(q)}"></div>
  </div>`);
  const input = searchWrap.querySelector('input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) location.hash = `/search?q=${encodeURIComponent(input.value.trim())}&tab=${tab}`;
  });
  root.appendChild(searchWrap);

  const results = el('<div></div>');
  root.appendChild(results);

  if (tab === 'people') {
    api(`/search?q=${encodeURIComponent(q)}&tab=people`)
      .then((res) => {
        results.innerHTML = '';
        if (!res.people.length) results.appendChild(emptyState('No people found'));
        res.people.forEach((p) => results.appendChild(personRow(p)));
      })
      .catch(errorToast);
    return { element: root };
  }

  if (tab === 'latest') {
    const feed = feedList(() => ({ type: 'all', filter: 'all', q }), {
      emptyTitle: 'No posts match',
      emptySub: 'Try a different word, or check the People tab.',
    });
    root.appendChild(feed);
    return { element: root, refresh: () => feed.refresh?.() };
  }

  api(`/search?q=${encodeURIComponent(q)}`)
    .then((res) => {
      results.innerHTML = '';
      const people = res.people.slice(0, 3);
      if (people.length) {
        const card = el('<div class="card" style="margin:0 0 16px"><div class="card-head sm">People</div></div>');
        people.forEach((p) => card.appendChild(personRow(p)));
        results.appendChild(card);
      }
      if (!res.posts.length && !people.length) {
        results.appendChild(emptyState('Nothing found', `No posts or people match “${q}”.`));
        return;
      }
      const sorted = [...res.posts].sort((a, b) => b.likeCount + b.repostCount - (a.likeCount + a.repostCount));
      sorted.forEach((p) => results.appendChild(postCard(p)));
    })
    .catch(errorToast);

  return { element: root };
}

function personRow(p) {
  const me = acting();
  const row = el(`<div class="card-row row" style="align-items:center">
    ${avatarHTML(p, 'a40')}
    <a class="grow nowrap" href="#/u/${esc(p.handle)}" style="color:inherit">
      <div class="bold nowrap">${esc(p.displayName)}${p.verified ? `<svg class="badge-check" viewBox="0 0 24 24"><path d="M12 1l2.6 2.1 3.3-.5 1.3 3.1 3 1.6-1 3.2 1 3.2-3 1.6-1.3 3.1-3.3-.5L12 23l-2.6-2.1-3.3.5-1.3-3.1-3-1.6 1-3.2-1-3.2 3-1.6L5.1 2.6l3.3.5z" fill="#1d9bf0"/><path d="M10.6 15.5 7.6 12.5l1.3-1.3 1.7 1.7 4-4 1.3 1.3z" fill="#fff"/></svg>` : ''}</div>
      <div class="muted small nowrap">@${esc(p.handle)}</div>
    </a>
    ${me
      ? `<button class="btn sm ${p.isFollowedByViewer ? 'outline-follow' : ''}" data-follow>${p.isFollowedByViewer ? 'Following' : 'Follow'}</button>`
      : `<button class="btn sm" data-as>Post as…</button>`}
  </div>`);
  row.querySelector('[data-follow]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    try {
      await api(`/accounts/${p.id}/follow`, { method: 'POST', body: { on: !p.isFollowedByViewer } });
      p.isFollowedByViewer = !p.isFollowedByViewer;
      btn.textContent = p.isFollowedByViewer ? 'Following' : 'Follow';
      btn.classList.toggle('outline-follow', p.isFollowedByViewer);
    } catch (err) {
      errorToast(err);
    }
  });
  row.querySelector('[data-as]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toast('Pick an account in the sidebar first', 'error');
  });
  return row;
}

function suggestions() {
  const me = acting();
  const list = state.accounts.filter((a) => !a.archived && a.id !== me?.id).slice(0, 6);
  const card = el('<div class="card" style="margin:16px"><div class="card-head sm">Who to follow</div></div>');
  if (!list.length) {
    card.appendChild(el('<div class="muted small" style="padding:10px 16px">No other accounts yet — create some in Admin.</div>'));
    return card;
  }
  list.forEach((p) => card.appendChild(personRow(p)));
  return card;
}
