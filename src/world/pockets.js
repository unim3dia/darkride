// The pocket worlds the off-ramps cross. Each is a mood more than a place:
// structure you can almost read, then it evaporates; sound turns into a choir.
import * as THREE from 'three';
import { pulseMat, dissolveMat } from '../render/pulseMaterial.js';
import { MATS, merge, SHARED_MATS } from './props.js';
import { glowTexture } from './chunks.js';
import { spurBox } from './spur.js';

const PM = {
  dustTown: dissolveMat({ color: 0x1d1915, roughness: 0.9, envMapIntensity: 0.1 }),
  ghost: dissolveMat({ color: 0x1a1a1e, roughness: 0.85, envMapIntensity: 0.12 }),
  halo: pulseMat({ color: 0x2a2d33, roughness: 0.4, metalness: 0.4, envMapIntensity: 0.5 }),
  shard: pulseMat({ color: 0x18181b, roughness: 0.7, metalness: 0.2, envMapIntensity: 0.2 }),
  edge: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.74, 0.8) }),
  sacred: new THREE.LineBasicMaterial({ color: new THREE.Color(0.72, 0.72, 0.85), transparent: true, opacity: 0.8, fog: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  sacredFaint: new THREE.LineBasicMaterial({ color: new THREE.Color(0.4, 0.4, 0.5), transparent: true, opacity: 0.6, fog: true, blending: THREE.AdditiveBlending, depthWrite: false }),
};
for (const m of Object.values(PM)) SHARED_MATS.add(m);

// ---------------------------------------------------------------- shared pieces

const P = {};
const middle = (spur, a = 0.25, b = 0.75) => {
  // arc lengths where the ramp is properly out in the pocket
  let t0 = 0;
  let t1 = spur.N - 1;
  while (t0 < spur.N - 1 && spur.U[t0] < a) t0++;
  while (t1 > 0 && spur.U[t1] > b) t1--;
  return [t0, t1];
};

/** Columns down into the fog under the ramp (not in the Ether: there, it floats). */
function supports(spur, geos) {
  for (let t = spur.tSepA + 20; t < spur.tSepB - 20; t += 32) {
    if (spur.U[Math.floor(t)] > 0.15 && spur.U[Math.floor(t)] < 0.85) continue; // deep in, nothing holds it up
    for (const s of [-1, 1]) geos.push(spurBox(spur, 1.4, 60, 1.4, t, s * 5.5, -61.2));
  }
}

/** A drifting field of specks kept around the camera: dust, motes, flecks of paper. */
class Field {
  constructor(scene, { count, box, color, size, vel, sway = 0, additive = false }) {
    this.box = box;
    this.vel = vel;
    this.sway = sway;
    this.seed = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) this.seed[i] = Math.random();
    this.pos = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({
      map: glowTexture(), // soft round grains, never hard squares
      color, size: size * 1.8, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    this.t = 0;
  }

  update(dt, center, weight, opacity) {
    this.points.visible = weight > 0.01;
    this.mat.opacity = weight * opacity;
    if (!this.points.visible) return;
    this.t += dt;
    const [bx, by, bz] = this.box;
    const wrapAxis = (v, c, size) => ((v - c) % size + size * 1.5) % size - size / 2 + c;
    for (let i = 0; i < this.pos.length / 3; i++) {
      const sx = this.seed[i * 3], sy = this.seed[i * 3 + 1], sz = this.seed[i * 3 + 2];
      const sw = Math.sin(this.t * (0.6 + sx) + sz * 20) * this.sway;
      this.pos[i * 3] = wrapAxis(sx * bx + this.vel[0] * this.t * (0.7 + sy * 0.6) + sw, center.x, bx);
      this.pos[i * 3 + 1] = wrapAxis(sy * by + this.vel[1] * this.t * (0.6 + sz * 0.8), center.y, by);
      this.pos[i * 3 + 2] = wrapAxis(sz * bz + this.vel[2] * this.t * (0.7 + sx * 0.6) + sw * 0.6, center.z, bz);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- THE DUST

function buildDust(scene, spur, r, out) {
  const town = [];
  const steel = [];
  const [t0, t1] = middle(spur, 0.12, 0.88);
  // a town packed right up to the road and over it, all of it coming apart as you pass
  for (let t = t0; t < t1; t += 7 + r() * 6) {
    for (const s of [-1, 1]) {
      if (r() < 0.15) continue;
      const w = 5 + r() * 12;
      const h = 8 + r() * 46;
      town.push(spurBox(spur, w, h + 40, 5 + r() * 10, t, s * (9.5 + r() * 34), -40));
    }
    if (r() < 0.45) town.push(spurBox(spur, 6 + r() * 26, 1 + r() * 4, 3 + r() * 10, t, (r() - 0.5) * 30, 7 + r() * 26)); // slabs hanging overhead
    if (r() < 0.12) for (const s of [-1, 1]) town.push(spurBox(spur, 1.4, 14, 1.4, t, s * (8 + r() * 3), 0));
  }
  supports(spur, steel);
  out.group.add(new THREE.Mesh(merge(town), PM.dustTown), new THREE.Mesh(merge(steel), MATS.pillar));
  out.fields = [
    { f: new Field(scene, { count: 7000, box: [70, 26, 70], color: 0x9a8668, size: 0.17, vel: [11, 0.6, 4], sway: 2.5 }), o: 0.75 },
    { f: new Field(scene, { count: 260, box: [90, 20, 90], color: 0x6e604c, size: 3.6, vel: [7, 0.2, 2.5], sway: 4 }), o: 0.12 },
  ];
}

// ---------------------------------------------------------------- THE ETHER

function buildEther(scene, spur, r, out) {
  const [t0, t1] = middle(spur, 0.1, 0.9);
  const edges = [];
  const A = {};
  for (let t = spur.tSepA; t < spur.tSepB; t += 3) {
    if (spur.U[Math.floor(t)] > 0.17 && spur.U[Math.floor(t)] < 0.83) continue;
    for (const s of [-1, 1]) {
      spur.sample(t, A);
      const g = new THREE.BoxGeometry(0.08, 0.04, 3.05).rotateY(-A.heading);
      edges.push(g.translate(A.x + A.nx * s * 7.3, A.y + 0.08, A.z + A.nz * s * 7.3));
    }
  }
  if (edges.length) out.group.add(new THREE.Mesh(merge(edges), PM.edge));
  // halos you pass through, rings lying flat around you, and rings far off, all turning
  out.halos = [];
  const ring = (R, tube, pos, rx, ry, spin) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 8, Math.max(48, Math.round(R * 1.4))), PM.halo);
    m.position.copy(pos);
    m.rotation.set(rx, ry, 0, 'YXZ');
    m.userData.spin = spin;
    out.group.add(m);
    out.halos.push(m);
  };
  for (let t = t0; t < t1; t += 28 + r() * 24) {
    spur.sample(t, A);
    const R = 14 + r() ** 2 * 120;
    ring(R, 0.2 + r() * 0.6, new THREE.Vector3(A.x, A.y + R * (0.05 + r() * 0.4), A.z), 0, Math.atan2(A.tx, A.tz) + (r() - 0.5) * 0.6, (r() - 0.5) * 0.2);
    if (r() < 0.4) ring(20 + r() * 50, 0.15, new THREE.Vector3(A.x, A.y - 2 + r() * 14, A.z), Math.PI / 2, 0, (r() - 0.5) * 0.15);
  }
  for (let k = 0; k < 10; k++) {
    const t = t0 + r() * (t1 - t0);
    ring(60 + r() * 160, 0.6 + r(), spur.at(t, (r() < 0.5 ? -1 : 1) * (90 + r() * 200), -40 + r() * 120), r() * Math.PI, r() * Math.PI, (r() - 0.5) * 0.06);
  }
  out.fields = [
    { f: new Field(scene, { count: 3600, box: [110, 60, 110], color: 0xf0f4fa, size: 0.2, vel: [0.3, 0.8, 0.2], sway: 2.6, additive: true }), o: 0.55 },
    { f: new Field(scene, { count: 200, box: [120, 60, 120], color: 0xdfe6ee, size: 5, vel: [0.6, 0.2, 0.3], sway: 6 }), o: 0.08 },
  ];
  out.update = (dt) => { for (const h of out.halos) h.rotation.z += h.userData.spin * dt; };
}

// ---------------------------------------------------------------- THE SANCTUM

function circleLoop(radius, seg = 72) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/** Seven circles: the flower of life, as a group of line loops. */
function flowerOfLife(R, mat) {
  const g = new THREE.Group();
  g.add(new THREE.LineLoop(circleLoop(R), mat));
  for (let k = 0; k < 6; k++) {
    const c = new THREE.LineLoop(circleLoop(R), mat);
    c.position.set(Math.cos((k * Math.PI) / 3) * R, Math.sin((k * Math.PI) / 3) * R, 0);
    g.add(c);
  }
  for (let k = 0; k < 6; k++) {
    const c = new THREE.LineLoop(circleLoop(R), mat);
    c.position.set(Math.cos((k * Math.PI) / 3 + Math.PI / 6) * R * 1.732, Math.sin((k * Math.PI) / 3 + Math.PI / 6) * R * 1.732, 0);
    g.add(c);
  }
  g.add(new THREE.LineLoop(circleLoop(R * 3), mat));
  return g;
}

function buildSanctum(scene, spur, r, out) {
  const stone = [];
  const [t0, t1] = middle(spur, 0.12, 0.88);
  const A = {};
  // arches at a steady beat, close enough to become a tunnel of measure
  for (let t = t0; t < t1; t += 18) {
    spur.sample(t, A);
    const g = new THREE.TorusGeometry(11 + Math.sin(t * 0.05) * 2, 0.35, 8, 48, Math.PI);
    g.rotateY(Math.atan2(A.tx, A.tz));
    stone.push(g.translate(A.x, A.y, A.z));
  }
  out.group.add(new THREE.Mesh(merge(stone), MATS.pillar));
  // the sky is geometry: nested solids everywhere, turning at their own rates
  const shapes = [
    (k) => new THREE.IcosahedronGeometry(k, 0), (k) => new THREE.DodecahedronGeometry(k, 0),
    (k) => new THREE.OctahedronGeometry(k, 0), (k) => new THREE.TetrahedronGeometry(k, 0), (k) => new THREE.IcosahedronGeometry(k, 1),
  ];
  out.solids = [];
  for (let i = 0; i < 46; i++) {
    const t = t0 + r() * (t1 - t0);
    const size = 3 + r() ** 2 * 34;
    const g = shapes[Math.floor(r() * shapes.length)](size);
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(g), size > 14 ? PM.sacred : PM.sacredFaint);
    const side = r() < 0.5 ? -1 : 1;
    l.position.copy(spur.at(t, side * (12 + r() * 140), -20 + r() * 110));
    l.userData.spin = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.25);
    out.group.add(l);
    out.solids.push(l);
  }
  // circles laid across the sky, and flowers of life overhead and standing in the fog
  const mid = Math.floor((t0 + t1) / 2);
  out.circles = [];
  for (let k = 0; k < 9; k++) {
    const c = new THREE.LineLoop(circleLoop(40 + k * 34, 160), k % 2 ? PM.sacredFaint : PM.sacred);
    c.position.copy(spur.at(mid, 0, 60 + k * 9));
    c.rotation.x = Math.PI / 2;
    c.userData.spin = (k % 2 ? 1 : -1) * (0.01 + k * 0.003);
    out.group.add(c);
    out.circles.push(c);
  }
  const over = flowerOfLife(30, PM.sacred);
  over.position.copy(spur.at(mid, 0, 46));
  over.rotation.x = Math.PI / 2;
  out.group.add(over);
  out.flowers = [over];
  for (let k = 0; k < 4; k++) {
    const f = flowerOfLife(10 + r() * 14, PM.sacredFaint);
    const t = t0 + ((k + 0.5) / 4) * (t1 - t0);
    spur.sample(t, A);
    const side = k % 2 ? 1 : -1;
    f.position.set(A.x + A.nx * side * (60 + r() * 50), A.y + 18 + r() * 20, A.z + A.nz * side * (60 + r() * 50));
    f.lookAt(A.x, A.y + 15, A.z);
    out.group.add(f);
    out.flowers.push(f);
  }
  for (let t = t0; t < t1; t += 18) {
    for (const s of [-1, 1]) {
      const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xe8ecff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      orb.position.copy(spur.at(t, s * 9, 5 + Math.sin(t) * 2));
      orb.scale.set(1.4, 1.4, 1);
      out.group.add(orb);
    }
  }
  out.fields = [{ f: new Field(scene, { count: 1600, box: [100, 60, 100], color: 0xd6dcff, size: 0.14, vel: [0, -0.6, 0], sway: 1, additive: true }), o: 0.5 }];
  out.update = (dt) => {
    for (const s of out.solids) { s.rotation.x += s.userData.spin.x * dt; s.rotation.y += s.userData.spin.y * dt; s.rotation.z += s.userData.spin.z * dt; }
    for (const c of out.circles) c.rotation.z += c.userData.spin * dt;
    out.flowers.forEach((f, i) => { f.rotation.z += (i % 2 ? -1 : 1) * 0.012 * dt; });
  };
}

