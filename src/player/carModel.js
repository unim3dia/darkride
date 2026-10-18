// A '70s land yacht, built as one: a beveled body shell with real wheel arches,
// a greenhouse of pillars and glass, chrome grille and quad lamps, a cabin with
// bench seats, and wire wheels with whitewalls and knock-off spinners.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { pulseMat } from '../render/pulseMaterial.js';
import { MATS, EYE_MAT, HEADLIGHT_MAT, TAIL_MAT, SHARED_MATS, merge } from '../world/props.js';

export const CAR_MATS = {
  paint: MATS.paint,
  paintDull: MATS.paintDull,
  chrome: MATS.chrome,
  glass: MATS.glass,
  rubber: MATS.rubber,
  whitewall: MATS.whitewall,
  vinyl: pulseMat({ color: 0x050506, roughness: 0.75, metalness: 0.0, envMapIntensity: 0.25 }),
  leather: pulseMat({ color: 0x0b0807, roughness: 0.6, envMapIntensity: 0.3 }),
  darkChrome: pulseMat({ color: 0x2a2c30, roughness: 0.35, metalness: 1.0, envMapIntensity: 0.9 }),
  seam: pulseMat({ color: 0x010101, roughness: 1.0, envMapIntensity: 0.0 }),
  rust: MATS.rust,
  amber: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.1, 0.01) }),
  redLamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.02, 0.01) }),
};
for (const m of Object.values(CAR_MATS)) SHARED_MATS.add(m);

export const WHEEL_RADIUS = 0.36;
export const WHEELS = [[-0.86, -1.72], [0.86, -1.72], [-0.86, 1.86], [0.86, 1.86]];

// ---------------------------------------------------------------- helpers

const rbox = (w, h, d, x, y, z, r = 0.03) => new RoundedBoxGeometry(w, h, d, LOD === 'high' ? 3 : 1, r).translate(x, y, z);
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** A cylinder strung between two points. */
function strut(a, b, r = 0.03, seg = 6) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  const m = A.add(B).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}

/** Side-profile (car z, y) extruded across the car's width from x0 to x0 + depth. */
let LOD = 'high'; // static cars are built at 'low': same silhouette, a fraction of the triangles

function extrudeSide(points, x0, depth, bevel = null, arches = []) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (const p of points.slice(1)) {
    if (p === 'arch') {
      const [cx, cy, r, from, to] = arches.shift();
      s.absarc(cx, cy, r, from, to, true); // clockwise: up and over the tire
    } else s.lineTo(p[0], p[1]);
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    curveSegments: LOD === 'high' ? 18 : 7,
    bevelEnabled: !!bevel,
    bevelThickness: bevel ? bevel[0] : 0,
    bevelSize: bevel ? bevel[1] : 0,
    bevelSegments: LOD === 'high' ? 4 : 1,
  });
  g.rotateY(-Math.PI / 2);
  return g.translate(x0 + depth, 0, 0);
}

/** A flat pane lying in the car's z-y plane at x. */
function sidePane(points, x) {
  const s = new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ShapeGeometry(s);
  g.rotateY(-Math.PI / 2);
  return g.translate(x, 0, 0);
}

/** Quad from four corners (counter-clockwise seen from the front face). */
function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- body

const ARCH_R = 0.52;

