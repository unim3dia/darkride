// Streams freeway chunks in and out around the car and owns their reactive bits:
// sodium lamps, swinging chains, eyes in the ruins, fires below, neon signs.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { chunkFeatures, rng, sample, elevation, hasBarrier, barrierSpans, CHUNK_LEN, N_CHUNKS } from './track.js';
import { MATS, SODIUM_MAT, merge, ruinTower, pineTree, lampPost, signTexture, box, disposeGroup } from './props.js';
import { buildStaticCar } from '../player/carModel.js';
import { ribbon, roadBox, roadPoint, roadHeading, trussGeometry, overpassGeometry } from './builders.js';
import { eyePoints } from './eyes.js';
import { makeBody } from './bodies.js';

const HW = ROAD.HALF_WIDTH;
const LINK_GEO = new THREE.TorusGeometry(0.16, 0.045, 5, 8);
LINK_GEO.userData.shared = true;
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function glowSprite(color, scale, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.set(scale, scale, 1);
  return s;
}

function solidSpans(a, b, gap) {
  if (!gap) return [[a, b]];
  return [[a, gap.start], [gap.end, b]].filter(([x, y]) => y - x > 0.5);
}

function buildRoad(f, a, b, r, bins) {
  const barriers = hasBarrier(a + 1);
  for (const [x, y] of solidSpans(a, b, f.gap)) {
    // the deck sits a hair proud of the street so they never fight where the road comes down
    bins.asphalt.push(ribbon(x, y, -HW - 0.8, HW + 0.8, 0.04, -1.3));
    for (const side of [-1, 1]) {
      if (barriers) {
        for (const [p, q] of barrierSpans(x, y, side)) bins.concrete.push(ribbon(p, q, side * (HW + 0.35) - 0.35, side * (HW + 0.35) + 0.35, 0.99, 0.04));
      }
      bins.paint_line.push(ribbon(x, y, side * (HW - 0.5) - 0.08, side * (HW - 0.5) + 0.08, 0.055, 0.04));
    }
    for (let s = Math.ceil(x / 9) * 9; s + 3.2 < y; s += 9) {
      if (r() < 0.12) continue; // faded away
      bins.paint_line.push(ribbon(s, s + 3.2, -0.08, 0.08, 0.055, 0.04, 3.2));
    }
  }
  for (let s = Math.ceil(a / 20) * 20; s < b; s += 20) {
    if (f.gap && s > f.gap.start - 2 && s < f.gap.end + 2) continue;
    const lift = elevation(s);
    if (lift > 3) for (const side of [-1, 1]) bins.concrete.push(roadBox(1.5, lift + 36, 1.5, s, side * (HW - 1.5), -(lift + 36) / 2 - 1.2));
    bins.steel.push(ribbon(s - 0.12, s + 0.12, -HW - 0.4, HW + 0.4, 0.06, 0.0, 0.24)); // expansion joint
  }
  if (f.gap) {
    // broken lips: slabs, rubble teeth and rebar reaching into nothing
    for (const [edge, dir] of [[f.gap.start, 1], [f.gap.end, -1]]) {
      for (let i = 0; i < 7; i++) {
        const off = (r() * 2 - 1) * HW;
        bins.concrete.push(roadBox(1 + r() * 2.5, 0.8 + r(), 0.8 + r() * 1.6, edge + dir * r() * 1.2, off, -0.5 - r() * 0.6, (r() - 0.5) * 0.5, (r() - 0.5) * 0.6));
      }
      for (let i = 0; i < 9; i++) {
        const len = 1 + r() * 2.4;
        bins.rust.push(roadBox(0.05, 0.05, len, edge + dir * len * 0.5, (r() * 2 - 1) * HW, -0.6 - r() * 0.5, (r() - 0.5) * 0.7, (r() - 0.5) * 0.4));
      }
    }
  }
}

