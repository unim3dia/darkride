// HOME. A dark building tucked in the back streets of the Underpass, a garage
// door in its face. It's only a building until you've done the night: then the
// watchers come out and stand along the way, a few at a time, eyes lit, turned
// toward the next corner, until the last of them stands by the door. It rolls
// up, and you can go in.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { sample } from './track.js';
import { pulseMat } from '../render/pulseMaterial.js';

const W = 18;        // across the face
const D = 22;        // deep
const H = 9;         // tall
const DOOR_W = 7.6;
const DOOR_H = 4.6;
const GUIDE_GAP = 26;   // metres between the figures that show you the way
const U_STREETS = [-245, -175, -105, -35, 35, 105, 175, 245];
const V_STREETS = [-210, -140, -70, 0, 70, 140, 210];

function heartGeometry() {
  // point toward +z once laid flat, so a row of them reads as arrows
  const s = new THREE.Shape();
  s.moveTo(0, -1.5);
  s.bezierCurveTo(-0.4, -1.1, -1.6, -0.4, -1.6, 0.45);
  s.bezierCurveTo(-1.6, 1.25, -0.6, 1.5, 0, 0.75);
  s.bezierCurveTo(0.6, 1.5, 1.6, 1.25, 1.6, 0.45);
  s.bezierCurveTo(1.6, -0.4, 0.4, -1.1, 0, -1.5);
  return new THREE.ShapeGeometry(s, 10).rotateX(-Math.PI / 2).rotateY(Math.PI);
}

export class Home {
  constructor(scene, district) {
    this.d = district;
    this.open = 0;       // 0..1 how far the door is up
    this.lit = 0;        // the guides coming out
    this.pickSpot();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildHouse();
    this.buildGuides();
    this.addSolids();
  }

  /**
   * Find a clear lot facing a back street, well away from the main drag, so
   * getting there means turning off and taking a corner or two.
   */
  pickSpot() {
    const d = this.d;
    const clear = (u, vFront, side) => {
      for (let a = 0; a <= 6; a++) {
        for (let b = 0; b <= 6; b++) {
          const p = d.toWorld(u - W / 2 - 2 + ((W + 4) * a) / 6, vFront + side * ((D + 3) * b) / 6);
          if (d.solidAt(p.x, 1, p.z, 1.5)) return false;
        }
      }
      return true;
    };
    const found = [];
    for (const S of V_STREETS) {
      for (let u = -d.DU + 40; u < d.DU - 40; u += 10) {
        if (U_STREETS.some((a) => Math.abs(a - u) < W / 2 + 18)) continue; // mid-block, with room to swing in
        const off = Math.abs(S - d.roadV(u));
        if (off < 95) continue;                                          // properly off the drag
        for (const side of [1, -1]) {
          const vFront = S + side * 7;
          if (Math.sign(vFront - d.roadV(u)) !== Math.sign(S - d.roadV(u))) continue; // the far side of the street
          if (clear(u, vFront, side)) found.push({ u, S, side, vFront, score: Math.abs(u + 120) * 0.6 + Math.abs(off - 150) });
        }
      }
    }
    found.sort((a, b) => a.score - b.score);
    const f = found[0] || { u: -140, S: 140, side: 1, vFront: 147 };
    Object.assign(this, { u: f.u, S: f.S, side: f.side, vFront: f.vFront });
  }

  /** District (u, v) of a point given in the house's own frame: x across the face, z out of the door. */
  local(x, z) { return { u: this.u + x, v: this.vFront - this.side * z }; }
  world(x, z, y = 0) { const p = this.local(x, z); return this.d.toWorld(p.u, p.v, y); }

