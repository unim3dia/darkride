// THE LOG JAM. Somewhere in the Pines a logging truck shed its load across the
// highway and nobody came for it. A wall of stacked trunks: you can't drive
// through, you jump it. Then a long carpet of loose pine logs that roll and
// tumble under the wheels and shake the car the whole way, until they thin out
// and the asphalt comes back.
import * as THREE from 'three';
import { ROAD, ZONES } from '../config.js';
import { LOOP_LEN, sample, zoneIndexAt, gapAt, wrap } from './track.js';

const WALL = 4;          // the stacked face
const CARPET = 90;       // loose logs to ride
const TAIL = 24;         // thinning out back to the road
const WALL_H = 1.55;
const BED_H = 0.95;

/** Bark marbled with char: brown grain shot through with black veins and burnt patches. */
function barkTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#6b4a30';
  g.fillRect(0, 0, 256, 256);
  // the grain runs along the trunk (u goes round, v along)
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * 256;
    g.strokeStyle = `rgba(${20 + Math.random() * 40},${12 + Math.random() * 20},${6 + Math.random() * 10},${0.3 + Math.random() * 0.5})`;
    g.lineWidth = 1 + Math.random() * 4;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 16) g.lineTo(x + Math.sin(y * 0.05 + i) * 6 + (Math.random() - 0.5) * 4, y);
    g.stroke();
  }
  // marbling: black veins that wander and fork
  for (let i = 0; i < 26; i++) {
    let x = Math.random() * 256, y = Math.random() * 256, a = Math.random() * 6.28;
    g.strokeStyle = `rgba(4,3,2,${0.5 + Math.random() * 0.45})`;
    g.lineWidth = 1.5 + Math.random() * 5;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 30; k++) { a += (Math.random() - 0.5) * 0.9; x += Math.cos(a) * 7; y += Math.sin(a) * 7; g.lineTo(x, y); }
    g.stroke();
  }
  // charred patches: soft black blooms with a faint ember edge
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 14 + Math.random() * 46;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(2,2,2,0.95)');
    gr.addColorStop(0.7, 'rgba(8,5,3,0.7)');
    gr.addColorStop(0.9, 'rgba(70,22,6,0.25)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// each log is a different wood: pale brown, dark bark, near-black, burnt through
const TONES = [[1.15, 1, 0.9], [0.75, 0.62, 0.55], [0.4, 0.36, 0.34], [0.22, 0.2, 0.2], [1, 0.85, 0.75]];

/** Find a long gap-free stretch in the middle of the Pines, clear of every exit. */
function pickSpot(avoid) {
  const pines = [];
  for (let s = 0; s < LOOP_LEN; s += 10) if (ZONES[zoneIndexAt(s)].kind === 'pines') pines.push(s);
  const span = WALL + CARPET + TAIL + 40;
  const clear = (s) => {
    for (let k = -20; k < span; k += 4) if (gapAt(wrap(s + k))) return false;
    return !avoid.some((a) => Math.abs(wrap(s - a + LOOP_LEN / 2) - LOOP_LEN / 2) < 450);
  };
  const mid = pines[Math.floor(pines.length / 2)] ?? 0;
  const order = pines.slice().sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  return order.find(clear) ?? mid;
}

export class LogJam {
  constructor(scene, avoid = []) {
    this.s0 = pickSpot(avoid);
    this.group = new THREE.Group();
    scene.add(this.group);
    const bark = new THREE.MeshStandardMaterial({ color: 0xc0a088, map: barkTexture(), roughness: 0.85, emissive: 0x0c0604 });
    const geo = new THREE.CylinderGeometry(0.34, 0.38, ROAD.HALF_WIDTH * 2 + 1.6, 9, 1).rotateZ(Math.PI / 2);
    // the pale cut ends
    const ends = geo.attributes.position;
    const col = [];
    for (let i = 0; i < ends.count; i++) { const cap = Math.abs(ends.getX(i)) > ROAD.HALF_WIDTH; col.push(...(cap ? [1.9, 1.35, 0.85] : [1, 1, 1])); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    bark.vertexColors = true;
    this.logs = [];
    // the wall: three rows stacked, the top one a little ragged
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 4 - row; k++) this.logs.push({ s: this.s0 + 0.7 + k * 0.72 + row * 0.36, y: 0.36 + row * 0.6, d: (Math.random() - 0.5) * 0.8, yaw: (Math.random() - 0.5) * 0.08, roll: 0, loose: false });
    }
    // the carpet: two layers of loose logs, then fewer and fewer
    for (let s = WALL; s < WALL + CARPET + TAIL; s += 0.75) {
      const thin = s > WALL + CARPET ? (s - WALL - CARPET) / TAIL : 0;
      if (Math.random() < thin) continue;
      const y = this.height(this.s0 + s) - 0.34 + (Math.random() - 0.5) * 0.08;
      this.logs.push({ s: this.s0 + s, y, d: (Math.random() - 0.5) * 1.6, yaw: (Math.random() - 0.5) * 0.35, roll: Math.random() * 6, loose: true });
    }
    this.mesh = new THREE.InstancedMesh(geo, bark, this.logs.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const tint = new THREE.Color();
    this.logs.forEach((L, i) => { const k = TONES[Math.floor(Math.random() * TONES.length)]; this.mesh.setColorAt(i, tint.setRGB(k[0], k[1], k[2])); });
    this.group.add(this.mesh);
    this.place(0);
    // where it came from: a jackknifed trailer on the shoulder
    const S = sample(this.s0 - 14);
    const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 11), new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.7, metalness: 0.4 }));
    trailer.position.set(S.x + S.nx * (ROAD.HALF_WIDTH + 2.5), S.y + 0.9, S.z + S.nz * (ROAD.HALF_WIDTH + 2.5));
    trailer.rotation.set(0, Math.atan2(S.tx, S.tz) + 0.5, 0.22);
    this.group.add(trailer);
  }

  /** How high the logs stand above the deck at ring position s (0 off the jam). */
  height(s) {
    const k = wrap(s - this.s0 + LOOP_LEN / 2) - LOOP_LEN / 2;
    if (k < 0 || k > WALL + CARPET + TAIL) return 0;
    if (k < WALL) return WALL_H;
    // the bed rolls: big slow heaves with a rattle on top
    const bed = BED_H + 0.18 * Math.sin(k * 0.45) + 0.09 * Math.abs(Math.sin(k * 4.2));
    if (k < WALL + CARPET) return bed;
    return bed * (1 - (k - WALL - CARPET) / TAIL);
  }

  /** Is s on the stacked face (the bit you can't drive into)? */
  isWall(s) {
    const k = wrap(s - this.s0 + LOOP_LEN / 2) - LOOP_LEN / 2;
    return k >= -0.5 && k < WALL;
  }

  /** Lay every log on the road; the loose ones turn as the car rides over them. */
  place(time, near = -1) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const S = {};
    this.logs.forEach((L, i) => {
      sample(L.s, S);
      let roll = L.roll;
      let lift = 0;
      if (L.loose && near >= 0) {
        const dk = Math.abs(L.s - near);
        if (dk < 6) { roll += time * 9; lift = 0.06 * Math.abs(Math.sin(time * 23 + i)); }
      }
      v.set(S.x + S.nx * L.d, S.y + L.y + lift, S.z + S.nz * L.d);
      e.set(0, Math.atan2(S.tx, S.tz) + L.yaw, 0, 'YXZ');
      q.setFromEuler(e).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll));
      this.mesh.setMatrixAt(i, m.compose(v, q, one));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** @returns { on: riding the logs (0..1 rattle) } */
  update(time, vehicle) {
    const h = this.height(vehicle.s);
    const on = h > 0.2 && !vehicle.airborne && Math.abs(vehicle.d) < ROAD.HALF_WIDTH ? Math.min(1, vehicle.speed / 12) : 0;
    const k = wrap(vehicle.s - this.s0 + LOOP_LEN / 2) - LOOP_LEN / 2;
    if (k > -60 && k < WALL + CARPET + TAIL + 20) this.place(time, on ? vehicle.s : -1);
    return { on };
  }
}
