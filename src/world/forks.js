// Forks in the highway: a sign, a lane that peels away, and a road out across
// a pocket world that eventually merges back. Owns the ramps, their pockets,
// and how much of a pocket you're "in" at any moment.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { FORKS, sample, rng } from './track.js';
import { pulseMat, fadingRoadMat } from '../render/pulseMaterial.js';
import { MATS, merge, SHARED_MATS } from './props.js';
import { Spur, spurRibbon } from './spur.js';
import { buildPocket } from './pockets.js';
import { Trail } from './trail.js';

const HW = ROAD.HALF_WIDTH;
const RAMP_ASPHALT = pulseMat(
  { color: 0x0e1012, roughness: 0.3, metalness: 0.15, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 },
  { puddles: true },
);
SHARED_MATS.add(RAMP_ASPHALT);
const DEEP_ROAD = fadingRoadMat({ color: 0x0e1012, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
SHARED_MATS.add(DEEP_ROAD);
const DEEP = 0.17; // fraction of the way along a ramp where the pocket swallows the road
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function signTexture(main, arrow, arrowRight) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#070809';
  g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = 'rgba(217,226,230,0.4)';
  g.lineWidth = 6;
  g.strokeRect(14, 14, 996, 228);
  g.fillStyle = '#d9e2e6';
  g.textBaseline = 'middle';
  g.font = '700 70px "Syncopate", sans-serif';
  g.textAlign = arrowRight ? 'left' : 'right';
  g.fillText(main, arrowRight ? 70 : 954, 128);
  g.font = '400 120px "IBM Plex Mono", monospace';
  g.textAlign = 'center';
  g.fillText(arrow, arrowRight ? 920 : 104, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Forks {
  constructor(scene) {
    this.scene = scene;
    this.spurs = FORKS.map((f) => new Spur(f));
    this.pockets = this.spurs.map((sp, i) => buildPocket(scene, sp, rng(700 + i)));
    this.group = new THREE.Group();
    scene.add(this.group);
    this.trails = [];
    this.spurs.forEach((sp, i) => {
      this.buildRamp(sp, this.pockets[i]);
      this.buildSigns(sp, this.pockets[i]);
    });
    this.weight = 0;
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
        walls.push(spurRibbon(sp, sp.tSepA, tIn, s * (HW + 0.35) - 0.35, s * (HW + 0.35) + 0.35, 0.99, 0.04, 4));
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
        const mat = new THREE.MeshBasicMaterial({ map: signTexture(text, arrow, right), color: new THREE.Color(1.35, 1.35, 1.35) });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), mat);
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
    this.group.add(new THREE.Mesh(merge(post), MATS.steel));
  }

  /** Lateral distance to the nearest ramp, for keeping highway scenery out of the way. */
  near(x, z, margin = 210) {
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
    if (h) {
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
    return { weight: this.weight, pocket };
  }
}
