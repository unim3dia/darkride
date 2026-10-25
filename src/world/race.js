// THE CIRCUIT. Just past the Narrows a left-hand exit peels off the ring and the
// road turns to pale ice. You roll to a stop on a grid beside an idling limo,
// three lamps count down, and it's one long lap before the road rejoins the ring.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { RACE } from './track.js';
import { Spur } from './spur.js';
import { buildStaticCar } from '../player/carModel.js';
import { buildBeam } from '../player/carLights.js';

const HW = ROAD.HALF_WIDTH;
export const LAPS = 1;
const P = {};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The circuit's palette: the Ether's pale air, brighter, faster. */
export const RACE_PALETTE = { fog: 0xa4aab2, skyTop: 0x60666e, skyHorizon: 0xc2c8d0, glow: 0xe2e8f0, light: 0.6, exposure: 1.0, fogMul: 1.25, grain: 1.8, rain: 0 };

/**
 * The circuit is an off-ramp: it leaves the ring, swings out in one long lap
 * across the pale, and rejoins. The grid sits just after it leaves the highway.
 */
export class RaceTrack extends Spur {
  constructor() {
    super(RACE);
    this.kind = 'race';
    this.t0 = this.tSepA;
    this.t1 = this.tSepB;
    const at = (u) => { let t = 0; while (t < this.N - 1 && this.U[t] < u) t++; return t; };
    this.tGrid = at(0.17);
    this.tLine = this.tGrid + 14;
    this.tFinish = at(0.86);
    const b = this.box;
    this.center = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  }

  wrap(t) { return Math.min(this.N - 1.001, Math.max(0, t)); }

  /** How hard the road bends over the next `ahead` meters (radians of heading change). */
  bend(t, ahead) {
    const a = this.sample(t, {}).heading;
    const b2 = this.sample(t + ahead, {}).heading;
    return Math.abs(Math.atan2(Math.sin(b2 - a), Math.cos(b2 - a)));
  }
}

// ---------------------------------------------------------------- the set

function ribbon(track, d0, d1, y0, y1, step = 3, uvs = null) {
  const pos = [];
  const A = {};
  const B = {};
  for (let t = track.t0; t < track.t1; t += step) {
    track.sample(t, A);
    track.sample(t + step, B);
    const c = (p, d, y) => [p.x + p.nx * d, p.y + y, p.z + p.nz * d];
    const a0 = c(A, d0, y0), a1 = c(A, d1, y0), b0 = c(B, d0, y0), b1 = c(B, d1, y0);
    pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
    if (uvs) { const v0 = t / 20; const v1 = (t + step) / 20; uvs.push(0, v0, 0, v1, 1, v1, 0, v0, 1, v1, 1, v0); }
    if (y1 !== y0) {
      const a2 = c(A, d1, y1), a3 = c(A, d0, y1), b2 = c(B, d1, y1), b3 = c(B, d0, y1);
      pos.push(...a3, ...a0, ...a1, ...a3, ...a1, ...a2);
      pos.push(...a2, ...b2, ...b3, ...a2, ...b3, ...a3);
      pos.push(...a3, ...b3, ...b0, ...a3, ...b0, ...a0);
      pos.push(...a1, ...b1, ...b2, ...a1, ...b2, ...a2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/** Grey marble: soft veins drifting through pale ice. */
function iceTexture() {
  const W = 256;
  const H = 512;
  const G = 32;
  const grid = Array.from({ length: (G + 1) * (G + 1) }, () => Math.random());
  const vnoise = (x, y) => {
    const xi = Math.floor(x) % G;
    const yi = Math.floor(y) % G;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => grid[(j % G) * (G + 1) + (i % G)];
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x / W) * 4;
      const v = (y / H) * 8;
      let turb = 0;
      let amp = 1;
      let f = 1;
      for (let o = 0; o < 4; o++) { turb += vnoise(u * f, v * f) * amp; amp *= 0.5; f *= 2; }
      const vein = Math.pow(Math.abs(Math.sin(u * 1.3 + v * 0.6 + turb * 3.2)), 0.3);
      const tone = 105 + vein * 120 + (turb - 0.9) * 40;
      const i = (y * W + x) * 4;
      img.data[i] = tone * 0.96;
      img.data[i + 1] = tone;
      img.data[i + 2] = tone * 1.04;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The limo: the same land yacht with the middle stretched out, black lacquer, mirror rims. */
function buildLimo() {
  const car = buildStaticCar(false);
  const E = 1.35;
  car.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      p.setZ(i, z < -0.9 ? z - E : z > 0.9 ? z + E : z * (0.9 + E) / 0.9);
    }
    g.computeBoundingSphere();
    o.geometry = g;
  });
  car.children[0].material = new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.18, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 1, envMapIntensity: 2.6 });
  car.children[3].material = chrome;
  car.children[7].material = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3 }); // whitewalls
  // glints that skate round the rims
  const star = document.createElement('canvas');
  star.width = star.height = 64;
  const sg = star.getContext('2d');
  const grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.15, 'rgba(220,240,255,0.6)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 64, 64);
  sg.fillStyle = 'rgba(255,255,255,0.9)';
  sg.fillRect(31, 2, 2, 60);
  sg.fillRect(2, 31, 60, 2);
  const tex = new THREE.CanvasTexture(star);
  const glints = [];
  for (const [x, z] of [[-0.86, -1.72 - E], [0.86, -1.72 - E], [-0.86, 1.86 + E], [0.86, 1.86 + E]]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(2.5, 2.6, 2.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.userData = { x: x + Math.sign(x) * 0.18, z, phase: Math.random() * 6 };
    car.add(sp);
    glints.push(sp);
  }
  car.userData.glints = glints;
  return car;
}

