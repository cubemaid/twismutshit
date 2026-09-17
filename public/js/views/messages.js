import { api } from '../api.js';
import { icons } from '../icons.js';
import { accountById, acting, on, state, setBadges } from '../store.js';
import { socketTyping } from '../socket.js';
import { dayLabel, now, relative, stamp, timeOfDay, toLocalInput, fromLocalInput } from '../time.js';
import {
  avatarHTML,
  el,
  emptyState,
  errorToast,
  esc,
  linkify,
  openMenu,
  openModal,
  confirmDialog,
  pickAccount,
  toast,
  debounce,
} from '../ui.js';
import { colHead } from '../shell.js';
import { openTimePicker as pickTime } from '../composer.js';

export function messagesView({ id = null } = {}) {
  return id ? threadView(Number(id)) : listView();
}

/* ------------------------------------------------------------------ *
 * list
 * ------------------------------------------------------------------ */
function listView() {
  const root = el('<div></div>');
  let items = [];
  const me = acting();

  const head = colHead({
    title: 'Messages',
    right: me ? `<button class="icon-btn" data-new title="New message">${icons.plus}</button>` : '',
  });
  head.querySelector('[data-new]')?.addEventListener('click', openNewConversation);
  root.appendChild(head);

  const searchBar = el(`<div style="padding:10px 16px">
    <div class="search-box">${icons.search}<input placeholder="Search messages" data-q></div>
  </div>`);
  root.appendChild(searchBar);
  const qInput = searchBar.querySelector('input');
  qInput.addEventListener('input', debounce(() => paint(qInput.value.trim().toLowerCase()), 200));

  const list = el('<div></div>');
  root.appendChild(list);

  if (!me) {
    root.appendChild(emptyState('Pick an account first', 'Direct messages are per character. Choose who you are posting as.'));
    return { element: root };
  }

  function paint(query = '') {
    list.innerHTML = '';
    const filtered = query
      ? items.filter(
          (c) =>
            c.displayName.toLowerCase().includes(query) ||
            c.displayHandle.toLowerCase().includes(query) ||
            (c.lastMessage?.text || '').toLowerCase().includes(query)
        )
      : items;
    if (!filtered.length) {
      list.appendChild(emptyState(query ? 'No conversations match' : 'No messages yet', 'Start a chat with the ✚ button.'));
      return;
    }
    filtered.forEach((conv) => list.appendChild(conversationRow(conv)));
  }

  async function load() {
    try {
      const res = await api(`/conversations?accountId=${me.id}`);
      items = res.items;
      setBadges(res.badges);
      paint(qInput.value.trim().toLowerCase());
    } catch (err) {
      errorToast(err);
    }
  }

  load();
  on('message', (payload) => {
    if (payload.action === 'create' && payload.message.senderId === acting()?.id) load();
    else if (payload.action !== 'update') load();
  });
  on('conversation', load);
  on('clock', load);
  on('session', load);
  on('world', load);

  return { element: root, refresh: load };
}

function conversationRow(conv) {
  const row = el(`<div class="conv-row">
    ${groupAvatar(conv, 'a48')}
    <div class="conv-body">
      <div class="conv-top">
        <span class="name nowrap">${esc(conv.displayName)}</span>
        <span class="handle nowrap">${esc(conv.displayHandle)}</span>
        ${conv.lastMessage ? `<span class="grow"></span><span class="time" data-rel="${conv.lastMessage.createdAt}">${relative(conv.lastMessage.createdAt)}</span>` : ''}
      </div>
      <div class="conv-preview">
        ${
          conv.lastMessage
            ? `${conv.type === 'group' ? `<b>@${esc(conv.lastMessage.sender?.handle || '')}</b> ` : ''}${esc(conv.lastMessage.text || '(deleted)')}`
            : '<i>No messages yet</i>'
        }
      </div>
    </div>
    ${conv.unreadCount ? '<span class="unread-dot"></span>' : ''}
  </div>`);
  row.addEventListener('click', () => (location.hash = `/messages/${conv.id}`));
  return row;
}

function groupAvatar(conv, size) {
  if (conv.type !== 'group') return avatarHTML(conv.participants.find((p) => p.id !== acting()?.id) || conv.participants[0], size);
  const two = conv.participants.slice(0, 2);
  return `<div style="position:relative;width:48px;height:48px;flex:none">
    <div style="position:absolute;left:0;top:0">${avatarHTML(two[0], 'a32')}</div>
    ${two[1] ? `<div style="position:absolute;right:0;bottom:0;border:2px solid var(--bg);border-radius:50%">${avatarHTML(two[1], 'a24')}</div>` : ''}
  </div>`;
}

