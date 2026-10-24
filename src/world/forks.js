// Forks in the highway: a sign, a lane that peels away, and a road out across
// a pocket world that eventually merges back. Owns the ramps, their pockets,
// and how much of a pocket you're "in" at any moment.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { FORKS, DETOUR_PLANS, sample, rng } from './track.js';
import { pulseMat, fadingRoadMat } from '../render/pulseMaterial.js';
import { MATS, merge, SHARED_MATS } from './props.js';
import { Spur, spurRibbon } from './spur.js';
import { buildPocket } from './pockets.js';
import { Trail } from './trail.js';
import { Detour, buildDetourMeshes } from './detour.js';

const HW = ROAD.HALF_WIDTH;
const RAMP_ASPHALT = pulseMat(
  { color: 0x0e1012, roughness: 0.3, metalness: 0.15, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 },
  { puddles: true },
);
SHARED_MATS.add(RAMP_ASPHALT);
const DEEP_ROAD = fadingRoadMat({ color: 0x0e1012, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
SHARED_MATS.add(DEEP_ROAD);
const CAVE_MATS = {
  asphalt: RAMP_ASPHALT,
  caveFloor: pulseMat({ color: 0x08090a, roughness: 0.2, metalness: 0.2, envMapIntensity: 0.25 }, { puddles: true }),
  rock: pulseMat({ color: 0x080706, roughness: 0.97, envMapIntensity: 0.03, side: THREE.DoubleSide }),
  stone: pulseMat({ color: 0x17140f, roughness: 0.82, envMapIntensity: 0.2, side: THREE.DoubleSide }, { puddles: true }),
  paint: MATS.paint_line,
  concrete: MATS.concrete,
  steel: MATS.steel,
};
for (const m of Object.values(CAVE_MATS)) SHARED_MATS.add(m);
const DEEP = 0.17; // fraction of the way along a ramp where the pocket swallows the road
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function board(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#070809';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(217,226,230,0.55)';
  g.lineWidth = 8;
  g.strokeRect(16, 16, w - 32, h - 32);
  g.fillStyle = '#e6edf0';
  g.textBaseline = 'middle';
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Write `text` no wider than `max` px. */
function fitText(g, text, x, y, max, weight, size, family) {
  g.font = `${weight} ${size}px ${family}`;
  const k = Math.min(1, max / g.measureText(text).width);
  g.font = `${weight} ${Math.floor(size * k)}px ${family}`;
  g.fillText(text, x, y);
}

const DISPLAY = '"Syncopate", sans-serif';
const MONO = '"IBM Plex Mono", monospace';

function signTexture(main, arrow, arrowRight) {
  return board(1024, 256, (g) => {
    g.textAlign = arrowRight ? 'left' : 'right';
    fitText(g, main, arrowRight ? 60 : 964, 130, 760, 700, 84, DISPLAY);
    g.textAlign = 'center';
    fitText(g, arrow, arrowRight ? 925 : 99, 134, 150, 400, 140, MONO);
  });
}

/** Roadside warning before a fork: the name, how far, which way. */
function advanceTexture(name, dist, arrow) {
  return board(768, 384, (g) => {
    g.textAlign = 'left';
    fitText(g, name, 56, 140, 520, 700, 84, DISPLAY);
    fitText(g, dist, 58, 270, 520, 500, 64, MONO);
    g.textAlign = 'center';
    fitText(g, arrow, 652, 200, 170, 400, 190, MONO);
  });
}

/** Signs are lit boards: they don't sink into the fog the way the road does. */
function signMat(tex) {
  return new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5), fog: false, toneMapped: false });
}