function buildSet(track, scene, r) {
  const group = new THREE.Group();
  scene.add(group);
  // the road: translucent grey ice, faintly marbled, a little light living in it
  const ice = iceTexture();
  const road = new THREE.MeshStandardMaterial({
    color: 0x8a9096, map: ice, roughness: 0.18, metalness: 0.0, envMapIntensity: 0.35,
    emissive: 0x2a3034, emissiveMap: ice, emissiveIntensity: 0.6,
    transparent: true, opacity: 0.8, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const uvs = [];
  group.add(new THREE.Mesh(ribbon(track, -HW - 0.8, HW + 0.8, 0.04, 0.04, 3, uvs), road));
  // its frozen depth: a dimmer slab beneath, glowing through
  group.add(new THREE.Mesh(ribbon(track, -HW - 0.8, HW + 0.8, -0.05, -1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.11, 0.12), transparent: true, opacity: 0.7, depthWrite: false })));
  // edges drawn in light: the one thing that's always certain
  const line = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.2, 2.6), fog: false });
  for (const s of [-1, 1]) group.add(new THREE.Mesh(ribbon(track, s * (HW + 0.5) - 0.07, s * (HW + 0.5) + 0.07, 0.07, 0.07, 2), line));
  // a dashed line down the middle, softly lit, counting off the speed
  const dashes = [];
  const A = {};
  const B = {};
  for (let t = track.t0; t < track.t1 - 4; t += 9) {
    for (let k = 0; k < 3; k++) {
      track.sample(t + k * 1.2, A);
      track.sample(t + (k + 1) * 1.2, B);
      const c = (p, d) => [p.x + p.nx * d, p.y + 0.08, p.z + p.nz * d];
      dashes.push(...c(A, -0.09), ...c(B, -0.09), ...c(B, 0.09), ...c(A, -0.09), ...c(B, 0.09), ...c(A, 0.09));
    }
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dashes, 3));
  group.add(new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.78, 0.82), side: THREE.DoubleSide })));
  // posts of light where the invisible walls are
  const posts = [];
  for (let t = track.t0; t < track.t1; t += 12) {
    track.sample(t, P);
    for (const s of [-1, 1]) posts.push(new THREE.BoxGeometry(0.08, 1.4, 0.08).translate(P.x + P.nx * s * (HW + 1.2), P.y + 0.7, P.z + P.nz * s * (HW + 1.2)));
  }
  group.add(new THREE.Mesh(mergeSimple(posts), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.95, 1.0) })));
  // gates you pass through: thin rectangles of light, leaning, every so often
  const gateMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.25, 1.3), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const gates = [];
  for (let t = track.t0 + 60; t < track.t1 - 40; t += 90 + Math.floor(r() * 60)) {
    track.sample(t, P);
    const w = HW * 2 + 6 + r() * 10;
    const h = 9 + r() * 14;
    const frame = new THREE.Group();
    for (const [sx, sy, px, py] of [[0.25, h, -w / 2, h / 2], [0.25, h, w / 2, h / 2], [w, 0.25, 0, h]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.25), gateMat);
      m.position.set(px, py, 0);
      frame.add(m);
    }
    frame.position.set(P.x, P.y, P.z);
    frame.rotation.set(0, -P.heading, (r() - 0.5) * 0.35, 'YXZ');
    group.add(frame);
    gates.push(frame);
  }
  // hoops of light the road threads through, closer together on the fast parts
  const hoopMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.9, 2.3), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let t = track.t0 + 30; t < track.t1 - 30; t += 34 + Math.floor(r() * 50)) {
    if (track.bend(t, 30) > 0.5) continue;
    track.sample(t, P);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(HW + 4 + r() * 3, 0.16, 6, 64), hoopMat);
    hoop.position.set(P.x, P.y + 2, P.z);
    hoop.rotation.set(0, -P.heading, r() * Math.PI, 'YXZ');
    group.add(hoop);
    gates.push(hoop);
  }
  // rings, enormous and slow, hanging in the air around the circuit
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.86, 0.9, 0.95), transparent: true, opacity: 0.35, depthWrite: false });
  const rings = [];
  for (let k = 0; k < 14; k++) {
    const R = 30 + r() * 140;
    const m = new THREE.Mesh(new THREE.TorusGeometry(R, 0.3 + r() * 1.2, 6, 96), ringMat);
    const a = r() * Math.PI * 2;
    const dist = 120 + r() * 380;
    m.position.set(track.center.x + Math.cos(a) * dist, -10 + r() * 140, track.center.z + Math.sin(a) * dist);
    m.rotation.set(r() * Math.PI, r() * Math.PI, 0);
    m.userData.spin = (r() - 0.5) * 0.05;
    group.add(m);
    rings.push(m);
  }
  // the infield: tall slabs standing in the fog like a city that never finished
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x8c9198, roughness: 0.9 });
  for (let k = 0; k < 40; k++) {
    const a = r() * Math.PI * 2;
    const dist = r() < 0.5 ? 30 + r() * 120 : 380 + r() * 260;
    const h = 20 + r() * 120;
    const m = new THREE.Mesh(new THREE.BoxGeometry(4 + r() * 12, h, 4 + r() * 12), slabMat);
    m.position.set(track.center.x + Math.cos(a) * dist, h / 2 - 40, track.center.z + Math.sin(a) * dist);
    m.rotation.y = r() * Math.PI;
    if (track.distance(m.position.x, m.position.z) > 24) group.add(m);
  }
  // motes in the air
  const motes = [];
  for (let k = 0; k < 1600; k++) {
    const a = r() * Math.PI * 2;
    const dist = r() * 520;
    motes.push(track.center.x + Math.cos(a) * dist, r() * 90 - 10, track.center.z + Math.sin(a) * dist);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(motes, 3));
  group.add(new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.7, depthWrite: false })));

  // the line, the gantry, three lamps
  track.sample(track.tLine, P);
  const check = document.createElement('canvas');
  check.width = 128; check.height = 16;
  const cg = check.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { cg.fillStyle = (i + j) % 2 ? '#1a1a1a' : '#e8e8e8'; cg.fillRect(i * 8, j * 8, 8, 8); }
  const lineTex = new THREE.CanvasTexture(check);
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry((HW + 0.8) * 2, 2.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lineTex, polygonOffset: true, polygonOffsetFactor: -6 }));
  startLine.position.set(P.x, P.y + 0.09, P.z);
  startLine.rotation.y = -P.heading;
  group.add(startLine);
  const gantry = new THREE.Group();
  const white = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.12, 1.15) });
  for (const x of [-(HW + 2), HW + 2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8, 0.4), white); m.position.set(x, 4, 0); gantry.add(m); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 4.4, 0.5, 0.5), white);
  beam.position.y = 8;
  gantry.add(beam);
  const lamps = [-2.4, 0, 2.4].map((x) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshBasicMaterial({ color: 0x1a0606, side: THREE.DoubleSide }));
    m.position.set(x, 6.6, 0.3);
    gantry.add(m);
    return m;
  });
  gantry.position.set(P.x, P.y, P.z);
  gantry.rotation.y = -P.heading + Math.PI; // facing the grid
  group.add(gantry);
  return { group, gates, rings, lamps };
}

