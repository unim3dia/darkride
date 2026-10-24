// Touch controls, only on phones and tablets (coarse pointer, no hover).
// Left thumb: a 360° stick that appears where you touch. Left and right steer,
// up is gas, down is brake (and reverse). Right thumb: the HOP switch (tap = pop,
// hold = charge a jump), the lift switches, and the camera.
export const isTouch = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 1 && /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document);

export const touchState = { steer: 0, throttle: 0, brake: 0, hopHeld: false, hopPressed: false, view: false, liftFront: false, liftLeft: false, liftRight: false, any: false };

function el(tag, cls, html = '') {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  return e;
}

/** A button that tracks its own touches; returns a setter-free state via callbacks. */
function hold(btn, onDown, onUp) {
  const ids = new Set();
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) ids.add(t.identifier);
    btn.classList.add('on');
    onDown();
  }, { passive: false });
  const end = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) ids.delete(t.identifier);
    if (!ids.size) { btn.classList.remove('on'); onUp(); }
  };
  btn.addEventListener('touchend', end, { passive: false });
  btn.addEventListener('touchcancel', end, { passive: false });
}

export function setupTouch() {
  if (!isTouch()) return false;
  document.body.classList.add('touch');
  const start = document.querySelector('.start');
  if (start) start.textContent = 'tap to start';
  const ui = el('div', 'touch-ui');
  ui.setAttribute('aria-label', 'Touch controls');

  // the stick: wherever the left thumb lands in the left half, that's center
  const pad = el('div', 't-pad', '<div class="t-base"><div class="t-knob"></div></div>');
  const base = pad.firstChild;
  const knob = base.firstChild;
  let padId = null;
  let x0 = 0;
  let y0 = 0;
  const RANGE = 60;
  const DEAD = 0.14;
  const curve = (k) => Math.sign(k) * Math.max(0, (Math.abs(k) - DEAD) / (1 - DEAD));
  const move = (t) => {
    let dx = t.clientX - x0;
    let dy = t.clientY - y0;
    const len = Math.hypot(dx, dy);
    if (len > RANGE) { dx *= RANGE / len; dy *= RANGE / len; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const sx = curve(dx / RANGE);
    const sy = curve(-dy / RANGE);
    touchState.steer = Math.sign(sx) * Math.abs(sx) ** 1.3;
    touchState.throttle = Math.max(0, sy);
    touchState.brake = Math.max(0, -sy);
  };
  pad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (padId !== null) return;
    const t = e.changedTouches[0];
    padId = t.identifier;
    x0 = t.clientX;
    y0 = t.clientY;
    const box = pad.getBoundingClientRect();
    base.style.left = `${x0 - box.left}px`;
    base.style.top = `${y0 - box.top}px`;
    pad.classList.add('on');
    touchState.any = true;
    move(t);
  }, { passive: false });
  pad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === padId) move(t);
  }, { passive: false });
  const padEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== padId) continue;
      padId = null;
      touchState.steer = touchState.throttle = touchState.brake = 0;
      knob.style.transform = '';
      base.style.left = base.style.top = '';
      pad.classList.remove('on');
    }
  };
  pad.addEventListener('touchend', padEnd);
  pad.addEventListener('touchcancel', padEnd);

  // right thumb: everything the car does besides driving
  const right = el('div', 't-right');
  const hop = el('button', 't-btn t-hop', 'HOP');
  const lift = el('button', 't-btn t-lift', 'LIFT');
  const leanL = el('button', 't-btn t-lean t-lean-l', '◀');
  const leanR = el('button', 't-btn t-lean t-lean-r', '▶');
  const cam = el('button', 't-mini t-cam', 'CAM');
  lift.setAttribute('aria-label', 'Lift the nose');
  leanL.setAttribute('aria-label', 'Three-wheel left');
  leanR.setAttribute('aria-label', 'Three-wheel right');
  right.append(cam, leanL, lift, leanR, hop);
  hold(hop, () => { touchState.hopHeld = true; touchState.hopPressed = true; touchState.any = true; }, () => { touchState.hopHeld = false; });
  hold(lift, () => { touchState.liftFront = true; }, () => { touchState.liftFront = false; });
  hold(leanL, () => { touchState.liftLeft = true; }, () => { touchState.liftLeft = false; });
  hold(leanR, () => { touchState.liftRight = true; }, () => { touchState.liftRight = false; });
  hold(cam, () => { touchState.view = true; }, () => {});

  ui.append(pad, right);
  document.body.appendChild(ui);
  // iOS: block pinch-zoom / double-tap zoom on the game surface
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  return true;
}

/** Fold touch into the frame's input; one-shot flags are consumed here. */
export function mergeTouch(input) {
  const t = touchState;
  const out = {
    ...input,
    steer: Math.abs(t.steer) > Math.abs(input.steer) ? t.steer : input.steer,
    throttle: Math.max(input.throttle, t.throttle),
    brake: Math.max(input.brake, t.brake),
    hopHeld: input.hopHeld || t.hopHeld,
    hopPressed: input.hopPressed || t.hopPressed,
    view: input.view || t.view,
    liftFront: input.liftFront || t.liftFront,
    liftLeft: input.liftLeft || t.liftLeft,
    liftRight: input.liftRight || t.liftRight,
    any: input.any || t.any,
  };
  t.hopPressed = false;
  t.view = false;
  t.any = false;
  return out;
}
