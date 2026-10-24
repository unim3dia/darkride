// THE STAMPEDE. One stretch of the ring where the air turns cold blue and you're
// suddenly inside a herd: wolves at the road's edge, bison, bears, elk and horses
// beside you, giants further out stacked into the fog. None of them is quite
// solid. They come apart as they run, shedding dark flakes into the wind, and
// pull themselves back together. Their eyes stay lit.
import * as THREE from 'three';
import { LOOP_LEN, sample, elevation } from './track.js';
import { merge } from './props.js';
import { Spur, spurRibbon } from './spur.js';

/** Where it happens, as loop fractions: the empty run between the Dust and the Ether. */
export const STAMPEDE = { a: 0.185 * LOOP_LEN, b: 0.262 * LOOP_LEN };
const FADE = 120;

// ---------------------------------------------------------------- the coming-apart

const herdTime = { value: 0 };

/**
 * Fur that isn't all there: a slow noise moving through each body decides which
 * parts exist this instant. The back of the animal goes first; the edge glints.
 */
function herdMat() {
  // not flesh: a vision, light that remembers the shape of an animal
  // solid, shaded bodies with cold light raking their edges; they only lose form where they come apart
  const m = new THREE.MeshStandardMaterial({ color: 0x0c1015, roughness: 0.9, metalness: 0, envMapIntensity: 0.15, side: THREE.DoubleSide });
  const form = { value: 1 };
  const len = { value: 2 };
  m.userData = { form, len };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uForm: form, uLen: len, uTime: herdTime });
    sh.vertexShader = 'varying vec3 vBody;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBody = position;');
    sh.fragmentShader = `
      uniform float uForm; uniform float uLen; uniform float uTime;
      varying vec3 vBody;
      float hh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float vn(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hh(i), hh(i + vec3(1,0,0)), f.x), mix(hh(i + vec3(0,1,0)), hh(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hh(i + vec3(0,0,1)), hh(i + vec3(1,0,1)), f.x), mix(hh(i + vec3(0,1,1)), hh(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float herdEdge = 0.0;
    ` + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          vec3 q = vBody * 1.6 + vec3(0.0, uTime * 1.6, uTime * 3.0);
          float n = vn(q + vec3(0.0, 0.0, uTime * 2.0)) * 0.65 + vn(q * 2.7) * 0.35;
          float rear = clamp(vBody.z / uLen, -1.0, 1.0) * 0.8;
          float cut = uForm + 0.12 - (n + rear);
          if (cut < 0.0) discard;
          herdEdge = smoothstep(0.09, 0.0, cut);
        }`)
      .replace('#include <opaque_fragment>', `{
          float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.5);
          outgoingLight += vec3(0.4, 0.55, 0.75) * rim * rim * 0.55 + vec3(0.6, 0.78, 1.0) * herdEdge * 0.45;
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'herd-dissolve';
  return m;
}

const EYE_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.85, 2.1) });

// ---------------------------------------------------------------- the animals
// Each faces -z with its feet at y = 0. Body parts merge into one mesh; the legs swing.

const sph = (r, sx, sy, sz, x, y, z) => new THREE.SphereGeometry(r, 14, 10).scale(sx, sy, sz).translate(x, y, z);
const cone = (r, h, rx, x, y, z) => new THREE.ConeGeometry(r, h, 7).rotateX(rx).translate(x, y, z);
const tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 8, r, 6);