function bodyParts({ wheel: withWheel = true } = {}) {
  const P = { paint: [], chrome: [], glass: [], vinyl: [], leather: [], darkChrome: [], seam: [], amber: [], redLamp: [], rubber: [] };

  // the shell, built as real panels so the cabin is hollow:
  // a floor pan, front clip and rear quarters with arches cut in, and thin door skins
  const BEV = [0.06, 0.045];
  const a0 = Math.asin((0.62 - 0.4) / ARCH_R);
  const archHalf = Math.cos(a0) * ARCH_R;
  P.paint.push(extrudeSide([[-1.22, 0.38], [1.32, 0.38], [1.32, 0.62], [-1.22, 0.62]], -0.88, 1.76, BEV));      // rocker / floor
  P.paint.push(extrudeSide([[-2.74, 0.4], [-2.24, 0.4], [-2.24, 0.62], [-2.84, 0.62], [-2.84, 0.52]], -0.88, 1.76, BEV)); // front valance
  P.paint.push(extrudeSide([[2.4, 0.4], [2.74, 0.4], [2.84, 0.55], [2.84, 0.62], [2.4, 0.62]], -0.88, 1.76, BEV));      // rear valance
  P.paint.push(extrudeSide([
    [-1.13, 0.62], [-1.13, 0.99], [-2.7, 0.93], [-2.86, 0.86], [-2.86, 0.62], [-1.72 - archHalf, 0.62], 'arch',
  ], -0.88, 1.76, BEV, [[-1.72, 0.4, ARCH_R, Math.PI - a0, a0]]));                                                 // hood + fenders
  P.paint.push(extrudeSide([
    [1.3, 0.62], [1.86 - archHalf, 0.62], 'arch', [2.84, 0.62], [2.84, 0.92], [2.66, 0.98], [1.3, 1.0],
  ], -0.88, 1.76, BEV, [[1.86, 0.4, ARCH_R, Math.PI - a0, a0]]));                                                  // trunk + quarters
  for (const sx of [-1, 1]) {
    P.paint.push(extrudeSide([[-1.13, 0.62], [1.3, 0.62], [1.3, 1.0], [-1.13, 0.99]], sx > 0 ? 0.8 : -0.88, 0.08, [0.03, 0.03])); // door skins
  }

  // greenhouse: vinyl top, pillars, a wide '70s sail panel
  P.vinyl.push(rbox(1.68, 0.07, 1.3, 0, 1.53, 0.18, 0.03));
  for (const sx of [-1, 1]) {
    P.paint.push(strut([sx * 0.84, 1.0, -1.17], [sx * 0.8, 1.5, -0.46], 0.035));       // A
    P.paint.push(strut([sx * 0.85, 1.0, 0.13], [sx * 0.82, 1.5, 0.13], 0.04));          // B
    P.vinyl.push(extrudeSide([[0.52, 1.5], [0.84, 1.5], [1.56, 1.01], [1.0, 1.01]], sx > 0 ? 0.78 : -0.84, 0.06)); // C sail
    P.chrome.push(strut([sx * 0.88, 1.01, -1.15], [sx * 0.88, 1.01, 1.5], 0.012, 4)); // belt trim
    P.chrome.push(strut([sx * 0.83, 1.53, -0.47], [sx * 0.83, 1.53, 0.84], 0.012, 4)); // drip rail
  }
  // glass
  P.glass.push(quad([-0.8, 1.02, -1.15], [0.8, 1.02, -1.15], [0.78, 1.48, -0.48], [-0.78, 1.48, -0.48])); // windshield
  P.glass.push(quad([0.76, 1.02, 1.52], [-0.76, 1.02, 1.52], [-0.74, 1.48, 0.84], [0.74, 1.48, 0.84])); // backlight
  for (const sx of [-1, 1]) {
    P.glass.push(sidePane([[-1.12, 1.02], [-0.5, 1.47], [0.1, 1.47], [0.1, 1.02]], sx * 0.84));
    P.glass.push(sidePane([[0.17, 1.02], [0.17, 1.47], [0.52, 1.47], [0.98, 1.02]], sx * 0.84));
  }

  // front: grille, quad lamps in chrome bezels, bumper with guards, ornament
  P.chrome.push(rbox(1.18, 0.3, 0.05, 0, 0.71, -2.87, 0.02));
  P.seam.push(box(1.08, 0.22, 0.04, 0, 0.71, -2.86));
  for (let i = 0; i < 15; i++) P.darkChrome.push(box(0.018, 0.22, 0.03, -0.49 + i * 0.07, 0.71, -2.885));
  for (const sx of [-1, 1]) {
    P.chrome.push(rbox(0.44, 0.2, 0.05, sx * 0.86, 0.74, -2.85, 0.02));
    P.amber.push(box(0.2, 0.05, 0.02, sx * 0.7, 0.5, -3.02));
  }
  P.chrome.push(rbox(2.1, 0.17, 0.2, 0, 0.5, -2.93, 0.06));
  for (const sx of [-1, 1]) P.chrome.push(rbox(0.09, 0.26, 0.12, sx * 0.42, 0.52, -3.0, 0.03));
  P.chrome.push(new THREE.ConeGeometry(0.03, 0.12, 8).translate(0, 1.05, -2.62));

  // rear: bumper, plate recess, exhaust
  P.chrome.push(rbox(2.1, 0.17, 0.2, 0, 0.5, 2.93, 0.06));
  P.seam.push(box(0.5, 0.16, 0.03, 0, 0.72, 2.86));
  P.chrome.push(strut([0.55, 0.36, 2.6], [0.55, 0.36, 3.02], 0.04, 8));

  // sides: chrome spear, door seams, handles, mirrors
  for (const sx of [-1, 1]) {
    const x = sx * 1.0;
    P.chrome.push(strut([x, 0.78, -2.6], [x, 0.78, 2.6], 0.015, 4));
    for (const z of [-1.13, 0.13, 1.2]) P.seam.push(box(0.012, 0.5, 0.01, x, 0.72, z));
    P.chrome.push(box(0.03, 0.03, 0.16, sx * 1.01, 0.9, -0.15), box(0.03, 0.03, 0.16, sx * 1.01, 0.9, 0.95));
    P.chrome.push(strut([sx * 0.96, 1.0, -1.02], [sx * 1.08, 1.1, -1.0], 0.015, 5));
    P.chrome.push(rbox(0.06, 0.09, 0.14, sx * 1.1, 1.12, -1.0, 0.02));
  }

  // ---- the details that make it a '70s land yacht and not a box
  const seg = LOD === 'high' ? 1 : 0;
  for (const sx of [-1, 1]) {
    const x = sx * 0.975;
    // chrome lips around the wheel arches
    for (const az of [-1.72, 1.86]) {
      P.chrome.push(new THREE.TorusGeometry(ARCH_R + 0.06, 0.014, 4, 12 + seg * 12, Math.PI).rotateY(Math.PI / 2).translate(x, 0.4, az));
    }
    // landau bar: the chrome S on the sail panel
    P.chrome.push(new THREE.TorusGeometry(0.16, 0.014, 4, 8 + seg * 8, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(sx * 0.875, 1.27, 1.02));
    P.chrome.push(strut([sx * 0.875, 1.27, 1.18], [sx * 0.875, 1.18, 1.4], 0.014, 4));
    // vent-window divider and side markers
    P.chrome.push(strut([sx * 0.845, 1.02, -0.8], [sx * 0.845, 1.25, -0.8], 0.012, 4));
    P.amber.push(box(0.02, 0.06, 0.16, sx * 1.015, 0.8, -2.45));
    P.redLamp.push(box(0.02, 0.06, 0.16, sx * 1.015, 0.8, 2.6));
    // rocker chrome
    P.chrome.push(strut([sx * 0.99, 0.45, -1.15], [sx * 0.99, 0.45, 1.3], 0.016, 4));
  }
  // grille bar, bumper rubber, trunk script, dual exhaust, whip antenna
  P.chrome.push(box(1.1, 0.025, 0.03, 0, 0.71, -2.895));
  P.seam.push(box(1.96, 0.035, 0.02, 0, 0.5, -3.035), box(1.96, 0.035, 0.02, 0, 0.5, 3.035));
  P.chrome.push(box(0.32, 0.03, 0.012, 0.5, 0.88, 2.865));
  P.chrome.push(strut([-0.55, 0.36, 2.6], [-0.55, 0.36, 3.02], 0.04, 8));
  P.chrome.push(strut([0.86, 0.99, 2.3], [0.88, 1.95, 2.42], 0.006, 3));
  // continental kit: the spare rides proud behind the bumper
  P.rubber.push(new THREE.TorusGeometry(0.28, 0.1, 6 + seg * 4, 14 + seg * 10).translate(0, 0.74, 3.17));
  P.chrome.push(new THREE.CylinderGeometry(0.23, 0.23, 0.07, 14 + seg * 10).rotateX(Math.PI / 2).translate(0, 0.74, 3.22));
  P.chrome.push(box(0.5, 0.12, 0.34, 0, 0.5, 3.1));
  // chromed undercarriage: frame rails, cross members, control arms, coils
  for (const sx of [-1, 1]) {
    P.chrome.push(box(0.08, 0.1, 4.3, sx * 0.55, 0.33, 0.1));
    for (const az of [-1.72, 1.86]) {
      P.chrome.push(strut([sx * 0.55, 0.33, az - 0.2], [sx * 0.82, 0.37, az], 0.025, 4));
      P.chrome.push(strut([sx * 0.55, 0.33, az + 0.2], [sx * 0.82, 0.37, az], 0.025, 4));
      for (let k = 0; k < 4; k++) P.chrome.push(new THREE.TorusGeometry(0.09, 0.012, 4, 10).rotateX(Math.PI / 2).translate(sx * 0.7, 0.4 + k * 0.05, az));
    }
  }
  for (const z of [-1.2, 0.2, 1.5]) P.chrome.push(box(1.1, 0.06, 0.08, 0, 0.33, z));

  // cabin: dash, benches, wheel
  P.leather.push(rbox(1.72, 0.24, 0.42, 0, 0.9, -0.86, 0.06));
  P.leather.push(rbox(1.62, 0.18, 0.56, 0, 0.62, 0.28, 0.06), rbox(1.62, 0.55, 0.14, 0, 0.92, 0.6, 0.06));
  P.leather.push(rbox(1.62, 0.18, 0.5, 0, 0.62, 1.28, 0.06), rbox(1.62, 0.5, 0.14, 0, 0.9, 1.56, 0.06));
  P.seam.push(box(1.7, 0.08, 4.6, 0, 0.42, 0)); // floor pan / underside
  P.darkChrome.push(strut(WHEEL_HUB, [-0.45, 0.92, -0.86], 0.025)); // steering column
  if (withWheel) P.darkChrome.push(steeringWheelGeo().rotateX(WHEEL_TILT).translate(...WHEEL_HUB));
  return P;
}

// ---------------------------------------------------------------- steering wheel + hand

const WHEEL_HUB = [-0.45, 1.06, -0.6];
const WHEEL_TILT = -0.45;
const RIM_R = 0.19;

/** A thin-rimmed '70s wheel with three spokes, in its own plane (facing +Z). */
function steeringWheelGeo() {
  const parts = [new THREE.TorusGeometry(RIM_R, 0.016, 8, 36)];
  for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
    parts.push(strut([0, 0, 0], [Math.cos(a) * RIM_R, Math.sin(a) * RIM_R, 0], 0.008, 4));
  }
  parts.push(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 14).rotateX(Math.PI / 2));
  return merge(parts);
}