function mergeSimple(geos) {
  const pos = [];
  for (const g of geos) pos.push(...(g.index ? g.toNonIndexed() : g).attributes.position.array);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return out;
}

// ---------------------------------------------------------------- the race

export class Race {
  constructor(scene, rng) {
    this.track = new RaceTrack();
    this.set = buildSet(this.track, scene, rng);
    this.phase = 'idle';
    this.t = 0;
    this.fade = 0;
    // the rival: a stretched black limo, lamps on, someone hooded at the wheel, waiting on the grid
    const car = buildLimo();
    car.rotation.order = 'YXZ';
    for (const x of [-0.86, 0.86]) {
      const b = buildBeam(30, 4);
      b.position.set(x, 0.74, -2.95 - 1.35);
      car.add(b);
    }
    this.rival = { mesh: car, t: this.track.tGrid, lane: 3.2, v: 0, dist: this.track.tGrid };
    this.set.group.add(car);
    this.poseRival();
  }

  get active() { return this.phase !== 'idle'; }

  /**
   * Now and then during the race the camera leaves its post: an orbit round the
   * back of both cars, a crane up to look down on them, a pass alongside.
   * Eases out of the chase position and back into it, so you never lose the car.
   */
  shot(camera, v, dt) {
    const S = this.cine;
    S.t += dt;
    const w = smooth(0, 1.1, S.t) * (1 - smooth(S.dur - 1.1, S.dur, S.t));
    const f = v.forward.clone();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const p = v.pos.clone();
    p.y += v.bodyY;
    const mid = p.clone().lerp(this.rival.mesh.position, 0.5);
    const chase = p.clone().addScaledVector(f, -8.5).addScaledVector(r, 1.8);
    chase.y += 2.2;
    const chaseLook = p.clone().addScaledVector(f, 7);
    chaseLook.y += 1;
    const k = S.t / S.dur;
    const pos = new THREE.Vector3();
    const look = mid.clone();
    look.y += 0.8;
    if (S.kind === 0) {
      const a = -1.3 + 2.6 * k;
      pos.copy(mid).addScaledVector(f, -Math.cos(a) * 15).addScaledVector(r, Math.sin(a) * 15);
      pos.y += 3.5 + 2 * Math.sin(k * Math.PI);
    } else if (S.kind === 1) {
      pos.copy(mid).addScaledVector(f, -9 + 4 * k);
      pos.y += 5 + 15 * smooth(0, 0.6, k);
    } else {
      pos.copy(mid).addScaledVector(r, (this.rival.lane > 0 ? 1 : -1) * 15).addScaledVector(f, 6 - 10 * k);
      pos.y += 2.4;
      look.addScaledVector(f, 4);
    }
    camera.position.copy(chase.lerp(pos, w));
    camera.lookAt(chaseLook.lerp(look, w));
    camera.fov += (58 + 6 * w - camera.fov) * Math.min(1, dt * 3);
    return S.t < S.dur;
  }