const SPECIES = {
  wolf: {
    body: () => [
      sph(1, 0.42, 0.48, 1.05, 0, 0.95, 0), sph(0.42, 1, 1.05, 1.1, 0, 1.12, -0.9),
      sph(0.3, 1, 0.95, 1.15, 0, 1.2, -1.35), cone(0.13, 0.42, -Math.PI / 2, 0, 1.12, -1.75),
      cone(0.08, 0.26, 0, -0.14, 1.5, -1.3), cone(0.08, 0.26, 0, 0.14, 1.5, -1.3),
      tube([[0, 1.05, 0.95], [0, 0.95, 1.45], [0, 0.7, 1.8]], 0.09),
    ],
    legs: [[-0.22, -0.65], [0.22, -0.65], [-0.22, 0.7], [0.22, 0.7]], hip: 0.95, legR: 0.075, eyes: [[-0.12, 1.27, -1.6], [0.12, 1.27, -1.6]],
    len: 3.3, half: 0.7, stride: 0.55, swing: 0.9,
  },
  bison: {
    body: () => [
      sph(1, 1.35, 1.35, 2.3, 0, 2.2, 0.2), sph(1.35, 1.05, 1.1, 1, 0, 2.9, -1.0), sph(0.8, 1, 1.05, 1.2, 0, 1.7, -2.5),
      cone(0.12, 0.7, 0, -0.75, 2.25, -2.6), cone(0.12, 0.7, 0, 0.75, 2.25, -2.6),
      sph(0.55, 1, 0.8, 1, 0, 1.15, -2.2), // the beard
    ],
    legs: [[-0.65, -1.3], [0.65, -1.3], [-0.65, 1.4], [0.65, 1.4]], hip: 1.7, legR: 0.28, eyes: [[-0.5, 1.95, -3.0], [0.5, 1.95, -3.0]],
    len: 5, half: 1.5, stride: 0.38, swing: 0.75,
  },
  bear: {
    body: () => [
      sph(1, 0.95, 1.0, 1.55, 0, 1.45, 0.1), sph(0.85, 1.1, 1, 1, 0, 2.05, -0.65), sph(0.55, 1, 0.95, 1.05, 0, 1.75, -1.65),
      sph(0.28, 1, 0.85, 1.3, 0, 1.6, -2.15), sph(0.17, 1, 1, 0.6, -0.36, 2.2, -1.6), sph(0.17, 1, 1, 0.6, 0.36, 2.2, -1.6),
    ],
    legs: [[-0.5, -0.95], [0.5, -0.95], [-0.5, 1.0], [0.5, 1.0]], hip: 1.25, legR: 0.25, eyes: [[-0.2, 1.88, -2.08], [0.2, 1.88, -2.08]],
    len: 4, half: 1.1, stride: 0.42, swing: 0.7,
  },
  elk: {
    body: () => {
      const g = [
        sph(1, 0.55, 0.7, 1.25, 0, 1.65, 0), tube([[0, 1.9, -0.9], [0, 2.4, -1.3], [0, 2.75, -1.55]], 0.26),
        sph(0.3, 0.9, 0.9, 1.6, 0, 2.8, -1.85),
      ];
      // antlers: a beam each side sweeping back, tines rising off it
      for (const s of [-1, 1]) {
        g.push(tube([[s * 0.12, 3.0, -1.7], [s * 0.6, 3.6, -1.5], [s * 0.9, 4.3, -1.0], [s * 0.95, 4.8, -0.4]], 0.05));
        for (const [t0, t1] of [[[s * 0.45, 3.45, -1.55], [s * 0.6, 3.9, -2.1]], [[s * 0.75, 3.95, -1.25], [s * 1.0, 4.45, -1.75]], [[s * 0.9, 4.45, -0.8], [s * 1.25, 4.9, -1.1]], [[s * 0.92, 4.6, -0.6], [s * 0.7, 5.1, -0.9]]]) {
          g.push(tube([t0, [(t0[0] + t1[0]) / 2, (t0[1] + t1[1]) / 2 + 0.05, (t0[2] + t1[2]) / 2], t1], 0.035));
        }
      }
      return g;
    },
    legs: [[-0.28, -0.85], [0.28, -0.85], [-0.28, 0.85], [0.28, 0.85]], hip: 1.55, legR: 0.08, eyes: [[-0.2, 2.9, -2.05], [0.2, 2.9, -2.05]],
    len: 4, half: 1.0, stride: 0.48, swing: 0.85,
  },
  horse: {
    body: () => [
      sph(1, 0.5, 0.65, 1.3, 0, 1.6, 0), tube([[0, 1.9, -0.95], [0, 2.45, -1.35], [0, 2.85, -1.5]], 0.28),
      sph(0.27, 0.8, 0.85, 2.1, 0, 2.7, -1.95), tube([[0, 1.85, 1.2], [0, 1.6, 1.6], [0, 1.15, 1.8]], 0.12),
      cone(0.06, 0.25, 0, -0.1, 3.1, -1.6), cone(0.06, 0.25, 0, 0.1, 3.1, -1.6),
    ],
    legs: [[-0.25, -0.9], [0.25, -0.9], [-0.25, 0.9], [0.25, 0.9]], hip: 1.55, legR: 0.08, eyes: [[-0.17, 2.85, -2.15], [0.17, 2.85, -2.15]],
    len: 4, half: 0.9, stride: 0.5, swing: 0.95,
  },
  elephant: {
    body: () => [
      sph(1, 2.3, 1.9, 3.3, 0, 4.1, 0), sph(1.45, 1, 1, 1, 0, 4.9, -3.4),
      new THREE.CircleGeometry(1.5, 14).scale(0.9, 1.2, 1).rotateY(-1.2).translate(-1.35, 4.9, -2.9),
      new THREE.CircleGeometry(1.5, 14).scale(0.9, 1.2, 1).rotateY(1.2).translate(1.35, 4.9, -2.9),
      cone(0.16, 1.9, -2.0, -0.55, 3.8, -4.4), cone(0.16, 1.9, -2.0, 0.55, 3.8, -4.4),
      tube([[0, 4.6, -4.5], [0, 3.4, -5.1], [0, 2.0, -5.0], [0, 1.1, -4.4]], 0.32),
    ],
    legs: [[-1.2, -1.9], [1.2, -1.9], [-1.2, 1.9], [1.2, 1.9]], hip: 3.2, legR: 0.6, eyes: [[-0.85, 5.1, -4.4], [0.85, 5.1, -4.4]],
    len: 7.5, half: 2.6, stride: 0.22, swing: 0.6,
  },
};
const GEO = {};