/**
 * The right hand, loose on the bottom of the rim: knuckles over the top of the
 * rim, fingers curled round behind it, thumb lying along it. Built in wheel space,
 * at the rim's lowest point, so it turns with the wheel.
 */
function handGeo() {
  const parts = [];
  // back of the hand lying over the rim, knuckles forward
  parts.push(new THREE.SphereGeometry(0.05, 14, 10).scale(1.25, 0.62, 1.0).translate(0.012, -RIM_R + 0.004, 0.03));
  // four fingers curled loosely round the rim: soft capsules, each a little shorter outward
  for (let k = 0; k < 4; k++) {
    const len = 0.05 - k * 0.006;
    const f = new THREE.CapsuleGeometry(0.0105, len, 4, 8);
    f.rotateX(Math.PI / 2 - 0.25).translate(-0.022 + k * 0.016, -RIM_R - 0.016, -0.004);
    parts.push(f);
    parts.push(new THREE.SphereGeometry(0.011, 8, 6).translate(-0.022 + k * 0.016, -RIM_R - 0.03, -0.028)); // fingertips tucked under
  }
  // thumb resting along the top of the rim, relaxed
  parts.push(new THREE.CapsuleGeometry(0.011, 0.04, 4, 8).rotateZ(Math.PI / 2 - 0.45).translate(0.054, -RIM_R + 0.016, 0.016));
  // heel of the palm and the wrist, narrowing into the cuff
  parts.push(new THREE.SphereGeometry(0.036, 10, 8).scale(1.1, 0.9, 1.1).translate(0.016, -RIM_R - 0.02, 0.07));
  parts.push(new THREE.CylinderGeometry(0.034, 0.03, 0.06, 12).rotateX(Math.PI / 2 - 0.3).translate(0.018, -RIM_R - 0.024, 0.105));
  return merge(parts);
}

