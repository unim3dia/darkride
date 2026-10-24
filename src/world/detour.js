// A detour off a left-hand ramp: a hard right that corkscrews down two turns,
// swings under the ring road into a cave (wet floor, rock, almost no light),
// then veers out to the left, climbs, and merges back onto the highway.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { sample, DETOUR } from './track.js';
import { Spur, spurRibbon } from './spur.js';

const HW = ROAD.HALF_WIDTH;
const LOOPS = 2;
const S = {};
const P = {};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Ring (s, d) to world, at height y. */
function ringPoint(s, d, y) {
  sample(s, S);
  return [S.x + S.nx * d, S.z + S.nz * d, y];
}

/** The whole route as raw [x, z, y, u] points; u maps back to the loop for streaming. */
function routePoints(plan, spur) {
  const { R, CAVE_Y, OUT_D } = DETOUR;
  const span = plan.sEnd - plan.sBranch;
  const uOf = (s) => (s - plan.sBranch) / span;
  let tB = 0;
  while (tB < spur.N - 1 && spur.U[tB] < DETOUR.U_BRANCH) tB++;
  const yB = spur.Y[tB] - 0.03; // a hair under the ramp where they overlap, so the ramp draws on top
  const yL = CAVE_Y + 1;
  const raw = [];

  // the corkscrew: constant right turn, LOOPS turns, ending pointed along the loop
  const th0 = plan.theta0;
  const cs = plan.sBranch - R * Math.sin(th0);
  const cd = plan.dB + R * Math.cos(th0);
  const LA = R * (Math.PI * 2 * LOOPS - th0);
  for (let a = 0; a < LA; a += 0.5) {
    const th = th0 + a / R;
    const s = cs + R * Math.sin(th);
    const d = cd - R * Math.cos(th);
    // mostly a steady grade, eased at both ends
    const x = Math.min(1, Math.max(0, (a - 6) / (LA - 6)));
    const y = yB - (yB - yL) * (0.5 * x + 0.5 * x * x * (3 - 2 * x));
    raw.push([...ringPoint(s, d, y), uOf(s)]);
  }

  // then along the loop: into the cave under the road, out to the left, up, and in
  for (let s = plan.sL; s <= plan.sEnd; s += 1) {
    let d;
    if (s < plan.sC0) d = plan.dL * (1 - smooth(plan.sL, plan.sC0, s));
    else if (s < plan.sC1) d = 0;
    else if (s < plan.sM0) d = OUT_D * smooth(plan.sC1, plan.sV, s);
    else d = OUT_D * (1 - smooth(plan.sM0, plan.sEnd, s));
    const deck = sample(s, S).y;
    let y;
    if (s < plan.sC0) y = yL + (CAVE_Y - yL) * smooth(plan.sL, plan.sC0, s);
    else if (s < plan.sC1) y = CAVE_Y + 0.7 * Math.sin((s - plan.sC0) / 23) * Math.sin(Math.PI * (s - plan.sC0) / (plan.sC1 - plan.sC0));
    else if (s < plan.sM0) y = CAVE_Y + (deck - CAVE_Y) * smooth(plan.sC1, plan.sM0, s);
    else y = deck;
    raw.push([...ringPoint(s, d, y), uOf(s)]);
  }
  return { raw, center: { s: cs, d: cd }, yTop: yB };
}

