// THE SCORE FOR THE HERD.
//
// The bridge is read like a piece of music, and every proportion in it comes
// from the golden ratio φ, the number living things grow by: shells, horns,
// antlers, the seeds in a sunflower. The acts begin at the golden sections of
// the bridge (powers of 1/φ), the herd breathes once every φ seconds, the vortex
// lays its shards on the golden angle, and the low drone is tuned to φ intervals
// over 432 Hz, the "natural" A. Nothing happens at random times.
//
//   I    SEED       0     – 0.236   the animals are only constellations: points of
//                                    light in the shape of a beast, among old trees
//   II   KINDLING   0.236 – 0.382   flesh gathers around the light, frail, slow
//   III  THE HERD   0.382 – 0.618   bodies, breathing in and out of form on the
//                                    φ-second breath; flashes of definition at the crest
//   IV   THE VORTEX 0.618 – 0.854   a golden spiral opens ahead of you; shards stream
//                                    into its arms; runes surface in the air
//   V    RETURN     0.854 – 1       the titans; then every body gives itself back to
//                                    light and the spiral swallows the road's end
import * as THREE from 'three';
import { merge } from './props.js';

export const PHI = (1 + Math.sqrt(5)) / 2;
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈137.5°: how leaves and seeds are spaced
export const BREATH = PHI;                                // seconds per breath of the herd
export const ACTS = [0, 1 / PHI ** 3, 1 / PHI ** 2, 1 / PHI, 1 - 1 / PHI ** 4, 1];
export const ACT_NAMES = ['SEED', 'KINDLING', 'THE HERD', 'THE VORTEX', 'RETURN'];
export const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Everything the score asks for at fraction u of the bridge. */
export function scoreAt(u) {
  const [, a1, a2, a3, a4] = ACTS;
  const act = ACTS.findIndex((a, i) => u >= a && u < (ACTS[i + 1] ?? 2));
  return {
    act: Math.max(0, Math.min(4, act)),
    // how much flesh the bodies may have
    body: ss(a1 * 0.62, a2, u) * (1 - 0.7 * ss(0.93, 1, u)),
    // how strongly the light-constellations show (always a trace, for the presence of the beast)
    stars: Math.max(0.25, 1 - ss(a1, a2, u)) + 0.75 * ss(0.92, 1, u),
    // size, speed and noise: the crescendo
    swell: 0.14 + 0.86 * ss(0, a4, u),
    vortex: ss(a3 - 0.06, a3 + 0.08, u),
    runes: ss(a3, a3 + 0.1, u),
    // trees stand thick at the start and give way to the herd
    trees: 1 - 0.6 * ss(a2, a3, u),
  };
}

// ---------------------------------------------------------------- constellations

