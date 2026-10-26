// THE DRIVE-THRU. Off Zone 9 a parkway curls down between dead lamps to a burger
// place that closed years ago but never told the machine. Pull up to the menu
// board and the speaker crackles into a recording: muffled, warped, still
// cheerful. Roll on to the window and a bag is waiting on the sill.
import * as THREE from 'three';
import { DRIVE } from './track.js';
import { SidePlace } from './sidePlace.js';
import { merge } from './props.js';

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

export class DriveThru extends SidePlace {
  constructor(scene) {
    super(scene, DRIVE, { name: 'BURGER NIGHT', sub: 'drive-thru · open', mapSub: 'drive-thru', color: '#ffb46a', halfWidth: 5 });
    this.buildRoad(new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.8 }));
    this.buildParkway();
    this.buildRestaurant();
    this.state = 'drive';
  }

  /** The parkway: a hedge each side, dead lamps, one or two still on. */
  buildParkway() {
    const sp = this.spur;
    const hedge = [];
    const poles = [];
    const lamps = [];
    for (let t = sp.tSepA + 20; t < sp.tSepB - 20; t += 6) {
      sp.sample(t, P);
      for (const s of [-1, 1]) hedge.push(new THREE.BoxGeometry(1.6, 1.4, 6.2).rotateY(-P.heading).translate(P.x + P.nx * s * 7, P.y + 0.7, P.z + P.nz * s * 7));
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

  /** The restaurant to the right, the lane curling past its menu board and window. */
  buildRestaurant() {
    const sp = this.spur;
    this.tMenu = this.tAt(0.48);
    this.tWindow = this.tAt(0.56);
    sp.sample((this.tMenu + this.tWindow) / 2, P);
    const g = new THREE.Group();
    const wall = new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.9 });
    const roofM = new THREE.MeshStandardMaterial({ color: 0x5a1a10, roughness: 0.7 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(12, 4.2, 22).translate(0, 2.1, 0), wall));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(13, 0.8, 23).translate(0, 4.6, 0), roofM));
    // the window: one dull fluorescent rectangle, the only light inside
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.4, 1.1) }));
    win.position.set(-6.02, 1.9, -3);
    win.rotation.y = -Math.PI / 2;
    g.add(win);
    // the bag on the sill
    this.bag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 }));
    this.bag.position.set(-6.25, 1.35, -3);
    g.add(this.bag);
    // the tall sign
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 12, 8).translate(0, 6, 0), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, metalness: 0.6, roughness: 0.5 }));
    pole.position.set(4, 0, 12);
    g.add(pole);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false, side: THREE.DoubleSide }));
    sign.position.set(4, 12.5, 12);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    this.signMat = sign.material;
    g.position.set(P.x + P.nx * 12.5, P.y, P.z + P.nz * 12.5);
    g.rotation.y = -P.heading;
    this.group.add(g);
    // the menu board on the right shoulder, a little box speaker under it
    sp.sample(this.tMenu, P);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.7), new THREE.MeshBasicMaterial({ map: menuTexture(), toneMapped: false }));
    board.position.set(P.x + P.nx * 5.4, P.y + 2.2, P.z + P.nz * 5.4);
    board.rotation.y = -P.heading - Math.PI / 2;
    this.group.add(board);
    this.boardLight = new THREE.PointLight(0xffc070, 5, 10, 1.6);
    this.boardLight.position.copy(board.position).add(new THREE.Vector3(-P.nx, 0.5, -P.nz));
    this.group.add(this.boardLight);
    const spk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6 }));
    spk.position.set(P.x + P.nx * 4.9, P.y + 0.9, P.z + P.nz * 4.9);
    spk.rotation.y = -P.heading;
    this.group.add(spk);
  }

  /** @returns { speak, served } */
  update(dt, time, vehicle) {
    const out = {};
    const h = this.hit(vehicle);
    this.w += (this.weightAt(h) - this.w) * Math.min(1, dt * 2);
    this.signMat.color.setScalar(Math.sin(time * 19) > 0.8 && Math.sin(time * 1.3) > 0.3 ? 0.25 : 1.1);
    this.boardLight.intensity = 5 * (Math.sin(time * 41) > 0.9 ? 0.3 : 1);
    if (!h) { this.state = 'drive'; this.bag.visible = true; return out; }
    if (this.state === 'drive' && Math.abs(h.t - this.tMenu) < 6 && vehicle.speed < 4) { this.state = 'ordered'; out.speak = true; }
    if (this.state === 'ordered' && Math.abs(h.t - this.tWindow) < 5 && vehicle.speed < 5) { this.state = 'served'; this.bag.visible = false; out.served = true; }
    // a nudge: slow down for the board
    if (this.state === 'drive' && h.t > this.tMenu - 30 && h.t < this.tMenu) out.slow = true;
    return out;
  }
}