function buildAnimal(kind) {
  const S = SPECIES[kind];
  GEO[kind] = GEO[kind] || { body: merge(S.body()), leg: new THREE.CylinderGeometry(S.legR, S.legR * 0.75, S.hip, 7).translate(0, -S.hip / 2, 0) };
  const mat = herdMat();
    mat.userData.len.value = S.len / 2;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(GEO[kind].body, mat));
  const legs = S.legs.map(([x, z]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, S.hip, z);
    pivot.add(new THREE.Mesh(GEO[kind].leg, mat));
    g.add(pivot);
    return pivot;
  });
  const eyes = S.eyes.map(([x, y, z]) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(S.half * 0.06 + 0.03, 6, 5), EYE_MAT);
    e.position.set(x, y, z);
    g.add(e);
    return e;
  });
  return { ...S, g, legs, eyes, mat, kind };
}

// ---------------------------------------------------------------- the herd

/** Who runs where: small and close at the road's edge, giants far out and up in the fog. */
function herdPlan() {
  const plan = [];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  for (const side of [-1, 1]) {
    // at the edge of the bridge: big wolves and horses, close enough to touch
    for (let k = 0; k < 6; k++) plan.push({ kind: pick(['wolf', 'wolf', 'horse']), d: side * (5 + Math.random() * 1.5), scale: 1.6 + Math.random() * 0.5, rise: -0.5, s: -60 + k * 25 });
    // the herd proper: bodies three to seven times life size, a wall rising away from you
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 7; k++) {
        plan.push({ kind: pick(['bison', 'bison', 'bear', 'elk', 'horse']), d: side * (11 + row * 9 + Math.random() * 3), scale: 3 + row * 1.3 + Math.random(), rise: -6 + row * 3 + Math.random() * 3, s: -60 + (k / 7) * 150 + Math.random() * 12 });
      }
    }
    // titans: heads above the top of the screen, striding through the fog
    for (let k = 0; k < 5; k++) {
      plan.push({ kind: k === 2 ? 'elephant' : pick(['bison', 'elk', 'bear']), d: side * (55 + Math.random() * 25), scale: k === 2 ? 9 : 11 + Math.random() * 6, rise: -25 + Math.random() * 10, s: -40 + k * 30 });
    }
  }
  return plan;
}