export function openNewConversation() {
  const me = acting();
  if (!me) return toast('Pick an account first', 'error');
  const others = state.accounts.filter((a) => a.id !== me.id && !a.archived);
  const body = el(`<div>
    <label class="field"><span>Group name (leave empty for a normal DM)</span><input class="input" data-title placeholder="e.g. The Group Chat"></label>
    <div class="section-title">Send to</div>
    <div data-list></div>
    <div class="row" style="justify-content:flex-end;margin-top:14px">
      <button class="btn" data-go disabled>Start chatting</button>
    </div>
    <div class="hint">Selecting two or more people creates a group chat.</div>
  </div>`);
  const chosen = new Set();
  const list = body.querySelector('[data-list]');
  const go = body.querySelector('[data-go]');
  others.forEach((acc) => {
    const row = el(`<label class="acc-row">
      <input type="checkbox" value="${acc.id}">
      ${avatarHTML(acc, 'a32')}
      <div class="who"><div class="name">${esc(acc.displayName)}</div><div class="handle">@${esc(acc.handle)}</div></div>
    </label>`);
    row.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) chosen.add(acc.id);
      else chosen.delete(acc.id);
      go.disabled = chosen.size === 0;
    });
    list.appendChild(row);
  });

  const modal = openModal({ title: 'New message', body, slim: true });
  go.addEventListener('click', async () => {
    try {
      const conv = await api('/conversations', {
        method: 'POST',
        body: {
          participantIds: [...chosen],
          type: chosen.size > 1 ? 'group' : 'direct',
          title: body.querySelector('[data-title]').value.trim(),
        },
      });
      modal.close();
      location.hash = `/messages/${conv.id}`;
    } catch (err) {
      errorToast(err);
    }
  });
}

/* ------------------------------------------------------------------ *
 * thread
 * ------------------------------------------------------------------ */
function threadView(id) {
  const root = el('<div></div>');
  let conv = null;
  let messages = [];
  const me = acting();
  let listNode = null;
  let typingNode = null;

  const head = colHead({ title: 'Message', backTo: '/messages', right: `<button class="icon-btn" data-more>${icons.moreH}</button>` });
  root.appendChild(head);
  head.querySelector('[data-more]').addEventListener('click', (e) => openConversationMenu(e, () => conv, load));

  const scroll = el('<div class="msg-list"></div>');
  root.appendChild(scroll);
  typingNode = el('<div class="typing" style="display:none"></div>');
  root.appendChild(typingNode);

  const composer = el(`<div class="dm-composer">
    <textarea class="textarea" rows="1" placeholder="Start a new message" data-input style="min-height:44px;max-height:160px"></textarea>
    <button class="tool-btn" data-time title="Set the message time">${icons.clock}</button>
    <button class="btn" data-send disabled>Send</button>
  </div>`);
  const ta = composer.querySelector('[data-input]');
  const sendBtn = composer.querySelector('[data-send]');
  const timeBtn = composer.querySelector('[data-time]');
  let customTime = null;

  function updateTimeChip() {
    if (customTime) {
      timeBtn.style.color = 'var(--gold)';
      timeBtn.title = `Sending as if it were ${stamp(customTime)} (right-click to reset)`;
    } else {
      timeBtn.style.color = '';
      timeBtn.title = 'Sending at the current moment';
    }
  }

  ta.addEventListener('input', () => {
    sendBtn.disabled = !ta.value.trim();
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    socketTyping(id, Boolean(ta.value.trim()));
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) sendBtn.click();
    }
  });
  timeBtn.addEventListener('click', async () => {
    const picked = await pickTime(customTime ?? now(), { title: 'When was this message sent?' });
    if (picked !== null) {
      customTime = picked;
      updateTimeChip();
    }
  });
  timeBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    customTime = null;
    updateTimeChip();
  });

  sendBtn.addEventListener('click', async () => {
    const text = ta.value.trim();
    if (!text) return;
    sendBtn.disabled = true;
    try {
      const msg = await api(`/conversations/${id}/messages`, {
        method: 'POST',
        body: { text, createdAt: customTime ? new Date(customTime).toISOString() : undefined },
      });
      ta.value = '';
      ta.style.height = 'auto';
      customTime = null;
      updateTimeChip();
      socketTyping(id, false);
      appendMessage(msg);
      markRead();
    } catch (err) {
      errorToast(err);
      sendBtn.disabled = false;
    }
  });

  function appendMessage(msg) {
    if (messages.some((m) => m.id === msg.id)) return;
    messages.push(msg);
    paint();
    requestAnimationFrame(() => (scroll.scrollTop = scroll.scrollHeight));
  }

  function paint() {
    scroll.innerHTML = '';
    let lastDay = null;
    messages.forEach((m) => {
      const day = new Date(m.createdAt).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        scroll.appendChild(el(`<div class="msg-day">${esc(dayLabel(m.createdAt))}</div>`));
      }
      scroll.appendChild(messageRow(m, () => load()));
    });
    if (!messages.length) {
      scroll.appendChild(emptyState('No messages yet', 'Say something.'));
    }
  }

  async function load() {
    try {
      const res = await api(`/conversations/${id}/messages?accountId=${me?.id ?? ''}`);
      conv = res.conversation;
      messages = res.items;
      paint();
      const h = root.querySelector('.col-head');
      const fresh = colHead({
        title: conv.displayName,
        subtitle: `${esc(conv.type === 'group' ? conv.displayHandle : 'Direct message')}`,
        backTo: '/messages',
        right: `<button class="icon-btn" data-more>${icons.moreH}</button>`,
      });
      fresh.querySelector('[data-more]').addEventListener('click', (e) => openConversationMenu(e, () => conv, load));
      h.replaceWith(fresh);
      requestAnimationFrame(() => (scroll.scrollTop = scroll.scrollHeight));
      markRead();
    } catch (err) {
      errorToast(err);
    }
  }

  function markRead() {
    if (!me) return;
    api(`/conversations/${id}/read`, { method: 'POST', body: {} })
      .then((r) => setBadges(r.badges))
      .catch(() => {});
  }

  /* typing indicator */
  const paintTyping = () => {
    const others = Object.values(state.typing).filter((t) => t && t.conversationId === id);
    if (!others.length) {
      typingNode.style.display = 'none';
      return;
    }
    typingNode.style.display = 'block';
    typingNode.textContent = `${others.map((o) => o.label).join(', ')} ${others.length > 1 ? 'are' : 'is'} typing…`;
  };
  on('typing', paintTyping);
  paintTyping();

  on('message', (payload) => {
    if (payload.conversationId !== id) return;
    if (payload.action === 'create') {
      appendMessage(payload.message);
      if (payload.message.senderId !== acting()?.id) markRead();
    } else load();
  });

  root.appendChild(composer);
  updateTimeChip();
  load();
  on('session', load);
  on('clock', () => paint());

  return { element: root, refresh: load };
}

