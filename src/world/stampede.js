// THE STAMPEDE. One stretch of the ring where the dust comes up and you're
// suddenly inside a herd: elephants and bison, huge, charging at your speed on
// both sides, some in the outer lanes, some galloping on the air past the
// barriers. They flicker; they leave echoes of themselves; the wind tears past.
import * as THREE from 'three';
import { LOOP_LEN, sample, elevation } from './track.js';
import { pulseMat } from '../render/pulseMaterial.js';

/** Where it happens, as loop fractions: the empty run between the Dust and the Ether. */
export const STAMPEDE = { a: 0.185 * LOOP_LEN, b: 0.262 * LOOP_LEN };
const FADE = 120;

const HIDE_MAT = pulseMat({ color: 0x0f0d0b, roughness: 0.95, envMapIntensity: 0.1 });
const TUSK_MAT = pulseMat({ color: 0x5a5248, roughness: 0.6, envMapIntensity: 0.2 });
const ECHO_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.37, 0.33), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });

/** A leg that swings from the hip. */
function leg(group, x, z, hip, len, r) {
  const pivot = new THREE.Group();
  pivot.position.set(x, hip, z);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, len, 8).translate(0, -len / 2, 0), HIDE_MAT);
  pivot.add(m);
  group.add(pivot);
  return pivot;
}

function elephant() {
  const g = new THREE.Group();
  const add = (geo, mat = HIDE_MAT) => { const m = new THREE.Mesh(geo, mat); g.add(m); return m; };
  add(new THREE.SphereGeometry(1, 18, 12).scale(2.3, 1.9, 3.3).translate(0, 4.1, 0));
  add(new THREE.SphereGeometry(1.45, 16, 12).translate(0, 4.9, -3.4));
  for (const s of [-1, 1]) {
    add(new THREE.CircleGeometry(1.5, 14).scale(0.9, 1.2, 1).rotateY(s * 1.2).translate(s * 1.35, 4.9, -2.9)).material.side = THREE.DoubleSide;
    add(new THREE.ConeGeometry(0.16, 1.9, 6).rotateX(-2.0).translate(s * 0.55, 3.8, -4.4), TUSK_MAT);
  }
  const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 4.6, -4.5), new THREE.Vector3(0, 3.4, -5.1), new THREE.Vector3(0, 2.0, -5.0), new THREE.Vector3(0, 1.1, -4.4)]);
  add(new THREE.TubeGeometry(trunk, 12, 0.32, 8));
  const legs = [[-1.2, -1.9], [1.2, -1.9], [-1.2, 1.9], [1.2, 1.9]].map(([x, z]) => leg(g, x, z, 3.2, 3.2, 0.6));
  return { g, legs, len: 7.5, half: 2.6, stride: 0.22 };
}

function bison() {
  const g = new THREE.Group();
  const add = (geo, mat = HIDE_MAT) => { const m = new THREE.Mesh(geo, mat); g.add(m); return m; };
  add(new THREE.SphereGeometry(1, 16, 12).scale(1.35, 1.35, 2.3).translate(0, 2.2, 0.2));
  add(new THREE.SphereGeometry(1.35, 14, 10).scale(1.05, 1.1, 1).translate(0, 2.9, -1.0));
  add(new THREE.SphereGeometry(0.8, 12, 10).scale(1, 1.05, 1.2).translate(0, 1.7, -2.5));
  for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.12, 0.7, 6).rotateZ(s * 1.1).translate(s * 0.75, 2.25, -2.6), TUSK_MAT);
  const legs = [[-0.65, -1.3], [0.65, -1.3], [-0.65, 1.4], [0.65, 1.4]].map(([x, z]) => leg(g, x, z, 1.7, 1.7, 0.28));
  return { g, legs, len: 5, half: 1.5, stride: 0.38 };
}

/** A trailing copy in light, the animal's own afterimage. */
function echoOf(a) {
  const e = a.g.clone(true);
  e.traverse((o) => { if (o.isMesh) o.material = ECHO_MAT; });
  const legs = [];
  e.children.forEach((c) => { if (c.isGroup) legs.push(c); });
  return { g: e, legs };
}

