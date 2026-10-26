// THE REST STOP. Off the Colonnade, a gas station far too big for anyone: eighteen
// pumps under one long humming canopy. Past it, a drive-through car wash. Roll
// up and it takes the wheel: the conveyor drags you in, the camera climbs inside
// the car, and the tunnel goes to work in colour: suds, long cloth strips,
// spinning brushes, light through soap. Then it lets you go.
import * as THREE from 'three';
import { WASH } from './track.js';
import { SidePlace } from './sidePlace.js';
import { merge } from './props.js';

const P = {};
const WASH_A = 0.6;    // where the tunnel starts along the exit
const WASH_LEN = 70;   // tunnel length (m)
const CRAWL = 2.4;     // conveyor speed (m/s)

function canopySign() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0d0e10';
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#ff5a3c';
  g.font = '700 84px "Syncopate", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('GAS · OPEN 24 HRS', 512, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CarWash extends SidePlace {
  constructor(scene) {
    super(scene, WASH, { name: 'REST STOP', sub: 'gas · car wash', mapSub: 'gas + car wash', color: '#ff7a5c', halfWidth: 7 });
    this.buildRoad(new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.7 }));
    this.buildStation();
    this.buildTunnel();
    this.state = 'idle';
  }

  /** The station: a slab of forecourt, nine islands of two pumps, one long canopy of tube lights. */
  buildStation() {
    const F = this.frame(0.36);
    const g = new THREE.Group();
    const conc = new THREE.MeshStandardMaterial({ color: 0x1e1f21, roughness: 0.85 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.5, metalness: 0.6 });
    const pumpMat = new THREE.MeshStandardMaterial({ color: 0x3a1410, roughness: 0.5, emissive: 0x1a0603 });
    const screen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 0.9) });
    const tube = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.3, 2.4) });
    const side = 1; // the station sits to the right of the exit road
    const off = 7 + 20;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(44, 0.1, 70).translate(0, 0.05, 0), conc));
    const pumps = [];
    const screens = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const x = -14 + col * 14;
        const z = -24 + row * 24;
        pumps.push(new THREE.BoxGeometry(1.4, 0.3, 6).translate(x, 0.15, z)); // island
        for (const dz of [-1.6, 1.6]) {
          pumps.push(new THREE.BoxGeometry(0.9, 1.8, 0.6).translate(x, 1.2, z + dz));
          screens.push(new THREE.PlaneGeometry(0.5, 0.3).translate(x + 0.46, 1.6, z + dz).rotateY(0));
        }
      }
    }
    g.add(new THREE.Mesh(merge(pumps), pumpMat));
    const sm = new THREE.Mesh(merge(screens), screen);
    g.add(sm);
    // the canopy: posts, a flat roof, rows of tube lights beneath it
    const posts = [];
    for (const x of [-18, 0, 18]) for (const z of [-30, 0, 30]) posts.push(new THREE.BoxGeometry(0.6, 6, 0.6).translate(x, 3, z));
    g.add(new THREE.Mesh(merge(posts), steel));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(44, 1.2, 72).translate(0, 6.6, 0), steel));
    const tubes = [];
    for (let z = -32; z <= 32; z += 4) tubes.push(new THREE.BoxGeometry(40, 0.12, 0.2).translate(0, 5.95, z));
    g.add(new THREE.Mesh(merge(tubes), tube));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(40, 5), new THREE.MeshBasicMaterial({ map: canopySign(), toneMapped: false }));
    sign.position.set(-22.1, 6.6, 0);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    g.position.set(F.x + F.nx * side * off, F.y - 0.02, F.z + F.nz * side * off);
    g.rotation.y = -F.heading;
    this.group.add(g);
    this.light = new THREE.PointLight(0xe8f0ff, 30, 90, 1.4);
    this.light.position.copy(g.position).add(new THREE.Vector3(0, 5, 0));
    this.group.add(this.light);
  }

  /** The tunnel straddles the road: walls, roof, brushes, curtains of cloth, coloured lamps. */
  buildTunnel() {
    const sp = this.spur;
    this.tA = this.tAt(WASH_A);
    this.tB = this.tA + WASH_LEN;
    const shell = [];
    const steel = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide });
    for (let t = this.tA; t < this.tB; t += 2) {
      sp.sample(t, P);
      for (const s of [-1, 1]) shell.push(new THREE.BoxGeometry(0.3, 5, 2.05).rotateY(-P.heading).translate(P.x + P.nx * s * 4.2, P.y + 2.5, P.z + P.nz * s * 4.2));
      shell.push(new THREE.BoxGeometry(8.7, 0.3, 2.05).rotateY(-P.heading).translate(P.x, P.y + 5.1, P.z));
    }
    this.group.add(new THREE.Mesh(merge(shell), steel));
    // arch sign at the mouth
    sp.sample(this.tA, P);
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 512, 0);
    ['#ff3cac', '#784ba0', '#2b86c5', '#3cffd0'].forEach((col, i) => grad.addColorStop(i / 3, col));
    g.fillStyle = '#060608'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = grad; g.font = '700 70px "Syncopate", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('WASH', 256, 66);
    const arch = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), toneMapped: false, side: THREE.DoubleSide }));
    arch.position.set(P.x, P.y + 6.3, P.z);
    arch.rotation.y = -P.heading + Math.PI;
    this.group.add(arch);
    // brushes: tall spinning cylinders either side, and one rolling overhead
    const bristle = (hue) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.9, 0.45), roughness: 0.9, emissive: new THREE.Color().setHSL(hue, 0.9, 0.12) });
    this.brushes = [];
    for (const [u, side, hue] of [[0.18, -1, 0.85], [0.18, 1, 0.55], [0.55, -1, 0.12], [0.55, 1, 0.3]]) {
      sp.sample(this.tA + WASH_LEN * u, P);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 4.4, 18, 6, true), bristle(hue));
      const pos = b.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { const k = 1 + 0.18 * Math.sin(i * 1.7); pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
      b.position.set(P.x + P.nx * side * 2.6, P.y + 2.4, P.z + P.nz * side * 2.6);
      b.userData = { spin: side * 9, P0: b.position.clone(), nx: P.nx * side, nz: P.nz * side };
      this.group.add(b);
      this.brushes.push(b);
    }
    sp.sample(this.tA + WASH_LEN * 0.38, P);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 7, 18, 1, true).rotateZ(Math.PI / 2).rotateY(-P.heading), bristle(0.7));
    top.position.set(P.x, P.y + 3.4, P.z);
    top.userData = { roll: true, axis: new THREE.Vector3(P.tz, 0, -P.tx).normalize(), P0: top.position.clone() };
    this.group.add(top);
    this.brushes.push(top);
    // curtains: long hanging strips of cloth in two bands, each a different colour
    this.strips = [];
    for (const [u, base] of [[0.3, 0.0], [0.72, 0.5]]) {
      sp.sample(this.tA + WASH_LEN * u, P);
      for (let i = 0; i < 18; i++) {
        const x = -3.6 + i * 0.42;
        const hue = (base + i / 18 * 0.5) % 1;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 3.6).translate(0, -1.8, 0), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue, 0.85, 0.5), emissive: new THREE.Color().setHSL(hue, 0.9, 0.18), roughness: 0.8, side: THREE.DoubleSide }));
        m.position.set(P.x + P.nx * x, P.y + 4.9, P.z + P.nz * x);
        m.rotation.order = 'YXZ';
        m.rotation.y = -P.heading;
        m.userData = { ph: Math.random() * 6, base: -P.heading };
        this.group.add(m);
        this.strips.push(m);
      }
    }
    // coloured lamps that cycle along the tunnel
    this.lamps = [];
    for (let k = 0; k < 5; k++) {
      sp.sample(this.tA + (k + 0.5) * (WASH_LEN / 5), P);
      const l = new THREE.PointLight(0xffffff, 0, 16, 1.5);
      l.position.set(P.x, P.y + 4.2, P.z);
      this.group.add(l);
      this.lamps.push(l);
    }
    // suds: soft white blobs that cling to the glass and slide down
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sg = sc.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const x = 12 + Math.random() * 40, y = 12 + Math.random() * 40, r = 6 + Math.random() * 12;
      const gr = sg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.7, 'rgba(240,245,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      sg.fillStyle = gr; sg.beginPath(); sg.arc(x, y, r, 0, 7); sg.fill();
    }
    this.sudsTex = new THREE.CanvasTexture(sc);
    this.suds = [];
  }

  /** Foam on the car: sprites stuck to the body's glass, sliding as they go. */
  soap(carBody, n) {
    for (let i = 0; i < n && this.suds.length < 44; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sudsTex, color: new THREE.Color().setHSL(Math.random(), 0.5, 0.92), transparent: true, opacity: 0.95, depthWrite: false }));
      const onScreen = Math.random() < 0.6;
      // windshield (z -1.15..-0.48, y 1.02..1.48) or the hood and roof
      const x = (Math.random() - 0.5) * 1.5;
      const z = onScreen ? -0.65 - Math.random() * 0.45 : (Math.random() - 0.5) * 4;
      const y = onScreen ? 1.05 + (z + 1.15) * 0.687 : 1.5; // on the windshield's slope, or up on the roof
      m.position.set(x, y, z);
      const s = 0.12 + Math.random() * 0.26;
      m.scale.set(s, s, 1);
      m.userData = { life: 6 + Math.random() * 6, slide: 0.03 + Math.random() * 0.05 };
      carBody.add(m);
      this.suds.push(m);
    }
  }

  /**
   * One frame. Returns { take: true } while the wash is driving the car, and
   * camera / colour instructions for main.
   */
  update(dt, time, vehicle, carBody) {
    const out = {};
    const h = this.hit(vehicle);
    this.w += (this.weightAt(h) - this.w) * Math.min(1, dt * 2);
    this.light.intensity = 30 * (Math.sin(time * 37) > 0.93 ? 0.4 : 1);
    for (const b of this.brushes) {
      if (b.userData.roll) b.rotateOnWorldAxis(b.userData.axis, dt * 6);
      else b.rotation.y += b.userData.spin * dt;
    }
    for (const s of this.strips) s.rotation.x = Math.sin(time * 2.2 + s.userData.ph) * 0.18;
    if (this.state === 'idle') {
      if (h && h.t > this.tA - 8 && h.t < this.tA) { this.state = 'in'; this.t = 0; out.start = true; }
    }
    if (this.state === 'in' && h) {
      this.t += dt;
      out.take = true;
      const tt = Math.min(this.tB + 6, h.t + CRAWL * dt);
      const q = this.spur.sample(tt, P);
      // the conveyor has you: centred, pointing down the tunnel, at a crawl
      vehicle.pos.x += (q.x - vehicle.pos.x) * Math.min(1, dt * 3);
      vehicle.pos.z += (q.z - vehicle.pos.z) * Math.min(1, dt * 3);
      vehicle.yaw += Math.atan2(Math.sin(q.heading - vehicle.yaw), Math.cos(q.heading - vehicle.yaw)) * Math.min(1, dt * 4);
      vehicle.vel.set(q.tx * CRAWL, 0, q.tz * CRAWL);
      const k = (h.t - this.tA) / WASH_LEN;
      out.progress = k;
      // light through soap, colour cycling down the tunnel
      for (let i = 0; i < this.lamps.length; i++) {
        this.lamps[i].color.setHSL((time * 0.12 + i * 0.2) % 1, 0.9, 0.55);
        this.lamps[i].intensity = 18;
      }
      out.hue = (time * 0.08) % 1;
      if (k > 0.05 && k < 0.85 && Math.random() < dt * 8) this.soap(carBody, 1);
      if (h.t >= this.tB + 4) { this.state = 'done'; out.end = true; }
    }
    // the foam slides down and fades once it's had its time
    for (let i = this.suds.length - 1; i >= 0; i--) {
      const m = this.suds[i];
      m.userData.life -= dt * (this.state === 'in' ? 1 : 3);
      m.position.y -= m.userData.slide * dt;
      m.material.opacity = Math.min(0.95, m.userData.life / 2);
      if (m.userData.life <= 0) { m.parent.remove(m); m.material.dispose(); this.suds.splice(i, 1); }
    }
    if (this.state !== 'in') for (const l of this.lamps) l.intensity *= Math.exp(-dt * 2);
    if (this.state === 'done' && !h) this.state = 'idle';
    return out;
  }
}
