// Geometry that follows the curve of the freeway.
import * as THREE from 'three';
import { sample } from './track.js';
import { box } from './props.js';

const A = {};
const B = {};

/**
 * A closed rectangular tube swept along the centerline from s=a to s=b.
 * dL/dR = lateral offsets (right is +), yT/yB = height above the deck.
 */
export function ribbon(a, b, dL, dR, yT, yB, step = 2) {
  const pos = [];
  const n = Math.max(1, Math.ceil((b - a) / step));
  const corner = (p, d, y) => [p.x + p.nx * d, p.y + y, p.z + p.nz * d];
  for (let i = 0; i < n; i++) {
    sample(a + ((b - a) * i) / n, A);
    sample(a + ((b - a) * (i + 1)) / n, B);
    const a0 = corner(A, dL, yT), a1 = corner(A, dR, yT), a2 = corner(A, dR, yB), a3 = corner(A, dL, yB);
    const b0 = corner(B, dL, yT), b1 = corner(B, dR, yT), b2 = corner(B, dR, yB), b3 = corner(B, dL, yB);
    const quad = (p, q, r, s) => pos.push(...p, ...q, ...r, ...p, ...r, ...s);
    quad(a0, b0, b1, a1); // top
    quad(a1, b1, b2, a2); // right
    quad(a2, b2, b3, a3); // bottom
    quad(a3, b3, b0, a0); // left
    if (i === 0) quad(a0, a1, a2, a3);
    if (i === n - 1) quad(b1, b0, b3, b2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const P = {};
/** A box oriented to the road at (s, d), lifted y above the deck. Local Z = along the road. */
export function roadBox(w, h, d, s, off, y, tiltX = 0, extraYaw = 0) {
  sample(s, P);
  const g = new THREE.BoxGeometry(w, h, d);
  if (tiltX) g.rotateX(tiltX);
  g.rotateY(-P.heading + extraYaw);
  g.translate(P.x + P.nx * off, P.y + y, P.z + P.nz * off);
  return g;
}

/** World point at (s, d, y-above-deck). */
export function roadPoint(s, off, y, out = new THREE.Vector3()) {
  sample(s, P);
  return out.set(P.x + P.nx * off, P.y + y, P.z + P.nz * off);
}

export function roadHeading(s) {
  return sample(s, P).heading;
}

/** Steel arch-truss walls on both sides + overhead ties (the trestle of the ruins). */
export function trussGeometry(a, b, halfWidth, r) {
  const geos = [];
  const H = 9 + r() * 3;
  for (const side of [-1, 1]) {
    const off = side * (halfWidth + 1.4);
    geos.push(ribbon(a, b, off - 0.35, off + 0.35, H, H - 0.7));
    geos.push(ribbon(a, b, off - 0.3, off + 0.3, 1.6, 1.0));
    for (let s = a; s < b; s += 5) {
      geos.push(roadBox(0.5, H, 0.5, s, off, H / 2));
      const diag = Math.atan2(5, H - 1.2);
      geos.push(roadBox(0.22, Math.hypot(5, H - 1.2), 0.22, s + 2.5, off, 1.3 + (H - 1.2) / 2, diag));
      geos.push(roadBox(0.22, Math.hypot(5, H - 1.2), 0.22, s + 2.5, off, 1.3 + (H - 1.2) / 2, -diag));
    }
  }
  for (let s = a; s < b; s += 10) {
    geos.push(roadBox((halfWidth + 1.4) * 2, 0.5, 0.6, s, 0, H - 0.3));
    geos.push(roadBox((halfWidth + 1.4) * 2, 0.25, 0.25, s + 5, 0, H - 2.2));
  }
  return geos;
}

/** Overpass crossing at s. Returns geometry + where its broken lip hangs over the road. */
export function overpassGeometry(s, r, broken) {
  sample(s, P);
  const geos = [];
  const lift = 9.5 + r() * 2;
  const skew = (r() - 0.5) * 0.5;
  const span = 160;
  const dir = new THREE.Vector3(P.tx, 0, P.tz).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 + skew);
  const center = new THREE.Vector3(P.x, P.y + lift, P.z);
  const yaw = Math.atan2(dir.x, dir.z);
  const piece = (from, to) => {
    const len = to - from;
    const mid = (from + to) / 2;
    const g = new THREE.BoxGeometry(12, 1.6, len).rotateY(yaw);
    g.translate(center.x + dir.x * mid, center.y, center.z + dir.z * mid);
    geos.push(g);
    const rail = new THREE.BoxGeometry(0.3, 1.0, len).rotateY(yaw);
    for (const o of [-5.8, 5.8]) {
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(o);
      geos.push(rail.clone().translate(center.x + dir.x * mid + side.x, center.y + 1.3, center.z + dir.z * mid + side.z));
    }
  };
  if (broken) {
    piece(-span / 2, -4 - r() * 3);
    piece(5 + r() * 4, span / 2);
  } else {
    piece(-span / 2, span / 2);
  }
  for (const o of [-14, 14, -40, 40]) {
    const px = center.x + dir.x * o;
    const pz = center.z + dir.z * o;
    geos.push(box(1.8, lift + 40, 1.8, px, center.y - (lift + 40) / 2 - 0.8, pz));
  }
  return { geos, center, dir, lift };
}
