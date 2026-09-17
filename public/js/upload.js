import { api } from './api.js';
import { icons } from './icons.js';
import { el, esc, errorToast, toast } from './ui.js';

/** POST files to the server, returns [{ url, alt, name }] */
export async function uploadImages(files) {
  const list = [...files].filter((f) => f && /^image\//.test(f.type));
  if (!list.length) {
    toast('Only images can be uploaded', 'error');
    return [];
  }
  const fd = new FormData();
  list.slice(0, 4).forEach((f) => fd.append('files', f));
  try {
    const res = await api('/upload', { method: 'POST', formData: fd });
    return res.files || [];
  } catch (err) {
    errorToast(err);
    return [];
  }
}

/** Opens the OS file picker and resolves with the chosen files. */
export function pickFiles({ multiple = false, capture = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (multiple) input.multiple = true;
    if (capture) input.capture = 'environment';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const files = [...(input.files || [])];
      input.remove();
      resolve(files);
    });
    // if the user cancels, the change event never fires; clean up on focus
    window.addEventListener(
      'focus',
      () => setTimeout(() => {
        if (document.body.contains(input)) {
          input.remove();
          resolve([]);
        }
      }, 500),
      { once: true }
    );
    input.click();
  });
}

/** Convenience: pick then upload. */
export async function pickAndUpload(options) {
  const files = await pickFiles(options);
  if (!files.length) return [];
  return uploadImages(files);
}

/**
 * A button that opens the picker, uploads, and hands back the uploaded files.
 * Used for avatars, banners and chat attachments.
 */
export function imageUploadButton(label, onDone, { icon = 'image', cls = 'btn sm ghost' } = {}) {
  const btn = el(`<button type="button" class="${cls}">${icons[icon]}<span>${esc(label)}</span></button>`);
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const uploaded = await pickAndUpload({ multiple: false });
    if (uploaded.length) onDone(uploaded[0]);
  });
  return btn;
}
