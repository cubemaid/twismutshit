import { icons } from './icons.js';
import { el, errorToast, openModal } from './ui.js';

/** Aspect ratios + output sizes that match what the layout expects. */
export const PRESETS = {
  header: { key: 'header', label: 'Header', aspect: 3, width: 1500, height: 500 },
  square: { key: 'square', label: 'Square', aspect: 1, width: 512, height: 512 },
  post: { key: 'post', label: 'Post', aspect: 16 / 9, width: 1280, height: 720 },
};

export const PRESET_LIST = [PRESETS.post, PRESETS.square, PRESETS.header];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be read as an image'));
    img.src = src;
  });
}

/**
 * Crop a picked file to a preset shape before it is uploaded.
 * Drag to reposition, slide to zoom, or switch preset.
 *
 * Resolves with a File (the crop), the original File (if "use original"),
 * or 'cancel' when the whole upload should stop.
 */
export function openCropper(file, { preset = PRESETS.post, index = 0, total = 1, allowOriginal = true } = {}) {
  return new Promise(async (resolve) => {
    const url = URL.createObjectURL(file);
    let img;
    try {
      img = await loadImage(url);
    } catch (err) {
      URL.revokeObjectURL(url);
      errorToast(err);
      resolve(null);
      return;
    }

    let current = preset;
    let zoom = 1;
    let x = 0;
    let y = 0;
    let base = 1; // scale that makes the image exactly cover the stage

    const body = el(`<div class="cropper">
      <div class="cropper-stage" data-stage><img data-img alt=""></div>
      <div class="cropper-controls">
        <span class="muted small" data-hint></span>
        <input type="range" min="1" max="4" step="0.01" value="1" data-zoom aria-label="Zoom">
      </div>
      <div class="row tight" data-presets></div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:4px">
        <button class="btn ghost" data-cancel>Cancel</button>
        ${allowOriginal ? '<button class="btn ghost" data-original>Use original</button>' : ''}
        <button class="btn" data-ok>Crop &amp; upload</button>
      </div>
    </div>`);

    const stage = body.querySelector('[data-stage]');
    const imgEl = body.querySelector('[data-img]');
    const zoomEl = body.querySelector('[data-zoom]');
    const hint = body.querySelector('[data-hint]');
    imgEl.src = url;
    imgEl.draggable = false;

    const modal = openModal({
      title: total > 1 ? `Crop image ${index + 1} of ${total}` : 'Crop image',
      body,
      slim: true,
      onClose: () => {
        URL.revokeObjectURL(url);
        resolve('cancel');
      },
    });

    const presetRow = body.querySelector('[data-presets]');
    PRESET_LIST.forEach((p) => {
      const b = el(`<button class="chip${p.key === current.key ? ' active' : ''}">${p.label}</button>`);
      b.addEventListener('click', () => {
        current = p;
        presetRow.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        b.classList.add('active');
        layout();
      });
      presetRow.appendChild(b);
    });

    const clamp = () => {
      const vw = stage.clientWidth;
      const vh = stage.clientHeight;
      const dw = img.naturalWidth * base * zoom;
      const dh = img.naturalHeight * base * zoom;
      x = dw <= vw ? (vw - dw) / 2 : Math.min(0, Math.max(vw - dw, x));
      y = dh <= vh ? (vh - dh) / 2 : Math.min(0, Math.max(vh - dh, y));
    };

    const paint = () => {
      const dw = img.naturalWidth * base * zoom;
      const dh = img.naturalHeight * base * zoom;
      imgEl.style.width = `${dw}px`;
      imgEl.style.height = `${dh}px`;
      imgEl.style.left = `${x}px`;
      imgEl.style.top = `${y}px`;
    };

    function layout(keepCentre = true) {
      const vw = stage.clientWidth;
      const vh = stage.clientHeight;
      const centreX = vw / 2 - x;
      const centreY = vh / 2 - y;
      base = Math.max(vw / img.naturalWidth, vh / img.naturalHeight);
      if (keepCentre && (x || y)) {
        const scale = base * zoom;
        x = vw / 2 - centreX * (scale / (base * zoom));
        y = vh / 2 - centreY * (scale / (base * zoom));
      }
      clamp();
      paint();
      hint.textContent = `${current.label} · ${current.width}×${current.height}`;
    }

    // set the shape, then measure
    const applyShape = () => {
      stage.style.aspectRatio = String(current.aspect);
      requestAnimationFrame(() => {
        x = 0;
        y = 0;
        layout(false);
      });
    };
    applyShape();

    /* drag to reposition */
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    stage.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('dragging');
    });
    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      x += e.clientX - lastX;
      y += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      clamp();
      paint();
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('dragging');
      if (e?.pointerId !== undefined) stage.releasePointerCapture?.(e.pointerId);
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('pointerleave', endDrag);

    zoomEl.addEventListener('input', () => {
      const vw = stage.clientWidth;
      const vh = stage.clientHeight;
      const oldScale = base * zoom;
      const cx = (vw / 2 - x) / oldScale; // image coords under the stage centre
      const cy = (vh / 2 - y) / oldScale;
      zoom = Number(zoomEl.value);
      const newScale = base * zoom;
      x = vw / 2 - cx * newScale;
      y = vh / 2 - cy * newScale;
      clamp();
      paint();
    });

    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(value);
      modal.close();
    };

    body.querySelector('[data-cancel]').addEventListener('click', () => finish('cancel'));
    body.querySelector('[data-original]')?.addEventListener('click', () => finish(file));

    body.querySelector('[data-ok]').addEventListener('click', () => {
      const vw = stage.clientWidth;
      const vh = stage.clientHeight;
      const scale = base * zoom;
      const canvas = document.createElement('canvas');
      canvas.width = current.width;
      canvas.height = current.height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, -x / scale, -y / scale, vw / scale, vh / scale, 0, 0, canvas.width, canvas.height);

      const png = /png$/i.test(file.type);
      const type = png ? 'image/png' : 'image/jpeg';
      const name = (file.name || 'image').replace(/\.[^.]+$/, '') + (png ? '.png' : '.jpg');
      canvas.toBlob(
        (blob) => finish(blob ? new File([blob], name, { type }) : file),
        type,
        png ? undefined : 0.92
      );
    });
  });
}

export { icons };