export class Detour extends Spur {
  constructor(plan, spur) {
    const route = routePoints(plan, spur);
    super({ kind: 'detour', side: 1, sA: plan.sBranch, sB: plan.sEnd, uSep: 0, raw: route.raw });
    this.plan = plan;
    this.parent = spur;
    this.center = route.center;
    this.yTop = route.yTop;
    this.name = plan.name;
    this.sub = plan.sub;
    // stations along the route, in meters
    this.tLoopEnd = Math.floor(DETOUR.R * (Math.PI * 2 * LOOPS - plan.theta0) * 0.98);
    this.tCaveA = this.tAtS(plan.sL + 0.5 * DETOUR.S_LEN);
    this.tCaveB = this.tAtS(plan.sC1 + 0.65 * DETOUR.VEER);
    this.tOpen = this.tAtS(plan.open[0]);
    this.tSepA = 0;
    this.tSepB = this.N - 1;
    // where it leaves the ramp: the ramp's right-hand wall gives way
    let tB = 0;
    while (tB < spur.N - 1 && spur.U[tB] < DETOUR.U_BRANCH) tB++;
    this.parentT = tB;
    spur.openings.push([tB - 8, tB + 46, 1]);
    // supports keep clear of the corkscrew
    const [cx, cz] = this.centerXZ();
    spur.keepClear = (x, z) => Math.hypot(x - cx, z - cz) < DETOUR.R + 12 || this.distance(x, z) < 22;
  }

  centerXZ() {
    return ringPoint(this.center.s, this.center.d, 0).slice(0, 2);
  }

  /**
   * The corkscrew's turns sit straight above one another, so a flat projection
   * can't tell them apart: try each turn and keep the one at the car's height.
   */
  query(x, z, y) {
    const r = super.query(x, z);
    if (!r || y === undefined || r.t > this.tLoopEnd + 40) return r;
    const lap = 2 * Math.PI * DETOUR.R;
    let best = r;
    for (let k = -LOOPS; k <= LOOPS; k++) {
      if (!k) continue;
      const t = r.t + k * lap;
      if (t < 0 || t > this.N - 2) continue;
      const c = this.project(x, z, t);
      if (c.ok && Math.abs(c.d) < 40 && Math.abs(c.y - y) < Math.abs(best.y - y)) best = c;
    }
    this.hint = best.t;
    return best;
  }

  /** First station at or past loop distance s, searching after the corkscrew. */
  tAtS(s) {
    let t = this.tLoopEnd;
    while (t < this.N - 2 && this.ringS(t) < s) t++;
    return t;
  }

  /** Walls everywhere but the branch, and the right side where it merges. */
  walled(t, side = 0) {
    if (t < 34) return false;
    if (t > this.tOpen && side >= 0) return false;
    return t < this.N - 24;
  }

  inCave(t) {
    return t > this.tCaveA && t < this.tCaveB;
  }

  /** 0 outside, 1 well inside the cave. */
  caveWeight(t) {
    return smooth(this.tCaveA, this.tCaveA + 30, t) * (1 - smooth(this.tCaveB - 30, this.tCaveB, t));
  }

  /**
   * How big the cave is at t: mostly a low cave, two tight squeezes, a small
   * chamber, and one huge hall with daylight falling in from a shaft.
   */
  caveSize(t) {
    const L = this.tCaveB - this.tCaveA;
    const f = (t - this.tCaveA) / L;
    const bump = (a, b, x) => smooth(a - 0.05, a, x) * (1 - smooth(b, b + 0.05, x));
    let w = 10.5;
    let h = 8;
    const tight = Math.max(bump(0.17, 0.25, f), bump(0.66, 0.72, f));
    w += (8.9 - w) * tight;
    h += (4.4 - h) * tight;
    const hall = bump(0.4, 0.56, f);
    w += (30 - w) * hall;
    h += (19 - h) * hall;
    const room = bump(0.82, 0.88, f);
    w += (17 - w) * room;
    h += (12.5 - h) * room;
    return { w, h };
  }

  /** Keep a chase camera inside the rock. */
  clipCamera(to) {
    const h = this.query(to.x, to.z, to.y);
    if (!h || !this.inCave(h.t)) return to;
    const size = this.caveSize(h.t);
    const d = THREE.MathUtils.clamp(h.d, -(size.w - 3.5), size.w - 3.5);
    const y = THREE.MathUtils.clamp(to.y, h.y + 0.9, h.y + Math.max(2.6, size.h - 1.6));
    this.sample(h.t, P);
    return to.clone().set(to.x + P.nx * (d - h.d), y, to.z + P.nz * (d - h.d));
  }
}

// ---------------------------------------------------------------- the cave

