// Dead cars have mass. Hit one and it slides, spins, grinds on its rims,
// and if you shove it far enough, drops through a gap into the fog.
import { ROAD } from '../config.js';
import { project, sample, elevation, gapAt } from './track.js';

const HALF = 1.6;
const RADIUS = 1.45;
const S = {};

export function makeBody(obj, s) {
  return { obj, s, vx: 0, vz: 0, vy: 0, w: 0, falling: false, gone: false, grind: 0 };
}

/** Two circles per car body, rebuilt each step from the live transform. */
export function collidersFrom(bodies, out) {
  for (const b of bodies) {
    if (b.gone) continue;
    const a = b.obj.rotation.y;
    const fx = -Math.sin(a) * HALF;
    const fz = -Math.cos(a) * HALF;
    const p = b.obj.position;
    out.push({ x: p.x + fx, z: p.z + fz, r: RADIUS, y: p.y, body: b, ox: fx, oz: fz });
    out.push({ x: p.x - fx, z: p.z - fz, r: RADIUS, y: p.y, body: b, ox: -fx, oz: -fz });
  }
  return out;
}

/** Car hits body: share the momentum instead of hitting a wall. */
export function shove(c, nx, nz, into) {
  const b = c.body;
  const j = into * 0.6;
  b.vx -= nx * j;
  b.vz -= nz * j;
  // off-center hits spin it
  b.w += (c.ox * -nz - c.oz * -nx) * j * 0.12;
  b.grind = Math.min(1, b.grind + into * 0.08);
}

export function updateBodies(bodies, dt, onGrind) {
  for (const b of bodies) {
    if (b.gone) continue;
    const p = b.obj.position;
    if (b.falling) {
      b.vy -= 26 * dt;
      p.y += b.vy * dt;
      p.x += b.vx * dt;
      p.z += b.vz * dt;
      b.obj.rotation.x += dt * 0.8;
      b.obj.rotation.z += b.w * dt * 0.3;
      if (p.y < elevation(b.s) - 60) { b.gone = true; b.obj.visible = false; }
      continue;
    }
    const speed = Math.hypot(b.vx, b.vz);
    if (speed < 0.02 && Math.abs(b.w) < 0.01) continue;
    p.x += b.vx * dt;
    p.z += b.vz * dt;
    b.obj.rotation.y += b.w * dt;
    const k = Math.exp(-2.4 * dt);
    b.vx *= k;
    b.vz *= k;
    b.w *= Math.exp(-3 * dt);
    const pr = project(p.x, p.z, b.s);
    b.s = pr.s;
    if (gapAt(pr.s)) { b.falling = true; b.vy = 0; continue; }
    p.y = elevation(pr.s);
    // jersey barriers keep it on the deck
    const lim = ROAD.HALF_WIDTH - 1.3;
    if (Math.abs(pr.d) > lim) {
      sample(pr.s, S);
      const side = Math.sign(pr.d);
      p.x -= S.nx * side * (Math.abs(pr.d) - lim);
      p.z -= S.nz * side * (Math.abs(pr.d) - lim);
      const into = b.vx * S.nx * side + b.vz * S.nz * side;
      if (into > 0) { b.vx -= S.nx * side * into * 1.5; b.vz -= S.nz * side * into * 1.5; }
    }
    b.grind *= Math.exp(-dt * 2);
    if (speed > 1.5) onGrind(b, speed);
  }
}