// ---------------------------------------------------------------- EPHEMERA

function buildEphemera(scene, spur, r, out) {
  const [t0, t1] = middle(spur, 0.1, 0.9);
  const houses = [];
  for (let i = 0; i < 26; i++) {
    const t = t0 + r() * (t1 - t0);
    const s = r() < 0.5 ? -1 : 1;
    const off = s * (11 + r() * 40);
    const lift = -12 + r() * 34;
    houses.push(spurBox(spur, 8, 6, 9, t, off, lift));
    const roof = new THREE.CylinderGeometry(0.01, 6.4, 3.6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.15);
    const p = spur.at(t, off, lift + 7.8);
    spur.sample(t, P);
    roof.rotateZ((r() - 0.5) * 0.8); // tipped, like it's falling slowly
    houses.push(roof.rotateY(-P.heading).translate(p.x, p.y, p.z));
  }
  out.group.add(new THREE.Mesh(merge(houses), PM.ghost));
  // fragments of everything, hanging all around and above you, turning
  const COUNT = 1700;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), PM.shard, COUNT);
  mesh.frustumCulled = false;
  const items = [];
  for (let i = 0; i < COUNT; i++) {
    const t = t0 + r() * (t1 - t0);
    const s = r() < 0.5 ? -1 : 1;
    const d = s * (3 + r() ** 1.8 * 110);
    let y = -16 + r() * 52;
    if (Math.abs(d) < 8 && y < 3.5) y += 5; // never in the lane itself
    const k = 0.15 + r() ** 3 * 4.5;
    items.push({
      base: spur.at(t, d, y), scale: new THREE.Vector3(k * (0.4 + r()), k * (0.05 + r() * 0.5), k * (0.4 + r())),
      axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), spin: (r() - 0.5) * 0.9, phase: r() * 10,
    });
  }
  out.group.add(mesh);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  let time = 0;
  out.update = (dt) => {
    time += dt;
    items.forEach((it, i) => {
      q.setFromAxisAngle(it.axis, it.phase + time * it.spin);
      pos.copy(it.base).y += Math.sin(time * 0.3 + it.phase) * 1.4;
      m.compose(pos, q, it.scale);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  out.fields = [
    { f: new Field(scene, { count: 2200, box: [70, 30, 70], color: 0xc4c4c8, size: 0.24, vel: [3.5, -0.4, 1.8], sway: 3.5 }), o: 0.7 },
    { f: new Field(scene, { count: 3000, box: [60, 30, 60], color: 0x8a8a90, size: 0.06, vel: [1, -6, 0.5], sway: 0.3 }), o: 0.5 },
  ];
}

// ---------------------------------------------------------------- registry
// post: what the film does to the whole frame in here (wash hue + amount, echo, soft focus, trails, bloom)

export const POCKETS = {
  dust: {
    name: 'THE DUST', sub: 'there was a town here a moment ago', build: buildDust,
    palette: { fog: 0x4a3f31, skyTop: 0x14110d, skyHorizon: 0x67563f, glow: 0x86704f, light: 0.18, exposure: 0.95, fogMul: 2.3, grain: 2.6, rain: 0 },
    post: { wash: [1.0, 0.8, 0.56], washAmt: 0.7, echo: 0.3, soft: 0.3, trails: 0.88, bloom: 1.1 },
    choir: { formant: 'oh', root: 73.42, dur: 9, wind: 1, chords: [[1, 1.5, 2, 2.133], [1, 1.333, 2, 2.667], [1, 1.2, 1.5, 2]] },
  },
  ether: {
    name: 'THE ETHER', sub: 'nothing underneath you now', build: buildEther,
    palette: { fog: 0x9aa0a8, skyTop: 0x5a6068, skyHorizon: 0xb4bac2, glow: 0xd4dae2, light: 0.5, exposure: 1.0, fogMul: 1.6, grain: 2.1, rain: 0 },
    post: { wash: [0.9, 0.95, 1.05], washAmt: 0.55, echo: 0.45, soft: 0.45, trails: 0.92, bloom: 1.4 },
    choir: { formant: 'oo', root: 146.83, dur: 11, chords: [[1, 1.5, 2, 3], [1, 1.333, 2, 2.667], [1.125, 1.5, 2.25, 3]] },
  },
  sanctum: {
    name: 'THE SANCTUM', sub: 'the geometry was here first', build: buildSanctum,
    palette: { fog: 0x24242c, skyTop: 0x050507, skyHorizon: 0x34343f, glow: 0x6a6878, light: 0.1, exposure: 0.95, fogMul: 1.0, grain: 1.8, rain: 0.15 },
    post: { wash: [0.86, 0.86, 1.06], washAmt: 0.5, echo: 0.35, soft: 0.15, trails: 0.87, bloom: 1.3 },
    choir: { formant: 'ah', root: 220, dur: 7, bells: true, chords: [[1, 1.25, 1.5, 2, 2.5], [1, 1.333, 1.667, 2, 2.667], [1.125, 1.5, 1.875, 2.25, 3], [1, 1.5, 2, 3, 4]] },
  },
  ephemera: {
    name: 'EPHEMERA', sub: 'everything that was ever left behind', build: buildEphemera,
    palette: { fog: 0x34343a, skyTop: 0x0a0a0c, skyHorizon: 0x4c4c55, glow: 0x60606c, light: 0.14, exposure: 0.95, fogMul: 1.5, grain: 2.3, rain: 0.4 },
    post: { wash: [1, 1, 1], washAmt: 0.75, echo: 0.25, soft: 0.12, trails: 0.9, bloom: 1.0 },
    choir: { formant: 'ah', root: 98, dur: 6, detune: 18, chords: [[1, 1.125, 1.5, 1.875, 2.25], [1, 1.333, 1.5, 2, 2.25], [1.067, 1.333, 1.6, 2, 2.667]] },
  },
};

export function buildPocket(scene, spur, r) {
  const def = POCKETS[spur.kind];
  const out = { ...def, group: new THREE.Group(), update: () => {}, fields: [] };
  def.build(scene, spur, r, out);
  const [t0, t1] = middle(spur, 0.3, 0.7);
  out.center = spur.at((t0 + t1) / 2, 0, 0);
  out.chunk = { lamps: [], chains: [], bodies: [], fires: [], signs: [], eyes: null, perches: [], group: out.group };
  scene.add(out.group);
  return out;
}
