// The drive-in: two blocks off the drag, left before the bridge. Rows of cars
// sit in the dark facing a big screen, and on it an old film loops: stock-car
// races, a photo finish, and the ones that end in a wreck. Pull in, stop, watch.
import * as THREE from 'three';
import { buildStaticCar, buildRider } from '../player/carModel.js';
import { boxAt, boxUV, cylAt } from './districtKit.js';

/** The lot, in the district's frame (u along the drag, v across it). */
export const LOT = { u0: 114, u1: 236, v0: -201, v1: -79, aisleV: -140, screenU: 119 };
const SCREEN_W = 52;
const SCREEN_H = 23;
const SCREEN_Y = 3.6;

export const inLotBlock = (cu, cv) => cu > LOT.u0 && cu < LOT.u1 && cv > LOT.v0 && cv < LOT.v1;

/** Static parts: the gravel, the screen's frame, rows of cars, the booth. Open on every side. */
export function layoutLot(d, K) {
  const r = d.r;
  const { u0, u1, v0, v1, aisleV, screenU } = LOT;
  K.add('dirt', boxUV(u0, u1, v0, v1, 0, 0.03));
  // the screen: a tall flat on a steel lattice, its back to the city
  K.add('concrete', boxUV(screenU - 1.4, screenU - 0.2, aisleV - SCREEN_W / 2 - 1, aisleV + SCREEN_W / 2 + 1, 0, SCREEN_Y + SCREEN_H + 1));
  K.box(screenU - 1.4, screenU - 0.2, aisleV - SCREEN_W / 2 - 1, aisleV + SCREEN_W / 2 + 1, SCREEN_Y + SCREEN_H + 1);
  for (let v = aisleV - SCREEN_W / 2; v <= aisleV + SCREEN_W / 2; v += 5.6) {
    K.add('steel', boxAt(screenU - 4, v, 0, 0.3, 0.3, SCREEN_Y + SCREEN_H));
    K.add('steel', boxAt(screenU - 2.6, v, 0, 3, 0.2, 0.2, 0));
  }
  // rows of cars facing it, a speaker post at every bay, an aisle down the middle
  for (let u = screenU + 28; u < u1 - 24; u += 14) {
    K.add('concrete', boxUV(u + 2.4, u + 3.1, v0 + 6, v1 - 6, 0, 0.18)); // the hump each row parks against
    for (let v = v0 + 9; v < v1 - 8; v += 8) {
      if (Math.abs(v - aisleV) < 7) continue;
      K.add('steel', cylAt(u + 2.75, v - 4, 0, 0.06, 1.25, 6));
      K.add('steel', boxAt(u + 2.75, v - 4, 1.2, 0.18, 0.32, 0.22));
      if (r() < 0.62) d.parked.push({ u: u + 0.2, v: v + (r() - 0.5) * 0.8, yaw: d.yawToward(-1, (r() - 0.5) * 0.08), dull: r() < 0.3, rider: r() < 0.55 });
    }
  }
  // the projection booth, off to one side of the aisle so the way in stays clear
  const bu = u1 - 13;
  const bv = aisleV + 18;
  K.add('brickDark', boxUV(bu - 3, bu + 3, bv - 4, bv + 4, 0, 3.6));
  K.add('concrete', boxUV(bu - 3.4, bu + 3.4, bv - 4.4, bv + 4.4, 3.6, 3.9));
  K.add('windowLit', boxUV(bu - 3.02, bu - 2.98, bv - 1, bv + 1, 2.2, 3));
  K.box(bu - 3, bu + 3, bv - 4, bv + 4, 3.9);
  d.watcherSpots.push({ u: bu - 4, v: bv + 5, y: 0, faceU: -1, faceV: 0 });
  return { booth: d.toWorld(bu - 3.1, bv, 2.6) };
}

/** A rider in the driver's seat, eyes on the screen. */
export function seatRider(car) {
  const rider = buildRider(0.9);
  rider.group.position.set(-0.45, 1.22, 0.28);
  for (const e of rider.eyes) e.material.color.setScalar(0.9);
  car.add(rider.group);
}

