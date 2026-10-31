// HOME. A dark building just off the main drag of the Underpass, a garage door in
// its face. It's only a building until you've done the night: then hearts light
// the road from the ramp down to it, the door rolls up, and you can go in.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { sample } from './track.js';
import { pulseMat } from '../render/pulseMaterial.js';

const W = 18;        // across the face
const D = 22;        // deep
const H = 9;         // tall
const DOOR_W = 6.6;
const DOOR_H = 4.6;
const HEART_GAP = 9;

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
    this.lit = 0;        // the hearts fading in
    this.pickSpot();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildHouse();
    this.buildHearts();
    this.addSolids();
  }

  /** Find a clear lot beside the drag, near where the ring comes back down. */
  pickSpot() {
    const d = this.d;
    const HW = ROAD.HALF_WIDTH;
    const clear = (u, side) => {
      const v0 = d.roadV(u) + side * (HW + 7);
      for (let a = 0; a <= 6; a++) {
        for (let b = 0; b <= 6; b++) {
          const p = d.toWorld(u - W / 2 - 2 + ((W + 4) * a) / 6, v0 + side * ((D + 3) * b) / 6);
          if (d.solidAt(p.x, 1, p.z, 1.5)) return false;
        }
      }
      return true;
    };
    for (const u of [-120, -80, -160, -40, -200, 0, 40, -240, 80, 120]) {
      for (const side of [1, -1]) {
        if (!clear(u, side)) continue;
        this.u = u; this.side = side;
        this.vFront = d.roadV(u) + side * (HW + 7);
        return;
      }
    }
    // nowhere free: stand it out on the shoulder anyway
    this.u = -120; this.side = 1; this.vFront = d.roadV(-120) + HW + 7;
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
    this.heartMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 0.02, 0.045), toneMapped: false, fog: false, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(heartGeometry().rotateX(Math.PI / 2).rotateZ(Math.PI), this.heartMat);
    sign.scale.setScalar(1.1);
    sign.position.set(0, DOOR_H + 2.2, 0.4);
    root.add(sign);
    this.sign = sign;
  }

  /** Hearts laid on the road: down the ramp, along the drag, and in through the door. */
  buildHearts() {
    const d = this.d;
    const pts = [];
    const HW = ROAD.HALF_WIDTH;
    const turnU = this.u - 26;
    for (let u = -d.DU - 160; u < turnU; u += HEART_GAP) {
      const S = sample(d.s0 + u);
      const k = THREE.MathUtils.smoothstep(u, turnU - 120, turnU);
      const off = this.side * k * (HW - 2.5); // drift over to the side the house is on
      pts.push(new THREE.Vector3(S.x + S.nx * off, S.y, S.z + S.nz * off));
    }
    // a curve off the road and up to the door, then inside
    const a = pts[pts.length - 1].clone();
    const door = this.world(0, 6, 0);
    const inside = this.world(0, -D * 0.55, 0);
    const curve = new THREE.QuadraticBezierCurve3(a, this.world(-10, 14, 0), door);
    const n = Math.ceil(curve.getLength() / HEART_GAP);
    for (let i = 1; i <= n; i++) pts.push(curve.getPoint(i / n));
    for (let t = HEART_GAP; t < door.distanceTo(inside); t += HEART_GAP) pts.push(door.clone().lerp(inside, t / door.distanceTo(inside)));
    // mostly greys, dark and mid, so they belong to the night; now and then one in dark maroon
    const mk = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false, fog: false, transparent: true, opacity: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
    this.heartMats = [mk(0.07, 0.07, 0.075), mk(0.17, 0.17, 0.18), mk(0.16, 0.015, 0.03)];
    const geo = heartGeometry();
    this.hearts = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      const m = new THREE.Mesh(geo, this.heartMats[i % 7 === 3 ? 2 : i % 2]);
      m.position.set(p.x, p.y + 0.07, p.z);
      m.rotation.y = Math.atan2(q.x - o.x, q.z - o.z);
      m.visible = false;
      this.group.add(m);
      this.hearts.push(m);
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
  watchPoint(back = 0, up = 0) { return this.world(0, 21 + back, 3.2 + up); }
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
    // the first time you come back with the night done, the hearts come on one after another,
    // running away from you down the ramp toward the door
    const out = {};
    if (ready && this.revealT === undefined && (vehicle.pos.distanceTo(this.hearts[0].position) < 260 || this.d.inside(vehicle.pos.x, vehicle.pos.z))) { this.revealT = time; out.arrive = true; }
    const lit = ready && this.revealT !== undefined;
    this.lit += ((lit ? 1 : 0) - this.lit) * Math.min(1, dt * 0.8);
    const show = this.lit > 0.01;
    const reach = lit ? (time - this.revealT) * 14 : 0;
    // a beat runs down the line toward the door, like a pulse
    for (let i = 0; i < this.hearts.length; i++) {
      const h = this.hearts[i];
      h.visible = show && i < reach;
      if (!h.visible) continue;
      const beat = Math.pow(Math.max(0, Math.sin(time * 3.2 - i * 0.45)), 6);
      h.scale.setScalar(0.85 + 0.45 * beat);
    }
    for (const m of this.heartMats) m.opacity = this.lit * 0.95;
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
    out.inside = lit && this.isInside(vehicle.pos);
    out.opening = near && this.open < 0.95;
    return out;
  }
}
