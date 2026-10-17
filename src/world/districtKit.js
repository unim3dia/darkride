// Building kit for the Underpass. Everything is authored in district-local
// coordinates: u runs along the main drag, v across it, y up. In the
// rotated district group that maps to x = v, z = -u.
import * as THREE from 'three';
import { pulseMat } from '../render/pulseMaterial.js';
import { SHARED_MATS } from './props.js';

export const DMATS = {
  brick: pulseMat({ color: 0x1c110d, roughness: 0.92, envMapIntensity: 0.1 }),
  brickDark: pulseMat({ color: 0x120c0a, roughness: 0.95, envMapIntensity: 0.08 }),
  corrugated: pulseMat({ color: 0x15181b, roughness: 0.55, metalness: 0.6, envMapIntensity: 0.35 }),
  steel: pulseMat({ color: 0x0d0e10, roughness: 0.5, metalness: 0.85, envMapIntensity: 0.4 }),
  containerRed: pulseMat({ color: 0x2a100c, roughness: 0.7, metalness: 0.4, envMapIntensity: 0.25 }),
  containerBlue: pulseMat({ color: 0x0d1822, roughness: 0.7, metalness: 0.4, envMapIntensity: 0.25 }),
  containerGreen: pulseMat({ color: 0x141a12, roughness: 0.7, metalness: 0.4, envMapIntensity: 0.25 }),
  tank: pulseMat({ color: 0x1b1d20, roughness: 0.6, metalness: 0.5, envMapIntensity: 0.3 }),
  concrete: pulseMat({ color: 0x1b1b1c, roughness: 0.9, envMapIntensity: 0.12 }),
  sidewalk: pulseMat({ color: 0x18181a, roughness: 0.8, envMapIntensity: 0.25 }),
  ground: pulseMat({ color: 0x0f1011, roughness: 0.32, metalness: 0.12, envMapIntensity: 0.55 }, { puddles: true }),
  dirt: pulseMat({ color: 0x15120f, roughness: 0.6, envMapIntensity: 0.3 }, { puddles: true }),
  rust: pulseMat({ color: 0x1d130d, roughness: 0.85, metalness: 0.4, envMapIntensity: 0.2 }),
  windowLit: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.62, 0.28) }),
  windowDim: pulseMat({ color: 0x050506, roughness: 0.08, metalness: 0.9, envMapIntensity: 0.9 }),
  tube: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.6, 2.3) }),
};
for (const m of Object.values(DMATS)) SHARED_MATS.add(m);

/** Axis-aligned box in district space. */
export function boxUV(u0, u1, v0, v1, y0, y1) {
  return new THREE.BoxGeometry(v1 - v0, y1 - y0, u1 - u0).translate((v0 + v1) / 2, (y0 + y1) / 2, -(u0 + u1) / 2);
}

/** Box centered at (u, v) with size along u, v and a yaw (radians, about y). */
export function boxAt(u, v, y, su, sv, h, yaw = 0) {
  return new THREE.BoxGeometry(sv, h, su).rotateY(yaw).translate(v, y + h / 2, -u);
}

export function cylAt(u, v, y, r, h, seg = 16) {
  return new THREE.CylinderGeometry(r, r, h, seg).translate(v, y + h / 2, -u);
}

/** A strut between two district-space points [u, y, v]. */
export function strutUV(a, b, r = 0.08, seg = 5) {
  const A = new THREE.Vector3(a[2], a[1], -a[0]);
  const B = new THREE.Vector3(b[2], b[1], -b[0]);
  const dir = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  const m = A.add(B).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}

/**
 * A brick warehouse with a broken parapet, windows (a few still lit), and
 * fire escapes clinging to one face.
 */
