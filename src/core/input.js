// Keyboard + gamepad, folded into one analog-ish state.
const held = new Set();
const pressed = new Set();
const released = new Set();

const HOP = ['Space'];
const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

// the last few keys struck, for spelling R-I-D-E
const typed = [];

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  typed.push({ code: e.code, t: performance.now() });
  if (typed.length > 4) typed.shift();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  held.add(e.code);
  pressed.add(e.code);
});
window.addEventListener('keyup', (e) => {
  held.delete(e.code);
  released.add(e.code);
});
window.addEventListener('blur', () => held.clear());

const any = (codes) => codes.some((c) => held.has(c));

let padHopPrev = false;
let rideLatch = false;
let padViewPrev = false;

export function readInput() {
  let throttle = any(KEYS.up) ? 1 : 0;
  let brake = any(KEYS.down) ? 1 : 0;
  let steer = (any(KEYS.right) ? 1 : 0) - (any(KEYS.left) ? 1 : 0);
  let hopHeld = any(HOP);
  let hopPressed = HOP.some((c) => pressed.has(c));
  let view = pressed.has('KeyC');

  const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (pad) {
    const x = pad.axes[0] || 0;
    if (Math.abs(x) > 0.12) steer = Math.sign(x) * ((Math.abs(x) - 0.12) / 0.88) ** 1.4;
    throttle = Math.max(throttle, pad.buttons[7]?.value || 0);
    brake = Math.max(brake, pad.buttons[6]?.value || 0);
    const padHop = !!(pad.buttons[0]?.pressed || pad.buttons[5]?.pressed);
    if (padHop && !padHopPrev) hopPressed = true;
    hopHeld = hopHeld || padHop;
    padHopPrev = padHop;
    const padView = !!pad.buttons[3]?.pressed;
    if (padView && !padViewPrev) view = true;
    padViewPrev = padView;
  }

  // hydraulic switches you hold: Shift lifts the nose, Q / E lift a side (three-wheel motion)
  let liftFront = any(['ShiftLeft', 'ShiftRight']);
  let liftLeft = any(['KeyQ']);
  let liftRight = any(['KeyE']);
  if (pad) {
    liftFront = liftFront || !!pad.buttons[4]?.pressed;
    liftLeft = liftLeft || !!pad.buttons[14]?.pressed;
    liftRight = liftRight || !!pad.buttons[15]?.pressed;
  }

  // hold R, I, D and E together: the ride takes you somewhere else (once per press)
  // (or type it: many keyboards can't hold four letters down at once)
  const ride = ['KeyR', 'KeyI', 'KeyD', 'KeyE'].every((c) => held.has(c));
  const spelled = typed.length === 4 && typed.map((k) => k.code).join() === 'KeyR,KeyI,KeyD,KeyE' && performance.now() - typed[0].t < 2500;
  // or type R-A-C-E: straight to the grid
  const raced = typed.length === 4 && typed.map((k) => k.code).join() === 'KeyR,KeyA,KeyC,KeyE' && performance.now() - typed[0].t < 2500;
  // or type M-A-P: the map comes up
  const last3 = typed.slice(-3);
  const mapped = last3.length === 3 && last3.map((k) => k.code).join() === 'KeyM,KeyA,KeyP' && performance.now() - last3[0].t < 2500;
  if (spelled || raced || mapped) typed.length = 0;
  const warp = raced ? 'race' : (ride && !rideLatch) || spelled;
  rideLatch = ride;

  const out = {
    warp, map: mapped,
    throttle, brake, steer, hopHeld, hopPressed, view, liftFront, liftLeft, liftRight,
    mute: pressed.has('KeyM'), any: pressed.size > 0,
  };
  pressed.clear();
  released.clear();
  return out;
}