// ---------------------------------------------------------------- the film

const L = 360;   // straights
const R = 95;    // turns
const LAP = 2 * L + 2 * Math.PI * R;

/** A point on the oval at distance p, `lane` meters toward the outside. */
function trackAt(p, lane = 0, out = {}) {
  p = ((p % LAP) + LAP) % LAP;
  let x, z, nx, nz, tx, tz;
  if (p < L) { x = -L / 2 + p; z = -R; nx = 0; nz = -1; tx = 1; tz = 0; }
  else if (p < L + Math.PI * R) {
    const a = -Math.PI / 2 + (p - L) / R;
    nx = Math.cos(a); nz = Math.sin(a); x = L / 2 + R * nx; z = R * nz; tx = -nz; tz = nx;
  } else if (p < 2 * L + Math.PI * R) { x = L / 2 - (p - L - Math.PI * R); z = R; nx = 0; nz = 1; tx = -1; tz = 0; }
  else {
    const a = Math.PI / 2 + (p - 2 * L - Math.PI * R) / R;
    nx = Math.cos(a); nz = Math.sin(a); x = -L / 2 + R * nx; z = R * nz; tx = -nz; tz = nx;
  }
  out.x = x + nx * lane; out.z = z + nz * lane; out.tx = tx; out.tz = tz; out.nx = nx; out.nz = nz;
  return out;
}

function buildSet(scene) {
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const infield = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.8 });
  const stand = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2).translate(0, -0.05, 0), infield));
  const strip = (l0, l1, y, mat) => {
    const pos = [];
    const A = {}, B = {};
    for (let p = 0; p < LAP; p += 4) {
      trackAt(p, l0, A); const ax = A.x, az = A.z;
      trackAt(p, l1, B); const bx = B.x, bz = B.z;
      trackAt(p + 4, l0, A); trackAt(p + 4, l1, B);
      pos.push(ax, y, az, bx, y, bz, A.x, y, A.z, A.x, y, A.z, bx, y, bz, B.x, y, B.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.material.side = THREE.DoubleSide;
    scene.add(m);
  };
  strip(-10, 10, 0, asphalt);
  strip(9.4, 9.8, 0.02, white);
  strip(-9.8, -9.4, 0.02, white);
  // the wall round the outside, and the stands down the front straight
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.9 });
  for (let p = 0; p < LAP; p += 6) {
    const A = trackAt(p, 11.5);
    const w = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.2, 0.5), wallMat);
    w.position.set(A.x, 0.6, A.z);
    w.rotation.y = Math.atan2(-A.tz, A.tx);
    scene.add(w);
  }
  for (let k = 0; k < 9; k++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(L * 0.8, 1.6, 4), stand);
    g.position.set(0, 0.8 + k * 1.6, -R - 18 - k * 4);
    scene.add(g);
  }
  // light towers and a finish gantry
  for (let x = -L / 2; x <= L / 2; x += 90) {
    for (const z of [-R - 40, R + 30]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(1, 34, 1), stand);
      t.position.set(x, 17, z);
      const head = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 1), white);
      head.position.set(x, 34, z);
      scene.add(t, head);
    }
  }
  const F = trackAt(300, 0);
  for (const lane of [-12, 12]) {
    const P = trackAt(300, lane);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), white);
    post.position.set(P.x, 4.5, P.z);
    scene.add(post);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(1, 1.6, 25), white);
  banner.position.set(F.x, 8.6, F.z);
  scene.add(banner);
  const check = document.createElement('canvas');
  check.width = 16; check.height = 128;
  const cg = check.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { cg.fillStyle = (i + j) % 2 ? '#111' : '#eee'; cg.fillRect(j * 8, i * 8, 8, 8); }
  const line = new THREE.Mesh(new THREE.PlaneGeometry(2, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(check) }));
  line.position.set(F.x, 0.03, F.z);
  scene.add(line);
}