/**
 * Near-black that ignores the dash glow: only a faint dark-grey edge where the
 * surface turns away from you, so the hand is a shape at the edge of the dark.
 */
export function shadowMat() {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
        gl_FragColor = vec4(vec3(0.005 + rim * 0.038), 1.0);
      }
    `,
  });
}

/** Steering wheel pivot with the hand on it; the forearm is restrung each frame. */
export function buildSteering(mat) {
  const pivot = new THREE.Group();
  pivot.position.set(...WHEEL_HUB);
  pivot.rotation.x = WHEEL_TILT;
  const spin = new THREE.Group();
  pivot.add(spin);
  spin.add(new THREE.Mesh(steeringWheelGeo(), CAR_MATS.darkChrome));
  // the grip sits low on the rim, round at about five o'clock: lazy, one-handed
  const grip = new THREE.Group();
  grip.rotation.z = 0.62;
  spin.add(grip);
  const hand = new THREE.Mesh(handGeo(), mat);
  grip.add(hand);
  const wrist = new THREE.Object3D();
  wrist.position.set(0.02, -RIM_R - 0.02, 0.12);
  grip.add(wrist);
  // the arm: shoulder → elbow → wrist, solved each frame so the elbow hangs naturally
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.034, 1, 14), mat);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.052, 1, 14), mat);
  const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), mat);
  const shoulderJoint = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10).scale(1.1, 0.9, 1), mat);
  return {
    pivot, spin, hand, wrist, forearm, upper, elbowJoint, shoulderJoint,
    shoulder: new THREE.Vector3(-0.22, 0.96, 0.24), // the driver's right shoulder, in body space
    upperLen: 0.4, foreLen: 0.42,
    pole: new THREE.Vector3(1, -0.45, 0.1).normalize(), // a lazy elbow, dropped and out toward the door side of the bench
  };
}

// ---------------------------------------------------------------- wire wheels

const wheelGeoCache = {};
function wheelGeometry() {
  if (wheelGeoCache[LOD]) return wheelGeoCache[LOD];
  const hi = LOD === 'high';
  const prof = [[0.235, -0.12], [0.29, -0.125], [0.338, -0.112], [0.358, -0.07], [0.36, 0], [0.358, 0.07], [0.338, 0.112], [0.29, 0.125], [0.235, 0.12]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const tire = new THREE.LatheGeometry(hi ? prof : prof.filter((_, i) => i % 2 === 0), hi ? 30 : 14).rotateZ(Math.PI / 2);
  const wall = new THREE.RingGeometry(0.255, 0.305, hi ? 30 : 14).rotateY(Math.PI / 2).translate(0.127, 0, 0);
  const spokes = [];
  const nSpokes = hi ? 36 : 12;
  for (let k = 0; k < nSpokes; k++) {
    const a = (k / nSpokes) * Math.PI * 2;
    const ha = a + (k % 2 ? 0.42 : -0.42);
    const hx = ((k % 3) - 1) * 0.035 - 0.02;
    spokes.push(strut([hx, Math.cos(ha) * 0.05, Math.sin(ha) * 0.05], [0.04, Math.cos(a) * 0.232, Math.sin(a) * 0.232], 0.005, 3));
  }
  const lip = new THREE.TorusGeometry(0.235, 0.016, hi ? 6 : 4, hi ? 30 : 14).rotateY(Math.PI / 2).translate(0.05, 0, 0);
  const hub = new THREE.CylinderGeometry(0.055, 0.06, 0.12, 12).rotateZ(Math.PI / 2).translate(0.04, 0, 0);
  const spinner = [0, 1, 2].map((i) => box(0.02, 0.15, 0.025, 0.11, 0, 0).rotateX((i * Math.PI * 2) / 3).translate(0, 0, 0));
  const dish = new THREE.CylinderGeometry(0.232, 0.232, 0.01, hi ? 30 : 14).rotateZ(Math.PI / 2).translate(-0.05, 0, 0);
  const set = {
    rubber: merge([tire]),
    whitewall: merge([wall]),
    chrome: merge([lip, hub, ...spinner, ...spokes]),
    darkChrome: merge([dish]),
  };
  for (const g of Object.values(set)) g.userData.shared = true;
  wheelGeoCache[LOD] = set;
  return set;
}

/** One wheel, whitewall facing out on either side. */
export function buildWheel(side) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  for (const [mat, geo] of Object.entries(wheelGeometry())) spin.add(new THREE.Mesh(geo, CAR_MATS[mat]));
  if (side < 0) spin.rotation.y = Math.PI;
  g.add(spin);
  g.userData.spin = spin;
  return g;
}

// ---------------------------------------------------------------- assemblies

function lampGeos() {
  const heads = [];
  for (const sx of [-1, 1]) for (const dx of [-0.11, 0.11]) heads.push(new THREE.CircleGeometry(0.075, 16).rotateY(Math.PI).translate(sx * 0.86 + dx, 0.74, -2.878));
  const rings = heads.map((_, i) => {
    const sx = i < 2 ? -1 : 1;
    const dx = i % 2 ? 0.11 : -0.11;
    return new THREE.TorusGeometry(0.08, 0.012, 5, 16).translate(sx * 0.86 + dx, 0.74, -2.875);
  });
  const tails = [-1, 1].map((sx) => rbox(0.1, 0.36, 0.04, sx * 0.9, 0.74, 2.86, 0.015));
  return { heads, rings, tails };
}

let staticCache = null;
/** Merged parked/wrecked car: a handful of meshes, wheels included. */
export function buildStaticCar(dull = true) {
  if (!staticCache) {
    LOD = 'low';
    const P = bodyParts();
    const L = lampGeos();
    const wg = wheelGeometry();
    const wheelParts = { rubber: [], whitewall: [], chrome: [], darkChrome: [] };
    for (const [x, z] of WHEELS) {
      for (const [mat, geo] of Object.entries(wg)) {
        const g = geo.clone();
        if (x < 0) g.rotateY(Math.PI);
        wheelParts[mat].push(g.translate(x, WHEEL_RADIUS, z));
      }
    }
    staticCache = {
      paint: merge(P.paint),
      vinyl: merge(P.vinyl),
      glass: merge(P.glass),
      chrome: merge([...P.chrome, ...L.rings, ...wheelParts.chrome]),
      darkChrome: merge([...P.darkChrome, ...wheelParts.darkChrome]),
      seam: merge([...P.seam, ...P.leather]),
      rubber: merge([...wheelParts.rubber, ...P.rubber]),
      amber: merge([...P.amber, ...P.redLamp]),
      whitewall: merge(wheelParts.whitewall),
      lamps: merge(L.heads),
      tails: merge(L.tails),
    };
    for (const g of Object.values(staticCache)) g.userData.shared = true;
    LOD = 'high';
  }
  const c = staticCache;
  const g = new THREE.Group();
  const add = (geo, mat) => g.add(new THREE.Mesh(geo, mat));
  add(c.paint, dull ? CAR_MATS.paintDull : CAR_MATS.paint);
  add(c.vinyl, CAR_MATS.vinyl);
  add(c.glass, CAR_MATS.glass);
  add(c.chrome, dull ? CAR_MATS.rust : CAR_MATS.chrome);
  add(c.darkChrome, CAR_MATS.darkChrome);
  add(c.seam, CAR_MATS.seam);
  add(c.rubber, CAR_MATS.rubber);
  add(c.whitewall, dull ? CAR_MATS.rubber : CAR_MATS.whitewall);
  add(c.lamps, CAR_MATS.darkChrome);
  add(c.tails, CAR_MATS.seam);
  add(c.amber, CAR_MATS.seam);
  return g;
}

/** A hood, shoulders and two eyes. */
export function buildRider(eyeScale = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12).scale(1, 1.18, 1.05), MATS.cloth));
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8).scale(1.05, 0.6, 0.7), MATS.cloth);
  shoulders.position.y = -0.38;
  g.add(shoulders);
  const eyes = [-0.085, 0.085].map((x) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.046 * eyeScale, 10, 8), EYE_MAT.clone());
    e.position.set(x, 0.03, -0.21);
    e.scale.z = 0.4;
    g.add(e);
    return e;
  });
  return { group: g, eyes };
}

/** The player's car: separate parts so suspension, wheels and hydraulics can move. */
export function buildPlayerCar() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const P = bodyParts({ wheel: false });
  const L = lampGeos();
  for (const [mat, geos] of Object.entries(P)) {
    if (geos.length) body.add(new THREE.Mesh(merge(geos), CAR_MATS[mat]));
  }
  body.add(new THREE.Mesh(merge(L.rings), CAR_MATS.chrome));
  const headlights = L.heads.map((geo) => {
    const m = new THREE.Mesh(merge([geo]), HEADLIGHT_MAT);
    body.add(m);
    return m;
  });
  for (const t of L.tails) body.add(new THREE.Mesh(merge([t]), TAIL_MAT));

  const rider = buildRider();
  rider.group.position.set(-0.45, 1.22, 0.28);
  body.add(rider.group);

  const wheels = WHEELS.map(([x, z]) => {
    const w = buildWheel(Math.sign(x));
    w.position.set(x, WHEEL_RADIUS, z);
    root.add(w);
    return w;
  });

  const rams = WHEELS.map(([x, z]) => {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 8), CAR_MATS.chrome);
    r.position.set(x * 0.7, 0, z);
    root.add(r);
    return r;
  });

  const steering = buildSteering(shadowMat());
  body.add(steering.pivot, steering.forearm, steering.upper, steering.elbowJoint, steering.shoulderJoint);

  return { root, body, wheels, rams, driver: rider.group, eyes: rider.eyes, headlights, steering };
}
