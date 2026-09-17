import { api } from '../api.js';
import { state, emit } from '../store.js';
import { toLocalInput, fromLocalInput, now } from '../time.js';
import { el, errorToast, esc, openModal, toast } from '../ui.js';

/**
 * The universal "edit absolutely everything about this account" dialog.
 * Used by the profile page and by the admin panel.
 */
export function openAccountEditor(account = null, { onSaved = null } = {}) {
  const isNew = !account;
  const a = account || {
    displayName: '',
    handle: '',
    bio: '',
    avatar: '',
    banner: '',
    location: '',
    website: '',
    verified: false,
    badge: '',
    color: '',
    createdAt: now(),
    followerBoost: 0,
    followingBoost: 0,
  };

  const body = el(`<div>
    <div class="grid-2">
      <label class="field"><span>Display name</span><input class="input" data-display value="${esc(a.displayName)}" placeholder="Jane Doe"></label>
      <label class="field"><span>Handle (no @)</span><input class="input" data-handle value="${esc(a.handle)}" placeholder="janedoe"></label>
    </div>
    <label class="field"><span>Bio</span><textarea class="textarea" data-bio placeholder="Write whatever you want here.">${esc(a.bio)}</textarea></label>
    <div class="grid-2">
      <label class="field"><span>Location</span><input class="input" data-location value="${esc(a.location)}"></label>
      <label class="field"><span>Website</span><input class="input" data-website value="${esc(a.website)}"></label>
    </div>
    <div class="grid-2">
      <label class="field"><span>Avatar image URL</span><input class="input" data-avatar value="${esc(a.avatar)}" placeholder="https://… or /uploads/…"></label>
      <label class="field"><span>Banner image URL</span><input class="input" data-banner value="${esc(a.banner)}"></label>
    </div>
    <div class="row" style="gap:14px;margin-bottom:12px;align-items:flex-start">
      <label class="checkbox"><input type="checkbox" data-verified ${a.verified ? 'checked' : ''}> Verified badge</label>
      <label class="field" style="margin:0;min-width:160px"><span>Badge style</span>
        <select class="select" data-badge>
          <option value="">Default (blue)</option>
          <option value="blue">Blue</option>
          <option value="gold">Gold</option>
          <option value="grey">Grey</option>
        </select>
      </label>
    </div>
    <div class="grid-2">
      <label class="field"><span>Joined the timeline on</span><input class="input" type="datetime-local" data-created></label>
      <label class="field"><span>Extra followers (fake number)</span><input class="input" type="number" data-followers value="${a.followerBoost || 0}"></label>
    </div>
    <div class="grid-2">
      <label class="field"><span>Extra following (fake number)</span><input class="input" type="number" data-following value="${a.followingBoost || 0}"></label>
      <label class="field"><span>Accent colour (optional)</span><input class="input" data-color value="${esc(a.color || '')}" placeholder="#1d9bf0"></label>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="btn ghost" data-cancel>Cancel</button>
      <button class="btn" data-save>${isNew ? 'Create account' : 'Save changes'}</button>
    </div>
  </div>`);

  body.querySelector('[data-badge]').value = a.badge || '';
  body.querySelector('[data-created]').value = toLocalInput(a.createdAt || now());

  const modal = openModal({ title: isNew ? 'New account' : `Edit @${a.handle}`, body, wide: true });
  body.querySelector('[data-cancel]').addEventListener('click', () => modal.close());

  body.querySelector('[data-save]').addEventListener('click', async () => {
    const payload = {
      displayName: body.querySelector('[data-display]').value.trim(),
      handle: body.querySelector('[data-handle]').value.trim().replace(/^@/, ''),
      bio: body.querySelector('[data-bio]').value,
      location: body.querySelector('[data-location]').value.trim(),
      website: body.querySelector('[data-website]').value.trim(),
      avatar: body.querySelector('[data-avatar]').value.trim(),
      banner: body.querySelector('[data-banner]').value.trim(),
      verified: body.querySelector('[data-verified]').checked,
      badge: body.querySelector('[data-badge]').value,
      color: body.querySelector('[data-color]').value.trim(),
      followerBoost: Number(body.querySelector('[data-followers]').value) || 0,
      followingBoost: Number(body.querySelector('[data-following]').value) || 0,
    };
    const created = fromLocalInput(body.querySelector('[data-created]').value);
    if (created) payload.createdAt = new Date(created).toISOString();
    if (!payload.handle) return toast('A handle is required', 'error');
    if (!payload.displayName) payload.displayName = payload.handle;

    try {
      const saved = isNew ? await api('/accounts', { method: 'POST', body: payload }) : await api(`/accounts/${a.id}`, { method: 'PATCH', body: payload });
      const idx = state.accounts.findIndex((x) => x.id === saved.id);
      if (idx === -1) state.accounts.push(saved);
      else state.accounts[idx] = { ...state.accounts[idx], ...saved };
      emit('accounts', state.accounts);
      modal.close();
      toast(isNew ? `@${saved.handle} created` : 'Account updated');
      onSaved?.(saved);
    } catch (err) {
      errorToast(err);
    }
  });

  return modal;
}

export function openCreateAccount(opts) {
  return openAccountEditor(null, opts);
}

/** quick switcher: "make this account follow that one" */
export async function followAs(accountId, { follow = true } = {}) {
  return api(`/accounts/${accountId}/follow`, { method: 'POST', body: { on: follow } });
}