export function warehouse(K, r, u0, u1, v0, v1, h, { escapes = null, mat = 'brick' } = {}) {
  K.add(mat, boxUV(u0, u1, v0, v1, 0, h));
  // parapet teeth and rooftop clutter
  const n = 2 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const cu = u0 + r() * (u1 - u0);
    const cv = v0 + r() * (v1 - v0);
    K.add(r() < 0.5 ? 'brickDark' : 'steel', boxAt(cu, cv, h, 1.5 + r() * 4, 1.5 + r() * 4, 0.6 + r() * 2.5));
  }
  if (r() < 0.4) K.add('tank', cylAt(u0 + (u1 - u0) * 0.3, v0 + (v1 - v0) * 0.6, h + 1.5, 1.4, 2.4, 10));
  if (r() < 0.4) for (const s of [0.2, 0.8]) K.add('steel', cylAt(u0 + (u1 - u0) * 0.3, v0 + (v1 - v0) * s, h, 0.1, 1.5, 4));

  // windows on every face, mostly dead
  const faces = [
    { axis: 'v', at: v0 - 0.06, from: u0, to: u1 }, { axis: 'v', at: v1 + 0.06, from: u0, to: u1 },
    { axis: 'u', at: u0 - 0.06, from: v0, to: v1 }, { axis: 'u', at: u1 + 0.06, from: v0, to: v1 },
  ];
  for (const f of faces) {
    for (let y = 2.8; y < h - 1.5; y += 3.6) {
      for (let t = f.from + 2.5; t < f.to - 2; t += 3.2) {
        const roll = r();
        if (roll < 0.45) continue;
        const lit = roll > 0.985;
        const geo = f.axis === 'v' ? boxAt(t, f.at, y, 1.3, 0.05, 1.7) : boxAt(f.at, t, y, 0.05, 1.3, 1.7);
        K.add(lit ? 'windowLit' : 'windowDim', geo);
        if (!lit && roll > 0.97) K.eyeSpots.push(f.axis === 'v' ? [t, y + 0.9, f.at] : [f.at, y + 0.9, t]);
      }
    }
  }

  // caged bulbs over doors: little pools of light at street level
  for (const f of faces) {
    for (let t = f.from + 6; t < f.to - 4; t += 14 + r() * 10) {
      if (r() < 0.45) continue;
      const [du, dv] = f.axis === 'v' ? [0, f.at < (v0 + v1) / 2 ? -1 : 1] : [f.at < (u0 + u1) / 2 ? -1 : 1, 0];
      const [u, v] = f.axis === 'v' ? [t, f.at] : [f.at, t];
      K.add('brickDark', boxAt(u + du * 0.02, v + dv * 0.02, 0, f.axis === 'v' ? 1.4 : 0.06, f.axis === 'v' ? 0.06 : 1.4, 2.4));
      K.wallLamps.push({ u: u + du * 0.35, v: v + dv * 0.35, y: 3.1, du, dv });
    }
  }

  // fire escapes: platforms, rails and ladders on one long face
  if (escapes) {
    const { side, from, to } = escapes;
    const at = side < 0 ? v0 - 0.9 : v1 + 0.9;
    for (let y = 4; y < h - 1; y += 3.6) {
      K.add('steel', boxAt((from + to) / 2, at, y, to - from, 1.6, 0.06));
      K.add('steel', boxAt((from + to) / 2, at + side * 0.78, y + 0.9, to - from, 0.04, 0.04));
      for (let u = from; u <= to; u += 2) K.add('steel', boxAt(u, at + side * 0.78, y, 0.04, 0.04, 0.9));
      const lu = y % 7.2 < 3.6 ? from + 0.6 : to - 0.6;
      K.add('steel', strutUV([lu, y, at], [lu + (lu < (from + to) / 2 ? 2.4 : -2.4), y + 3.6, at], 0.03, 4));
    }
  }
  K.box(u0, u1, v0, v1, h);
}