function buildScenery(f, a, b, r, bins, eyeSpots, avoid) {
  if (f.kind === 'district' || f.kind === 'narrows') return;
  const deckY = 14;
  if (f.kind === 'monoliths') return monoliths(a, b, r, bins, eyeSpots, avoid);
  if (f.kind === 'colonnade') return colonnade(a, b, r, bins, avoid);
  if (f.kind === 'pale') return pale(a, b, r, bins, avoid);
  if (f.kind === 'pines') {
    for (let i = 0; i < 26; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const p = roadPoint(a + r() * (b - a), side * (13 + r() * 85), 0);
      if (avoid(p.x, p.z)) continue;
      bins.pine.push(...pineTree(r, p.x, deckY - 24 + r() * 6, p.z));
      if (r() < 0.18) eyeSpots.push(roadPoint(a + r() * (b - a), side * (16 + r() * 30), -3 + r() * 6));
    }
    return;
  }
  const towers = f.kind === 'trestle' ? 3 : 5;
  for (let i = 0; i < towers; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const off = side * (38 + r() * 190);
    const p = roadPoint(a + r() * (b - a), off, 0);
    if (avoid(p.x, p.z)) continue;
    const h = 45 + r() * 85;
    bins.ruin.push(...ruinTower(r, p.x, p.z, h));
    const nEyes = r() < 0.55 ? 1 + Math.floor(r() * 3) : 0;
    for (let k = 0; k < nEyes; k++) {
      eyeSpots.push(roadPoint(a + r() * (b - a), off - side * 14, -20 + r() * (h - 35)));
    }
  }
  // rubble field far below the deck
  for (let i = 0; i < 6; i++) {
    const p = roadPoint(a + r() * (b - a), (r() * 2 - 1) * 70, 0);
    if (avoid(p.x, p.z)) continue;
    bins.ruin.push(box(3 + r() * 9, 1 + r() * 4, 3 + r() * 9, p.x, deckY - 30, p.z));
  }
}

// ---------------------------------------------------------------- abstract zones

const GROUND = -16; // world height the slabs stand on, far below the deck, lost in fog

/** Blank slabs and towers out in the fog: some huge and low, some impossibly tall, a few leaning. */
function monoliths(a, b, r, bins, eyeSpots, avoid) {
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const near = r() < 0.3;
    const off = side * (near ? 18 + r() * 20 : 40 + r() * 170);
    const p = roadPoint(a + r() * (b - a), off, 0);
    if (avoid(p.x, p.z)) continue;
    const tall = r() < 0.45;
    const w = tall ? 5 + r() * 9 : 18 + r() * 44;
    const d = tall ? 5 + r() * 9 : 8 + r() * 30;
    const h = tall ? 70 + r() * 110 : 10 + r() * 34;
    const g = new THREE.BoxGeometry(w, h, d).rotateY(r() * Math.PI);
    if (r() < 0.14) g.rotateZ((r() - 0.5) * 0.22); // leaning, as if settling
    bins[r() < 0.55 ? 'slab' : 'slabLight'].push(g.translate(p.x, GROUND + h / 2, p.z));
    if (tall && r() < 0.3) eyeSpots.push(new THREE.Vector3(p.x - side * (w / 2 + 0.2), 14 + r() * 20, p.z));
  }
}

/** The road runs down a nave: pillars in strict rows, beams overhead, receding into fog. */
function colonnade(a, b, r, bins, avoid) {
  const SPACING = 9;
  for (let s = Math.ceil(a / SPACING) * SPACING; s < b; s += SPACING) {
    const row = Math.round(s / SPACING);
    for (const off of [-15, 15, -27, 27, -39, 39]) {
      const outer = Math.abs(off) > 20;
      const at = s + (outer ? SPACING / 2 : 0);
      if (avoid(...xz(roadPoint(at, off, 0)))) continue;
      bins.pillar.push(roadBox(1.6, 96, 1.6, at, off, GROUND + 48 - 14));
    }
    if (row % 4 === 0) {
      bins.pillar.push(roadBox(31.6, 1.6, 1.8, s, 0, 30));   // the beam that makes it a hall
      bins.slab.push(roadBox(55.6, 1.0, 1.2, s, 0, 46));
    }
  }
}

/** Almost nothing: a line of poles carrying a wire, and silhouettes too far away to name. */
function pale(a, b, r, bins, avoid) {
  const POLE = 30;
  const side = 11.5;
  for (let s = Math.ceil(a / POLE) * POLE; s < b; s += POLE) {
    bins.pillar.push(roadBox(0.28, 40, 0.28, s, side, GROUND + 20 - 14)); // from the ground below, up past the deck
    bins.pillar.push(roadBox(2.6, 0.16, 0.16, s, side, 8.4));
  }
  for (const dw of [-1, 1]) bins.pillar.push(ribbon(a, b, side + dw - 0.03, side + dw + 0.03, 8.65, 8.6, 4));
  if (r() < 0.45) {
    const off = (r() < 0.5 ? -1 : 1) * (180 + r() * 160);
    const p = roadPoint(a + r() * (b - a), off, 0);
    if (!avoid(p.x, p.z)) {
      const h = 120 + r() * 120;
      bins.slab.push(new THREE.BoxGeometry(8 + r() * 10, h, 8 + r() * 10).translate(p.x, GROUND + h / 2, p.z));
    }
  }
}