/** Merge keeping uv (the painted arrows need it). */
function mergeUV(geos) {
  const pos = [];
  const uv = [];
  for (const g of geos) {
    const n = g.index ? g.toNonIndexed() : g;
    pos.push(...n.attributes.position.array);
    uv.push(...n.attributes.uv.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

let arrowMat = null;
function laneArrowMat() {
  if (arrowMat) return arrowMat;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(64, 8); g.lineTo(120, 92); g.lineTo(84, 92); g.lineTo(84, 248); g.lineTo(44, 248); g.lineTo(44, 92); g.lineTo(8, 92);
  g.closePath();
  g.fill();
  const img = g.getImageData(0, 0, 128, 256);
  for (let i = 3; i < img.data.length; i += 4) if (Math.random() < 0.25) img.data[i] *= Math.random();
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  arrowMat = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(0.55, 0.57, 0.58), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  SHARED_MATS.add(arrowMat);
  return arrowMat;
}

export class Forks {
  constructor(scene) {
    this.scene = scene;
    this.spurs = FORKS.map((f) => new Spur(f));
    // detours leave their ramps first, so the pockets can keep their columns out of the way
    this.detours = DETOUR_PLANS.map((plan) => new Detour(plan, this.spurs.find((sp) => sp.kind === plan.fork.kind)));
    this.pockets = this.spurs.map((sp, i) => buildPocket(scene, sp, rng(700 + i)));
    this.group = new THREE.Group();
    scene.add(this.group);
    this.trails = [];
    this.spurs.forEach((sp, i) => {
      this.buildRamp(sp, this.pockets[i]);
      this.buildSigns(sp, this.pockets[i]);
    });
    this.detours.forEach((det, i) => this.buildDetour(det, rng(900 + i)));
    this.weight = 0;
    this.cave = 0;
    this.active = null;
  }

  get chunks() {
    return this.pockets.map((p) => p.chunk);
  }

  buildRamp(sp, pocket) {
    const asphalt = [];
    const deep = [];
    const lines = [];
    const walls = [];
    let tIn = 0;
    while (tIn < sp.N - 1 && sp.U[tIn] < DEEP) tIn++;
    let tOut = sp.N - 1;
    while (tOut > 0 && sp.U[tOut] > 1 - DEEP) tOut--;
    sp.tDeepA = tIn;
    sp.tDeepB = tOut;
    for (let t = 0; t < sp.N - 2; t += 20) {
      const t1 = Math.min(sp.N - 1.01, t + 20);
      const inDeep = t >= tIn && t1 <= tOut;
      (inDeep ? deep : asphalt).push(spurRibbon(sp, t, t1, -HW - 0.8, HW + 0.8, 0.04, inDeep ? 0 : -1.3));
      if (!inDeep) for (const s of [-1, 1]) lines.push(spurRibbon(sp, t, t1, s * (HW - 0.5) - 0.08, s * (HW - 0.5) + 0.08, 0.06, 0.04));
    }
    for (let t = 6; t < sp.N - 6; t += 9) if (t < tIn || t > tOut) lines.push(spurRibbon(sp, t, t + 3.2, -0.08, 0.08, 0.06, 0.04, 3.2));
    // barriers only between leaving the highway and entering the pocket; past that, nothing holds
    // you up but the dark (the walls are still there, you just can't see them)
    if (sp.kind !== 'ether') {
      for (const s of [-1, 1]) {
        const gap = sp.openings.find(([, , side]) => side === s);
        const pieces = gap ? [[sp.tSepA, gap[0]], [gap[1], tIn]] : [[sp.tSepA, tIn]];
        for (const [a, b] of pieces) if (b - a > 4) walls.push(spurRibbon(sp, a, b, s * (HW + 0.35) - 0.35, s * (HW + 0.35) + 0.35, 0.99, 0.04, 4));
        walls.push(spurRibbon(sp, tOut, sp.tSepB, s * (HW + 0.35) - 0.35, s * (HW + 0.35) + 0.35, 0.99, 0.04, 4));
      }
    }
    this.group.add(new THREE.Mesh(merge(asphalt), RAMP_ASPHALT));
    this.group.add(new THREE.Mesh(merge(deep), DEEP_ROAD));
    this.group.add(new THREE.Mesh(merge(lines), MATS.paint_line));
    if (walls.length) this.group.add(new THREE.Mesh(merge(walls), MATS.concrete));
    // chevrons leading into the ramp from both ends
    const into = (from, to) => {
      const pts = [];
      const step = Math.sign(to - from) * 6;
      for (let t = from; step > 0 ? t <= to : t >= to; t += step) pts.push(sp.at(t, 0, 0));
      this.trails.push(new Trail(this.scene, pts, { persistent: true }));
    };
    into(Math.floor(sp.tSepA * 0.15), Math.floor(sp.tSepA * 2.2));
    into(Math.ceil(sp.N - 1 - (sp.N - 1 - sp.tSepB) * 0.15), Math.floor(sp.N - 1 - (sp.N - 1 - sp.tSepB) * 2.2));
  }

  /** An overhead gantry before each end: the loop goes on, the pocket is that way. */
  buildSigns(sp, pocket) {
    const post = [];
    const make = (s, dir) => {
      const A = sample(s);
      for (const d of [-(HW + 1.4), HW + 1.4]) post.push(new THREE.BoxGeometry(0.4, 8, 0.4).translate(A.x + A.nx * d, A.y + 4, A.z + A.nz * d));
      const beam = new THREE.BoxGeometry((HW + 1.4) * 2, 0.5, 0.5).rotateY(-A.heading);
      post.push(beam.translate(A.x, A.y + 7.6, A.z));
      // for drivers going `dir` along the loop, which way is the ramp?
      const visualRight = sp.side * dir > 0;
      const panel = (text, arrow, right, offset) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 1.9), signMat(signTexture(text, arrow, right)));
        m.position.set(A.x + A.nx * offset, A.y + 6.3, A.z + A.nz * offset);
        m.rotation.y = Math.atan2(-dir * A.tx, -dir * A.tz);
        this.group.add(m);
      };
      const rampSide = sp.side * 3.6;
      panel(pocket.name, visualRight ? '→' : '←', visualRight, rampSide);
      panel('RING ROAD', '↑', !visualRight, -rampSide);
    };
    make(sp.sA - 110, 1);
    make(sp.sB + 110, -1);

    // five warnings on the ramp's side of the road, counting down to the split
    for (const dist of [1000, 750, 500, 300, 150]) {
      const A = sample(sp.sA - dist);
      const d = sp.side * (HW + 2.6);
      post.push(new THREE.BoxGeometry(0.3, 4.4, 0.3).translate(A.x + A.nx * d, A.y + 2.2, A.z + A.nz * d));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), signMat(advanceTexture(pocket.name, `${dist} M`, sp.side > 0 ? '↗' : '↖')));
      m.position.set(A.x + A.nx * d, A.y + 5.3, A.z + A.nz * d);
      m.rotation.y = Math.atan2(-A.tx, -A.tz) - sp.side * 0.12; // turned a touch toward the driver
      this.group.add(m);
    }
    // and arrows painted in the lane that's about to leave
    const arrows = [];
    for (let k = 0; k < 5; k++) {
      const A = sample(sp.sA - 40 - k * 32);
      const g = new THREE.PlaneGeometry(2.2, 5.2).rotateX(-Math.PI / 2).rotateY(-A.heading + sp.side * 0.35);
      arrows.push(g.translate(A.x + A.nx * sp.side * 3.9, A.y + 0.07, A.z + A.nz * sp.side * 3.9));
    }
    const arrowGeo = mergeUV(arrows);
    this.group.add(new THREE.Mesh(arrowGeo, laneArrowMat()));
    this.group.add(new THREE.Mesh(merge(post), MATS.steel));
  }

  /** A detour: its road and cave, a countdown on the ramp, chevrons into the turn. */
  buildDetour(det, r) {
    const meshes = buildDetourMeshes(det, CAVE_MATS, merge, r);
    this.group.add(meshes);
    det.meshes = meshes;
    const sp = det.parent;
    const post = [];
    // the ramp's right shoulder: three boards counting down, then the hard right
    for (const [back, label] of [[260, '250 M'], [160, '150 M'], [70, 'NOW']]) {
      const t = Math.max(2, det.parentT - back);
      const p = sp.sample(t);
      const d = HW + 2.4;
      post.push(new THREE.BoxGeometry(0.3, 4.4, 0.3).translate(p.x + p.nx * d, p.y + 2.2, p.z + p.nz * d));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), signMat(advanceTexture(det.name, label, '↱')));
      m.position.set(p.x + p.nx * d, p.y + 5.3, p.z + p.nz * d);
      m.rotation.y = Math.atan2(-p.tx, -p.tz) - 0.12;
      this.group.add(m);
    }
    this.group.add(new THREE.Mesh(merge(post), MATS.steel));
    const pts = [];
    for (let t = 2; t < 70; t += 6) pts.push(det.at(t, 0, 0));
    this.trails.push(new Trail(this.scene, pts, { persistent: true }));
  }

  /** Lateral distance to the nearest ramp, for keeping highway scenery out of the way. */
  near(x, z, margin = 210) {
    if (this.detours.some((det) => {
      const b = det.box;
      return x > b.minX - 40 && x < b.maxX + 40 && z > b.minZ - 40 && z < b.maxZ + 40 && det.distance(x, z) < 30;
    })) return true;
    return this.spurs.some((sp) => {
      const b = sp.box;
      if (x < b.minX - margin || x > b.maxX + margin || z < b.minZ - margin || z > b.maxZ + margin) return false;
      return sp.distance(x, z) < margin;
    });
  }

  /** @returns { weight 0..1, pocket } — how far into a pocket world you are. */
  update(dt, time, vehicle, camera) {
    let target = 0;
    let pocket = this.active;
    const h = vehicle.spurHit;
    let cave = 0;
    let detour = null;
    if (h && h.spur instanceof Detour) {
      detour = h.spur;
      cave = detour.caveWeight(h.t);
    } else if (h && this.spurs.includes(h.spur)) {
      const i = this.spurs.indexOf(h.spur);
      const u = h.spur.sample(h.t).u;
      const sep = h.spur.uSep;
      target = smooth(sep * 1.4, sep * 4.2, Math.min(u, 1 - u));
      if (target > 0) pocket = this.pockets[i];
    }
    this.weight += (target - this.weight) * Math.min(1, dt * 0.9);
    if (this.weight < 0.005) pocket = null;
    this.active = pocket;
    for (const p of this.pockets) {
      const near = camera.position.distanceTo(p.center) < 1700;
      p.group.visible = near;
      if (near) p.update(dt, time);
      for (const { f, o } of p.fields) f.update(dt, camera.position, p === pocket ? this.weight : 0, o);
    }
    for (const t of this.trails) t.update(dt, time, vehicle);
    for (const det of this.detours) det.meshes.userData.update(time);
    this.cave += (cave - this.cave) * Math.min(1, dt * 1.6);
    return { weight: this.weight, pocket, cave: this.cave, detour };
  }
}