/** A shipping container, lying along u (turned = false) or along v. */
export function container(K, r, u, v, y, turned, long = r() < 0.5) {
  const su = long ? 12 : 6;
  const yaw = turned ? Math.PI / 2 : 0;
  const mats = ['containerRed', 'containerBlue', 'containerGreen', 'rust'];
  const m = mats[Math.floor(r() * mats.length)];
  K.add(m, boxAt(u, v, y, su, 2.45, 2.6, yaw));
  // corrugation ribs
  for (let k = -su / 2 + 0.6; k < su / 2; k += 0.9) {
    const du = Math.cos(yaw) * k;
    const dv = -Math.sin(yaw) * k;
    K.add(m, boxAt(u + du, v + dv, y + 0.1, 0.12, 2.52, 2.4, yaw));
  }
  if (y === 0) {
    const [hu, hv] = turned ? [1.25, su / 2] : [su / 2, 1.25];
    K.box(u - hu, u + hu, v - hv, v + hv, 2.6);
  }
  return su;
}

export function tank(K, u, v, rad, h) {
  K.add('tank', cylAt(u, v, 0, rad, h, 24));
  K.add('tank', new THREE.SphereGeometry(rad, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.25, 1).translate(v, h, -u));
  for (let y = 1; y < h; y += 2.2) K.add('steel', new THREE.TorusGeometry(rad + 0.04, 0.05, 4, 24).rotateX(Math.PI / 2).translate(v, y, -u));
  K.add('steel', strutUV([u + rad + 0.3, 0, v], [u + rad + 0.3, h + 0.5, v], 0.05, 4));
  K.circle(u, v, rad, h);
}

/** Chain-link fence around a rectangle, with a gate gap on one side. */
export function fence(K, u0, u1, v0, v1, gate) {
  const H = 2.6;
  const sides = [
    ['u', v0, u0, u1, 'v0'], ['u', v1, u0, u1, 'v1'], ['v', u0, v0, v1, 'u0'], ['v', u1, v0, v1, 'u1'],
  ];
  for (const [dir, at, a, b, name] of sides) {
    const segs = gate && gate.side === name ? [[a, gate.at - 6], [gate.at + 6, b]] : [[a, b]];
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 1) continue;
      for (let t = s0; t <= s1; t += 3) {
        const [u, v] = dir === 'u' ? [t, at] : [at, t];
        K.add('steel', cylAt(u, v, 0, 0.05, H, 5));
      }
      const [u, v, su, sv] = dir === 'u' ? [(s0 + s1) / 2, at, s1 - s0, 0.02] : [at, (s0 + s1) / 2, 0.02, s1 - s0];
      K.fence.push(boxAt(u, v, 0.05, su, sv, H - 0.1));
      K.add('steel', boxAt(u, v, H - 0.05, su, Math.max(sv, 0.05), 0.05));
      if (dir === 'u') K.box(s0, s1, at - 0.2, at + 0.2, H);
      else K.box(at - 0.2, at + 0.2, s0, s1, H);
    }
  }
}

/** The rail trestle: steel truss walls on pillars, crossing the district along u. */
export function trestle(K, v, from, to, y) {
  const W = 4.2;
  K.add('steel', boxUV(from, to, v - W, v + W, y, y + 0.9));
  for (const side of [-1, 1]) {
    const vv = v + side * W;
    K.add('steel', boxUV(from, to, vv - 0.2, vv + 0.2, y + 5.2, y + 5.6));
    K.add('steel', boxUV(from, to, vv - 0.25, vv + 0.25, y + 0.9, y + 1.4));
    for (let u = from; u < to; u += 6) {
      K.add('steel', strutUV([u, y + 1.2, vv], [u, y + 5.4, vv], 0.12, 4));
      K.add('steel', strutUV([u, y + 1.2, vv], [u + 6, y + 5.4, vv], 0.08, 4));
    }
    K.add('steel', boxUV(from, to, v + side * 0.8 - 0.06, v + side * 0.8 + 0.06, y + 0.9, y + 1.05)); // rails
  }
  for (let u = from + 4; u < to; u += 24) {
    for (const side of [-1, 1]) {
      K.add('concrete', boxAt(u, v + side * 3.2, 0, 1.6, 1.6, y));
      K.circle(u, v + side * 3.2, 1.05, y);
    }
    K.add('concrete', boxAt(u, v, y - 1.2, 1.6, 8.4, 1.2));
  }
}