const xz = (p) => [p.x, p.z];

export class ChunkManager {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.onSpawn = () => {};
    this.onDespawn = () => {};
    this.signMat = null;
    this.extras = [];                 // always-present chunk-likes (the district)
    this.avoid = () => false;         // keep highway scenery out of these places
  }

  /** Every chunk plus the extras, for systems that don't care which is which. */
  *all() {
    yield* this.chunks.values();
    yield* this.extras;
  }

  build(index) {
    const f = chunkFeatures(index);
    const a = index * CHUNK_LEN;
    const b = a + CHUNK_LEN;
    const r = rng(f.seed);
    const group = new THREE.Group();
    const bins = { asphalt: [], concrete: [], paint_line: [], steel: [], ruin: [], pine: [], rust: [], slab: [], slabLight: [], pillar: [] };
    const eyeSpots = [];
    const chunk = { index, f, group, lamps: [], chains: [], bodies: [], fires: [], signs: [], eyes: null, perches: [] };

    buildRoad(f, a, b, r, bins);
    buildScenery(f, a, b, r, bins, eyeSpots, this.avoid);
    if (f.truss) bins.steel.push(...trussGeometry(a, b, HW, r));

    if (f.overpass) {
      const broken = f.kind === 'zone9' || r() < 0.35;
      const op = overpassGeometry(a + CHUNK_LEN / 2, r, broken);
      bins.concrete.push(...op.geos);
      for (const t of broken ? [-14, 16] : [-3, 3]) {
        const side = new THREE.Vector3(-op.dir.z, 0, op.dir.x).multiplyScalar(4.6);
        chunk.perches.push(op.center.clone().addScaledVector(op.dir, t).add(side).setY(op.center.y + 0.8));
      }
      if (broken) this.hangChains(chunk, op, r);
    }

    if (f.lamps) {
      for (const s of [a + 6 + r() * 6, a + 26 + r() * 6]) {
        const side = r() < 0.5 ? -1 : 1;
        this.addLamp(chunk, s, side, r, bins);
      }
    }

    for (const w of f.wrecks) {
      const car = buildStaticCar(true);
      const p = roadPoint(w.s, w.d, 0);
      car.position.copy(p);
      car.rotation.y = -roadHeading(w.s) + w.yaw + (r() < 0.3 ? Math.PI : 0);
      car.rotation.z = (r() - 0.5) * 0.08;
      group.add(car);
      chunk.bodies.push(makeBody(car, w.s));
    }

    if (f.sign) this.addSign(chunk, a + 20, r);

    for (let i = 0; i < f.fires; i++) {
      const p = roadPoint(a + r() * CHUNK_LEN, (r() < 0.5 ? -1 : 1) * (15 + r() * 80), -18 - r() * 12);
      if (this.avoid(p.x, p.z)) continue;
      const s = glowSprite(0xff7a2a, 5 + r() * 6, 0.9);
      s.position.copy(p);
      group.add(s);
      chunk.fires.push({ sprite: s, base: s.scale.x, seed: r() * 100 });
    }

    for (const [name, geos] of Object.entries(bins)) {
      if (!geos.length) continue;
      group.add(new THREE.Mesh(merge(geos), MATS[name]));
    }

    if (eyeSpots.length) {
      chunk.eyes = eyePoints(eyeSpots, f.kind, r);
      group.add(chunk.eyes.points);
    }
    this.scene.add(group);
    return chunk;
  }

  addLamp(chunk, s, side, r, bins) {
    const off = side * (HW + 1.4);
    const base = roadPoint(s, off, 0);
    const h = roadHeading(s);
    const { geos, head } = lampPost(side);
    for (const g of geos) bins.steel.push(g.rotateY(-h).translate(base.x, base.y, base.z));
    head.applyAxisAngle(new THREE.Vector3(0, 1, 0), -h).add(base);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.26), SODIUM_MAT.clone());
    bulb.position.copy(head).y -= 0.12;
    bulb.rotation.y = -h;
    const halo = glowSprite(0xffa04a, 7, 0.55);
    halo.position.copy(bulb.position);
    // the wet-road glare: a long smear under the lamp
    const glare = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff8a3a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glare.position.set(head.x, base.y + 0.03, head.z);
    glare.rotation.y = -h;
    chunk.group.add(bulb, halo, glare);
    chunk.lamps.push({ pos: head.clone(), bulb, halo, glare, level: 1, flicker: 0, dead: r() < 0.12, seed: r() * 100 });
  }

  hangChains(chunk, op, r) {
    // chains hang from the broken lip; sometimes a wrecked car hangs from them
    const lipT = -2 - r() * 2;
    const anchor = op.center.clone().addScaledVector(op.dir, lipT);
    anchor.y -= 0.8;
    const withCar = r() < 0.65;
    const pivot = new THREE.Group();
    pivot.position.copy(anchor);
    const len = withCar ? op.lift - 4.8 : op.lift - 2 - r() * 3;
    const linkGeo = LINK_GEO;
    const offsets = withCar ? [-1.2, 1.2] : [0];
    for (const o of offsets) {
      for (let y = 0; y < len; y += 0.38) {
        const link = new THREE.Mesh(linkGeo, MATS.steel);
        link.position.set(o, -y, 0);
        link.rotation.y = (Math.round(y / 0.38) % 2) * Math.PI / 2;
        pivot.add(link);
      }
    }
    let car = null;
    if (withCar) {
      car = buildStaticCar(true);
      car.position.set(0, -len - 0.9, 0);
      car.rotation.set(0.25, r() * Math.PI, 0.12);
      pivot.add(car);
    }
    chunk.group.add(pivot);
    chunk.chains.push({ pivot, len, car, theta: 0, omega: 0, phi: r() * Math.PI, thetaZ: 0, omegaZ: 0 });
  }

  addSign(chunk, s, r) {
    const side = r() < 0.5 ? -1 : 1;
    const p = roadPoint(s, side * (HW + 2.2), 0);
    if (!this.signMat) {
      this.signMat = new THREE.MeshBasicMaterial({ map: signTexture(['ZONE 9', 'DANGER', 'NO TRESPASSING']), color: new THREE.Color(1.6, 1.6, 1.6) });
      this.signMat.userData.shared = true;
    }
    const mat = this.signMat.clone();
    mat.userData = {};
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2), mat);
    sign.position.set(p.x, p.y + 2.6, p.z);
    sign.rotation.y = -roadHeading(s) + side * 0.5;
    sign.rotation.z = (r() - 0.5) * 0.25;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2, 0.12), MATS.steel);
    post.position.set(p.x, p.y + 1, p.z);
    chunk.group.add(sign, post);
    chunk.signs.push({ mat, seed: r() * 10 });
  }

  /** Which chunk indices should be live around distance s (the loop wraps). */
  wanted(s, dir = 1) {
    const cur = Math.floor(s / CHUNK_LEN);
    const [back, ahead] = dir >= 0 ? [ROAD.CHUNKS_BEHIND, ROAD.CHUNKS_AHEAD] : [ROAD.CHUNKS_AHEAD, ROAD.CHUNKS_BEHIND];
    const out = [];
    for (let i = cur - back; i <= cur + ahead; i++) out.push(((i % N_CHUNKS) + N_CHUNKS) % N_CHUNKS);
    return out;
  }

  /** Keep chunks streamed around distance s. */
  update(s, dir = 1) {
    const want = new Set(this.wanted(s, dir));
    for (const [i, c] of this.chunks) {
      if (!want.has(i)) {
        this.onDespawn(c);
        this.scene.remove(c.group);
        disposeGroup(c.group);
        this.chunks.delete(i);
      }
    }
    for (const i of want) {
      if (!this.chunks.has(i)) {
        const c = this.build(i);
        this.chunks.set(i, c);
        this.onSpawn(c);
        return; // at most one build per frame keeps it smooth
      }
    }
  }

  *each(key) {
    for (const c of this.all()) yield* c[key];
  }
}

export function warmStart(mgr, s) {
  for (const i of mgr.wanted(s)) {
    if (!mgr.chunks.has(i)) {
      const c = mgr.build(i);
      mgr.chunks.set(i, c);
      mgr.onSpawn(c);
    }
  }
}
