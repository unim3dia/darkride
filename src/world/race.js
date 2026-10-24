// THE CIRCUIT. A left off the Narrows' avenue, a gate of light at the end of a
// street, and you're somewhere else: on the line of a pale floating circuit, a
// rival idling on your right, three lamps counting down. Three laps.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { buildStaticCar } from '../player/carModel.js';
import { buildBeam } from '../player/carLights.js';

const HW = ROAD.HALF_WIDTH;
const ORIGIN = new THREE.Vector3(9200, 0, -9200); // far off the map, lost in its own fog
export const LAPS = 3;
const P = {};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The circuit's palette: the Ether's pale air, brighter, faster. */
export const RACE_PALETTE = { fog: 0xa4aab2, skyTop: 0x60666e, skyHorizon: 0xc2c8d0, glow: 0xe2e8f0, light: 0.6, exposure: 1.0, fogMul: 1.25, grain: 1.8, rain: 0 };

/**
 * A closed loop the car can drive, with the same query interface as an off-ramp.
 * Arc length wraps, so crossing the line is seamless.
 */
export class RaceTrack {
  constructor(ringS) {
    this.kind = 'race';
    this.openings = [];
    this.ringSValue = ringS;
    const raw = [];
    const M = 4000;
    for (let i = 0; i < M; i++) {
      const th = (i / M) * Math.PI * 2;
      const r = 250 + 70 * Math.sin(2 * th) + 38 * Math.sin(3 * th + 1) + 18 * Math.sin(5 * th + 2) + 7 * Math.sin(9 * th + 0.4);
      // hills: a long climb, crests you'll float over, drops, a run of whoops
      const y = 24 + 21 * Math.sin(2 * th + 0.5) + 8.5 * Math.sin(5 * th + 1.1) + 3.5 * Math.sin(11 * th) * Math.max(0, Math.sin(th - 0.6));
      raw.push([ORIGIN.x + r * Math.cos(th), ORIGIN.z + r * Math.sin(th), y]);
    }
    const cum = [0];
    for (let i = 1; i <= M; i++) {
      const a = raw[i - 1];
      const b = raw[i % M];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.len = cum[M];
    const N = Math.floor(this.len);
    this.N = N;
    this.X = new Float64Array(N); this.Z = new Float64Array(N); this.Y = new Float64Array(N);
    let j = 0;
    for (let t = 0; t < N; t++) {
      const target = (t / N) * this.len;
      while (cum[j + 1] < target) j++;
      const f = (target - cum[j]) / (cum[j + 1] - cum[j]);
      const a = raw[j];
      const b = raw[(j + 1) % M];
      this.X[t] = a[0] + (b[0] - a[0]) * f; this.Z[t] = a[1] + (b[1] - a[1]) * f; this.Y[t] = a[2] + (b[2] - a[2]) * f;
    }
    this.hint = 0;
  }

  wrap(t) { return ((t % this.N) + this.N) % this.N; }

  sample(t, out = {}) {
    const tt = this.wrap(t);
    const i = Math.floor(tt);
    const k = (i + 1) % this.N;
    const f = tt - i;
    out.x = this.X[i] + (this.X[k] - this.X[i]) * f;
    out.z = this.Z[i] + (this.Z[k] - this.Z[i]) * f;
    out.y = this.Y[i] + (this.Y[k] - this.Y[i]) * f;
    const a = (i + 1) % this.N;
    const b = (i - 1 + this.N) % this.N;
    const dx = this.X[a] - this.X[b];
    const dz = this.Z[a] - this.Z[b];
    const l = Math.hypot(dx, dz) || 1;
    out.tx = dx / l; out.tz = dz / l;
    out.nx = -out.tz; out.nz = out.tx;
    out.heading = Math.atan2(out.tx, -out.tz);
    out.u = 0;
    return out;
  }

  at(t, d, yRel = 0, out = new THREE.Vector3()) {
    this.sample(t, P);
    return out.set(P.x + P.nx * d, P.y + yRel, P.z + P.nz * d);
  }

  ringS() { return this.ringSValue; }
  walled() { return true; }

  project(x, z, hint) {
    let t = hint;
    for (let k = 0; k < 6; k++) {
      this.sample(t, P);
      t += Math.max(-60, Math.min(60, (x - P.x) * P.tx + (z - P.z) * P.tz));
    }
    t = this.wrap(t);
    this.sample(t, P);
    const along = (x - P.x) * P.tx + (z - P.z) * P.tz;
    const d = (x - P.x) * P.nx + (z - P.z) * P.nz;
    return { t, d, y: P.y, nx: P.nx, nz: P.nz, ok: Math.abs(along) < 3, spur: this };
  }

  nearestT(x, z) {
    let best = 0;
    let bd = Infinity;
    for (let t = 0; t < this.N; t += 10) {
      const d = (this.X[t] - x) ** 2 + (this.Z[t] - z) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  query(x, z) {
    if (Math.abs(x - ORIGIN.x) > 600 || Math.abs(z - ORIGIN.z) > 600) return null;
    let r = this.project(x, z, this.hint);
    if (!r.ok || Math.abs(r.d) > 30) r = this.project(x, z, this.nearestT(x, z));
    this.hint = r.t;
    return r.ok ? r : null;
  }

  distance(x, z) {
    const r = this.project(x, z, this.nearestT(x, z));
    return r.ok ? Math.abs(r.d) : Infinity;
  }

  /** How hard the road bends over the next `ahead` meters (radians of heading change). */
  bend(t, ahead) {
    const a = this.sample(t, {}).heading;
    const b = this.sample(t + ahead, {}).heading;
    return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
  }
}

// ---------------------------------------------------------------- the set

function ribbon(track, d0, d1, y0, y1, step = 3, uvs = null) {
  const pos = [];
  const A = {};
  const B = {};
  for (let t = 0; t < track.N; t += step) {
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

/** Cracks and frozen bubbles, glowing from inside. */
function iceTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#020a0e';
  g.fillRect(0, 0, 256, 512);
  // a deep glow pooling in places under the surface
  for (let k = 0; k < 8; k++) {
    const x = Math.random() * 256;
    const y = Math.random() * 512;
    const rg = g.createRadialGradient(x, y, 0, x, y, 60 + Math.random() * 80);
    rg.addColorStop(0, 'rgba(40,120,150,0.35)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 512);
  }
  g.shadowColor = 'rgba(160,240,255,0.9)';
  g.shadowBlur = 6;
  for (let k = 0; k < 40; k++) {
    let x = Math.random() * 256;
    let y = Math.random() * 512;
    g.strokeStyle = `rgba(170,240,255,${0.45 + Math.random() * 0.55})`;
    g.lineWidth = 0.6 + Math.random() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 6; i++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 90; g.lineTo(x, y); }
    g.stroke();
  }
  for (let k = 0; k < 160; k++) {
    g.fillStyle = `rgba(200,245,255,${Math.random() * 0.5})`;
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 512, Math.random() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
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
  group.visible = false;
  scene.add(group);
  // the road: a ribbon of glowing ice, lit from inside, slick as glass
  const ice = iceTexture();
  ice.repeat.set(1, 1);
  // (barely any sky in it: a mirror finish just turns it into a flat sheet of fog)
  const road = new THREE.MeshStandardMaterial({
    color: 0x04121a, roughness: 0.22, metalness: 0.0, envMapIntensity: 0.12,
    emissive: 0x9ff2ff, emissiveMap: ice, emissiveIntensity: 2.6, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const uvs = [];
  group.add(new THREE.Mesh(ribbon(track, -HW - 0.8, HW + 0.8, 0.04, 0.04, 3, uvs), road));
  // its frozen depth: a dimmer slab beneath, glowing through
  group.add(new THREE.Mesh(ribbon(track, -HW - 0.8, HW + 0.8, -0.05, -1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.2, 0.28) })));
  // edges drawn in light: the one thing that's always certain
  const line = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.2, 2.6), fog: false });
  for (const s of [-1, 1]) group.add(new THREE.Mesh(ribbon(track, s * (HW + 0.5) - 0.07, s * (HW + 0.5) + 0.07, 0.07, 0.07, 2), line));
  // posts of light where the invisible walls are
  const posts = [];
  for (let t = 0; t < track.N; t += 12) {
    track.sample(t, P);
    for (const s of [-1, 1]) posts.push(new THREE.BoxGeometry(0.08, 1.4, 0.08).translate(P.x + P.nx * s * (HW + 1.2), P.y + 0.7, P.z + P.nz * s * (HW + 1.2)));
  }
  group.add(new THREE.Mesh(mergeSimple(posts), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.95, 1.0) })));
  // gates you pass through: thin rectangles of light, leaning, every so often
  const gateMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.25, 1.3), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const gates = [];
  for (let t = 60; t < track.N - 40; t += 90 + Math.floor(r() * 60)) {
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
  for (let t = 30; t < track.N - 30; t += 34 + Math.floor(r() * 50)) {
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
    m.position.set(ORIGIN.x + Math.cos(a) * dist, -10 + r() * 140, ORIGIN.z + Math.sin(a) * dist);
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
    m.position.set(ORIGIN.x + Math.cos(a) * dist, h / 2 - 40, ORIGIN.z + Math.sin(a) * dist);
    m.rotation.y = r() * Math.PI;
    if (track.distance(m.position.x, m.position.z) > 24) group.add(m);
  }
  // motes in the air
  const motes = [];
  for (let k = 0; k < 1600; k++) {
    const a = r() * Math.PI * 2;
    const dist = r() * 520;
    motes.push(ORIGIN.x + Math.cos(a) * dist, r() * 90 - 10, ORIGIN.z + Math.sin(a) * dist);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(motes, 3));
  group.add(new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.7, depthWrite: false })));

  // the line, the gantry, three lamps
  track.sample(0, P);
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
  /**
   * @param scene the world
   * @param gate  where the gate of light stands in the city: { pos, yaw, back(vehicle) }
   */
  constructor(scene, gate, ringS, rng) {
    this.track = new RaceTrack(ringS);
    this.set = buildSet(this.track, scene, rng);
    this.gate = gate;
    this.phase = 'idle';
    this.t = 0;
    this.fade = 0;
    // the rival: another black lowrider, lamps on, someone hooded at the wheel
    const car = buildLimo();
    car.rotation.order = 'YXZ';
    for (const x of [-0.86, 0.86]) {
      const b = buildBeam(30, 4);
      b.position.set(x, 0.74, -2.95 - 1.35);
      car.add(b);
    }
    this.rival = { mesh: car, t: 0, lane: 3.2, v: 0, dist: 0 };
    this.set.group.add(car);
    this.buildGate(scene);
  }

  /** The way in: a tall rectangle of white light standing across a Narrows street. */
  buildGate(scene) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.65, 1.75), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const veil = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.37, 0.4), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const W = 9;
    const H = 12;
    for (const [sx, sy, px, py] of [[0.3, H, -W / 2, H / 2], [0.3, H, W / 2, H / 2], [W, 0.3, 0, H]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.3), mat);
      m.position.set(px, py, 0);
      g.add(m);
    }
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(W, H), veil);
    sheet.position.y = H / 2;
    g.add(sheet);
    g.position.copy(this.gate.pos);
    g.rotation.y = this.gate.yaw;
    scene.add(g);
    this.gateMesh = g;
    this.veil = veil;
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

  /** Through the gate: onto the line, the rival beside you, lamps dark. */
  enter(vehicle) {
    const T = this.track;
    this.phase = 'countdown';
    this.t = 0;
    this.set.group.visible = true;
    const g = T.at(-14, -3.2, 0);
    const P0 = T.sample(-14);
    vehicle.placeAt(g.x, g.y + 0.3, g.z, P0.heading, 0);
    this.rival.t = T.N - 14;
    this.rival.dist = -14;
    this.rival.v = 0;
    this.rival.lane = 3.2;
    this.playerDist = -14;
    this.playerLastT = T.wrap(-14);
    this.lap = 0;
    this.result = null;
    this.cine = null;
    this.nextShot = 8;
    this.set.lamps.forEach((l) => l.material.color.setHex(0x1a0606));
    this.poseRival();
  }

  leave(vehicle) {
    this.phase = 'idle';
    this.set.group.visible = false;
    this.gate.back(vehicle);
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
    this.veil.opacity = 0.45 + 0.25 * Math.sin(performance.now() * 0.003);
    if (this.phase === 'idle') {
      // drive into the gate
      if (vehicle.pos.distanceTo(this.gate.pos) < 6 && Math.abs(vehicle.pos.y - this.gate.pos.y) < 3) out.enter = true;
      this.fade = Math.max(0, this.fade - dt);
      return out;
    }
    this.fade = Math.min(1, this.fade + dt * 1.5);
    this.t += dt;
    const T = this.track;
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
        out.card = ['GO', 'three laps'];
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
    const h = vehicle.spurHit && vehicle.spurHit.spur === T ? vehicle.spurHit : null;
    let laneT = 3.2 * Math.sign(Math.sin(R.t * 0.004) + 0.4);
    if (h && Math.abs(gap) < 9) laneT = h.d > 0 ? -3.6 : 3.6;
    R.lane += (laneT - R.lane) * Math.min(1, dt * 0.9);
    this.poseRival();

    // where you are, laps
    if (h) {
      let dtt = h.t - this.playerLastT;
      if (dtt < -T.N / 2) dtt += T.N;
      if (dtt > T.N / 2) dtt -= T.N;
      this.playerDist += dtt;
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
      const lap = Math.floor(Math.max(0, this.playerDist) / T.N);
      if (lap > this.lap) {
        this.lap = lap;
        if (lap < LAPS) out.card = [lap === LAPS - 1 ? 'FINAL LAP' : `LAP ${lap + 1}`, ''];
      }
      const done = this.playerDist >= LAPS * T.N;
      const rivalDone = R.dist >= LAPS * T.N;
      if (done || rivalDone) {
        this.result = done && (!rivalDone || this.playerDist - LAPS * T.N > R.dist - LAPS * T.N) ? 'win' : 'lose';
        this.phase = 'finished';
        this.t = 0;
        out.card = this.result === 'win' ? ['FIRST', 'the city opens its eyes for you'] : ['SECOND', 'the rival fades into the pale'];
        out.finish = this.result;
      }
    } else if (this.phase === 'finished' && this.t > 6) {
      out.done = true;
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