  /** Whether a cinematic shot should run this frame. */
  wantsShot(dt, vehicle) {
    if (this.phase !== 'racing' && !(this.cine && this.cine.t < this.cine.dur)) return false;
    if (this.cine && this.cine.t < this.cine.dur) return true;
    this.nextShot = (this.nextShot ?? 7) - dt;
    const close = vehicle.pos.distanceTo(this.rival.mesh.position) < 40;
    if (this.nextShot > 0 || !close || vehicle.airborne) return false;
    this.cine = { t: 0, dur: 5, kind: this.shotKind = ((this.shotKind ?? -1) + 1) % 3 };
    this.nextShot = 10 + Math.random() * 4;
    return true;
  }

  /** You've rolled up to the grid: the limo is idling beside you, the lamps are dark. */
  enter(h) {
    const T = this.track;
    this.phase = 'countdown';
    this.t = 0;
    this.rival.t = T.tGrid;
    this.rival.dist = T.tGrid;
    this.rival.v = 0;
    this.rival.lane = h.d > 0 ? -3.4 : 3.4;
    this.playerDist = h.t;
    this.playerLastT = h.t;
    this.result = null;
    this.cine = null;
    this.nextShot = 8;
    this.set.lamps.forEach((l) => l.material.color.setHex(0x1a0606));
    this.poseRival();
  }

  poseRival() {
    const R = this.rival;
    const T = this.track;
    const p = T.at(R.t, R.lane, 0);
    const a = T.sample(R.t);
    const b = T.sample(R.t + 3);
    R.mesh.position.copy(p);
    R.mesh.rotation.set(Math.atan2(b.y - a.y, 3), -a.heading, 0);
  }

