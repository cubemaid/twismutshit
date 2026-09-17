import { acting } from '../store.js';
import { icons } from '../icons.js';
import { clockBanner, colHead, composingBar, openClockModal } from '../shell.js';
import { createComposer } from '../composer.js';
import { chipRow, el, openModal, toast } from '../ui.js';
import { feedList } from './feed.js';

const TABS = [
  { key: 'following', label: 'Following' },
  { key: 'all', label: 'Everything' },
];

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'noreplies', label: 'No replies' },
  { key: 'media', label: 'With media' },
  { key: 'verified', label: 'Verified' },
];

export function homeView() {
  const root = el('<div></div>');
  let tab = localStorage.getItem('chirper:homeTab') || 'following';
  let filter = localStorage.getItem('chirper:homeFilter') || 'all';
  let feed = null;

  function build() {
    root.innerHTML = '';
    const me = acting();

    const head = colHead({
      title: tab === 'following' ? 'Home' : 'Everything',
      tabs: TABS,
      activeTab: tab,
      onTab: (key) => {
        tab = key;
        localStorage.setItem('chirper:homeTab', key);
        build();
      },
      right: `<button class="icon-btn" data-clock title="Time machine">${icons.clock}</button>`,
    });
    head.querySelector('[data-clock]').addEventListener('click', openClockModal);
    root.appendChild(head);
    root.appendChild(clockBanner());

    if (tab === 'following' && !me) {
      root.appendChild(
        el(`<div class="empty">
          <h3>Pick an account first</h3>
          <div>Open the account button in the bottom-left corner and choose who you are posting as. Your Following feed depends on it.</div>
        </div>`)
      );
      return;
    }

    const composer = createComposer({
      placeholder: me ? `What's happening, @${me.handle}?` : 'Pick an account to post',
      compact: true,
    });
    if (!me) composer.querySelector('textarea').disabled = true;
    root.appendChild(composer);
    root.appendChild(composingBar('post'));

    root.appendChild(
      chipRow(FILTERS, filter, (key) => {
        filter = key;
        localStorage.setItem('chirper:homeFilter', key);
        build();
      })
    );

    feed = feedList(() => ({ type: tab, accountId: me?.id ?? '', filter }), {
      emptyTitle: tab === 'following' ? 'Your Following feed is quiet' : 'No posts yet',
      emptySub:
        tab === 'following'
          ? 'Follow a few accounts, or post something yourself — you always show up in your own feed.'
          : 'Post something, or drag the clock around to jump to a different moment.',
    });
    root.appendChild(feed);
  }

  build();

  return {
    element: root,
    refresh: () => feed?.refresh?.(),
  };
}

export function openHomeComposer() {
  if (!acting()) return toast('Pick an account first', 'error');
  const node = createComposer({ autoFocus: true });
  return openModal({ title: 'New post', body: node, onClose: () => node.composerApi?.destroy() });
}
