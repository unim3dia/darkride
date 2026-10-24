// An off-ramp: a road that peels off the loop, swings out across a pocket world,
// and merges back further on. Sampled at 1 m so it can be queried like the loop.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { sample, elevation } from './track.js';

const HW = ROAD.HALF_WIDTH;
const S = {};
const P = {};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Spur {
  constructor(def) {
    const { at: fraction, raw, ...rest } = def; // `at` is the config's loop fraction; at() is a method here
    Object.assign(this, rest);
    this.fraction = fraction;
    this.openings = [];  // [t0, t1, side]: stretches where a wall gives way (a branch leaves here)
    this.build(raw || this.rampPoints());
  }

  /** The off-ramp's own shape: out across the void on a sine bump, and back. [x, z, y, u] per point. */
  rampPoints() {
    const RAW = 3200;
    const span = this.sB - this.sA;
    const eA = elevation(this.sA);
    const eB = elevation(this.sB);
    const raw = [];
    for (let i = 0; i <= RAW; i++) {
      const u = i / RAW;
      sample(this.sA + u * span, S);
      const bump = Math.sin(Math.PI * u) ** 2;
      const d = this.side * this.D * bump;
      // shares the highway's surface while they overlap, then finds its own height
      const k = smooth(this.uSep * 0.6, this.uSep * 2.4, Math.min(u, 1 - u));
      // deep in the pocket, where the road is barely there, it rolls: light hills, up and down
      const roll = smooth(0.2, 0.3, u) * (1 - smooth(0.7, 0.8, u));
      const hills = roll * (2.2 * Math.sin(u * span / 15 + this.D) + 0.7 * Math.sin(u * span / 7.7 + 1.3));
      const y = S.y * (1 - k) + (eA + (eB - eA) * u + this.lift * bump + hills) * k;
      raw.push([S.x + S.nx * d, S.z + S.nz * d, y, u]);
    }
    return raw;
  }

  /** Resample raw points to 1 m stations and derive frames, bounds, separation points. */
  build(raw) {
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
    this.len = cum[cum.length - 1];
    const N = Math.floor(this.len) + 1;
    this.X = new Float64Array(N); this.Z = new Float64Array(N); this.Y = new Float64Array(N); this.U = new Float64Array(N);
    let j = 0;
    for (let t = 0; t < N; t++) {
      while (j < raw.length - 2 && cum[j + 1] < t) j++;
      const f = Math.min(1, (t - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j]));
      for (const [arr, k] of [[this.X, 0], [this.Z, 1], [this.Y, 2], [this.U, 3]]) arr[t] = raw[j][k] + (raw[j + 1][k] - raw[j][k]) * f;
    }
    this.N = N;
    this.TX = new Float64Array(N); this.TZ = new Float64Array(N);
    for (let t = 0; t < N; t++) {
      const a = Math.min(N - 1, t + 1);
      const b = Math.max(0, t - 1);
      const dx = this.X[a] - this.X[b];
      const dz = this.Z[a] - this.Z[b];
      const l = Math.hypot(dx, dz) || 1;
      this.TX[t] = dx / l; this.TZ[t] = dz / l;
    }
    this.tSepA = 0;
    while (this.tSepA < N - 1 && this.U[this.tSepA] < this.uSep) this.tSepA++;
    this.tSepB = N - 1;
    while (this.tSepB > 0 && this.U[this.tSepB] > 1 - this.uSep) this.tSepB--;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let t = 0; t < N; t++) {
      minX = Math.min(minX, this.X[t]); maxX = Math.max(maxX, this.X[t]);
      minZ = Math.min(minZ, this.Z[t]); maxZ = Math.max(maxZ, this.Z[t]);
    }
    this.box = { minX, maxX, minZ, maxZ };
    this.hint = -1;
  }

  /** Point and frame at arc length t. Right-hand normal is (nx, nz). */
  sample(t, out = {}) {
    const tt = Math.min(this.N - 1.001, Math.max(0, t));
    const i = Math.floor(tt);
    const f = tt - i;
    out.x = this.X[i] + (this.X[i + 1] - this.X[i]) * f;
    out.z = this.Z[i] + (this.Z[i + 1] - this.Z[i]) * f;
    out.y = this.Y[i] + (this.Y[i + 1] - this.Y[i]) * f;
    out.u = this.U[i] + (this.U[i + 1] - this.U[i]) * f;
    out.tx = this.TX[i]; out.tz = this.TZ[i];
    out.nx = -out.tz; out.nz = out.tx;
    out.heading = Math.atan2(out.tx, -out.tz);
    return out;
  }

  ringS(t) {
    return this.sA + this.sample(t, P).u * (this.sB - this.sA);
  }

  /** World point at (t, lateral d, height above the deck). */
  at(t, d, yRel = 0, out = new THREE.Vector3()) {
    this.sample(t, P);
    return out.set(P.x + P.nx * d, P.y + yRel, P.z + P.nz * d);
  }

  /** Is there a wall on this `side` (sign of d) at t? */
  walled(t, side = 0) {
    for (const [a, b, sd] of this.openings) if (t > a && t < b && (!side || sd === side)) return false;
    return t > this.tSepA && t < this.tSepB;
  }

  /** Brute-force nearest arc length (coarse, then the caller refines). */
  nearestT(x, z) {
    let best = 0;
    let bd = Infinity;
    for (let t = 0; t < this.N; t += 12) {
      const d = (this.X[t] - x) ** 2 + (this.Z[t] - z) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  project(x, z, hint) {
    let t = hint;
    for (let k = 0; k < 6; k++) {
      this.sample(t, P);
      const step = (x - P.x) * P.tx + (z - P.z) * P.tz;
      t = Math.min(this.N - 1.001, Math.max(0, t + Math.max(-60, Math.min(60, step))));
    }
    this.sample(t, P);
    const along = (x - P.x) * P.tx + (z - P.z) * P.tz;
    const d = (x - P.x) * P.nx + (z - P.z) * P.nz;
    return { t, d, y: P.y, nx: P.nx, nz: P.nz, ok: Math.abs(along) < 3 && t > 0.5 && t < this.N - 1.5, spur: this };
  }

  /** Where is (x, z) relative to this ramp? null if it's nowhere near. */
  query(x, z) {
    const b = this.box;
    if (x < b.minX - 30 || x > b.maxX + 30 || z < b.minZ - 30 || z > b.maxZ + 30) { this.hint = -1; return null; }
    if (this.hint < 0) this.hint = this.nearestT(x, z);
    let r = this.project(x, z, this.hint);
    if (!r.ok || Math.abs(r.d) > 40) r = this.project(x, z, this.nearestT(x, z));
    this.hint = r.t;
    return r.ok ? r : null;
  }

  /** Lateral distance from the ramp's centerline (Infinity if not alongside it). */
  distance(x, z) {
    const r = this.project(x, z, this.nearestT(x, z));
    return r.ok ? Math.abs(r.d) : Infinity;
  }
}

/** A tube swept along the ramp, like the highway's ribbon. */
export function spurRibbon(spur, t0, t1, dL, dR, yT, yB, step = 2) {
  const pos = [];
  const n = Math.max(1, Math.ceil((t1 - t0) / step));
  const A = {};
  const B = {};
  const corner = (p, d, y) => [p.x + p.nx * d, p.y + y, p.z + p.nz * d];
  for (let i = 0; i < n; i++) {
    spur.sample(t0 + ((t1 - t0) * i) / n, A);
    spur.sample(t0 + ((t1 - t0) * (i + 1)) / n, B);
    const a0 = corner(A, dL, yT), a1 = corner(A, dR, yT), a2 = corner(A, dR, yB), a3 = corner(A, dL, yB);
    const b0 = corner(B, dL, yT), b1 = corner(B, dR, yT), b2 = corner(B, dR, yB), b3 = corner(B, dL, yB);
    const quad = (p, q, r, s) => pos.push(...p, ...q, ...r, ...p, ...r, ...s);
    quad(a0, b0, b1, a1);
    quad(a1, b1, b2, a2);
    quad(a2, b2, b3, a3);
    quad(a3, b3, b0, a0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A box standing on the ramp's frame at (t, d), base `y0` above the deck. */
export function spurBox(spur, w, h, d, t, off, y0, tiltX = 0) {
  spur.sample(t, P);
  const g = new THREE.BoxGeometry(w, h, d);
  if (tiltX) g.rotateX(tiltX);
  g.rotateY(-P.heading);
  return g.translate(P.x + P.nx * off, P.y + y0 + h / 2, P.z + P.nz * off);
}

export { HW };