/**
 * The herd's own country: a thin bridge strung across a cold void, far from
 * anywhere else. Same interface as an off-ramp, so the car drives it as one.
 */
const HERD_ORIGIN = { x: -9200, z: 9200 };
export const HERD_LEN = 2600;
export function buildHerdRoad(ringS) {
  const raw = [];
  const M = 2600;
  for (let i = 0; i <= M; i++) {
    const u = i / M;
    const x = HERD_ORIGIN.x + u * HERD_LEN;
    const z = HERD_ORIGIN.z + 70 * Math.sin(u * Math.PI * 2.2) + 25 * Math.sin(u * Math.PI * 7.1);
    const y = 40 + 9 * Math.sin(u * Math.PI * 3) + 3 * Math.sin(u * Math.PI * 13);
    raw.push([x, z, y, u]);
  }
  const road = new Spur({ kind: 'herd', side: 1, sA: ringS, sB: ringS, uSep: 0, raw });
  road.tSepA = 0;
  road.tSepB = road.N - 1;
  return road;
}

/** The bridge: a strip of dark stone a lane and a half wide, a thin line of light down its middle. */
export function herdRoadMesh(road) {
  const g = new THREE.Group();
  const deck = new THREE.MeshStandardMaterial({ color: 0x15191e, roughness: 0.35, metalness: 0.2 });
  const line = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.85, 1.1) });
  g.add(new THREE.Mesh(spurRibbon(road, 0, road.N - 2, -3.2, 3.2, 0.04, -1.6, 3), deck));
  const dashes = [];
  for (let t = 0; t < road.N - 6; t += 10) dashes.push(spurRibbon(road, t, t + 4, -0.07, 0.07, 0.07, 0.06, 4));
  g.add(new THREE.Mesh(merge(dashes), line));
  return g;
}

const FLAKES = 9000;