/** A point cloud on the surface of a body: the beast as stars. */
export function constellationGeo(bodyGeo, every = 7) {
  const p = bodyGeo.attributes.position;
  const pts = [];
  for (let i = 0; i < p.count; i += every) pts.push(p.getX(i), p.getY(i), p.getZ(i));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

export function constellationMat(size) {
  return new THREE.PointsMaterial({
    color: new THREE.Color(0.55, 0.85, 1.0), size, sizeAttenuation: true,
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
}

// ---------------------------------------------------------------- the vortex

/**
 * A sunflower of shards hanging over the road ahead: seed n sits at radius
 * c·√n and angle n·(golden angle), so the arms you see are Fibonacci spirals.
 * The whole disc turns, and every shard drifts slowly inward to the eye.
 */
export class Vortex {
  constructor(group, N = 2584) { // a Fibonacci number
    this.N = N;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.6, 0, -0.5, -0.45, 0, 0.55, -0.35, 0.05], 3));
    this.dark = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x0a0e14, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }), N);
    this.dark.frustumCulled = false;
    const glow = new THREE.BufferGeometry();
    glow.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.glow = new THREE.Points(glow, new THREE.PointsMaterial({ color: new THREE.Color(0.7, 0.85, 1.0), size: 0.9, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.glow.frustumCulled = false;
    // a pale eye of light at the centre
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(235,245,255,1)');
    gr.addColorStop(0.25, 'rgba(160,200,240,0.5)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    this.eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    group.add(this.dark, this.glow, this.eye);
    this.drift = new Float32Array(N).map(() => Math.random());
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.sc = new THREE.Vector3();
  }

  /** Centre `C`, facing back along tangent `T`, radius R, at strength w. */
  update(time, C, T, R, w) {
    const vis = w > 0.01;
    this.dark.visible = this.glow.visible = this.eye.visible = vis;
    if (!vis) return;
    const right = new THREE.Vector3(-T.z, 0, T.x).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const gp = this.glow.geometry.attributes.position.array;
    const spin = time * 0.618 * 0.35;
    for (let n = 0; n < this.N; n++) {
      // drift inward: each seed's place slides toward the eye and wraps out again
      const k = ((n / this.N) - time * 0.021 * (0.5 + this.drift[n]) % 1 + 1) % 1;
      const idx = k * this.N;
      const r = R * Math.sqrt(idx / this.N);
      const a = idx * GOLDEN_ANGLE + spin * (1 + 2.5 * (1 - r / R));
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 0.62;
      const depth = (1 - r / R) * R * 0.25;
      this.v.copy(C).addScaledVector(right, x).addScaledVector(up, y).addScaledVector(T, depth);
      const s = (0.4 + 2.2 * (r / R)) * w;
      this.e.set(a * 3 + n, a, n * 0.37);
      this.dark.setMatrixAt(n, this.m.compose(this.v, this.q.setFromEuler(this.e), this.sc.setScalar(s)));
      gp[n * 3] = this.v.x; gp[n * 3 + 1] = this.v.y; gp[n * 3 + 2] = this.v.z;
    }
    this.dark.instanceMatrix.needsUpdate = true;
    this.glow.geometry.attributes.position.needsUpdate = true;
    this.dark.material.opacity = 0.85 * w;
    this.glow.material.opacity = 0.55 * w;
    this.eye.position.copy(C).addScaledVector(T, R * 0.25);
    this.eye.scale.setScalar(R * (0.55 + 0.08 * Math.sin(time * 2 * Math.PI / BREATH)));
    this.eye.material.opacity = 0.9 * w;
  }
}

// ---------------------------------------------------------------- runes

/** A rune drawn the old way: a stave and a few branches, all straight cuts. */
function runeTexture(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  let s = seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.strokeStyle = 'rgba(255,225,170,1)';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.shadowColor = 'rgba(255,200,120,0.9)';
  g.shadowBlur = 8;
  g.beginPath();
  g.moveTo(32, 8); g.lineTo(32, 56);
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const y0 = 10 + r() * 30;
    const side = r() < 0.5 ? -1 : 1;
    g.moveTo(32, y0);
    g.lineTo(32 + side * (10 + r() * 10), y0 + (r() - 0.3) * 22);
    if (r() < 0.4) g.lineTo(32, y0 + 18);
  }
  g.stroke();
  return new THREE.CanvasTexture(c);
}

/** Runes that surface along the herd: drifting, turning, glowing, gone. */
export class Runes {
  constructor(group, N = 34) {
    const tex = FIB.slice(2, 10).map((f, i) => runeTexture(f * 7 + i));
    this.list = Array.from({ length: N }, (_, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[i % tex.length], color: new THREE.Color(i % 3 ? 1.2 : 0.7, i % 3 ? 1.0 : 1.1, i % 3 ? 0.7 : 1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      group.add(sp);
      return { sp, s: (i / N) * 160 - 40, d: (i % 2 ? 1 : -1) * (6 + (i * PHI * 7) % 26), h: 2 + (i * PHI * 3) % 14, ph: i * GOLDEN_ANGLE };
    });
  }

  update(dt, time, road, t, w) {
    const Q = {};
    for (const r of this.list) {
      r.s -= dt * 6;
      if (r.s < -40) r.s += 160;
      const life = Math.max(0, Math.sin((time / BREATH) * 0.5 + r.ph));
      r.sp.material.opacity = w * life * 0.9;
      r.sp.visible = w > 0.01;
      road.sample(t + r.s, Q);
      r.sp.position.set(Q.x + Q.nx * r.d, Q.y + r.h + Math.sin(time + r.ph) * 0.6, Q.z + Q.nz * r.d);
      r.sp.scale.setScalar(1.6 + life);
    }
  }
}

// ---------------------------------------------------------------- the old trees

/** A gnarled tree: a leaning trunk that splits by the golden ratio, with vines hanging. */
export function treeGeo(seed) {
  let s = seed * 7919 + 13;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const wood = [];
  const vines = [];
  const grow = (a, dir, len, rad, depth) => {
    const b = a.clone().addScaledVector(dir, len);
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3((r() - 0.5) * len * 0.25, 0, (r() - 0.5) * len * 0.25));
    wood.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 5, rad, 6));
    if (depth >= 4) {
      // vines from the tips
      if (r() < 0.6) {
        const drop = 2 + r() * 6;
        vines.push(new THREE.CylinderGeometry(0.025, 0.02, drop, 3).translate(b.x, b.y - drop / 2, b.z));
      }
      return;
    }
    const kids = depth < 1 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const turn = (k * GOLDEN_ANGLE) + r();
      const nd = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn)
        .add(new THREE.Vector3(Math.cos(turn) * 0.7, 0.25 + r() * 0.35, Math.sin(turn) * 0.7)).normalize();
      grow(b, nd, len / PHI * (0.85 + r() * 0.3), rad / PHI, depth + 1);
    }
  };
  grow(new THREE.Vector3(0, -2, 0), new THREE.Vector3((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5).normalize(), 9 + r() * 5, 0.9 + r() * 0.5, 0);
  return { wood: merge(wood), vines: merge(vines) };
}

