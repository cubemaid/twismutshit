import { acting } from '../store.js';
import { colHead } from '../shell.js';
import { el, emptyState } from '../ui.js';
import { feedList } from './feed.js';

export function bookmarksView() {
  const root = el('<div></div>');
  const me = acting();
  root.appendChild(colHead({ title: 'Bookmarks', subtitle: me ? `@${me.handle}` : '' }));

  if (!me) {
    root.appendChild(emptyState('Pick an account first', 'Bookmarks are saved per character.'));
    return { element: root };
  }

  const feed = feedList(() => ({ type: 'bookmarks', accountId: me.id }), {
    emptyTitle: 'No bookmarks yet',
    emptySub: 'Hit the bookmark icon on any post to save it here.',
  });
  root.appendChild(feed);
  return { element: root, refresh: () => feed.refresh?.() };
}