const n2 = (a, b) => Math.sin(a * 0.21 + b * 1.7) * 0.5 + Math.sin(a * 0.093 - b * 2.9 + 1.3) * 0.35 + Math.sin(a * 0.47 + b * 5.1 + 4.2) * 0.15;

/** A rough rock tube around the road: an arch over a wet floor, its size breathing along the way. */
function caveGeometry(det, t0, t1) {
  const ARCH = 26;
  const FLOOR = 8;
  const K = ARCH + FLOOR;
  const step = 2;
  const rows = Math.ceil((t1 - t0) / step) + 1;
  const pos = new Float32Array(rows * K * 3);
  for (let j = 0; j < rows; j++) {
    const t = Math.min(t1, t0 + j * step);
    det.sample(t, P);
    const { w, h } = det.caveSize(Math.min(det.tCaveB, Math.max(det.tCaveA, t)));
    const mouth = 1 + 0.55 * (1 - smooth(0, 16, Math.min(t - t0, t1 - t)));
    for (let k = 0; k < K; k++) {
      let x;
      let y;
      if (k < ARCH) {
        const phi = (k / (ARCH - 1)) * Math.PI;
        const r = (1 + 0.22 * n2(t, phi * 3) + 0.08 * n2(t * 3.1, phi * 7)) * mouth;
        x = Math.cos(phi) * w * r;
        y = Math.max(-0.4, Math.sin(phi) * h * r * (1 + 0.14 * n2(t * 0.5, phi)) - 0.4);
      } else {
        const f = (k - ARCH + 1) / (FLOOR + 1);
        x = w * mouth * (1 - 2 * f);
        y = -0.45 + (Math.abs(x) > HW + 1 ? 0.5 * n2(t, f * 9) + 0.3 : 0.08 * n2(t, f * 9));
      }
      const i = (j * K + k) * 3;
      pos[i] = P.x + P.nx * x;
      pos[i + 1] = P.y + y;
      pos[i + 2] = P.z + P.nz * x;
    }
  }
  const idx = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let k = 0; k < K; k++) {
      const a = j * K + k;
      const b = j * K + ((k + 1) % K);
      idx.push(a, a + K, b, b, a + K, b + K);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Things hanging from the roof and lying on the floor. */
function caveDressing(det, t0, t1, r) {
  const rocks = [];
  for (let t = t0 + 6; t < t1 - 6; t += 2.5 + r() * 4) {
    det.sample(t, P);
    const { w, h } = det.caveSize(Math.min(det.tCaveB, Math.max(det.tCaveA, t)));
    const x = (r() - 0.5) * 1.5 * w;
    const top = h * Math.sqrt(Math.max(0, 1 - (x / w) ** 2)) - 0.8;
    const room = top - 2.4; // never low enough to hit the car
    const len = Math.min(room, 0.8 + r() * (h > 10 ? 7 : 3) * (Math.abs(x) > 4 ? 1 : 0.5));
    if (len > 0.4) {
      const g = new THREE.ConeGeometry(0.18 + r() * (h > 10 ? 1.4 : 0.5), len, 5).rotateX(Math.PI).translate(0, top - len / 2, 0);
      rocks.push(g.rotateY(-P.heading).translate(P.x + P.nx * x, P.y, P.z + P.nz * x));
    }
    if (r() < 0.5) {
      const side = r() < 0.5 ? -1 : 1;
      const off = HW + 1.6 + r() * Math.max(0.5, w - HW - 3);
      const b = new THREE.DodecahedronGeometry(0.6 + r() * (w > 15 ? 3 : 1.4), 0).scale(1, 0.6 + r() * 0.6, 1);
      rocks.push(b.translate(P.x + P.nx * side * off, P.y - 0.2, P.z + P.nz * side * off));
      // in the big rooms, columns where roof and floor have grown together
      if (w > 15 && r() < 0.35) {
        const c = new THREE.CylinderGeometry(0.7 + r(), 1.4 + r() * 1.5, h * 1.3, 7).translate(0, h * 0.55, 0);
        rocks.push(c.translate(P.x + P.nx * side * (off + 2), P.y, P.z + P.nz * side * (off + 2)));
      }
    }
  }
  return rocks;
}

/** Specks of cold light on the roof, so faint you wonder if they're there. */
function glowworms(det, t0, t1, r) {
  const pts = [];
  for (let i = 0; i < 360; i++) {
    const t = t0 + r() * (t1 - t0);
    det.sample(t, P);
    const { w, h } = det.caveSize(Math.min(det.tCaveB, Math.max(det.tCaveA, t)));
    const phi = 0.35 + r() * (Math.PI - 0.7);
    const x = Math.cos(phi) * (w - 0.9);
    const y = Math.sin(phi) * (h - 0.8) - 0.4;
    pts.push(P.x + P.nx * x, P.y + y, P.z + P.nz * x);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    color: new THREE.Color(0.1, 0.28, 0.27), size: 0.08, sizeAttenuation: true,
    transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
}

/**
 * Daylight down a shaft: a pale opening high in the roof of each big room, a
 * shaft of dusty light leaning down to the floor, and the pool where it lands.
 */
function skylights(det, r) {
  const L = det.tCaveB - det.tCaveA;
  const group = new THREE.Group();
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float edge = sin(vUv.x * 3.14159);
        float motes = 0.75 + 0.25 * sin(vUv.y * 40.0 + uTime * 0.7 + vUv.x * 9.0);
        float fall = mix(0.35, 1.0, vUv.y);
        gl_FragColor = vec4(vec3(0.62, 0.68, 0.74) * edge * edge * motes * fall * 0.09, 1.0);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const openMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.55, 0.6), fog: false });
  const poolMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.055, 0.06), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
  for (const f of [0.48, 0.85]) {
    const t = det.tCaveA + f * L;
    det.sample(t, P);
    const { w, h } = det.caveSize(t);
    const side = f < 0.6 ? 1 : -1;
    const top = new THREE.Vector3(P.x + P.nx * side * w * 0.35, P.y + h * 0.92, P.z + P.nz * side * w * 0.35);
    const floor = new THREE.Vector3(P.x + P.nx * side * w * 0.12, P.y, P.z + P.nz * side * w * 0.12);
    const len = top.distanceTo(floor);
    const rad = f < 0.6 ? 3.2 : 1.8;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.7, len, 20, 1, true), beamMat);
    beam.position.copy(top).add(floor).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(floor).normalize());
    const hole = new THREE.Mesh(new THREE.CircleGeometry(rad * 0.9, 18).rotateX(Math.PI / 2), openMat);
    hole.position.copy(top).y -= 0.2;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(rad * 1.9, 24).rotateX(-Math.PI / 2), poolMat);
    pool.position.copy(floor).y += 0.08;
    group.add(beam, hole, pool);
  }
  group.userData.update = (time) => { beamMat.uniforms.uTime.value = time; };
  return group;
}

