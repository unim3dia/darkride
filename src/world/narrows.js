// THE NARROWS — the inner city, halfway round the ring.
// Tall grey buildings packed along ten-meter streets, almost no light.
// Greys are laid out like a phrase of music: a repeating figure of values
// so the dark reads as composed, not empty. One red sign is the landmark;
// one hollow plaza is the still center everything else crowds around.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { pulseMat } from '../render/pulseMaterial.js';
import { SHARED_MATS } from './props.js';
import { District } from './district.js';
import { DMATS, boxUV, boxAt, cylAt, strutUV, warehouse } from './districtKit.js';

// six greys, near-black to charcoal; the "scale" the city is played in
const GREYS = [0x0a0a0b, 0x0e0e10, 0x121214, 0x16171a, 0x1b1c1f, 0x212226];
GREYS.forEach((c, i) => {
  DMATS['g' + i] = pulseMat({ color: c, roughness: 0.88 - i * 0.04, metalness: 0.05, envMapIntensity: 0.08 + i * 0.03 });
  SHARED_MATS.add(DMATS['g' + i]);
});
DMATS.lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.5, 2.6) });
DMATS.clock = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.92, 0.95) });
SHARED_MATS.add(DMATS.lamp);
SHARED_MATS.add(DMATS.clock);

const PITCH = 38;
const HALF = 14;                 // 28m blocks, 10m streets
const PHRASE = [2, 0, 3, 1, 4, 2, 5, 1, 3, 0];          // grey values, in order
const HEIGHTS = [24, 38, 20, 52, 30, 64, 28, 44, 22, 34]; // a skyline with a rhythm
const PLAZA = { u: 76, v: -76, r: 34 };

export class Narrows extends District {
  constructor(scene, opts) {
    super(scene, { DU: 250, DV: 214, seed: 4242, name: 'narrows', ...opts });
  }

  layout(K) {
    const r = this.r;
    this.phone = null;
    K.add('ground', new THREE.PlaneGeometry(this.DV * 2 + 40, this.DU * 2 + 40).rotateX(-Math.PI / 2).translate(0, -0.01, 0));

    const us = [];
    const vs = [];
    for (let u = -228; u <= 228; u += PITCH) us.push(u);
    for (let v = -190; v <= 190; v += PITCH) vs.push(v);
    let i = 0;
    for (const cu of us) {
      let j = 0;
      for (const cv of vs) {
        j++;
        const inPlaza = Math.hypot(cu - PLAZA.u, cv - PLAZA.v) < PLAZA.r + 12;
        if (inPlaza) continue;
        const edge = cu === us[0] || cu === us[us.length - 1] || cv === vs[0] || cv === vs[vs.length - 1];
        this.block(K, cu, cv, i, j, edge);
      }
      i++;
    }
    this.plaza(K);
    this.perimeterN(K);
    this.overhead(K, us, vs);
    this.corners(K, us, vs);
    this.landmark(K);
  }

