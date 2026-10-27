// THE STAMPEDE. One stretch of the ring where the air turns cold blue and you're
// suddenly inside a herd: wolves at the road's edge, bison, bears, elk and horses
// beside you, giants further out stacked into the fog. None of them is quite
// solid. They come apart as they run, shedding dark flakes into the wind, and
// pull themselves back together. Their eyes stay lit.
import * as THREE from 'three';
import { LOOP_LEN, sample, elevation, HERD } from './track.js';
import { merge } from './props.js';
import { Spur, spurRibbon } from './spur.js';
import { scoreAt, BREATH, constellationGeo, constellationMat, Vortex, Runes, buildForest, buildVines } from './herdScore.js';

/** Where it happens, as loop fractions: the empty run between the Dust and the Ether. */
export const STAMPEDE = { a: HERD.sA, b: HERD.sB };
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
  const flash = { value: 0 };
  const len = { value: 2 };
  m.userData = { form, len, flash };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uForm: form, uLen: len, uTime: herdTime, uFlash: flash });
    sh.vertexShader = 'varying vec3 vBody;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBody = position;');
    sh.fragmentShader = `
      uniform float uForm; uniform float uLen; uniform float uTime; uniform float uFlash;
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
          outgoingLight += vec3(0.4, 0.55, 0.75) * rim * rim * (0.45 + uFlash * 2.2) + vec3(0.75, 0.88, 1.0) * rim * uFlash * 0.6 + vec3(0.6, 0.78, 1.0) * herdEdge * 0.45;
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

/**
 * A body laid along a spine: overlapping ellipsoids from rump to withers, each
 * with its own girth and height, so the silhouette has a chest, a waist, haunches.
 * `spine` rows: [z, y, rx, ry, rz].
 */
const spineBody = (spine) => spine.map(([z, y, rx, ry, rz]) => sph(1, rx, ry, rz, 0, y, z));

/** A chain of ellipsoids from a to b, tapering: necks, snouts, tails. */
function chain(a, b, r0, r1, n = 4, flat = 1) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = r0 + (r1 - r0) * t;
    out.push(sph(1, r * flat, r, r * 1.5, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t));
  }
  return out;
}

function antlers() {
  const g = [];
  for (const s of [-1, 1]) {
    g.push(tube([[s * 0.12, 3.0, -1.7], [s * 0.6, 3.6, -1.5], [s * 0.9, 4.3, -1.0], [s * 0.95, 4.8, -0.4]], 0.05));
    for (const [t0, t1] of [[[s * 0.45, 3.45, -1.55], [s * 0.6, 3.9, -2.1]], [[s * 0.75, 3.95, -1.25], [s * 1.0, 4.45, -1.75]], [[s * 0.9, 4.45, -0.8], [s * 1.25, 4.9, -1.1]], [[s * 0.92, 4.6, -0.6], [s * 0.7, 5.1, -0.9]]]) {
      g.push(tube([t0, [(t0[0] + t1[0]) / 2, (t0[1] + t1[1]) / 2 + 0.05, (t0[2] + t1[2]) / 2], t1], 0.035));
    }
  }
  return g;
}

/**
 * Each faces -z with its feet at y = 0. `legs`: [x, z, front?]; `up`/`lo` are
 * the thigh and shin lengths (they sum to the hip height), `r` their thickness.
 */
const SPECIES = {
  wolf: {
    body: () => [
      ...spineBody([[0.75, 0.98, 0.22, 0.26, 0.4], [0.3, 0.98, 0.24, 0.27, 0.42], [-0.15, 1.0, 0.27, 0.31, 0.42], [-0.55, 1.05, 0.3, 0.36, 0.4]]),
      ...chain([0, 1.1, -0.75], [0, 1.3, -1.05], 0.2, 0.16, 3),
      sph(1, 0.19, 0.17, 0.24, 0, 1.33, -1.22), ...chain([0, 1.27, -1.38], [0, 1.22, -1.62], 0.1, 0.06, 3),
      cone(0.06, 0.2, 0, -0.1, 1.53, -1.17), cone(0.06, 0.2, 0, 0.1, 1.53, -1.17),
      ...chain([0, 1.02, 0.95], [0, 0.72, 1.55], 0.09, 0.06, 4),
    ],
    legs: [[-0.15, -0.5, 1], [0.15, -0.5, 1], [-0.15, 0.68, 0], [0.15, 0.68, 0]], up: 0.5, lo: 0.48, r: 0.07, hip: 0.98,
    eyes: [[-0.09, 1.38, -1.33], [0.09, 1.38, -1.33]], len: 3.2, half: 0.55, swing: 0.75,
  },
  bison: {
    body: () => [
      ...spineBody([[1.3, 1.85, 0.6, 0.62, 0.7], [0.6, 1.95, 0.72, 0.75, 0.8], [-0.1, 2.15, 0.85, 0.95, 0.75], [-0.7, 2.45, 0.9, 1.15, 0.7], [-1.2, 2.35, 0.75, 1.0, 0.55]]),
      sph(1, 0.55, 0.62, 0.6, 0, 1.75, -1.75), sph(1, 0.42, 0.45, 0.55, 0, 1.4, -2.15), // head hung low
      sph(1, 0.32, 0.5, 0.4, 0, 1.05, -1.95), // beard
      cone(0.08, 0.5, 0, -0.55, 1.95, -1.9).rotateZ(0.3), cone(0.08, 0.5, 0, 0.55, 1.95, -1.9),
      ...chain([0, 1.95, 1.9], [0, 1.4, 2.1], 0.07, 0.05, 3),
    ],
    legs: [[-0.42, -1.0, 1], [0.42, -1.0, 1], [-0.42, 1.25, 0], [0.42, 1.25, 0]], up: 0.75, lo: 0.75, r: 0.2, hip: 1.5,
    eyes: [[-0.35, 1.6, -2.35], [0.35, 1.6, -2.35]], len: 4.8, half: 1.0, swing: 0.6,
  },
  bear: {
    body: () => [
      ...spineBody([[0.95, 1.3, 0.62, 0.62, 0.6], [0.35, 1.42, 0.7, 0.72, 0.65], [-0.3, 1.6, 0.75, 0.82, 0.6], [-0.8, 1.7, 0.66, 0.75, 0.5]]),
      ...chain([0, 1.6, -1.1], [0, 1.5, -1.45], 0.42, 0.38, 2),
      sph(1, 0.4, 0.38, 0.42, 0, 1.55, -1.65), ...chain([0, 1.45, -1.9], [0, 1.4, -2.15], 0.18, 0.12, 2),
      sph(1, 0.12, 0.13, 0.06, -0.26, 1.92, -1.6), sph(1, 0.12, 0.13, 0.06, 0.26, 1.92, -1.6),
    ],
    legs: [[-0.38, -0.75, 1], [0.38, -0.75, 1], [-0.38, 0.85, 0], [0.38, 0.85, 0]], up: 0.6, lo: 0.6, r: 0.2, hip: 1.2,
    eyes: [[-0.16, 1.68, -1.95], [0.16, 1.68, -1.95]], len: 3.8, half: 0.85, swing: 0.6,
  },
  elk: {
    body: () => [
      ...spineBody([[0.85, 1.65, 0.32, 0.38, 0.45], [0.3, 1.62, 0.34, 0.4, 0.5], [-0.3, 1.7, 0.36, 0.44, 0.5], [-0.8, 1.82, 0.34, 0.45, 0.42]]),
      ...chain([0, 1.95, -1.0], [0, 2.75, -1.55], 0.22, 0.16, 5),
      sph(1, 0.16, 0.18, 0.26, 0, 2.85, -1.75), ...chain([0, 2.75, -1.95], [0, 2.6, -2.2], 0.12, 0.08, 2),
      ...antlers(),
    ],
    legs: [[-0.2, -0.75, 1], [0.2, -0.75, 1], [-0.2, 0.85, 0], [0.2, 0.85, 0]], up: 0.78, lo: 0.82, r: 0.07, hip: 1.6,
    eyes: [[-0.14, 2.9, -1.9], [0.14, 2.9, -1.9]], len: 4, half: 0.6, swing: 0.8,
  },
  horse: {
    body: () => [
      ...spineBody([[0.85, 1.62, 0.36, 0.4, 0.45], [0.3, 1.58, 0.36, 0.42, 0.5], [-0.3, 1.62, 0.38, 0.45, 0.5], [-0.8, 1.72, 0.36, 0.46, 0.42]]),
      ...chain([0, 1.9, -1.0], [0, 2.65, -1.4], 0.25, 0.17, 5, 0.7),
      ...chain([0, 2.7, -1.5], [0, 2.4, -2.05], 0.16, 0.1, 4, 0.8),
      cone(0.05, 0.22, 0, -0.08, 2.95, -1.45), cone(0.05, 0.22, 0, 0.08, 2.95, -1.45),
      ...chain([0, 1.85, 1.2], [0, 1.15, 1.75], 0.12, 0.08, 4),
    ],
    legs: [[-0.2, -0.78, 1], [0.2, -0.78, 1], [-0.2, 0.85, 0], [0.2, 0.85, 0]], up: 0.78, lo: 0.8, r: 0.07, hip: 1.58,
    eyes: [[-0.13, 2.68, -1.62], [0.13, 2.68, -1.62]], len: 4, half: 0.6, swing: 0.85,
  },
  elephant: {
    body: () => [
      ...spineBody([[1.6, 3.6, 1.6, 1.6, 1.4], [0.5, 3.8, 1.9, 1.85, 1.6], [-0.7, 4.0, 1.9, 1.9, 1.5], [-1.7, 4.2, 1.6, 1.7, 1.2]]),
      sph(1.3, 1, 1.05, 1, 0, 4.7, -3.2),
      new THREE.CircleGeometry(1.5, 14).scale(0.9, 1.2, 1).rotateY(-1.2).translate(-1.3, 4.7, -2.7),
      new THREE.CircleGeometry(1.5, 14).scale(0.9, 1.2, 1).rotateY(1.2).translate(1.3, 4.7, -2.7),
      cone(0.16, 1.9, -2.0, -0.55, 3.6, -4.2), cone(0.16, 1.9, -2.0, 0.55, 3.6, -4.2),
      tube([[0, 4.4, -4.3], [0, 3.2, -4.9], [0, 1.8, -4.8], [0, 0.9, -4.2]], 0.32),
    ],
    legs: [[-1.0, -1.6, 1], [1.0, -1.6, 1], [-1.0, 1.7, 0], [1.0, 1.7, 0]], up: 1.6, lo: 1.5, r: 0.55, hip: 3.1,
    eyes: [[-0.85, 4.9, -4.2], [0.85, 4.9, -4.2]], len: 7.5, half: 2.3, swing: 0.4,
  },
};
const GEO = {};

/** A leg: thigh from the hip, shin from the knee, a hoof or paw at the end. */
function legGeos(S) {
  return {
    up: new THREE.CylinderGeometry(S.r * 1.5, S.r, S.up, 8).translate(0, -S.up / 2, 0),
    lo: new THREE.CylinderGeometry(S.r, S.r * 0.7, S.lo, 7).translate(0, -S.lo / 2, 0),
    foot: new THREE.CylinderGeometry(S.r * 0.9, S.r * 1.05, S.r * 1.2, 7).translate(0, -S.lo - S.r * 0.4, 0),
    joint: new THREE.SphereGeometry(S.r * 1.15, 8, 6),
  };
}

function buildAnimal(kind) {
  const S = SPECIES[kind];
  GEO[kind] = GEO[kind] || { body: merge(S.body()), ...legGeos(S) };
  GEO[kind].stars = GEO[kind].stars || constellationGeo(GEO[kind].body, kind === 'elephant' ? 5 : 6);
  const G = GEO[kind];
  const mat = herdMat();
  mat.userData.len.value = S.len / 2;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(G.body, mat));
  // the beast as stars: shows when the flesh is gone, so something is always there
  const starMat = constellationMat(S.half * 0.05 + 0.04);
  g.add(new THREE.Points(G.stars, starMat));
  const legs = S.legs.map(([x, z, front]) => {
    const hip = new THREE.Group();
    hip.position.set(x, S.hip, z);
    hip.add(new THREE.Mesh(G.up, mat));
    const knee = new THREE.Group();
    knee.position.y = -S.up;
    knee.add(new THREE.Mesh(G.joint, mat), new THREE.Mesh(G.lo, mat), new THREE.Mesh(G.foot, mat));
    hip.add(knee);
    g.add(hip);
    return { hip, knee, front: !!front };
  });
  const eyes = S.eyes.map(([x, y, z]) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(S.half * 0.06 + 0.03, 6, 5), EYE_MAT);
    e.position.set(x, y, z);
    g.add(e);
    return e;
  });
  return { ...S, g, legs, eyes, mat, starMat, kind };
}

// ---------------------------------------------------------------- the herd

/** Who runs where: small and close at the road's edge, giants far out and up in the fog. */
function herdPlan() {
  const plan = [];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  for (const side of [-1, 1]) {
    // at the edge of the bridge: big wolves and horses, close enough to touch
    for (let k = 0; k < 6; k++) plan.push({ kind: pick(['wolf', 'wolf', 'horse']), d: side * (5 + Math.random() * 1.5), scale: 1.6 + Math.random() * 0.5, rise: -0.6, s: -60 + k * 25, rank: k * 0.05 });
    // the herd proper: bodies three to seven times life size, a wall rising away from you
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 7; k++) {
        plan.push({ kind: pick(['bison', 'bison', 'bear', 'elk', 'horse']), d: side * (11 + row * 9 + Math.random() * 3), scale: 3 + row * 1.3 + Math.random(), rise: -0.75, s: -60 + (k / 7) * 150 + Math.random() * 12, rank: 0.12 + row * 0.14 + Math.random() * 0.14 });
      }
    }
    // titans: heads above the top of the screen, striding through the fog
    for (let k = 0; k < 5; k++) {
      plan.push({ kind: k === 2 ? 'elephant' : pick(['bison', 'elk', 'bear']), d: side * (55 + Math.random() * 25), scale: k === 2 ? 9 : 11 + Math.random() * 6, rise: -0.75, s: -40 + k * 30, rank: 0.68 + Math.random() * 0.22 });
    }
  }
  return plan;
}

/**
 * The herd's own country: a thin bridge strung across a cold void, far from
 * anywhere else. Same interface as an off-ramp, so the car drives it as one.
 */
/** The herd's road is an off-ramp: it shares the deck, peels away, and comes back. */
export function buildHerdRoad() {
  return new Spur(HERD);
}

/** How wide the road is at fraction u: highway at both ends, a thin strip in the middle. */
export const herdHalfWidth = (u) => {
  const thin = THREE.MathUtils.smoothstep(u, 0.05, 0.16) * (1 - THREE.MathUtils.smoothstep(u, 0.84, 0.95));
  return 8.3 + (3.6 - 8.3) * thin;
};

/** Pale old concrete: stains, cracks, potholes, and edges that have crumbled away. */
function brokenRoadTexture() {
  const W = 256;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#5d685f';
  g.fillRect(0, 0, W, H);
  // moss and lichen in the low places, greener toward the crumbling edges
  for (let k = 0; k < 140; k++) {
    const edge = Math.random() < 0.6;
    const x = edge ? (Math.random() < 0.5 ? Math.random() * 50 : W - Math.random() * 50) : Math.random() * W;
    const y = Math.random() * H, r = 6 + Math.random() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${60 + Math.random() * 30},${110 + Math.random() * 50},${60 + Math.random() * 20},${0.35 + Math.random() * 0.35})`);
    gr.addColorStop(1, 'rgba(60,110,60,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // lighter worn patches and grit
  for (let k = 0; k < 4000; k++) { g.fillStyle = `rgba(${150 + Math.random() * 60},${150 + Math.random() * 60},${150 + Math.random() * 60},${Math.random() * 0.08})`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  // grime and wet stains
  for (let k = 0; k < 90; k++) {
    const x = Math.random() * W, y = Math.random() * H, r = 10 + Math.random() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(10,11,12,${0.2 + Math.random() * 0.4})`);
    gr.addColorStop(1, 'rgba(10,11,12,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // tyre-dark track down the middle
  g.fillStyle = 'rgba(30,32,34,0.18)';
  g.fillRect(W * 0.3, 0, W * 0.4, H);
  // potholes
  for (let k = 0; k < 9; k++) {
    const x = 30 + Math.random() * (W - 60), y = Math.random() * H;
    g.fillStyle = 'rgba(6,7,8,0.95)';
    g.beginPath();
    g.ellipse(x, y, 6 + Math.random() * 16, 5 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // cracks, branching
  g.strokeStyle = 'rgba(8,9,10,0.85)';
  for (let k = 0; k < 40; k++) {
    let x = Math.random() * W, y = Math.random() * H;
    g.lineWidth = 0.6 + Math.random() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 7; i++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.3) * 50; g.lineTo(x, y); }
    g.stroke();
  }
  // crumbled edges: bite away the sides, deeper in places
  const img = g.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    const bite = (side) => 6 + 18 * Math.max(0, Math.sin(y * 0.021 + side * 2.1) * Math.sin(y * 0.0073 + side)) + Math.random() * 7;
    const l = bite(0);
    const r = bite(1);
    for (let x = 0; x < W; x++) if (x < l || x > W - r) img.data[(y * W + x) * 4 + 3] = 0;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The bridge: a strip of bright broken concrete a lane and a half wide over the void. */
export function herdRoadMesh(road) {
  const g = new THREE.Group();
  const tex = brokenRoadTexture();
  const pos = [];
  const uv = [];
  const A = {};
  const B = {};
  for (let t = road.tSepA; t < road.tSepB - 3; t += 3) {
    road.sample(t, A);
    road.sample(t + 3, B);
    const wa = herdHalfWidth(A.u), wb = herdHalfWidth(B.u);
    const c = (P, d) => [P.x + P.nx * d, P.y + 0.04, P.z + P.nz * d];
    const a0 = c(A, -wa), a1 = c(A, wa), b0 = c(B, -wb), b1 = c(B, wb);
    const v0 = t / 40, v1 = (t + 3) / 40;
    pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
    uv.push(0, v0, 0, v1, 1, v1, 0, v0, 1, v1, 1, v0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const deck = new THREE.MeshStandardMaterial({
    // wet: it holds the tail lights and the sky
    map: tex, alphaTest: 0.5, color: 0xffffff, roughness: 0.32, metalness: 0.1, envMapIntensity: 1.3, emissive: 0x1a221c, emissiveMap: tex, side: THREE.DoubleSide,
  });
  g.add(new THREE.Mesh(geo, deck));
  // the slab's broken underside
  g.add(new THREE.Mesh(spurRibbon(road, road.tSepA, road.tSepB, -2.9, 2.9, -0.02, -1.4, 3), new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 1 })));
  // a worn centre line, missing in stretches
  const dashes = [];
  for (let t = road.tSepA; t < road.tSepB - 6; t += 10) if (Math.sin(t * 0.013) > -0.4 && Math.random() > 0.2) dashes.push(spurRibbon(road, t, t + 4, -0.08, 0.08, 0.06, 0.05, 4));
  // the land the herd runs on: it rises out of the void under the middle of the road and sinks back
  const lp = [];
  const lc = [];
  for (let t = road.tSepA; t < road.tSepB - 6; t += 6) {
    road.sample(t, A); road.sample(t + 6, B);
    const ka = THREE.MathUtils.smoothstep(A.u, 0.1, 0.24) * (1 - THREE.MathUtils.smoothstep(A.u, 0.76, 0.9));
    const kb = THREE.MathUtils.smoothstep(B.u, 0.1, 0.24) * (1 - THREE.MathUtils.smoothstep(B.u, 0.76, 0.9));
    for (const [d0, d1] of [[-160, -4.2], [4.2, 160]]) {
      const c = (P, d, k) => [P.x + P.nx * d, P.y - 0.8 - (1 - k) * 30, P.z + P.nz * d];
      const q = [c(A, d0, ka), c(A, d1, ka), c(B, d1, kb), c(B, d0, kb)];
      const al = [ka, ka, kb, kb];
      for (const i of [0, 1, 2, 0, 2, 3]) { lp.push(...q[i]); lc.push(0.09, 0.12, 0.1, al[i]); }
    }
  }
  const land = new THREE.BufferGeometry();
  land.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  land.setAttribute('color', new THREE.Float32BufferAttribute(lc, 4));
  land.computeVertexNormals();
  g.add(new THREE.Mesh(land, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.6, side: THREE.DoubleSide, depthWrite: true })));
  g.add(new THREE.Mesh(merge(dashes), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.86, 0.84) })));
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
      return { ...a, rank: p.rank, d: p.d, scaleK: p.scale, rise: p.rise, sOff: p.s, phase: Math.random() * 6, pace: 1.5 + Math.random() * 0.9, wave: 0.6 + Math.random() * 0.9, seed: i * 1.7 };
    });
    this.makeFlakes();
    this.makeDust();
    this.vortex = new Vortex(this.group);
    this.runes = new Runes(this.group);
    this.w = 0;
  }

  /** The old trees and creeping vines belong to the bridge, not the herd. */
  plant(road, scene) {
    this.forest = new THREE.Group();
    this.trees = buildForest(road, this.forest);
    buildVines(road, this.forest);
    scene.add(this.forest);
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
      F.vel[i * 3 + 2] = Q.nz * out + (Math.random() - 0.5) * 3;
      F.vel[i * 3] += Q.tx * a.speedNow * 0.9; F.vel[i * 3 + 2] += Q.tz * a.speedNow * 0.9;
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
    const uh = h ? h.t / road.N : 0;
    // no cut: the herd seeps in as the road leaves the deck, and drains out before it rejoins
    const target = h ? THREE.MathUtils.smoothstep(uh, 0.03, 0.15) * (1 - THREE.MathUtils.smoothstep(uh, 0.86, 0.97)) : 0;
    this.w += (target - this.w) * Math.min(1, dt * 2.5);
    this.group.visible = this.w > 0.01;
    const out = { w: this.w, near: 0 };
    if (!this.group.visible) return out;
    if (h) this.t = h.t;
    // the score: which act we're in, and what it asks of the herd
    const ur = (this.t || 0) / road.N;
    const u = THREE.MathUtils.clamp((ur - 0.08) / 0.84, 0, 1); // the score plays over the ramp's middle
    this.hover = 1 - THREE.MathUtils.smoothstep(ur, 0.1, 0.24) * (1 - THREE.MathUtils.smoothstep(ur, 0.76, 0.9));
    const sc = scoreAt(u);
    const I = sc.swell;
    this.intensity = I;
    this.score = sc;
    out.intensity = I;
    out.score = sc;
    // one held breath before the crescendo: the world goes almost entirely to fog, then they burst out of it
    const fz = Math.abs(u - 0.58) / 0.05;
    out.whiteout = fz < 1 ? Math.pow(Math.cos(fz * Math.PI / 2), 0.6) * this.w : 0;
    if (this.trees) for (const tr of this.trees) tr.g.visible = Math.abs(tr.u - ur) < 0.12 && ((tr.u * 97) % 1) < sc.trees;
    const C = road.sample(this.t || 0);
    const along = vehicle.vel.x * C.tx + vehicle.vel.z * C.tz;
    const pace = THREE.MathUtils.clamp(Math.max(along, 0), 18, 48);
    const Q = {};
    for (const a of this.herd) {
      // they charge past you, faster than the car, and the herd never ends
      const run = Math.max(pace, 26) * a.pace * (0.7 + 0.55 * I) * (1 + 0.1 * Math.sin(time * 0.31 + a.phase));
      a.sOff += (run - along) * dt;
      a.speedNow = run;
      const span = 150 + a.scaleK * 6;
      if (a.sOff > span * 0.6) a.sOff -= span;
      if (a.sOff < -span * 0.4) a.sOff += span;
      const ends = THREE.MathUtils.smoothstep(a.sOff, -span * 0.4, -span * 0.3) * (1 - THREE.MathUtils.smoothstep(a.sOff, span * 0.5, span * 0.6));
      // sometimes an animal, sometimes only shards of one: the shape comes and goes fast
      // one slow wave rolls forward through the whole herd, like a breath: bodies
      // gather as it passes and come apart behind it, but never all the way
      const wave = Math.sin((time / BREATH) * Math.PI * 2 - a.sOff * 0.035 - Math.abs(a.d) * 0.02); // one breath every φ seconds
      const breathe = 0.62 + 0.38 * wave;
      const byLens = Math.abs(a.sOff + 8) < a.len * a.scaleK * 0.6 && Math.abs(a.d) < 4 + a.half * a.scaleK ? 0.3 : 1;
      const arrived = THREE.MathUtils.smoothstep(I, a.rank, a.rank + 0.08);
      const frail = 0.45 + 0.55 * I;
      const form = sc.body * arrived * frail * Math.max(0.3 * ends * this.w, byLens * ends * this.w * THREE.MathUtils.clamp(breathe, 0, 1));
      a.mat.userData.form.value = form;
      // as the wave crests, light rakes the body for a moment: a flash of what it is
      a.mat.userData.flash.value = Math.pow(Math.max(0, wave), 10);
      // stars arrive a little ahead of the flesh, and burn brightest when the body is gone
      const starArrive = THREE.MathUtils.smoothstep(I + 0.3, a.rank, a.rank + 0.08) * ends * this.w;
      const stars = starArrive * Math.min(1, sc.stars * (0.35 + 0.65 * (1 - form)) + 0.15);
      a.starMat.opacity = stars * (0.75 + 0.25 * Math.sin(time * 9 + a.seed));
      a.g.visible = form > 0.02 || stars > 0.02;
      if (!a.g.visible) continue;
      road.sample((this.t || 0) + a.sOff, Q);
      // out over the void (before the land rises, after it sinks) they hover in space
      // the herd gallops in step: one beat, every body on it
      a.phase = time * 7.5 / Math.sqrt(a.scaleK) + (a.d > 0 ? 0 : Math.PI * 0.5);
      const bob = Math.abs(Math.sin(a.phase)) * a.hip * 0.18 * a.scaleK;
      // out over the void (before the land rises, after it sinks) they're colossal and
      // sunk: the head rides level with the car, the body plunges down past the road
      const hv = this.hover;
      const grow = a.scaleK * (0.5 + 0.5 * Math.min(1, I + 0.15)) * (1 + hv * (a.kind === 'wolf' ? 0.6 : 1.4));
      const headY = a.eyes[0].position.y * grow;
      const y = Q.y + a.rise * (1 - hv) + hv * (1.4 - headY);
      const d = a.d + Math.sign(a.d) * hv * (a.half * grow * 0.9 + 2);
      a.g.position.set(Q.x + Q.nx * d, y + bob, Q.z + Q.nz * d);
      a.g.rotation.set(Math.sin(a.phase * 2) * 0.05, -Q.heading, 0);
      // smeared by its own speed
      a.g.scale.set(grow, grow, grow * (1 + 1.2 * (1 - form)));
      // a rotary gallop: the two fronts land close together, then the two hinds
      a.legs.forEach((l, i) => {
        const p = a.phase + [0, 0.45, Math.PI, Math.PI + 0.45][i];
        l.hip.rotation.x = Math.sin(p) * a.swing;
        const lift = Math.max(0, Math.sin(p + 1.1));
        l.knee.rotation.x = l.front ? -lift * 1.4 : lift * 1.0;
      });
      const lit = form > 0.35 && Math.sin(time * 7 + a.seed * 3) > -0.9;
      a.eyes.forEach((e) => { e.visible = lit; });
      const rate = (0.3 + I) * Math.max(0, 1.1 - form) * (a.kind === 'wolf' ? 40 : 110) * this.w * Math.min(3, Math.sqrt(a.scaleK));
      const n = Math.floor(rate * dt + Math.random());
      if (n > 0) this.shed(a, n, Q);
      if (Math.random() < dt * 0.8 * this.w) this.puff(this.embers, a.g.position.x, y + a.hip * a.scaleK, a.g.position.z, 3, a.half * a.scaleK, 2.5);
      out.near = Math.max(out.near, (1 - Math.min(1, (Math.hypot(a.sOff, a.d) - 4) / 40)) * form);
    }
    // the spiral opens ahead and the runes surface beside you
    const ahead = road.sample((this.t || 0) + 230);
    const eyeC = new THREE.Vector3(ahead.x, ahead.y + 34, ahead.z);
    const T = new THREE.Vector3(-ahead.tx, 0, -ahead.tz);
    this.vortex.update(time, eyeC, T, 70 + 40 * sc.vortex, sc.vortex * this.w);
    this.runes.update(dt, time, road, this.t || 0, sc.runes * this.w);
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