export class Stampede {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.herd = herdPlan().map((p, i) => {
      const a = buildAnimal(p.kind);
      a.g.scale.setScalar(p.scale);
      this.group.add(a.g);
      return { ...a, d: p.d, scaleK: p.scale, rise: p.rise, sOff: p.s, phase: Math.random() * 6, pace: 1.5 + Math.random() * 0.9, wave: 0.6 + Math.random() * 0.9, seed: i * 1.7 };
    });
    this.makeFlakes();
    this.makeDust();
    this.w = 0;
  }

  /** Dark flakes the bodies shed: tumbling, streaming back, gone. */
  makeFlakes() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.5, 0, -0.45, -0.4, 0, 0.5, -0.3, 0.05], 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.07, 0.1), side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false, fog: true });
    const mesh = new THREE.InstancedMesh(geo, mat, FLAKES);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.flakes = {
      mesh, next: 0,
      pos: new Float32Array(FLAKES * 3), vel: new Float32Array(FLAKES * 3), rot: new Float32Array(FLAKES * 3),
      spin: new Float32Array(FLAKES * 3), size: new Float32Array(FLAKES), life: new Float32Array(FLAKES), max: new Float32Array(FLAKES),
    };
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < FLAKES; i++) mesh.setMatrixAt(i, zero);
  }

  /** Breath and grit hanging in the cold air, and the odd ember. */
  makeDust() {
    const N = 700;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3).fill(-1e4), 3));
    this.dust = {
      N, next: 0, life: new Float32Array(N), vel: new Float32Array(N * 3),
      pts: new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8fa4b8, size: 1.1, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })),
    };
    this.group.add(this.dust.pts);
    const E = 80;
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(E * 3).fill(-1e4), 3));
    this.embers = {
      N: E, next: 0, life: new Float32Array(E), vel: new Float32Array(E * 3),
      pts: new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffa060, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })),
    };
    this.group.add(this.embers.pts);
  }

  shed(a, n, Q) {
    const F = this.flakes;
    const k = a.scaleK;
    const p = a.g.position;
    for (let j = 0; j < n; j++) {
      const i = F.next++ % FLAKES;
      // somewhere on the body, mostly the back half
      const back = (Math.random() * 0.9 - 0.3) * a.len * k;
      const side = (Math.random() - 0.5) * a.half * 1.6 * k;
      F.pos[i * 3] = p.x - Q.tx * back + Q.nx * side;
      F.pos[i * 3 + 1] = p.y + (0.5 + Math.random()) * a.hip * k;
      F.pos[i * 3 + 2] = p.z - Q.tz * back + Q.nz * side;
      // left behind by the run, flung up and outward
      const out = Math.sign(a.d) * (1 + Math.random() * 4);
      F.vel[i * 3] = Q.nx * out + (Math.random() - 0.5) * 3;
      F.vel[i * 3 + 1] = 1 + Math.random() * 4;
      // and they're thrown forward, ahead of the herd, as fast as it runs
      F.vel[i * 3] += Q.tx * a.speedNow * 0.9; F.vel[i * 3 + 2] += Q.tz * a.speedNow * 0.9;
      F.vel[i * 3 + 2] = Q.nz * out + (Math.random() - 0.5) * 3;
      for (let c = 0; c < 3; c++) { F.rot[i * 3 + c] = Math.random() * 6; F.spin[i * 3 + c] = (Math.random() - 0.5) * 9; }
      F.size[i] = (0.15 + Math.random() * 0.7) * Math.sqrt(k) * (a.kind === 'wolf' ? 0.6 : 1);
      F.max[i] = F.life[i] = 1 + Math.random() * 1.8;
    }
  }

  puff(D, x, y, z, n, spread, up) {
    const pos = D.pts.geometry.attributes.position.array;
    for (let k = 0; k < n; k++) {
      const i = D.next++ % D.N;
      pos[i * 3] = x + (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = y + Math.random() * 0.6;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      D.vel[i * 3] = (Math.random() - 0.5) * 3;
      D.vel[i * 3 + 1] = up * (0.4 + Math.random());
      D.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
      D.life[i] = 1 + Math.random() * 1.6;
    }
  }

  /** @returns { w, near }: how much herd is around you. `road` is the herd's bridge. */
  update(dt, time, vehicle, road) {
    herdTime.value = time;
    const h = vehicle.spurHit && vehicle.spurHit.spur === road ? vehicle.spurHit : null;
    const target = h ? Math.min(1, h.t / 120, (road.N - h.t) / 120) : 0;
    this.w += (target - this.w) * Math.min(1, dt * (target > this.w ? 1.2 : 2));
    this.group.visible = this.w > 0.01;
    const out = { w: this.w, near: 0 };
    if (!this.group.visible) return out;
    if (h) this.t = h.t;
    const C = road.sample(this.t || 0);
    const along = vehicle.vel.x * C.tx + vehicle.vel.z * C.tz;
    const pace = THREE.MathUtils.clamp(Math.max(along, 0), 18, 48);
    const Q = {};
    for (const a of this.herd) {
      // they charge past you, faster than the car, and the herd never ends
      const run = Math.max(pace, 26) * a.pace * (1 + 0.1 * Math.sin(time * 0.31 + a.phase));
      a.sOff += (run - along) * dt;
      a.speedNow = run;
      const span = 150 + a.scaleK * 6;
      if (a.sOff > span * 0.6) a.sOff -= span;
      if (a.sOff < -span * 0.4) a.sOff += span;
      const ends = THREE.MathUtils.smoothstep(a.sOff, -span * 0.4, -span * 0.3) * (1 - THREE.MathUtils.smoothstep(a.sOff, span * 0.5, span * 0.6));
      // sometimes an animal, sometimes only shards of one: the shape comes and goes fast
      // one slow wave rolls forward through the whole herd, like a breath: bodies
      // gather as it passes and come apart behind it, but never all the way
      const wave = Math.sin(time * 1.15 - a.sOff * 0.035 - Math.abs(a.d) * 0.02);
      const breathe = 0.62 + 0.38 * wave;
      const byLens = Math.abs(a.sOff + 8) < a.len * a.scaleK * 0.6 && Math.abs(a.d) < 4 + a.half * a.scaleK ? 0.3 : 1;
      const form = Math.max(0.3 * ends * this.w, byLens * ends * this.w * THREE.MathUtils.clamp(breathe, 0, 1));
      a.mat.userData.form.value = form;
      a.g.visible = form > 0.02;
      if (!a.g.visible) continue;
      road.sample((this.t || 0) + a.sOff, Q);
      const y = Q.y + a.rise * (1 + 0.15 * Math.sin(time * 0.4 + a.seed));
      // the herd gallops in step: one beat, every body on it
      this.beat = (this.beat || 0) + dt * 0.5 / this.herd.length;
      a.phase = time * 7.5 / Math.sqrt(a.scaleK) + (a.d > 0 ? 0 : Math.PI * 0.5);
      const bob = Math.abs(Math.sin(a.phase)) * a.hip * 0.18 * a.scaleK;
      a.g.position.set(Q.x + Q.nx * a.d, y + bob, Q.z + Q.nz * a.d);
      a.g.rotation.set(Math.sin(a.phase * 2) * 0.05, -Q.heading, 0);
      // smeared by its own speed, and now and then it skips like a bad memory
      a.g.scale.set(a.scaleK, a.scaleK, a.scaleK * (1 + 1.2 * (1 - form)));
      a.legs.forEach((l, i) => { l.rotation.x = Math.sin(a.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.9 : 0)) * a.swing; });
      const lit = form > 0.35 && Math.sin(time * 7 + a.seed * 3) > -0.9;
      a.eyes.forEach((e) => { e.visible = lit; });
      const rate = Math.max(0, 1.1 - form) * (a.kind === 'wolf' ? 40 : 110) * this.w * Math.min(3, Math.sqrt(a.scaleK));
      const n = Math.floor(rate * dt + Math.random());
      if (n > 0) this.shed(a, n, Q);
      if (Math.random() < dt * 0.8 * this.w) this.puff(this.embers, a.g.position.x, y + a.hip * a.scaleK, a.g.position.z, 3, a.half * a.scaleK, 2.5);
      out.near = Math.max(out.near, (1 - Math.min(1, (Math.hypot(a.sOff, a.d) - 4) / 40)) * form);
    }
    this.stepFlakes(dt);
    this.stepPoints(this.dust, dt, 0.4 * this.w);
    this.stepPoints(this.embers, dt, 0.9 * this.w);
    return out;
  }

  stepFlakes(dt) {
    const F = this.flakes;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < FLAKES; i++) {
      if (F.life[i] <= 0) continue;
      F.life[i] -= dt;
      if (F.life[i] <= 0) { F.mesh.setMatrixAt(i, zero); continue; }
      F.vel[i * 3 + 1] -= 1.2 * dt; // light: they barely fall
      for (let c = 0; c < 3; c++) { F.pos[i * 3 + c] += F.vel[i * 3 + c] * dt; F.rot[i * 3 + c] += F.spin[i * 3 + c] * dt; F.vel[i * 3 + c] *= 0.985; }
      const k = F.size[i] * Math.min(1, F.life[i] / (F.max[i] * 0.4));
      p.set(F.pos[i * 3], F.pos[i * 3 + 1], F.pos[i * 3 + 2]);
      q.setFromEuler(e.set(F.rot[i * 3], F.rot[i * 3 + 1], F.rot[i * 3 + 2]));
      F.mesh.setMatrixAt(i, m.compose(p, q, s.setScalar(k)));
    }
    F.mesh.instanceMatrix.needsUpdate = true;
  }

  stepPoints(D, dt, opacity) {
    const pos = D.pts.geometry.attributes.position.array;
    for (let i = 0; i < D.N; i++) {
      if (D.life[i] <= 0) continue;
      D.life[i] -= dt;
      if (D.life[i] <= 0) { pos[i * 3 + 1] = -1e4; continue; }
      pos[i * 3] += D.vel[i * 3] * dt; pos[i * 3 + 1] += D.vel[i * 3 + 1] * dt; pos[i * 3 + 2] += D.vel[i * 3 + 2] * dt;
      D.vel[i * 3 + 1] *= 0.98;
    }
    D.pts.geometry.attributes.position.needsUpdate = true;
    D.pts.material.opacity = opacity;
  }
}