  /** A block: towers shoulder to shoulder, values and heights from the phrase. */
  block(K, cu, cv, i, j, edge) {
    const r = this.r;
    let v0 = cv - HALF;
    let v1 = cv + HALF;
    // the avenue cuts through: keep only what stands clear of it, fronted by an arcade
    const rv = this.roadV(cu);
    const clear = ROAD.HALF_WIDTH + 7;
    if (v1 > rv - clear && v0 < rv + clear) {
      if (cv > rv) v0 = rv + clear;
      else v1 = rv - clear;
      if (v1 - v0 < 8) return;
      this.arcade(K, cu, cv > rv ? v0 : v1, cv > rv ? 1 : -1);
    }
    K.add('sidewalk', boxUV(cu - HALF - 1.6, cu + HALF + 1.6, v0 - 1.6, v1 + 1.6, 0, 0.14));
    const n = 1 + Math.floor(r() * 3);
    const w = (HALF * 2) / n;
    for (let k = 0; k < n; k++) {
      const step = i * 3 + j * 5 + k * 7;
      const grey = 'g' + PHRASE[step % PHRASE.length];
      const h = HEIGHTS[step % HEIGHTS.length] * (edge ? 1.3 : 1) + (r() - 0.5) * 6;
      const u0 = cu - HALF + k * w;
      warehouse(K, r, u0, u0 + w - 0.2, v0, v1, h, { mat: grey });
      this.crown(K, u0, u0 + w - 0.2, v0, v1, h, grey);
      this.ledges(K, u0, u0 + w - 0.2, v0, v1, h, step);
      if (r() < 0.22 && !edge) this.waterTower(K, u0 + w / 2, (v0 + v1) / 2, h);
      if (r() < 0.12) this.blade(K, u0 + w / 2, r() < 0.5 ? v0 - 0.1 : v1 + 0.1, 5 + r() * 4);
    }
    // doorways where someone might stand
    if (r() < 0.3 && !edge) {
      const side = r() < 0.5 ? -1 : 1;
      const vv = side < 0 ? v0 - 1.0 : v1 + 1.0;
      this.watcherSpots.push({ u: cu + (r() - 0.5) * 16, v: vv, y: 0.14, faceU: 0, faceV: side });
    }
    if (r() < 0.18) this.parked.push({ u: cu + (r() - 0.5) * 20, v: (r() < 0.5 ? v0 - 3.2 : v1 + 3.2), yaw: this.yawToward(r() < 0.5 ? 1 : -1, 0), dull: r() < 0.5 });
    this.walls.push({ u: cu, v: v1 + 0.08, du: 0, dv: 1 });
  }

  /** Stepped crowns: the tall ones taper, deco-style, against the sky. */
  crown(K, u0, u1, v0, v1, h, grey) {
    if (h < 40) return;
    const inset = 2.5;
    K.add(grey, boxUV(u0 + inset, u1 - inset, v0 + inset, v1 - inset, h, h + 6));
    K.add(grey, boxUV(u0 + inset * 2.2, u1 - inset * 2.2, v0 + inset * 2.2, v1 - inset * 2.2, h + 6, h + 10));
  }

  /** Cornices every few floors: thin shelves of shadow. */
  ledges(K, u0, u1, v0, v1, h, step) {
    const every = 3.6 * (2 + (step % 3));
    for (let y = every; y < h - 2; y += every) {
      K.add('g' + PHRASE[(step + 4) % PHRASE.length], boxUV(u0 - 0.3, u1 + 0.3, v0 - 0.3, v1 + 0.3, y, y + 0.35));
    }
  }

  waterTower(K, u, v, h) {
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.add('steel', strutUV([u + a * 1.4, h, v + b * 1.4], [u + a * 1.1, h + 4, v + b * 1.1], 0.08, 4));
    K.add('rust', cylAt(u, v, h + 4, 1.9, 3.6, 14));
    K.add('rust', new THREE.ConeGeometry(2.1, 1.4, 14).translate(v, h + 8.3, -u));
  }

  /** An unlit sign blade jutting over the street. */
  blade(K, u, v, y) {
    K.add('steel', boxAt(u, v, y, 0.25, 1.6, 4.2));
    K.add('steel', boxAt(u, v, y + 4.2, 0.08, 1.8, 0.08));
  }

  /** A covered walk along the avenue: pillars and a low ceiling. */
  arcade(K, cu, vFace, side) {
    const v = vFace - side * 0.2;
    K.add('g1', boxUV(cu - HALF, cu + HALF, Math.min(v, v - side * 4.2), Math.max(v, v - side * 4.2), 4.4, 5.0));
    for (let u = cu - HALF + 2; u <= cu + HALF - 1; u += 4.5) {
      const pv = v - side * 4.0;
      K.add('g2', boxAt(u, pv, 0, 0.6, 0.6, 4.4));
      K.box(u - 0.3, u + 0.3, pv - 0.3, pv + 0.3, 4.4);
    }
  }

