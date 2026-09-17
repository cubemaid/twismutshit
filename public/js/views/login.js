import { api } from '../api.js';
import { icons } from '../icons.js';
import { el, esc, toast } from '../ui.js';

export function loginView({ needsSetup = false, siteName = 'Chirper', welcome = '' } = {}) {
  const root = el(`<div class="login-wrap">
    <div class="login-card">
      <div class="bird">${icons.bird}</div>
      <h1>${esc(siteName)}</h1>
      <p>${esc(welcome || (needsSetup ? 'Enter the shared password to get started.' : 'Enter the shared password to continue.'))}</p>
      <form data-form>
        <label class="field"><input class="input" type="password" data-password placeholder="Password" autocomplete="current-password" autofocus></label>
        <button class="btn block" type="submit">Sign in</button>
      </form>
      <div class="hint" style="margin-top:16px">One password for both of you. You pick which character you are posting as after signing in.</div>
    </div>
  </div>`);

  const form = root.querySelector('[data-form]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await api('/login', { method: 'POST', body: { password: root.querySelector('[data-password]').value } });
      location.reload();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      root.querySelector('[data-password]').select();
    }
  });

  return { element: root };
}