  buildHouse() {
    const d = this.d;
    const root = new THREE.Group();
    root.position.copy(this.world(0, 0, 0));
    root.rotation.y = d.faceYaw(0, -this.side); // +z faces the road
    this.group.add(root);
    this.root = root;
    const wall = pulseMat({ color: 0x0b0b0d, roughness: 0.92 });
    const trim = pulseMat({ color: 0x151517, roughness: 0.6, metalness: 0.5 });
    const box = (w, h, dd, x, y, z, m = wall) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m); b.position.set(x, y, z); root.add(b); return b; };
    const side = (W - DOOR_W) / 2;
    box(W, H, 0.6, 0, H / 2, -D);                                   // back
    for (const s of [-1, 1]) box(0.6, H, D, s * (W / 2), H / 2, -D / 2); // sides
    box(W + 0.6, 0.6, D + 0.6, 0, H, -D / 2);                       // roof
    for (const s of [-1, 1]) box(side, H, 0.6, s * (DOOR_W / 2 + side / 2), H / 2, 0); // face, either side of the door
    box(DOOR_W, H - DOOR_H, 0.6, 0, DOOR_H + (H - DOOR_H) / 2, 0);  // over the door
    box(W - 1, 0.04, D - 1, 0, 0.03, -D / 2, trim);                 // the floor inside
    box(DOOR_W + 0.8, 0.3, 0.9, 0, DOOR_H + 0.15, 0.2, trim);       // the door's head
    // the door: slats on a panel that rolls up into the head
    this.door = new THREE.Group();
    const slat = pulseMat({ color: 0x1a1b1e, roughness: 0.5, metalness: 0.6 });
    for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W - 0.1, DOOR_H / 9 - 0.04, 0.12), slat); s.position.set(0, (i + 0.5) * (DOOR_H / 9), 0); this.door.add(s); }
    this.door.position.set(0, 0, 0.12);
    root.add(this.door);
    // one bare bulb inside, warm, the only light the place has
    this.bulb = new THREE.PointLight(0xffb070, 0, 26, 1.6);
    this.bulb.position.set(0, H - 1.5, -D / 2);
    root.add(this.bulb);
    const bulbGlass = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 1.2), toneMapped: false }));
    bulbGlass.position.copy(this.bulb.position);
    root.add(bulbGlass);
    this.bulbGlass = bulbGlass;
    // a heart of light over the door, dark until the night is done
    this.heartMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.05, 0.1), toneMapped: false, fog: false, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(heartGeometry().rotateX(Math.PI / 2).rotateZ(Math.PI), this.heartMat);
    sign.scale.setScalar(1.7);
    sign.position.set(0, DOOR_H + 2.6, 0.4);
    root.add(sign);
    this.sign = sign;
    // a low red wash over the apron so the house is there when you look for it
    this.porch = new THREE.PointLight(0xff3040, 0, 30, 1.4);
    this.porch.position.set(0, DOOR_H + 3, 3);
    root.add(this.porch);
  }

  /**
   * The way in: down the ramp, along the drag to the nearest avenue, up it to the
   * back street, along that to the door. Watchers stand along it, turned onward.
   */
  buildGuides() {
    const d = this.d;
    const avenue = U_STREETS.filter((a) => a > -d.DU + 30).reduce((b, a) => (Math.abs(a - this.u) < Math.abs(b - this.u) ? a : b));
    const pts = [];
    for (let u = -d.DU - 260; u < avenue; u += 8) { const S = sample(d.s0 + u); pts.push(new THREE.Vector3(S.x, S.y, S.z)); }
    const leg = (u0, v0, u1, v1) => { const n = Math.max(1, Math.round(Math.hypot(u1 - u0, v1 - v0) / 8)); for (let i = 1; i <= n; i++) pts.push(d.toWorld(u0 + ((u1 - u0) * i) / n, v0 + ((v1 - v0) * i) / n, 0)); };
    leg(avenue, d.roadV(avenue), avenue, this.S);
    // along the back street on its far side, then swing round into the door
    const dirU = Math.sign(this.u - avenue) || 1;
    const far = this.S - this.side * 3.5;
    leg(avenue, this.S, avenue + dirU * 6, far);
    leg(avenue + dirU * 6, far, this.u - dirU * 13, far);
    const a = d.toWorld(this.u - dirU * 13, far, 0), c = d.toWorld(this.u, far, 0), b = this.world(0, 1, 0);
    const swing = new THREE.QuadraticBezierCurve3(a, c, b);
    for (let i = 1; i <= 6; i++) pts.push(swing.getPoint(i / 6));
    pts.push(this.world(0, -8, 0));
    this.route = pts;
    // figures: one every GUIDE_GAP metres of route, alternating sides, and one at every corner
    const body = new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.95 });
    const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 1.8), toneMapped: false, transparent: true, opacity: 0 });
    this.eyeMat = eye;
    // the lantern glow round their eyes, the thing you actually see from down the street
    const hc = document.createElement('canvas'); hc.width = hc.height = 64;
    const g2 = hc.getContext('2d'); const gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(200,225,255,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
    this.haloMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hc), color: 0xcfe6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.guides = [];
    let run = 0, flip = 1;
    for (let i = 1; i < pts.length - 1; i++) {
      run += pts[i].distanceTo(pts[i - 1]);
      const a = pts[i - 1], b = pts[i + 1];
      const dirA = new THREE.Vector3().subVectors(pts[i], a).normalize();
      const dirB = new THREE.Vector3().subVectors(b, pts[i]).normalize();
      const corner = dirA.dot(dirB) < 0.9;
      if (run < GUIDE_GAP && !corner && i !== pts.length - 2) continue;
      run = 0;
      flip = -flip;
      // stand at the edge of the way, looking where you go next
      const n = new THREE.Vector3(-dirB.z, 0, dirB.x);
      const off = corner ? 6.5 : 6;
      const side = corner ? -Math.sign(n.dot(new THREE.Vector3().subVectors(dirB, dirA))) || 1 : flip;
      const p = pts[i].clone().addScaledVector(n, side * off);
      const g = new THREE.Group();
      const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.1, 7, 1, true), body);
      cloak.position.y = 1.05;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), body);
      head.position.y = 2.2;
      g.add(cloak, head);
      for (const x of [-0.09, 0.09]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), eye); e.position.set(x, 2.24, 0.22); g.add(e); }
      const halo = new THREE.Sprite(this.haloMat);
      halo.scale.set(1.6, 1.6, 1);
      halo.position.set(0, 2.24, 0.25);
      g.add(halo);
      g.scale.setScalar(1.25);
      g.position.copy(p);
      g.rotation.y = Math.atan2(dirB.x, dirB.z);
      g.visible = false;
      g.userData = { along: i };
      this.group.add(g);
      this.guides.push(g);
    }
  }

  /** The walls are solid to the car; the door is too, until it's up. */
  addSolids() {
    const d = this.d;
    const add = (x0, x1, z0, z1, h) => {
      const A = this.local(x0, z0), B = this.local(x1, z1);
      const b = { u0: Math.min(A.u, B.u), u1: Math.max(A.u, B.u), v0: Math.min(A.v, B.v), v1: Math.max(A.v, B.v), h };
      const i = d.boxes.push(b) - 1;
      for (let a = Math.floor(b.u0 / 40); a <= Math.floor(b.u1 / 40); a++) {
        for (let c = Math.floor(b.v0 / 40); c <= Math.floor(b.v1 / 40); c++) {
          const k = a + ',' + c;
          if (!d.hash.has(k)) d.hash.set(k, []);
          d.hash.get(k).push(i);
        }
      }
      return b;
    };
    const side = (W - DOOR_W) / 2;
    add(-W / 2, W / 2, -D - 0.3, -D + 0.3, H);
    for (const s of [-1, 1]) add(s * W / 2 - 0.3, s * W / 2 + 0.3, -D, 0, H);
    for (const s of [-1, 1]) add(s * DOOR_W / 2, s * (DOOR_W / 2 + side), -0.3, 0.3, H);
    this.doorBox = add(-DOOR_W / 2, DOOR_W / 2, -0.3, 0.4, DOOR_H);
  }

  /** Where the camera stands to watch the door: out on the apron, a little high. */
  watchPoint(back = 0, up = 0) { return this.world(0, 11 + back, 3.0 + up); }
  doorPoint() { return this.world(0, 0, 2.3); }

  /** Is the car in, well past the door? */
  isInside(pos) {
    const p = this.d.toLocal(pos.x, pos.z);
    const x = p.u - this.u;
    const z = (this.vFront - p.v) * this.side;
    return Math.abs(x) < W / 2 - 1 && z < -5 && z > -D + 1;
  }

  /** How far the car is from the door, for opening it as you come up. */
  doorDistance(pos) { return pos.distanceTo(this.world(0, 0, pos.y)); }

  /**
   * @param ready  the night is done: light the way and let the door open
   * @param shut   the ending holds the door shut (0..1 closing)
   */
  update(dt, time, vehicle, ready, shut = 0) {
    // the first time you come back with the night done, the watchers come out to show the way,
    // running away from you down the ramp toward the door
    const out = {};
    if (ready && this.revealT === undefined && (vehicle.pos.distanceTo(this.route[0]) < 200 || this.d.inside(vehicle.pos.x, vehicle.pos.z))) { this.revealT = time; out.arrive = true; }
    const lit = ready && this.revealT !== undefined;
    this.lit += ((lit ? 1 : 0) - this.lit) * Math.min(1, dt * 0.8);
    const show = this.lit > 0.01;
    // they come out a few at a time, always the next ones ahead of you, and stay
    let at = 0, best = Infinity;
    for (let i = 0; i < this.route.length; i += 2) { const dd = this.route[i].distanceToSquared(vehicle.pos); if (dd < best) { best = dd; at = i; } }
    this.reached = Math.max(this.reached || 0, at);
    for (const g of this.guides) {
      const ahead = g.userData.along - this.reached;
      g.visible = show && ahead < 70;
    }
    this.eyeMat.opacity = this.lit * (0.75 + 0.25 * Math.sin(time * 9));
    this.haloMat.opacity = this.lit * (0.7 + 0.15 * Math.sin(time * 2.3));
    const thump = Math.pow(Math.max(0, Math.sin(time * 3.2)), 8);
    this.heartMat.opacity = this.lit * (0.55 + 0.45 * thump);
    // the door rolls up when you're close, and down when the story says so
    const near = lit && this.doorDistance(vehicle.pos) < 34;
    const want = shut > 0 ? 1 - shut : near ? 1 : 0;
    this.open += (want - this.open) * Math.min(1, dt * (shut > 0 ? 4 : 1.4));
    this.door.position.y = this.open * (DOOR_H - 0.3);
    this.door.scale.y = 1 - this.open * 0.85;
    this.doorBox.h = this.open > 0.7 ? 0 : DOOR_H;
    this.bulb.intensity = this.lit * (8 + 2 * Math.sin(time * 17) * Math.sin(time * 3.1));
    this.bulbGlass.visible = this.lit > 0.05;
    this.porch.intensity = this.lit * (14 + 10 * thump);
    out.inside = lit && this.isInside(vehicle.pos);
    out.opening = near && this.open < 0.95;
    return out;
  }
}
