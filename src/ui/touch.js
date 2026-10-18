// Touch controls, only on phones and tablets (coarse pointer, no hover).
// Left thumb: a steering pad. Right thumb: GAS, BRAKE, and the HOP switch
// (tap = pop, hold = charge a jump). Small buttons up top: camera and lift.
export const isTouch = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 1 && /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document);

export const touchState = { steer: 0, throttle: 0, brake: 0, hopHeld: false, hopPressed: false, view: false, liftFront: false, any: false };

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

  // steering pad: drag left and right anywhere in the left third
  const pad = el('div', 't-pad', '<div class="t-knob"></div>');
  const knob = pad.firstChild;
  let padId = null;
  let x0 = 0;
  const RANGE = 70;
  pad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    padId = t.identifier;
    x0 = t.clientX;
    pad.classList.add('on');
    touchState.any = true;
  }, { passive: false });
  pad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== padId) continue;
      const dx = Math.max(-RANGE, Math.min(RANGE, t.clientX - x0));
      touchState.steer = Math.sign(dx) * (Math.abs(dx) / RANGE) ** 1.3;
      knob.style.transform = `translateX(${dx}px)`;
    }
  }, { passive: false });
  const padEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== padId) continue;
      padId = null;
      touchState.steer = 0;
      knob.style.transform = '';
      pad.classList.remove('on');
    }
  };
  pad.addEventListener('touchend', padEnd);
  pad.addEventListener('touchcancel', padEnd);

  const right = el('div', 't-right');
  const gas = el('button', 't-btn t-gas', 'GAS');
  const brake = el('button', 't-btn t-brake', 'BRAKE');
  const hop = el('button', 't-btn t-hop', 'HOP');
  right.append(brake, hop, gas);
  hold(gas, () => { touchState.throttle = 1; touchState.any = true; }, () => { touchState.throttle = 0; });
  hold(brake, () => { touchState.brake = 1; }, () => { touchState.brake = 0; });
  hold(hop, () => { touchState.hopHeld = true; touchState.hopPressed = true; touchState.any = true; }, () => { touchState.hopHeld = false; });

  const top = el('div', 't-top');
  const cam = el('button', 't-mini', 'CAM');
  const lift = el('button', 't-mini', 'LIFT');
  top.append(lift, cam);
  hold(cam, () => { touchState.view = true; }, () => {});
  hold(lift, () => { touchState.liftFront = true; }, () => { touchState.liftFront = false; });

  ui.append(pad, right, top);
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
    any: input.any || t.any,
  };
  t.hopPressed = false;
  t.view = false;
  t.any = false;
  return out;
}