  /** The void: an open square with a dry fountain, one tall white lamp, a clock. */
  plaza(K) {
    const { u, v } = PLAZA;
    K.add('sidewalk', cylAt(u, v, 0, PLAZA.r, 0.1, 40));
    K.add('g3', cylAt(u, v, 0.1, 7, 0.8, 36));
    K.add('g0', cylAt(u, v, 0.35, 6.2, 0.6, 36));
    K.add('g4', cylAt(u, v, 0.1, 0.9, 4.2, 12));
    K.add('g4', cylAt(u, v, 4.2, 2.2, 0.4, 16));
    K.circle(u, v, 7.2, 0.9);
    // the clock tower on the square's far corner
    const tu = u + 24;
    const tv = v - 24;
    K.add('g2', boxAt(tu, tv, 0, 7, 7, 44));
    K.add('g3', boxAt(tu, tv, 44, 5, 5, 8));
    K.add('g1', new THREE.ConeGeometry(4, 7, 4).rotateY(Math.PI / 4).translate(tv, 55.5, -tu));
    K.box(tu - 3.5, tu + 3.5, tv - 3.5, tv + 3.5, 44);
    this.clocks = [];
    for (const [du, dv] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
      const face = new THREE.CircleGeometry(2.1, 28);
      const yaw = Math.atan2(dv, -du); // turn +Z toward (du, dv) in group space (x = v, z = -u)
      face.rotateY(yaw).translate(tv + dv * 3.55, 40, -(tu + du * 3.55));
      K.add('clock', face);
    }
    this.lampAt(u - 12, v + 12, this.r, 1, 'mercury');
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      this.watcherSpots.push({ u: u + Math.cos(a) * 9, v: v + Math.sin(a) * 9, y: 0.1, faceU: -Math.cos(a), faceV: -Math.sin(a), bystander: k !== 0 });
    }
    this.answererSpots.push({ u: u - 20, v: v + 16, yaw: this.yawToward(1, -0.6) });
    this.plazaCenter = { u, v };
  }

  /** Taller, darker walls at the edge; open where the avenue leaves. */
  perimeterN(K) {
    const r = this.r;
    for (const su of [-1, 1]) {
      const g = this.roadV(su * this.DU);
      const [u0, u1] = su > 0 ? [this.DU, this.DU + 14] : [-this.DU - 14, -this.DU];
      for (let v = -this.DV - 14; v < this.DV + 14; v += 14) {
        if (Math.abs(v + 7 - g) < ROAD.HALF_WIDTH + 10 || this.blocksRoad(u0, u1, v, v + 14)) continue;
        K.add('g' + PHRASE[Math.floor(v / 14 + 50) % PHRASE.length], boxUV(u0, u1, v, v + 14, 0, 40 + r() * 50));
      }
    }
    for (const sv of [-1, 1]) {
      const [v0, v1] = sv > 0 ? [this.DV, this.DV + 14] : [-this.DV - 14, -this.DV];
      for (let u = -this.DU; u < this.DU; u += 14) {
        if (this.blocksRoad(u, u + 14, v0, v1)) continue;
        K.add('g' + PHRASE[Math.floor(u / 14 + 50) % PHRASE.length], boxUV(u, u + 14, v0, v1, 0, 40 + r() * 50));
      }
    }
  }

  /** Skybridges and sagging wires: the streets get a ceiling. */
  overhead(K, us, vs) {
    const r = this.r;
    for (let a = 0; a < us.length - 1; a++) {
      for (const cv of vs) {
        const su = (us[a] + us[a + 1]) / 2;
        if (this.nearRoad(su, cv, 6) || Math.hypot(su - PLAZA.u, cv - PLAZA.v) < PLAZA.r + 14) continue;
        const roll = r();
        if (roll < 0.1) {
          const y = 8 + Math.floor(r() * 4) * 3.6;
          K.add('g2', boxUV(su - 5, su + 5, cv - 2, cv + 2, y, y + 3.2));
          K.add(r() < 0.25 ? 'windowLit' : 'windowDim', boxUV(su - 4.5, su + 4.5, cv - 2.05, cv + 2.05, y + 1.2, y + 2.2));
          if (r() < 0.4) this.watcherSpots.push({ u: su, v: cv + 2.6, y: y + 3.2, faceU: 0, faceV: 1 });
        } else if (roll < 0.45) {
          // wires across the street, sagging in three spans
          const y = 6 + r() * 6;
          const off = (r() - 0.5) * 16;
          const pts = [[su - 5, y, cv + off], [su - 1.7, y - 0.7, cv + off], [su + 1.7, y - 0.7, cv + off], [su + 5, y, cv + off]];
          for (let k = 0; k < 3; k++) K.add('g0', strutUV(pts[k], pts[k + 1], 0.025, 3));
        }
      }
    }
  }

  /** Intersections: rare cold lamps (often dead), steam, and one ringing payphone. */
  corners(K, us, vs) {
    const r = this.r;
    for (let a = 0; a < us.length - 1; a++) {
      for (let b = 0; b < vs.length - 1; b++) {
        const u = (us[a] + us[a + 1]) / 2;
        const v = (vs[b] + vs[b + 1]) / 2;
        if (this.nearRoad(u, v, 3) || Math.hypot(u - PLAZA.u, v - PLAZA.v) < PLAZA.r) continue;
        if (r() < 0.2) this.lampAt(u + 3.4, v + 3.4, r, r() < 0.5 ? -1 : 1, 'mercury');
        if (r() < 0.4) {
          this.vents.push(this.toWorld(u, v, 0));
          K.add('steel', new THREE.CylinderGeometry(0.6, 0.6, 0.04, 14).translate(v, 0.02, -u));
        }
        if (!this.phone && a === 4 && b === 6) this.payphone(K, u + 4.6, v - 4.6);
      }
    }
    // only a few of the doorway bulbs still work here
    K.wallLamps = K.wallLamps.filter(() => r() < 0.22);
  }

  payphone(K, u, v) {
    K.add('steel', boxAt(u, v, 0, 1.0, 1.0, 2.3));
    K.add('windowDim', boxAt(u, v - 0.52, 0.9, 0.8, 0.05, 1.2));
    K.add('lamp', boxAt(u, v, 2.3, 0.5, 0.5, 0.06));
    K.box(u - 0.5, u + 0.5, v - 0.5, v + 0.5, 2.3);
    this.phone = { pos: this.toWorld(u, v, 1.4), ringing: true, cooldown: 0 };
    this.watcherSpots.push({ u: u + 3, v: v - 2, y: 0.14, faceU: -1, faceV: 0.5 });
  }

  /** The one warm color in the place: a red HOTEL blade over the plaza. */
  landmark() {
    const pos = this.toWorld(PLAZA.u - 38, PLAZA.v - 10, 22);
    this.signAt('HOTEL', 'rooms', pos, this.faceYaw(1, 0.2), [0xff2b2b, 0xff6a5a]);
  }

  /** Marks for the inner city. */
  paint() {
    super.paintWith({
      lines: ['THE DARK HERE IS LISTENING', 'FOLLOW THE RED', 'ANSWER IT', 'THE CLOCK IS NOT WRONG', 'THEY WATCH FROM THE BRIDGES', 'HIT THE SWITCHES SOFTLY'],
      arrows: [-150, -60, 30, 150].map((u) => ({ u, v: this.roadV(u) - 14, du: 0.3, dv: -1 })),
      spirals: [{ u: PLAZA.u, v: PLAZA.v + 14, size: 7 }],
    });
  }
}