/** Film cars wear plain paint: no pulse contours, no world fog. */
function filmCar(paint) {
  const car = buildStaticCar(false);
  const cache = new Map();
  car.traverse((o) => {
    if (!o.isMesh) return;
    if (!cache.has(o.material)) {
      const src = o.material;
      cache.set(src, new THREE.MeshStandardMaterial({ color: src.color ? src.color.clone() : 0x222222, roughness: src.roughness ?? 0.6, metalness: Math.min(0.5, src.metalness ?? 0) }));
    }
    o.material = cache.get(o.material);
  });
  car.children[0].material = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.35, metalness: 0.2 });
  return car;
}

const PAINTS = [0xe8e8e8, 0x202020, 0x8a8a8a, 0xbdbdbd];

/** Each reel: a few cars, a few shots. Some are just racing; some end in a wreck. */
const REELS = [
  { kind: 'race', dur: 12 },
  { kind: 'crash', dur: 10 },
  { kind: 'finish', dur: 8.5 },
  { kind: 'pileup', dur: 11 },
  { kind: 'race', dur: 10, seed: 2 },
  { kind: 'crash', dur: 9.5, seed: 3 },
];

export class DriveInMovie {
  constructor(district, booth) {
    this.d = district;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x707070);
    this.scene.fog = new THREE.Fog(0x707070, 120, 700);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-200, 300, -150);
    this.scene.add(sun);
    buildSet(this.scene);
    this.cam = new THREE.PerspectiveCamera(38, SCREEN_W / SCREEN_H, 0.5, 2000);
    this.cars = PAINTS.map((c) => { const m = filmCar(c); this.scene.add(m); return { mesh: m, p: 0, lane: 0, v: 0, free: null }; });
    this.dust = this.makeDust();
    this.rt = new THREE.WebGLRenderTarget(1152, 510, { samples: 2 });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.buildScreen(booth);
    this.reel = -1;
    this.t = 0;
    this.frameT = 0;
    this.time = 0;
    this.hit = 0;
    this.roar = 0;
    this.nextReel();
  }

  buildScreen(booth) {
    const d = this.d;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.rt.texture }, uTime: { value: 0 }, uCut: { value: 0 }, uLevel: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float uTime; uniform float uCut; uniform float uLevel;
        varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          float weave = (h(vec2(floor(uTime * 18.0), 3.0)) - 0.5) * 0.004;
          vec2 uv = vUv + vec2(0.0, weave);
          vec3 c = texture2D(map, uv).rgb;
          float g = dot(c, vec3(0.3, 0.59, 0.11));
          g = pow(g, 0.9) * 1.15;
          float fr = floor(uTime * 18.0);
          g *= 0.88 + 0.12 * h(vec2(fr, 1.0));                         // projector flicker
          g += (h(uv * 900.0 + fr) - 0.5) * 0.12;                       // grain
          float sx = h(vec2(fr, 7.0));
          if (sx > 0.7) g += smoothstep(0.0015, 0.0, abs(uv.x - h(vec2(fr, 9.0)))) * 0.35; // a scratch
          vec2 q = vUv - 0.5;
          g *= 1.0 - dot(q, q) * 1.3;                                   // hot center, falling off
          g = mix(g, 1.0, uCut);                                        // white flash on a splice
          vec3 tint = vec3(1.0, 0.96, 0.88);
          gl_FragColor = vec4(tint * g * uLevel, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      toneMapped: true,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), this.mat);
    screen.position.copy(d.toWorld(LOT.screenU + 0.02, LOT.aisleV, SCREEN_Y + SCREEN_H / 2));
    screen.rotation.y = d.faceYaw(1, 0);
    d.world.add(screen);
    this.center = screen.position.clone();

    // the beam from the booth: faint, dusty, wide at the screen
    const to = this.center;
    const len = booth.distanceTo(to);
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLevel: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uLevel; varying vec2 vUv;
        void main() {
          float edge = sin(vUv.x * 3.14159);
          float dust = 0.7 + 0.3 * sin(vUv.y * 60.0 - uTime * 0.8 + vUv.x * 21.0) * sin(vUv.y * 23.0 + uTime * 0.5);
          gl_FragColor = vec4(vec3(0.75, 0.72, 0.62) * edge * edge * dust * 0.05 * uLevel * mix(1.4, 0.4, vUv.y), 1.0);
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 16, len, 24, 1, true), this.beamMat);
    beam.position.copy(booth).add(to).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(booth).normalize());
    d.world.add(beam);
    // the screen lights the front rows a little
    this.glow = new THREE.PointLight(0xfff2d8, 0, 70, 1.6);
    this.glow.position.copy(d.toWorld(LOT.screenU + 14, LOT.aisleV, 7));
    d.world.add(this.glow);
  }

  makeDust() {
    const N = 240;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdddddd, size: 1.4, transparent: true, opacity: 0.55, depthWrite: false }));
    this.scene.add(pts);
    return { pts, life: new Float32Array(N), vel: new Float32Array(N * 3), next: 0, N };
  }

  puff(x, y, z, n, speed) {
    const D = this.dust;
    const pos = D.pts.geometry.attributes.position.array;
    for (let k = 0; k < n; k++) {
      const i = D.next++ % D.N;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      D.vel[i * 3] = (Math.random() - 0.5) * speed;
      D.vel[i * 3 + 1] = Math.random() * speed * 0.6;
      D.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      D.life[i] = 1.2 + Math.random() * 1.5;
    }
  }

  nextReel() {
    this.reel = (this.reel + 1) % REELS.length;
    this.t = 0;
    this.cut = 1;
    const R0 = REELS[this.reel];
    this.cars.forEach((c, i) => { c.free = null; c.swerveAt = 0; c.spinAt = 0; c.mesh.visible = false; c.mesh.rotation.set(0, 0, 0); c.mesh.position.y = 0; c.wobble = Math.random() * 6; c.i = i; });
    const use = (i, p, lane, v) => Object.assign(this.cars[i], { p, lane, laneT: lane, v, base: v }, { mesh: Object.assign(this.cars[i].mesh, { visible: true }) });
    const s = R0.seed || 0;
    if (R0.kind === 'race') { use(0, 80 + s * 200, -4, 54); use(1, 92 + s * 200, 3, 54); use(2, 104 + s * 200, 0, 54); }
    if (R0.kind === 'crash') { use(0, 40, -3.2, 56); use(1, 41.5, 3.2, 56); use(2, 14, 0, 55); this.cars[1].swerveAt = 2.9 + s * 0.3; }
    if (R0.kind === 'finish') { use(0, 40, -3, 58); use(1, 38, 3, 58.4); }
    if (R0.kind === 'pileup') { use(0, 300, 0, 50); use(1, 285, -3, 52); use(2, 270, 3, 53); use(3, 255, 0, 53); this.cars[0].spinAt = 3.2; }
    this.roar = 0;
  }

  /** Knock a car loose from its lane: from here on it slides, spins and maybe rolls. */
  wreck(c, push, spin, roll) {
    if (c.free) { c.free.vx += push.x; c.free.vz += push.z; c.free.yawRate += spin; return; }
    const A = trackAt(c.p, c.lane);
    c.free = {
      x: A.x, z: A.z, y: 0, vy: roll ? 6 + Math.random() * 3 : 0.6,
      vx: A.tx * c.v + push.x, vz: A.tz * c.v + push.z,
      yaw: Math.atan2(-A.tx, -A.tz), yawRate: spin, roll: 0, rollRate: roll,
    };
    this.puff(A.x, 0.8, A.z, 30, 9);
    this.hit = 1;
  }

  step(dt) {
    const R0 = REELS[this.reel];
    const t = this.t;
    for (const c of this.cars) {
      if (!c.mesh.visible) continue;
      if (!c.free) {
        if (R0.kind === 'race') { c.v = c.base + 3.2 * Math.sin(t * 0.6 + c.i * 2.1); if (Math.sin(t * 0.4 + c.i) > 0.85) c.laneT = (c.i - 1) * 4 * (Math.sin(t + c.i) > 0 ? 1 : -1); }
        if (c.swerveAt && t > c.swerveAt) c.laneT = -2.4;
        if (R0.kind === 'crash' && c.i === 2 && t > 4) c.laneT = 7.5;
        if (c.spinAt && t > c.spinAt) this.wreck(c, { x: 0, z: 0 }, 5.5, 0);
        c.lane += (c.laneT - c.lane) * Math.min(1, dt * 1.6);
        c.p += c.v * dt;
        const A = trackAt(c.p, c.lane);
        c.mesh.position.set(A.x, 0.02 * Math.sin(t * 30 + c.wobble), A.z);
        c.mesh.rotation.set(0, Math.atan2(-A.tx, -A.tz) - (c.laneT - c.lane) * 0.04, 0);
        if (Math.random() < 0.3) this.puff(A.x - A.tx * 3, 0.4, A.z - A.tz * 3, 1, 2);
      } else {
        const f = c.free;
        const grip = f.y > 0.05 ? 0 : 1.1;
        f.vx *= Math.exp(-grip * dt); f.vz *= Math.exp(-grip * dt);
        f.x += f.vx * dt; f.z += f.vz * dt;
        f.vy -= 22 * dt; f.y += f.vy * dt;
        if (f.y < 0) { f.y = 0; if (f.vy < -3) this.puff(f.x, 0.5, f.z, 10, 6); f.vy *= -0.3; f.rollRate *= 0.55; }
        f.yaw += f.yawRate * dt; f.yawRate *= Math.exp(-0.7 * dt);
        f.roll += f.rollRate * dt;
        if (f.y === 0 && Math.abs(f.rollRate) < 0.6) f.roll += (Math.round(f.roll / Math.PI) * Math.PI - f.roll) * Math.min(1, dt * 3);
        c.mesh.position.set(f.x, f.y + Math.abs(Math.sin(f.roll)) * 0.9, f.z);
        c.mesh.rotation.set(0, f.yaw, f.roll, 'YXZ');
        if (Math.hypot(f.vx, f.vz) > 6 && Math.random() < 0.6) this.puff(f.x, 0.6, f.z, 2, 4);
      }
    }
    // contact: anything closer than a car's width hits
    const live = this.cars.filter((c) => c.mesh.visible);
    for (let a = 0; a < live.length; a++) {
      for (let b = a + 1; b < live.length; b++) {
        const A = live[a].mesh.position;
        const B = live[b].mesh.position;
        const dx = B.x - A.x;
        const dz = B.z - A.z;
        const dd = Math.hypot(dx, dz);
        if (dd < 3.4 && (R0.kind !== 'race' && R0.kind !== 'finish')) {
          const n = { x: dx / (dd || 1), z: dz / (dd || 1) };
          const roll = R0.kind === 'crash' && !live[a].free ? 7 : (Math.random() < 0.5 ? 5 : 0);
          this.wreck(live[a], { x: -n.x * 9, z: -n.z * 9 }, 4 * (Math.random() < 0.5 ? 1 : -1), roll);
          this.wreck(live[b], { x: n.x * 6, z: n.z * 6 }, -3, 0);
        }
      }
    }
    // dust drifts and fades
    const D = this.dust;
    const pos = D.pts.geometry.attributes.position.array;
    for (let i = 0; i < D.N; i++) {
      if (D.life[i] <= 0) { pos[i * 3 + 1] = -100; continue; }
      D.life[i] -= dt;
      pos[i * 3] += D.vel[i * 3] * dt; pos[i * 3 + 1] += D.vel[i * 3 + 1] * dt; pos[i * 3 + 2] += D.vel[i * 3 + 2] * dt;
      D.vel[i * 3] *= 0.97; D.vel[i * 3 + 2] *= 0.97; D.vel[i * 3 + 1] = D.vel[i * 3 + 1] * 0.97 + 0.3 * dt;
    }
    D.pts.geometry.attributes.position.needsUpdate = true;
    this.shoot(R0, t);
  }

  /** Where the camera is: the shots in each reel. */
  shoot(R0, t) {
    const cam = this.cam;
    const lead = this.cars.filter((c) => c.mesh.visible).reduce((a, c) => (c.p > a.p ? c : a));
    const P = (c) => c.mesh.position;
    const look = new THREE.Vector3();
    let shake = 0;
    if (R0.kind === 'race') {
      if (t < 4) { const A = trackAt(330 + (R0.seed || 0) * 200, 18); cam.position.set(A.x, 1.3, A.z); look.copy(P(lead)); }
      else if (t < 8.5) { const c = this.cars[1]; const A = trackAt(c.p - 13, c.lane + 1.5); cam.position.set(A.x, 2.1, A.z); const B = trackAt(c.p + 25, c.lane); look.set(B.x, 1, B.z); shake = 0.05; }
      else { const A = trackAt(lead.p + 20, -8); cam.position.set(A.x, 1.0, A.z); look.copy(P(this.cars[2])); }
    } else if (R0.kind === 'crash') {
      const A = trackAt(205, 22);
      cam.position.set(A.x, 1.6, A.z);
      look.copy(P(this.cars[0])).lerp(P(this.cars[1]), 0.5);
      look.y = 1;
      shake = this.hit * 0.6;
    } else if (R0.kind === 'finish') {
      const A = trackAt(300, 16);
      if (t < 6.2) { cam.position.set(A.x, 1.4, A.z); const B = trackAt(300, -12); look.set(B.x, 1.2, B.z); }
      else { const B = trackAt(lead.p - 30, -15); cam.position.set(B.x, 6, B.z); look.copy(P(lead)); }
    } else {
      const A = trackAt(420, -60);
      cam.position.set(A.x, 14, A.z);
      look.copy(P(this.cars[0]));
      shake = this.hit * 0.4;
    }
    cam.position.x += (Math.random() - 0.5) * shake;
    cam.position.y += (Math.random() - 0.5) * shake;
    cam.lookAt(look);
    // how loud the film is: cars near the lens roar
    let near = 0;
    for (const c of this.cars) if (c.mesh.visible) near = Math.max(near, 1 - Math.min(1, cam.position.distanceTo(P(c)) / 60));
    this.roar += (near - this.roar) * 0.2;
  }

  /**
   * Run the projector. Only renders when you're near enough to see it, at the
   * film's own jerky 18 frames a second. Returns how much of the film you hear.
   */
  update(dt, renderer, carPos) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    this.beamMat.uniforms.uTime.value = this.time;
    const dist = carPos.distanceTo(this.center);
    if (dist > 340) return { level: 0, roar: 0, hit: 0 };
    this.t += dt;
    this.hit = Math.max(0, this.hit - dt * 1.5);
    this.cut = Math.max(0, this.cut - dt * 9);
    this.mat.uniforms.uCut.value = this.cut;
    if (this.t > REELS[this.reel].dur) this.nextReel();
    this.frameT += dt;
    const FRAME = 1 / 18;
    if (this.frameT >= FRAME) {
      const n = Math.min(3, Math.floor(this.frameT / FRAME));
      for (let k = 0; k < n; k++) this.step(FRAME);
      this.frameT -= n * FRAME;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(this.rt);
      renderer.render(this.scene, this.cam);
      renderer.setRenderTarget(prev);
    }
    const flick = 0.85 + 0.15 * Math.random();
    this.glow.intensity = (6 + this.hit * 20 + this.cut * 30) * flick;
    const level = 1 - THREE.MathUtils.smoothstep(dist, 40, 130);
    return { level, roar: this.roar, hit: this.hit };
  }
}