/** Old trees in rows along the bridge, spaced by Fibonacci numbers, thinning as the herd comes. */
export function buildForest(road, group) {
  const variants = [0, 1, 2, 3, 4].map(treeGeo);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x141a16, roughness: 0.95 });
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x1e3324, roughness: 0.9 });
  const trees = [];
  let t = road.N * 0.16;
  let i = 0;
  while (t < road.N * 0.84) {
    const P = road.sample(t);
    for (const side of [-1, 1]) {
      const d = side * (7 + FIB[(i + (side > 0 ? 3 : 5)) % 8] * 1.6);
      const v = variants[(i * 3 + (side > 0 ? 1 : 0)) % variants.length];
      const tg = new THREE.Group();
      tg.add(new THREE.Mesh(v.wood, woodMat), new THREE.Mesh(v.vines, vineMat));
      const k = 0.9 + ((i * PHI) % 1) * 0.9;
      tg.scale.set(k, k * (1 + (i % 3) * 0.15), k);
      tg.position.set(P.x + P.nx * d, P.y - 0.8, P.z + P.nz * d);
      tg.rotation.y = i * GOLDEN_ANGLE;
      group.add(tg);
      trees.push({ g: tg, u: t / road.N });
    }
    t += 13 + FIB[i % 7] * 2;
    i++;
  }
  return trees;
}

/** Vines and moss creeping in from the bridge's edges. */
export function buildVines(road, group) {
  const geos = [];
  for (let t = road.N * 0.16; t < road.N * 0.84; t += 3 + ((t * PHI) % 5)) {
    const P = road.sample(t);
    for (const side of [-1, 1]) {
      if (((t * PHI * side) % 1 + 1) % 1 < 0.45) continue;
      const pts = [];
      let d = side * (3.7 + Math.random() * 0.6);
      let tt = t;
      for (let k = 0; k < 6; k++) {
        const Q = road.sample(tt);
        pts.push(new THREE.Vector3(Q.x + Q.nx * d, Q.y + 0.08, Q.z + Q.nz * d));
        tt += 0.8 + Math.random();
        d -= side * (0.15 + Math.random() * 0.45);
      }
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.04 + Math.random() * 0.05, 4));
    }
  }
  group.add(new THREE.Mesh(merge(geos), new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.8, emissive: 0x0c1f12 })));
}
