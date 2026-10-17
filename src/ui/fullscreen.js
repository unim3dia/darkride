// Fullscreen: F key or the corner button. The button only shows while the
// mouse is moving, then fades so nothing sits on the image while you drive.
const IDLE_MS = 2200;

export function toggleFullscreen() {
  const doc = document;
  try {
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
    } else {
      const el = doc.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => {}); // refused (e.g. not from a user gesture): stay windowed
    }
  } catch {
    // fullscreen unsupported in this context; nothing to do
  }
}

export function setupFullscreenButton() {
  const btn = document.getElementById('fullscreen');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullscreen();
    btn.blur(); // keep Space from re-triggering the button
  });
  const sync = () => {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Enter fullscreen');
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();

  // F, handled inside the key event itself so the browser counts it as a user gesture
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && !e.repeat && !e.metaKey && !e.ctrlKey) toggleFullscreen();
  });

  let timer = null;
  window.addEventListener('pointermove', () => {
    document.body.classList.add('pointer-active');
    clearTimeout(timer);
    timer = setTimeout(() => document.body.classList.remove('pointer-active'), IDLE_MS);
  });
}
