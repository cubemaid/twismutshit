import { acting, emit, state } from '../store.js';
import { icons } from '../icons.js';
import { clockBanner, colHead, composingBar, openAccountMenu, openClockModal } from '../shell.js';
import { el } from '../ui.js';
import { feedList } from './feed.js';

const TABS = [
  { key: 'following', label: 'Following' },
  { key: 'all', label: 'Everything' },
];

export function homeView() {
  const root = el('<div></div>');
  let tab = localStorage.getItem('chirper:homeTab') || 'following';
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
      const anyAccounts = state.accounts.length > 0;
      const card = el(`<div class="empty">
        <h3>${anyAccounts ? 'Pick an account first' : 'No accounts yet'}</h3>
        <div>${
          anyAccounts
            ? 'Open the account button in the bottom-left corner and choose who you are posting as. Your Following feed depends on it.'
            : 'Your world is completely empty. Create your first character and start writing.'
        }</div>
        <div style="margin-top:16px"><button class="btn" data-create>${anyAccounts ? 'Choose an account' : 'Create an account'}</button></div>
      </div>`);
      card.querySelector('[data-create]').addEventListener('click', (e) => {
        if (anyAccounts) openAccountMenu(e.currentTarget);
        else emit('create-account');
      });
      root.appendChild(card);
      return;
    }

    root.appendChild(composingBar('post'));

    feed = feedList(() => ({ type: tab, accountId: me?.id ?? '' }), {
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