export class Stampede {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.herd = [];
    // the lanes they run in: the outer lanes of the deck, and out on the air either side
    const slots = [-5.2, 5.2, -12, 12, -19, 19, -27, 27, -5.4, 5.4, -14, 14, -23, 23, -33, 33];
    slots.forEach((d, i) => {
      const big = Math.abs(d) > 9 && i % 2 === 0; // the giants keep to the air past the barriers
      const a = big ? elephant() : bison();
      const echoes = [echoOf(a), echoOf(a)];
      this.group.add(a.g, ...echoes.map((e) => e.g));
      this.herd.push({ ...a, echoes, kind: big ? 'elephant' : 'bison', d, sOff: -40 + (i * 13) % 100, phase: Math.random() * 6, pace: 0.92 + Math.random() * 0.2 });
    });
    this.makeDust();
    this.makeStreaks();
    this.w = 0;
    this.v = 0;
  }

  makeDust() {
    const N = 900;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3).fill(-1e4), 3));
    this.dust = {
      N, next: 0, life: new Float32Array(N), vel: new Float32Array(N * 3),
      pts: new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9c8a74, size: 0.9, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })),
    };
    this.group.add(this.dust.pts);
  }

  makeStreaks() {
    const N = 90;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6).fill(-1e4), 3));
    this.streaks = {
      N, next: 0, life: new Float32Array(N),
      lines: new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xd8cbb8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })),
    };
    this.group.add(this.streaks.lines);
  }

  puff(x, y, z, n) {
    const D = this.dust;
    const pos = D.pts.geometry.attributes.position.array;
    for (let k = 0; k < n; k++) {
      const i = D.next++ % D.N;
      pos[i * 3] = x + (Math.random() - 0.5) * 2;
      pos[i * 3 + 1] = y + Math.random() * 0.6;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * 2;
      D.vel[i * 3] = (Math.random() - 0.5) * 3;
      D.vel[i * 3 + 1] = 0.5 + Math.random() * 2.5;
      D.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
      D.life[i] = 1 + Math.random() * 1.8;
    }
  }

  streak(P, d, y, len) {
    const S = this.streaks;
    const pos = S.lines.geometry.attributes.position.array;
    const i = S.next++ % S.N;
    const x = P.x + P.nx * d;
    const z = P.z + P.nz * d;
    pos.set([x, y, z, x - P.tx * len, y, z - P.tz * len], i * 6);
    S.life[i] = 0.25 + Math.random() * 0.3;
  }

  /** How deep into the stretch `s` is: 0 outside, 1 in the thick of it. */
  weightAt(s) {
    const w = ((s % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
    const { a, b } = STAMPEDE;
    return Math.min(1, Math.max(0, (w - a) / FADE)) * Math.min(1, Math.max(0, (b - w) / FADE));
  }

  /** @returns { w, near, push } — how much herd is around you, and a shove if you drifted into one. */
  update(dt, time, vehicle) {
    const P = {};
    sample(vehicle.s, P);
    const along = vehicle.vel.x * P.tx + vehicle.vel.z * P.tz;
    const onDeck = vehicle.onRoad && !vehicle.spurHit && Math.abs(vehicle.pos.y - elevation(vehicle.s)) < 4;
    const target = onDeck && along > 2 ? this.weightAt(vehicle.s) : 0;
    this.w += (target - this.w) * Math.min(1, dt * (target > this.w ? 0.8 : 1.5));
    this.group.visible = this.w > 0.01;
    const out = { w: this.w, near: 0, push: 0 };
    if (!this.group.visible) return out;
    // they run as fast as you do, give or take, and never far
    const pace = THREE.MathUtils.clamp(Math.max(along, 0), 18, 48);
    const Q = {};
    for (const a of this.herd) {
      const run = pace * a.pace * (1 + 0.1 * Math.sin(time * 0.31 + a.phase));
      a.sOff += (run - along) * dt;
      if (a.sOff > 70) a.sOff -= 3 * dt * (a.sOff - 70);
      if (a.sOff < -50) a.sOff += 3 * dt * (-50 - a.sOff);
      // they come out of the dust: the herd fills in from the edges as the weight rises
      const shown = this.w > Math.min(0.9, Math.abs(a.d) / 40 + 0.05);
      a.g.visible = shown;
      a.echoes.forEach((e) => { e.g.visible = shown; });
      if (!shown) continue;
      const s = vehicle.s + a.sOff;
      sample(s, Q);
      const y = elevation(s);
      a.phase += dt * run * a.stride;
      const bob = Math.abs(Math.sin(a.phase)) * (a.kind === 'elephant' ? 0.5 : 0.7);
      a.g.position.set(Q.x + Q.nx * a.d, y + bob, Q.z + Q.nz * a.d);
      a.g.rotation.set(Math.sin(a.phase * 2) * 0.04, -Q.heading, 0);
      a.legs.forEach((l, i) => { l.rotation.x = Math.sin(a.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.9 : 0)) * 0.75; });
      // afterimages lag behind and flicker
      a.echoes.forEach((e, k) => {
        const back = (k + 1) * (1.6 + pace * 0.04);
        e.g.position.copy(a.g.position).addScaledVector(new THREE.Vector3(Q.tx, 0, Q.tz), -back);
        e.g.rotation.copy(a.g.rotation);
        e.legs.forEach((l, i) => { l.rotation.x = a.legs[i].rotation.x * 0.8; });
        e.g.visible = Math.random() > 0.12;
      });
      // hooves throw dust; the wind tears streaks off them
      if (Math.random() < dt * (a.kind === 'elephant' ? 26 : 18) * this.w) this.puff(a.g.position.x, y, a.g.position.z, 3);
      if (Math.random() < dt * 9 * this.w) this.streak(Q, a.d + (Math.random() - 0.5) * 4, y + 1 + Math.random() * 5, 6 + Math.random() * 12);
      // too close: they shoulder you back toward the middle
      const dd = (vehicle.d ?? 0) - a.d;
      if (Math.abs(a.sOff) < a.len * 0.6 && Math.abs(dd) < a.half + 1.1) {
        out.push = Math.sign(dd || -a.d) * (a.half + 1.1 - Math.abs(dd));
        out.normal = { x: Q.nx, z: Q.nz };
      }
      out.near = Math.max(out.near, 1 - Math.min(1, (Math.hypot(a.sOff, a.d) - 4) / 30));
    }
    // particles live and die in the world, so you drive through them
    const D = this.dust;
    const dp = D.pts.geometry.attributes.position.array;
    for (let i = 0; i < D.N; i++) {
      if (D.life[i] <= 0) continue;
      D.life[i] -= dt;
      if (D.life[i] <= 0) { dp[i * 3 + 1] = -1e4; continue; }
      dp[i * 3] += D.vel[i * 3] * dt; dp[i * 3 + 1] += D.vel[i * 3 + 1] * dt; dp[i * 3 + 2] += D.vel[i * 3 + 2] * dt;
      D.vel[i * 3 + 1] *= 0.98;
    }
    D.pts.geometry.attributes.position.needsUpdate = true;
    D.pts.material.opacity = 0.45 * this.w;
    const S = this.streaks;
    const sp = S.lines.geometry.attributes.position.array;
    for (let i = 0; i < S.N; i++) {
      if (S.life[i] <= 0) continue;
      S.life[i] -= dt;
      if (S.life[i] <= 0) for (let k = 0; k < 6; k++) sp[i * 6 + k] = -1e4;
    }
    S.lines.geometry.attributes.position.needsUpdate = true;
    S.lines.material.opacity = 0.35 * this.w;
    ECHO_MAT.opacity = (0.16 + 0.1 * Math.random()) * this.w;
    return out;
  }
}

