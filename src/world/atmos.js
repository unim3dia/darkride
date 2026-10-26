// Weather that belongs to a place: a lid of dark fog over the trestle, fog banks
// that sweep in and out across Zone 9, gusts in the Pale that nearly wash the
// picture out at the lens, hail over the Monoliths, clouds far off in the sky,
// and a couple of trees in Zone 9 so tall you're not sure they're trees.
import * as THREE from 'three';
import { sample, zoneIndexAt, LOOP_LEN } from './track.js';
import { ZONES } from '../config.js';
import { treeGeo } from './herdScore.js';

/** What each zone asks for. */
const MOODS = {
  trestle: { topFog: 0.8 },
  zone9: { gust: 0.5, gustEvery: 9, topFog: 0.25, giants: true },
  pale: { gust: 0.88, gustEvery: 11 },
  monoliths: { topFog: 0.35, hail: true, clouds: 'pale', gust: 0.3, gustEvery: 14 },
  ruins: { clouds: 'dark', topFog: 0.15 },
};

function cloudTexture(seed, dark) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  let s = seed * 9973 + 7;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const puffs = 10 + Math.floor(r() * 14);
  const flat = r() < 0.5;
  for (let i = 0; i < puffs; i++) {
    const x = 30 + r() * 196;
    const y = (flat ? 70 : 40) + (r() - 0.5) * (flat ? 30 : 60);
    const rad = 14 + r() * 34;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = dark ? 0.55 : 0.35;
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 128);
  }
  return new THREE.CanvasTexture(c);
}

export class Atmos {
  constructor(scene) {
    this.scene = scene;
    this.top = 0;
    this.gust = 0;
    this.gustT = 0;
    this.nextGust = 4;
    this.hail = 0;
    this.hailT = -100;
    this.nextHail = 25;
    this.buildHail();
    this.buildClouds();
    this.buildGiants();
  }

  buildHail() {
    const N = 1400;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    this.hailLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0, depthWrite: false }));
    this.hailLines.frustumCulled = false;
    this.scene.add(this.hailLines);
    this.hailP = new Float32Array(N * 3).map((_, i) => (i % 3 === 1 ? Math.random() * 30 : (Math.random() - 0.5) * 60));
    this.hailN = N;
  }

  buildClouds() {
    this.clouds = [];
    for (let i = 0; i < 14; i++) {
      const dark = i % 2 === 0;
      const m = new THREE.SpriteMaterial({ map: cloudTexture(i + 1, dark), color: dark ? 0x2a2238 : 0x9aa0a8, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const sp = new THREE.Sprite(m);
      sp.userData = { a: (i / 14) * Math.PI * 2 + Math.random() * 0.3, dist: 600 + Math.random() * 400, h: 120 + Math.random() * 200, w: 220 + Math.random() * 320, dark, drift: (Math.random() - 0.5) * 0.004 };
      this.scene.add(sp);
      this.clouds.push(sp);
    }
  }

  /** Two trees in Zone 9, five times the height of anything around them, off in the murk. */
  buildGiants() {
    this.giants = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x0d0c10, roughness: 1 });
    const z9 = ZONES.findIndex((z) => z.kind === 'zone9');
    let a = -1, b = -1;
    for (let s = 0; s < LOOP_LEN; s += 20) { if (zoneIndexAt(s) === z9) { if (a < 0) a = s; b = s; } }
    for (const [u, side, seed] of [[0.35, -1, 3], [0.7, 1, 8]]) {
      const S = sample(a + (b - a) * u);
      const t = treeGeo(seed);
      const m = new THREE.Mesh(t.wood, wood);
      m.scale.setScalar(7);
      m.position.set(S.x + S.nx * side * 260, -30, S.z + S.nz * side * 260);
      this.giants.add(m);
    }
    this.scene.add(this.giants);
  }

  update(dt, time, s, camera) {
    const kind = s === null ? '' : ZONES[zoneIndexAt(s)].kind;
    const M = MOODS[kind] || {};
    const ease = (cur, to, rate) => cur + (to - cur) * Math.min(1, dt * rate);
    this.top = ease(this.top, M.topFog || 0, 0.6);
    // gusts: a bank rolls in over ~1.5 s, sits, and tears away
    this.nextGust -= dt;
    if (M.gust && this.nextGust <= 0) { this.gustT = 0; this.gustPeak = M.gust * (0.7 + Math.random() * 0.3); this.nextGust = M.gustEvery * (0.6 + Math.random() * 0.8); }
    this.gustT += dt;
    const env = this.gustPeak ? Math.max(0, Math.min(this.gustT / 1.4, 1, (4.5 - this.gustT) / 2.2)) : 0;
    this.gust = ease(this.gust, (M.gust ? env * this.gustPeak : 0), 3);
    // hail: about thirty seconds, now and then
    this.nextHail -= dt;
    if (M.hail && this.nextHail <= 0) { this.hailT = 0; this.nextHail = 70 + Math.random() * 60; }
    this.hailT += dt;
    const hailOn = M.hail && this.hailT < 30 ? Math.min(1, this.hailT / 3, (30 - this.hailT) / 4) : 0;
    this.hail = ease(this.hail, hailOn, 2);
    this.stepHail(dt, camera);
    // clouds hang far off, in a ring round wherever you are
    const want = M.clouds;
    for (const c of this.clouds) {
      const u = c.userData;
      u.a += u.drift * dt;
      c.position.set(camera.position.x + Math.cos(u.a) * u.dist, u.h, camera.position.z + Math.sin(u.a) * u.dist);
      c.scale.set(u.w, u.w * 0.45, 1);
      const on = want && ((want === 'dark') === u.dark) ? (u.dark ? 0.85 : 0.6) : 0;
      c.material.opacity = ease(c.material.opacity, on, 0.4);
      c.visible = c.material.opacity > 0.01;
    }
    this.giants.visible = kind === 'zone9' || kind === 'trestle' || kind === 'pale';
    return { top: this.top, gust: this.gust, hail: this.hail };
  }

  stepHail(dt, camera) {
    const L = this.hailLines;
    L.material.opacity = this.hail * 0.75;
    L.visible = this.hail > 0.01;
    if (!L.visible) return;
    const pos = L.geometry.attributes.position.array;
    const P = this.hailP;
    const c = camera.position;
    for (let i = 0; i < this.hailN; i++) {
      P[i * 3 + 1] -= dt * (34 + (i % 7) * 3);
      if (P[i * 3 + 1] < -4) { P[i * 3 + 1] += 34; P[i * 3] = (Math.random() - 0.5) * 60; P[i * 3 + 2] = (Math.random() - 0.5) * 60; }
      const x = c.x + P[i * 3], y = c.y + P[i * 3 + 1], z = c.z + P[i * 3 + 2];
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x + 0.05; pos[i * 6 + 4] = y + 0.5; pos[i * 6 + 5] = z;
    }
    L.geometry.attributes.position.needsUpdate = true;
  }
}
