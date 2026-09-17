import { icons } from '../icons.js';
import { api } from '../api.js';
import { state } from '../store.js';
import { colHead } from '../shell.js';
import { setShotMode } from '../screenshot.js';
import { el, esc, errorToast, toast } from '../ui.js';

export function settingsView() {
  const root = el('<div></div>');
  root.appendChild(colHead({ title: 'Settings' }));

  const s = state.settings || {};
  const body = el(`<div style="padding:16px">
    <div class="card">
      <div class="card-head sm">${icons.eye} What you see</div>
      <div class="card-body">
        <label class="checkbox"><input type="checkbox" data-future ${s.showFuturePosts ? 'checked' : ''}> Show posts dated in the future</label>
        <div class="hint" style="margin:-4px 0 12px 27px">Posts you date <i>after</i> the current moment are hidden from feeds unless this is on.</div>
        <label class="checkbox"><input type="checkbox" data-hidereplies ${s.hideRepliesDefault ? 'checked' : ''}> Hide replies in feeds by default</label>
      </div>
    </div>

    <div class="card">
      <div class="card-head sm">${icons.bird} This site</div>
      <div class="card-body">
        <label class="field"><span>Site name</span><input class="input" data-name value="${esc(s.siteName || 'Chirper')}"></label>
        <label class="field"><span>Accent colour</span><input class="input" data-accent value="${esc(s.accent || '#1d9bf0')}" placeholder="#1d9bf0"></label>
        <label class="field"><span>Welcome note (shown on the sign-in screen)</span><input class="input" data-welcome value="${esc(s.welcomeNote || '')}"></label>
        <button class="btn" data-save>Save site settings</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head sm">${icons.download} Your data</div>
      <div class="card-body">
        <div class="row">
          <a class="btn ghost" href="/api/export">${icons.download} Download everything (.json)</a>
          <button class="btn ghost" data-import>${icons.upload} Import a backup</button>
        </div>
        <div class="hint">Export before big changes — it is a single file with accounts, posts, DMs, notifications and trends.</div>
        <input type="file" accept="application/json" hidden data-file>
      </div>
    </div>

    <div class="card">
      <div class="card-head sm">${icons.image} Screenshots</div>
      <div class="card-body">
        <button class="btn" data-shot>${icons.image} Turn on clean view</button>
        <div class="hint">
          Hides the Chirper-only bits — time machine, who's here, the status bar, the Admin link and the
          app badges — so what's left looks like a real Twitter page. Three extra toggles strip the
          sidebar, the column header and the stats row. Press <b>S</b> any time to toggle it.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head sm">${icons.sliders} More</div>
      <div class="card-body">
        <a class="btn ghost" href="#/admin">Open the admin panel</a>
        <div class="hint">Accounts, notifications, trends, the time machine and danger-zone resets all live there.</div>
      </div>
    </div>
  </div>`);

  body.querySelector('[data-shot]').addEventListener('click', () => setShotMode(true));

  body.querySelector('[data-save]').addEventListener('click', async () => {
    try {
      await api('/settings', {
        method: 'PATCH',
        body: {
          siteName: body.querySelector('[data-name]').value,
          accent: body.querySelector('[data-accent]').value,
          welcomeNote: body.querySelector('[data-welcome]').value,
        },
      });
      toast('Site settings saved');
    } catch (err) {
      errorToast(err);
    }
  });
  body.querySelector('[data-future]').addEventListener('change', async (e) => {
    await api('/settings', { method: 'PATCH', body: { showFuturePosts: e.target.checked } });
    toast(e.target.checked ? 'Future posts will show up' : 'Future posts hidden');
  });
  body.querySelector('[data-hidereplies]').addEventListener('change', async (e) => {
    await api('/settings', { method: 'PATCH', body: { hideRepliesDefault: e.target.checked } });
    toast('Saved');
  });

  const file = body.querySelector('[data-file]');
  body.querySelector('[data-import]').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const dump = JSON.parse(await f.text());
      await api('/import', { method: 'POST', body: dump });
      toast('Backup imported — reloading');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      errorToast(err);
    }
  });

  root.appendChild(body);
  return { element: root };
}