  /**
   * One frame. Returns what the race wants this frame: `hold` keeps the player's
   * car on the grid, `card` asks for a title, `lamp` and `go` for sounds, `done` to leave.
   */
  update(dt, vehicle) {
    const out = {};
    const T = this.track;
    const h = vehicle.spurHit && vehicle.spurHit.spur === T ? vehicle.spurHit : null;
    // the pale comes on as the road leaves the ring and goes as it rejoins: no cut
    const u = h ? h.t / T.N : 0;
    const want = h ? THREE.MathUtils.smoothstep(u, 0.04, 0.14) * (1 - THREE.MathUtils.smoothstep(u, 0.88, 0.97)) : 0;
    this.fade += (want - this.fade) * Math.min(1, dt * 2);
    if (!h) { this.phase = 'idle'; this.raced = false; }
    if (this.phase === 'idle') {
      // roll up to the grid and the race begins
      if (h && !this.raced && h.t > T.tGrid - 10 && h.t < T.tGrid + 8) { this.enter(h); this.raced = true; out.enter = true; }
      return out;
    }
    this.t += dt;
    for (const r of this.set.rings) r.rotation.z += r.userData.spin * dt;

    if (this.phase === 'countdown') {
      out.hold = true;
      const lit = Math.floor(this.t - 1);
      this.set.lamps.forEach((l, i) => l.material.color.setRGB(i < lit ? 3 : 0.1, i < lit ? 0.25 : 0.02, i < lit ? 0.15 : 0.02));
      if (lit !== this.lastLit && lit >= 1 && lit <= 3) out.lamp = lit;
      this.lastLit = lit;
      if (this.t > 4.2) {
        this.phase = 'racing';
        this.t = 0;
        this.set.lamps.forEach((l) => l.material.color.setRGB(0.3, 3, 0.6));
        out.go = true;
        out.card = ['GO', 'one long lap'];
      }
      return out;
    }

    // the rival drives: fast where it's straight, careful where it bends, never too far from you
    const R = this.rival;
    const bend = T.bend(R.t, 45);
    let target = 47 - bend * 34;
    const gap = R.dist - this.playerDist;
    if (gap > 70) target -= 6;
    if (gap < -60) target += 6;
    if (this.phase === 'finished') target = Math.max(0, target - 30);
    R.v += THREE.MathUtils.clamp(target - R.v, -16 * dt, 9 * dt);
    R.t = T.wrap(R.t + R.v * dt);
    R.dist += R.v * dt;
    // it picks a line: inside on the bends, wide on the straights, and gives you room
    let laneT = 3.2 * Math.sign(Math.sin(R.t * 0.004) + 0.4);
    if (h && Math.abs(gap) < 9) laneT = h.d > 0 ? -3.6 : 3.6;
    R.lane += (laneT - R.lane) * Math.min(1, dt * 0.9);
    this.poseRival();

    // where you are, laps
    if (h) {
      this.playerDist += h.t - this.playerLastT;
      this.playerLastT = h.t;
      // paint-swapping: lean on each other, don't pass through
      const dx = vehicle.pos.x - R.mesh.position.x;
      const dz = vehicle.pos.z - R.mesh.position.z;
      const dd = Math.hypot(dx, dz);
      if (dd < 3.4 && dd > 0.01) {
        const push = (3.4 - dd) * 0.5;
        vehicle.pos.x += (dx / dd) * push;
        vehicle.pos.z += (dz / dd) * push;
        R.lane -= Math.sign(h.d - R.lane) * push;
        out.bump = Math.min(1, vehicle.speed / 30);
      }
    }
    if (this.phase === 'racing') {
      const done = this.playerDist >= T.tFinish;
      const rivalDone = R.dist >= T.tFinish;
      if (done || rivalDone) {
        this.result = done && (!rivalDone || this.playerDist - T.tFinish > R.dist - T.tFinish) ? 'win' : 'lose';
        this.phase = 'finished';
        this.t = 0;
        out.card = this.result === 'win' ? ['FIRST', 'the city opens its eyes for you'] : ['SECOND', 'the rival fades into the pale'];
        out.finish = this.result;
      }
    }
    for (const g of this.set.gates) if (g.isMesh) g.rotation.z += dt * 0.4;
    for (const sp of this.rival.mesh.userData.glints) {
      // a star skates round each rim and flares now and then
      const a = this.t * (6 + R.v * 0.6) + sp.userData.phase;
      sp.position.set(sp.userData.x, 0.36 + Math.sin(a) * 0.3, sp.userData.z + Math.cos(a) * 0.3);
      const flare = Math.max(0, Math.sin(a * 0.37 + sp.userData.phase)) ** 8;
      sp.scale.setScalar(0.25 + flare * 1.3);
    }
    return out;
  }
}
