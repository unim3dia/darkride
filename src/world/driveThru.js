// THE DRIVE-THRU. Off Zone 9 a parkway curls down between dead lamps to a burger
// place that closed years ago but never told the machine. Pull up to the menu
// board and the speaker crackles into a recording: muffled, warped, still
// cheerful. Roll on to the window and a bag is waiting on the sill.
import * as THREE from 'three';
import { DRIVE } from './track.js';
import { SidePlace } from './sidePlace.js';
import { merge } from './props.js';
import { buildStaticCar } from '../player/carModel.js';

const P = {};

function menuTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = '#1a0d08';
  g.fillRect(0, 0, 256, 384);
  g.fillStyle = '#ffcf6a';
  g.font = '700 30px "Syncopate", sans-serif';
  g.textAlign = 'center';
  g.fillText('MENU', 128, 46);
  g.font = '500 17px "IBM Plex Mono", monospace';
  const items = ['NO.1 . . . . 2.49', 'NO.2 . . . . 3.19', 'NIGHT FRIES . .99', 'LARGE SHAKE 1.89', 'THE USUAL . . —', 'COFFEE . . . .50', 'WHATEVER . . . ?'];
  items.forEach((t, i) => { g.globalAlpha = i === 4 || i === 6 ? 0.45 : 0.9; g.fillText(t, 128, 100 + i * 36); });
  g.globalAlpha = 1;
  // burnt-out panels
  for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(Math.random() * 200, 70 + Math.random() * 260, 40 + Math.random() * 50, 20 + Math.random() * 30); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#120806';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#ff4a2a';
  g.font = '700 74px "Syncopate", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('BURGER', 256, 92);
  g.fillStyle = '#ffd36a';
  g.font = '700 48px "Syncopate", sans-serif';
  g.fillText('NIGHT', 256, 176);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bigSignTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 512);
  // a fat round burger of a sign: bun, patty, bun, ringed in bulbs
  g.fillStyle = '#ffb12e';
  g.beginPath(); g.arc(256, 256, 240, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a0806';
  g.beginPath(); g.arc(256, 256, 220, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff9a2a';
  g.beginPath(); g.ellipse(256, 170, 170, 70, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#5a1a0c'; g.fillRect(90, 250, 332, 30);
  g.fillStyle = '#ff9a2a'; g.fillRect(96, 300, 320, 40);
  for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; g.fillStyle = i % 2 ? '#fff2c0' : '#ffcf6a'; g.beginPath(); g.arc(256 + Math.cos(a) * 230, 256 + Math.sin(a) * 230, 7, 0, 7); g.fill(); }
  g.fillStyle = '#ff4a2a';
  g.font = '700 70px "Syncopate", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('BURGER', 256, 222);
  g.fillStyle = '#fff1c8';
  g.font = '700 48px "Syncopate", sans-serif';
  g.fillText('NIGHT', 256, 392);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function arrowTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#140806';
  g.fillRect(0, 0, 512, 160);
  g.fillStyle = '#ffcf6a';
  g.font = '700 54px "Syncopate", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 82);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// the lot, in its own frame: a along the exit road, c across it (negative = toward the building)
const LOT = { a0: -48, a1: 48, c0: -52, c1: -7 };
const BUILDING = [-12, 12, -37, -23];      // a0 a1 c0 c1
// Like a real drive-thru, the lane runs counter-clockwise: in up the right side, along the back with
// the building on your left (the board comes first, then the window), out down the left side.
const MENU = { a: 5, c: -40.2 };           // where you stop to order: the board is at your driver's window
const WINDOW = { a: -7, c: -40.2 };
// the drive-thru lane: down the left side of the building, along the back, up the right side,
// fenced in by curbs and kinked by baffles so you have to thread it
const WALLS = [
  [-21.5, -20.5, -45, -14],   // left fence
  [20.5, 21.5, -45, -14],     // right fence
  [-21.5, 21.5, -46, -45],    // back fence
  [16, 20.5, -27, -26],       // baffles in the way in (right side)
  [12, 16, -32, -31],
  [11, 12, -45, -42.4],       // a kink in the back lane before the board
  [-16, -12, -31, -30],       // and one on the way out (left side)
  [-30, 30, -8.6, -7.4],      // a curb along the road: you can't cut in, you come round
];

export class DriveThru extends SidePlace {
  constructor(scene) {
    super(scene, DRIVE, { name: 'BURGER NIGHT', sub: 'drive-thru · open', mapSub: 'drive-thru', color: '#ffb46a', halfWidth: 5 });
    this.buildRoad(new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.8 }));
    this.T0 = this.tAt(0.5);
    const O = this.spur.sample(this.T0, {});
    this.O = { x: O.x, y: O.y, z: O.z, tx: O.tx, tz: O.tz, nx: O.nx, nz: O.nz, heading: O.heading };
    // the walls of the exit open onto the lot at either end of it
    this.spur.openings.push([this.T0 + LOT.a0, this.T0 - 30, -1], [this.T0 + 30, this.T0 + LOT.a1, -1]);
    this.buildParkway();
    this.buildRestaurant();
    this.state = 'drive';
    const self = this;
    this.pad = { height(x, z) { const [a, c] = self.local(x, z); return a > LOT.a0 && a < LOT.a1 && c > LOT.c0 && c < LOT.c1 ? self.O.y + 0.02 : -Infinity; } };
  }

  /** World (x, z) → lot frame (a, c). */
  local(x, z) {
    const O = this.O;
    return [(x - O.x) * O.tx + (z - O.z) * O.tz, (x - O.x) * O.nx + (z - O.z) * O.nz];
  }

  /** Lot frame → world point at height y above the lot. */
  world(a, c, y = 0) {
    const O = this.O;
    return new THREE.Vector3(O.x + O.tx * a + O.nx * c, O.y + y, O.z + O.tz * a + O.nz * c);
  }

  /** A box in the lot frame: [a0, a1] along, [c0, c1] across, h tall. */
  box(a0, a1, c0, c1, h, y0 = 0) {
    const p = this.world((a0 + a1) / 2, (c0 + c1) / 2, y0 + h / 2);
    return new THREE.BoxGeometry(c1 - c0, h, a1 - a0).rotateY(-this.O.heading).translate(p.x, p.y, p.z);
  }

  /** The parkway: a hedge each side, dead lamps, one or two still on. No hedge where the lot opens. */
  buildParkway() {
    const sp = this.spur;
    const hedge = [];
    const poles = [];
    const lamps = [];
    for (let t = sp.tSepA + 20; t < sp.tSepB - 20; t += 6) {
      sp.sample(t, P);
      for (const s of [-1, 1]) if (!(s < 0 && Math.abs(t - this.T0) < 52)) hedge.push(new THREE.BoxGeometry(1.6, 1.4, 6.2).rotateY(-P.heading).translate(P.x + P.nx * s * 7, P.y + 0.7, P.z + P.nz * s * 7));
    }
    let k = 0;
    for (let t = sp.tSepA + 30; t < sp.tSepB - 30; t += 34) {
      sp.sample(t, P);
      const s = k % 2 ? 1 : -1;
      poles.push(new THREE.CylinderGeometry(0.1, 0.12, 7, 6).translate(P.x + P.nx * s * 6, P.y + 3.5, P.z + P.nz * s * 6));
      if (k % 3 === 0) lamps.push(new THREE.SphereGeometry(0.3, 8, 6).translate(P.x + P.nx * s * 5.4, P.y + 6.9, P.z + P.nz * s * 5.4));
      k++;
    }
    this.group.add(new THREE.Mesh(merge(hedge), new THREE.MeshStandardMaterial({ color: 0x0c140d, roughness: 1 })));
    this.group.add(new THREE.Mesh(merge(poles), new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.6, metalness: 0.5 })));
    this.group.add(new THREE.Mesh(merge(lamps), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.0, 0.45) })));
  }

  /** A flat panel in the lot frame facing ±c (side = -1 faces away from the road) or ±a. */
  panel(mat, w, h, a, c, y, faceA = 0, faceC = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.copy(this.world(a, c, y));
    const dir = new THREE.Vector3(this.O.tx * faceA + this.O.nx * faceC, 0, this.O.tz * faceA + this.O.nz * faceC);
    m.rotation.y = Math.atan2(dir.x, dir.z);
    this.group.add(m);
    return m;
  }

  /** The lot, the building, the lane round the back, the tall sign out by the road. */
  buildRestaurant() {
    const lot = new THREE.Mesh(this.box(LOT.a0, LOT.a1, LOT.c0, LOT.c1, 0.1, -0.08), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.55, metalness: 0.1, envMapIntensity: 0.7 }));
    this.group.add(lot);
    // painted lane arrows and bays
    const paint = [];
    for (let k = -4; k <= 4; k++) paint.push(this.box(28 + k * 0.1 - 0.08, 28 + k * 0.1 + 0.08, -12 - k * 3.2 - 2.5, -12 - k * 3.2 + 2.5, 0.02, 0.03));
    for (let c = -16; c > -44; c -= 5) paint.push(this.box(-16.6, -16.4, c - 1.2, c, 0.02, 0.03));
    for (let a = -18; a < 20; a += 5) paint.push(this.box(a, a + 1.2, -41.1, -40.9, 0.02, 0.03));
    this.group.add(new THREE.Mesh(merge(paint), new THREE.MeshBasicMaterial({ color: 0x8a8370 })));
    // the building
    const [b0, b1, b2, b3] = BUILDING;
    this.group.add(new THREE.Mesh(this.box(b0, b1, b2, b3, 4.4), new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.9 })));
    this.group.add(new THREE.Mesh(this.box(b0 - 0.6, b1 + 0.6, b2 - 0.6, b3 + 0.6, 0.9, 4.4), new THREE.MeshStandardMaterial({ color: 0x5a1a10, roughness: 0.7, emissive: 0x200604 })));
    // a dim front window facing the road, so the place reads as a restaurant
    this.panel(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.35, 0.2) }), 14, 1.6, 0, b3 + 0.02, 1.9, 0, 1);
    // the curbs and fences of the lane
    this.group.add(new THREE.Mesh(merge(WALLS.map(([a0, a1, c0, c1]) => this.box(a0, a1, c0, c1, 1.1))), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8, emissive: 0x120804 })));
    // reflector posts on the lane so you can follow it in the dark
    const refl = [];
    for (const [a0, a1, c0, c1] of WALLS.slice(0, 7)) {
      const len = Math.max(a1 - a0, c1 - c0);
      for (let k = 0; k <= len; k += 4) { const a = a1 - a0 > c1 - c0 ? a0 + k : (a0 + a1) / 2; const c = a1 - a0 > c1 - c0 ? (c0 + c1) / 2 : c0 + k; const p = this.world(a, c, 1.3); refl.push(new THREE.SphereGeometry(0.12, 6, 4).translate(p.x, p.y, p.z)); }
    }
    this.group.add(new THREE.Mesh(merge(refl), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.45, 0.15) })));
    // the lane entrance: an arrow on a post at the front-left corner
    const enter = this.panel(new THREE.MeshBasicMaterial({ map: arrowTexture('DRIVE THRU ↓'), toneMapped: false, side: THREE.DoubleSide }), 5, 1.6, 18, -15, 3.2, 0, 1);
    this.signMat = enter.material;
    const post = this.world(18, -15.2, 0);
    this.group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 6).translate(post.x, post.y + 1.2, post.z), new THREE.MeshStandardMaterial({ color: 0x2a2b2e })));
    // the menu board, on the back of the building at window height, facing the lane
    const board = this.panel(new THREE.MeshBasicMaterial({ map: menuTexture(), toneMapped: false }), 2, 3, MENU.a, b2 - 0.05, 2.1, 0, -1);
    this.boardLight = new THREE.PointLight(0xffc070, 6, 12, 1.6);
    this.boardLight.position.copy(this.world(MENU.a, b2 - 1.5, 3));
    this.group.add(this.boardLight);
    const spk = new THREE.Mesh(this.box(MENU.a - 2.1, MENU.a - 1.6, b2 - 0.8, b2 - 0.1, 1.1), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6 }));
    this.group.add(spk);
    this.board = board;
    // the window: one dull fluorescent rectangle, and the bag on the sill
    this.panel(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.4, 1.1) }), 2.4, 1.4, WINDOW.a, b2 - 0.03, 1.9, 0, -1);
    this.bag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 }));
    this.bag.position.copy(this.world(WINDOW.a, b2 - 0.3, 1.35));
    this.group.add(this.bag);
    // the big sign: a tall pole out by the road with a round burger on top, lit all night
    const sp = this.world(-38, -14, 0);
    this.group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 30, 10).translate(sp.x, sp.y + 15, sp.z), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, metalness: 0.6, roughness: 0.5 })));
    const bigMat = new THREE.MeshBasicMaterial({ map: bigSignTexture(), toneMapped: false, transparent: true, alphaTest: 0.05 });
    this.bigSigns = [1, -1].map((f) => this.panel(bigMat, 13, 13, -38, -14, 36, f, 0));
    this.bigMat = bigMat;
    this.bigLight = new THREE.PointLight(0xffa040, 40, 70, 1.4);
    this.bigLight.position.copy(this.world(-38, -14, 33));
    this.group.add(this.bigLight);
    // a couple of cars nobody came back for, out on the lot
    for (const a of [26, 32]) {
      const car = buildStaticCar(true);
      car.position.copy(this.world(a, -14));
      car.rotation.y = -this.O.heading + Math.PI / 2;
      this.group.add(car);
    }
  }

  /** Keep the car out of the building and the lane's curbs. */
  collide(vehicle) {
    const [a, c] = this.local(vehicle.pos.x, vehicle.pos.z);
    if (a < LOT.a0 - 4 || a > LOT.a1 + 4 || c < LOT.c0 - 4 || c > -6) return;
    if (vehicle.pos.y > this.O.y + 3) return;
    const R = 1.1;
    for (const [a0, a1, c0, c1] of [BUILDING, ...WALLS]) {
      if (a < a0 - R || a > a1 + R || c < c0 - R || c > c1 + R) continue;
      // out by the shortest way
      const pushes = [[a0 - R - a, 0], [a1 + R - a, 0], [0, c0 - R - c], [0, c1 + R - c]];
      const [da, dc] = pushes.reduce((m, p) => (Math.abs(p[0] + p[1]) < Math.abs(m[0] + m[1]) ? p : m));
      const O = this.O;
      vehicle.pos.x += O.tx * da + O.nx * dc;
      vehicle.pos.z += O.tz * da + O.nz * dc;
      const nx = O.tx * Math.sign(da) + O.nx * Math.sign(dc), nz = O.tz * Math.sign(da) + O.nz * Math.sign(dc);
      const into = -(vehicle.vel.x * nx + vehicle.vel.z * nz);
      if (into > 0) { vehicle.vel.x += nx * into * 1.2; vehicle.vel.z += nz * into * 1.2; vehicle.vel.multiplyScalar(0.85); }
      return;
    }
  }

  /** @returns { speak, served, static } */
  update(dt, time, vehicle) {
    const out = {};
    const h = this.hit(vehicle);
    const [a, c] = this.local(vehicle.pos.x, vehicle.pos.z);
    const onLot = vehicle.onPad && a > LOT.a0 && a < LOT.a1 && c > LOT.c0 && c < LOT.c1;
    this.w += ((onLot ? 1 : this.weightAt(h)) - this.w) * Math.min(1, dt * 2);
    this.bigMat.color.setScalar(Math.sin(time * 13) > 0.92 && Math.sin(time * 0.7) > 0.4 ? 0.35 : 1.15);
    this.signMat.color.setScalar(Math.sin(time * 19) > 0.8 && Math.sin(time * 1.3) > 0.3 ? 0.25 : 1.1);
    this.boardLight.intensity = 6 * (Math.sin(time * 41) > 0.9 ? 0.3 : 1);
    this.collide(vehicle);
    if (!onLot) {
      if (!h) { this.state = 'drive'; this.bag.visible = true; }
      return out;
    }
    const at = (p, r) => Math.hypot(a - p.a, c - p.c) < r;
    if (this.state === 'drive' && at(MENU, 4) && vehicle.speed < 4) {
      // it takes your order twice, then the third time there's only static, then twice again…
      this.visits = (this.visits || 0) + 1;
      if (this.visits % 3 === 0) { this.state = 'static'; out.static = true; }
      else { this.state = 'ordered'; out.speak = true; }
    }
    if (this.state === 'ordered' && at(WINDOW, 3.5) && vehicle.speed < 5) { this.state = 'served'; this.bag.visible = false; out.served = true; }
    return out;
  }
}