function messageRow(msg, reload) {
  const mine = msg.senderId === acting()?.id;
  const row = el(`<div class="msg ${mine ? 'mine' : ''}" data-id="${msg.id}">
    ${mine ? '' : avatarHTML(msg.sender, 'a32')}
    <div style="max-width:78%">
      ${msg.replyTo ? `<div class="small muted" style="padding:0 6px 3px">↩ ${esc(msg.replyTo.text.slice(0, 60))}</div>` : ''}
      <div class="msg-bubble">${linkify(msg.text)}</div>
      <div class="msg-meta">
        <span data-rel="${msg.createdAt}">${relative(msg.createdAt)}</span>
        ${msg.editedAt ? ' · edited' : ''}
        ${!mine ? ` · ${esc(msg.sender?.displayName || '')}` : ''}
      </div>
    </div>
  </div>`);
  const bubble = row.querySelector('.msg-bubble');
  bubble.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openMenu(
      { getBoundingClientRect: () => new DOMRect(e.clientX, e.clientY, 0, 0) },
      [
        { label: 'Edit text', icon: 'edit', onClick: () => editMessage(msg, reload) },
        { label: 'Change time', icon: 'clock', onClick: () => changeMessageTime(msg, reload) },
        { label: 'Copy text', icon: 'copy', onClick: () => navigator.clipboard?.writeText(msg.text).then(() => toast('Copied')) },
        { sep: true },
        { label: 'Delete message', icon: 'trash', danger: true, onClick: () => deleteMessage(msg, reload) },
      ]
    );
  });
  return row;
}

async function editMessage(msg, reload) {
  const body = el(`<div>
    <label class="field"><span>Message</span><textarea class="textarea" data-text>${esc(msg.text)}</textarea></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-save>Save</button></div>
  </div>`);
  const modal = openModal({ title: 'Edit message', body, slim: true });
  body.querySelector('[data-save]').addEventListener('click', async () => {
    await api(`/messages/${msg.id}`, { method: 'PATCH', body: { text: body.querySelector('[data-text]').value } });
    modal.close();
    reload?.();
  });
}