// ---------------------------------------------------------------- the way down

/**
 * The corkscrew isn't built, it's worn: a channel in old stone, scooped in the
 * middle where water ran, with ragged banks and a broken underside.
 */
function carvedChannel(det, t0, t1) {
  const pts = [];
  const K = 14;
  const step = 2;
  const rows = Math.ceil((t1 - t0) / step) + 1;
  const ring = [];
  for (let j = 0; j < rows; j++) {
    const t = Math.min(t1, t0 + j * step);
    det.sample(t, P);
    const grow = smooth(t0, t0 + 30, t); // the branch starts flush with the ramp
    const row = [];
    for (let k = 0; k < K; k++) {
      // across the top: bank, scoop, bank; then round under the bottom
      let x;
      let y;
      if (k < 9) {
        const f = k / 8;
        x = (f * 2 - 1) * (HW + 1.6 + 1.2 * n2(t * 0.7, k));
        const edge = Math.max(0, Math.abs(x) - (HW - 0.6));
        y = 0.04 - 0.05 * Math.cos(f * Math.PI * 2) + grow * (edge * edge * 0.55 + Math.max(0, edge) * 0.4 * (1 + n2(t, k * 2)));
      } else {
        const f = (k - 9) / 4;
        x = (1 - f * 2) * (HW + 1.2) * (0.8 + 0.3 * n2(t, k));
        y = -1.4 - grow * (2.6 + 1.8 * n2(t * 0.4, k * 1.3)) * Math.sin(f * Math.PI + 0.3);
      }
      row.push([P.x + P.nx * x, P.y + y, P.z + P.nz * x]);
    }
    ring.push(row);
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let k = 0; k < K; k++) {
      const a = ring[j][k], b = ring[j][(k + 1) % K], c = ring[j + 1][k], d = ring[j + 1][(k + 1) % K];
      pts.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  return g;
}

/** The column the corkscrew winds around: a pillar of stone the water left standing. */
function stonePillar(cx, cz, yTop) {
  const g = new THREE.CylinderGeometry(3.2, 5.5, 96, 16, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.22 * n2(y * 0.4, a * 2) + 0.12 * n2(y * 1.3, a * 5);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return g.translate(cx, yTop - 46, cz);
}

/**
 * Build everything you see: the worn way down, the cave, the climb back out.
 * `mats` lends the ramp's own asphalt, paint and concrete for the built part.
 */
export function buildDetourMeshes(det, mats, merge, r) {
  const group = new THREE.Group();
  const open = [];
  const cave = [];
  const lines = [];
  const walls = [];
  const steel = [];
  // down to the cave: carved stone
  const carvedEnd = det.tCaveA + 10;
  group.add(new THREE.Mesh(carvedChannel(det, 0, carvedEnd), mats.stone));
  for (let t = carvedEnd - 12; t < det.N - 2; t += 16) {
    const t1 = Math.min(det.N - 1.01, t + 16);
    const inCave = t1 <= det.tCaveB;
    (inCave ? cave : open).push(spurRibbon(det, t, t1, -HW - 0.8, HW + 0.8, 0.04, inCave ? 0 : -1.3));
    if (!inCave) for (const s of [-1, 1]) lines.push(spurRibbon(det, t, t1, s * (HW - 0.5) - 0.08, s * (HW - 0.5) + 0.08, 0.06, 0.04));
  }
  // the climb back out is built: low walls over the void, posts underneath
  const wall = (t0, t1, s) => { if (t1 - t0 > 4) walls.push(spurRibbon(det, t0, t1, s * (HW + 0.35) - 0.35, s * (HW + 0.35) + 0.35, 0.99, 0.04, 4)); };
  for (const s of [-1, 1]) wall(det.tCaveB - 4, s > 0 ? det.tOpen : det.N - 24, s);
  for (let t = det.tCaveB + 10; t < det.tOpen; t += 26) {
    det.sample(t, P);
    for (const s of [-1, 1]) steel.push(new THREE.BoxGeometry(1.2, 50, 1.2).translate(P.x + P.nx * s * 5, P.y - 26.3, P.z + P.nz * s * 5).toNonIndexed());
  }
  const [cx, cz] = det.centerXZ();
  group.add(new THREE.Mesh(stonePillar(cx, cz, det.yTop), mats.stone));
  group.add(new THREE.Mesh(merge(open), mats.asphalt));
  group.add(new THREE.Mesh(merge(cave), mats.caveFloor));
  group.add(new THREE.Mesh(merge(lines), mats.paint));
  group.add(new THREE.Mesh(merge(walls), mats.concrete));
  group.add(new THREE.Mesh(merge(steel), mats.steel));
  const c0 = det.tCaveA - 6;
  const c1 = det.tCaveB + 6;
  group.add(new THREE.Mesh(caveGeometry(det, c0, c1), mats.rock));
  group.add(new THREE.Mesh(merge(caveDressing(det, c0, c1, r)), mats.rock));
  group.add(glowworms(det, c0, c1, r));
  const sky = skylights(det, r);
  group.add(sky);
  group.userData.update = sky.userData.update;
  return group;
}