/** An abandoned gas station: canopy with failing tubes, pumps, a kiosk. */
export function gasStation(K, u, v) {
  for (const du of [-6, 6]) for (const dv of [-3.5, 3.5]) {
    K.add('steel', boxAt(u + du, v + dv, 0, 0.35, 0.35, 5));
    K.circle(u + du, v + dv, 0.35, 5);
  }
  K.add('corrugated', boxAt(u, v, 5, 16, 10, 0.7));
  const tubes = [];
  for (const dv of [-2.5, 0, 2.5]) tubes.push(boxAt(u, v + dv, 4.95, 10, 0.12, 0.05));
  for (const dv of [-2, 2]) {
    K.add('concrete', boxAt(u, v + dv, 0, 1.6, 0.6, 0.25));
    K.add('rust', boxAt(u, v + dv, 0.25, 0.7, 0.45, 1.6));
    K.box(u - 0.8, u + 0.8, v + dv - 0.3, v + dv + 0.3, 1.8);
  }
  K.add('brick', boxAt(u + 14, v + 2, 0, 7, 6, 3.4));
  K.add('windowLit', boxAt(u + 10.45, v + 2, 0.9, 0.05, 3.5, 1.6));
  K.box(u + 10.5, u + 17.5, v - 1, v + 5, 3.4);
  return tubes;
}

/** A one-story motel row: doors, a few lit windows. */
export function motel(K, r, u, v, len, side) {
  K.add('brick', boxAt(u, v, 0, len, 9, 4.2));
  K.add('steel', boxAt(u, v + side * 5.2, 3.4, len, 1.6, 0.15));
  const face = v + side * 4.53;
  for (let k = -len / 2 + 2; k < len / 2 - 1; k += 4) {
    K.add('brickDark', boxAt(u + k, face, 0, 1.0, 0.05, 2.2));
    K.add(r() < 0.18 ? 'windowLit' : 'windowDim', boxAt(u + k + 1.6, face, 1.0, 1.2, 0.05, 1.0));
  }
  K.box(u - len / 2, u + len / 2, v - 4.5, v + 4.5, 4.2);
}

export function fireBarrel(K, u, v) {
  K.add('rust', cylAt(u, v, 0, 0.36, 0.95, 12));
  K.circle(u, v, 0.45, 1.0);
}

export function rubble(K, r, u, v, spread) {
  for (let i = 0; i < 8; i++) {
    const h = 0.3 + r() * 0.9;
    // tilt in place first, then set it down in the lot
    const g = new THREE.BoxGeometry(1 + r() * 3, h, 1 + r() * 3).rotateX((r() - 0.5) * 0.3).rotateY(r() * 3);
    K.add('concrete', g.translate(v + (r() - 0.5) * spread, h / 2 - 0.1, -(u + (r() - 0.5) * spread)));
  }
}

export function ruinedWall(K, r, u, v, len, alongU) {
  let t = -len / 2;
  while (t < len / 2) {
    const w = 1.5 + r() * 3;
    const h = 1 + r() * 7;
    const [cu, cv] = alongU ? [u + t + w / 2, v] : [u, v + t + w / 2];
    K.add('brick', boxAt(cu, cv, 0, alongU ? w : 0.5, alongU ? 0.5 : w, h));
    if (h > 1.2) alongU ? K.box(cu - w / 2, cu + w / 2, v - 0.3, v + 0.3, h) : K.box(u - 0.3, u + 0.3, cv - w / 2, cv + w / 2, h);
    t += w + (r() < 0.3 ? 2 + r() * 3 : 0);
  }
}