async function changeMessageTime(msg, reload) {
  const ms = await pickTime(msg.createdAt, { title: 'When was this sent?' });
  if (ms === null) return;
  await api(`/messages/${msg.id}`, { method: 'PATCH', body: { createdAt: new Date(ms).toISOString() } });
  toast(`Dated ${stamp(ms)}`);
  reload?.();
}

async function deleteMessage(msg, reload) {
  if (!(await confirmDialog({ title: 'Delete message?', message: 'It will be removed from the conversation.', confirmLabel: 'Delete' }))) return;
  await api(`/messages/${msg.id}`, { method: 'DELETE' });
  reload?.();
}

function openConversationMenu(ev, getConv, reload) {
  const conv = getConv();
  if (!conv) return;
  openMenu(
    ev.currentTarget,
    [
      { title: conv.displayName },
      { label: 'Edit group details', icon: 'edit', onClick: () => editConversation(conv, reload) },
      { label: 'Add or remove people', icon: 'users', onClick: () => editParticipants(conv, reload) },
      { label: 'Send a message as…', icon: 'mail', onClick: () => sendAs(conv, reload) },
      { sep: true },
      { label: 'Copy conversation link', icon: 'link', onClick: () => navigator.clipboard?.writeText(`${location.origin}/#/messages/${conv.id}`).then(() => toast('Link copied')) },
      { sep: true },
      { label: 'Delete conversation', icon: 'trash', danger: true, onClick: async () => {
        if (!(await confirmDialog({ title: 'Delete conversation?', message: 'Every message in it disappears for both of you.', confirmLabel: 'Delete' }))) return;
        await api(`/conversations/${conv.id}`, { method: 'DELETE' });
        location.hash = '/messages';
      } },
    ],
    { align: 'right' }
  );
}

function editConversation(conv, reload) {
  const body = el(`<div>
    <label class="field"><span>Name ${conv.type === 'direct' ? '(only used for group chats)' : ''}</span><input class="input" data-title value="${esc(conv.title || '')}"></label>
    <label class="field"><span>Avatar image URL</span><input class="input" data-avatar value="${esc(conv.avatar || '')}"></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-save>Save</button></div>
  </div>`);
  const modal = openModal({ title: 'Conversation settings', body, slim: true });
  body.querySelector('[data-save]').addEventListener('click', async () => {
    await api(`/conversations/${conv.id}`, {
      method: 'PATCH',
      body: { title: body.querySelector('[data-title]').value, avatar: body.querySelector('[data-avatar]').value },
    });
    modal.close();
    toast('Updated');
    reload?.();
  });
}

function editParticipants(conv, reload) {
  const chosen = new Set(conv.participants.map((p) => p.id));
  const body = el('<div></div>');
  state.accounts.forEach((acc) => {
    const row = el(`<label class="acc-row">
      <input type="checkbox" ${chosen.has(acc.id) ? 'checked' : ''}>
      ${avatarHTML(acc, 'a32')}
      <div class="who"><div class="name">${esc(acc.displayName)}</div><div class="handle">@${esc(acc.handle)}</div></div>
    </label>`);
    row.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) chosen.add(acc.id);
      else chosen.delete(acc.id);
    });
    body.appendChild(row);
  });
  const footer = el('<div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" data-save>Save</button></div>');
  body.appendChild(footer);
  const modal = openModal({ title: 'People in this chat', body, slim: true });
  footer.querySelector('[data-save]').addEventListener('click', async () => {
    await api(`/conversations/${conv.id}`, { method: 'PATCH', body: { participantIds: [...chosen] } });
    modal.close();
    toast('Participants updated');
    reload?.();
  });
}

async function sendAs(conv, reload) {
  const id = await pickAccount({ title: 'Send as…' });
  if (!id) return;
  const acc = accountById(id);
  const body = el(`<div>
    <div class="muted small" style="margin-bottom:10px">Sending as @${esc(acc.handle)}</div>
    <textarea class="textarea" data-text placeholder="Message…"></textarea>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" data-send>Send</button></div>
  </div>`);
  const modal = openModal({ title: 'Send as another account', body, slim: true });
  body.querySelector('[data-send]').addEventListener('click', async () => {
    const text = body.querySelector('[data-text]').value.trim();
    if (!text) return;
    await api(`/conversations/${conv.id}/messages`, { method: 'POST', body: { text, as: id } });
    modal.close();
    toast('Sent');
    reload?.();
  });
}
