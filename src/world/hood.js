// THE BLOCK. A short loop off the Ruins into a neighbourhood everyone forgot:
// crooked houses with one light left on each, a broken playground, and in the
// middle of the road a basketball court with one enormous ball. You get one
// shot: hit it and it flies for a hoop standing far off in the dark.
import * as THREE from 'three';
import { HOOD } from './track.js';
import { Spur, spurRibbon } from './spur.js';
import { merge } from './props.js';

const P = {};
const HALF = 5.5;           // half width of the street
const COURT_U = 0.5;        // where the court sits along the loop
const BALL_R = 2.6;
const GRAVITY = 22;

export const hoodHalfWidth = () => HALF;

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7a3a17';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
  g.strokeStyle = '#140904';
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();
  g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 256); g.stroke();
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 256); g.stroke();
  for (const x of [128, 384]) { g.beginPath(); g.ellipse(x, 128, 70, 128, 0, 0, Math.PI * 2); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A crooked little house: walls, a gable roof slumping one way, one lit window. */
function house(r) {
  const w = 6 + r() * 4;
  const d = 6 + r() * 4;
  const h = 3 + r() * 2.5;
  const walls = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const roof = new THREE.CylinderGeometry(0.01, w * 0.72, 2.6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, d / w).translate(0, h + 1.3, 0);
  if (r() < 0.4) roof.rotateZ((r() - 0.5) * 0.4);
  const lit = r() < 0.85;
  const win = new THREE.PlaneGeometry(1.1, 1.3).translate((r() - 0.5) * w * 0.5, h * 0.5, -d / 2 - 0.02).rotateY(Math.PI);
  return { walls, roof, win, lit, tilt: (r() - 0.5) * 0.08 };
}

export class Hood {
  constructor(scene, rng) {
    this.spur = new Spur(HOOD);
    this.group = new THREE.Group();
    scene.add(this.group);
    const sp = this.spur;
    const r = rng;
    const t0 = sp.tSepA;
    const t1 = sp.tSepB;
    // the street, and the dead ground the houses stand on
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.75 });
    this.group.add(new THREE.Mesh(spurRibbon(sp, t0, t1, -HALF, HALF, 0.05, -1, 3), asphalt));
    const ground = new THREE.MeshStandardMaterial({ color: 0x0c0d0c, roughness: 1 });
    this.group.add(new THREE.Mesh(spurRibbon(sp, t0 + 20, t1 - 20, -70, -HALF, -0.05, -0.1, 6), ground));
    this.group.add(new THREE.Mesh(spurRibbon(sp, t0 + 20, t1 - 20, HALF, 70, -0.05, -0.1, 6), ground));
    // houses down both sides, set back, each slightly wrong
    const walls = [];
    const roofs = [];
    const lit = [];
    const dark = [];
    const glows = [];
    const tCourt = sp.N * COURT_U;
    for (let t = t0 + 30; t < t1 - 30; t += 14 + r() * 10) {
      if (Math.abs(t - tCourt) < 38) continue;
      for (const side of [-1, 1]) {
        if (r() < 0.2) continue;
        sp.sample(t, P);
        const H = house(r);
        const m = new THREE.Matrix4().makeRotationY(-P.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + H.tilt)
          .premultiply(new THREE.Matrix4().makeTranslation(P.x + P.nx * side * (HALF + 9 + r() * 6), P.y - 0.05, P.z + P.nz * side * (HALF + 9 + r() * 6)));
        const sink = new THREE.Matrix4().makeRotationZ((r() - 0.5) * 0.06);
        walls.push(H.walls.applyMatrix4(sink).applyMatrix4(m));
        roofs.push(H.roof.applyMatrix4(sink).applyMatrix4(m));
        (H.lit ? lit : dark).push(H.win.applyMatrix4(m));
        if (H.lit) glows.push(new THREE.Vector3().setFromMatrixPosition(m).add(new THREE.Vector3(0, 2.2, 0)));
      }
    }
    this.group.add(new THREE.Mesh(merge(walls), new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.95 })));
    this.group.add(new THREE.Mesh(merge(roofs), new THREE.MeshStandardMaterial({ color: 0x100e0d, roughness: 0.9 })));
    this.group.add(new THREE.Mesh(merge(lit), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.4, 0.6), side: THREE.DoubleSide, fog: false })));
    if (dark.length) this.group.add(new THREE.Mesh(merge(dark), new THREE.MeshBasicMaterial({ color: 0x050505 })));
    // each lit window throws a little warm halo into the dark
    const gc = document.createElement('canvas');
    gc.width = gc.height = 64;
    const gg = gc.getContext('2d');
    const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,170,90,0.9)');
    gr.addColorStop(1, 'rgba(255,170,90,0)');
    gg.fillStyle = gr;
    gg.fillRect(0, 0, 64, 64);
    const glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (const p of glows) { const sp2 = new THREE.Sprite(glowMat); sp2.position.copy(p); sp2.scale.setScalar(7); this.group.add(sp2); }
    this.buildPlayground(sp, tCourt - 70, r);
    this.buildCourt(sp, tCourt);
    this.tCourt = tCourt;
  }

  /** A swing set with one swing left, a slide leaning off its ladder, a seesaw stuck down. */
  buildPlayground(sp, t, r) {
    sp.sample(t, P);
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.6, metalness: 0.6 });
    const add = (geo) => g.add(new THREE.Mesh(geo, steel));
    for (const x of [-2.5, 2.5]) for (const z of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6).rotateX(z * 0.3).translate(x, 1.6, z * 0.5));
    add(new THREE.CylinderGeometry(0.06, 0.06, 5.2, 6).rotateZ(Math.PI / 2).translate(0, 3.2, 0));
    this.swing = new THREE.Group();
    this.swing.position.set(-1, 3.2, 0);
    for (const x of [-0.3, 0.3]) this.swing.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.4, 3).translate(x, -1.2, 0), steel));
    this.swing.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.3).translate(0, -2.4, 0), steel));
    g.add(this.swing);
    const slide = new THREE.Group();
    slide.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 4.5), steel));
    slide.position.set(5, 1.1, 2);
    slide.rotation.set(0.45, 0.6, 0.25);
    g.add(slide);
    add(new THREE.BoxGeometry(0.3, 0.1, 4).rotateX(0.35).translate(-6, 0.7, 3));
    g.position.set(P.x + P.nx * (HALF + 12), P.y, P.z + P.nz * (HALF + 12));
    g.rotation.y = -P.heading;
    this.group.add(g);
    // one sodium light over it, mostly dead
    this.playLight = new THREE.PointLight(0xffa860, 6, 28, 1.6);
    this.playLight.position.set(g.position.x, P.y + 6, g.position.z);
    this.group.add(this.playLight);
  }

  /** The court across the street, the giant ball on it, and a hoop far off in the dark. */
  buildCourt(sp, t) {
    sp.sample(t, P);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#1c2026';
    g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.4})`; g.fillRect(Math.random() * 256, Math.random() * 512, 3, 3); }
    g.strokeStyle = 'rgba(200,190,160,0.55)';
    g.lineWidth = 4;
    g.strokeRect(12, 12, 232, 488);
    g.beginPath(); g.moveTo(12, 256); g.lineTo(244, 256); g.stroke();
    g.beginPath(); g.arc(128, 256, 40, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(128, 12, 100, 0, Math.PI); g.stroke();
    g.beginPath(); g.arc(128, 500, 100, Math.PI, Math.PI * 2); g.stroke();
    const court = new THREE.Mesh(new THREE.PlaneGeometry(22, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3 }));
    court.position.set(P.x, P.y + 0.08, P.z);
    court.rotation.y = -P.heading;
    this.group.add(court);
    // the ball, larger than life, sitting at the far end of the court
    sp.sample(t + 8, P);
    this.ballHome = new THREE.Vector3(P.x, P.y + BALL_R, P.z);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.8, emissive: 0x2a1206, emissiveIntensity: 0.6 }));
    this.ball.position.copy(this.ballHome);
    this.group.add(this.ball);
    // a flickering light over the court so you can find it
    this.courtLight = new THREE.PointLight(0xffe0b0, 14, 40, 1.4);
    this.courtLight.position.set(P.x, P.y + 9, P.z);
    this.group.add(this.courtLight);
    // the hoop: way down the line of the court and off to the side, up in the dark
    sp.sample(t + 120, P);
    this.rim = new THREE.Vector3(P.x + P.nx * -40, P.y + 22, P.z + P.nz * -40);
    const hoop = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.5, metalness: 0.7 });
    hoop.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 24, 8).translate(0, -10, -4.5), steel));
    const board = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 0.3), new THREE.MeshStandardMaterial({ color: 0xcfd2d4, roughness: 0.4, emissive: 0x202224 }));
    board.position.set(0, 3, -4);
    hoop.add(board);
    hoop.add(new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.18, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.45, 0.15) })));
    const net = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 2.2, 3, 16, 1, true).translate(0, -1.5, 0), new THREE.MeshBasicMaterial({ color: 0xbbbbbb, wireframe: true, transparent: true, opacity: 0.5 }));
    hoop.add(net);
    hoop.position.copy(this.rim);
    // the board faces the court
    hoop.lookAt(this.ballHome.x, this.rim.y, this.ballHome.z);
    this.group.add(hoop);
    this.hoopLight = new THREE.PointLight(0xff9050, 10, 30, 1.5);
    this.hoopLight.position.copy(this.rim).add(new THREE.Vector3(0, 5, 0));
    this.group.add(this.hoopLight);
    this.state = 'waiting';
  }

  /** @returns events: { shot, swish, miss } */
  update(dt, time, vehicle) {
    const out = {};
    const flick = Math.sin(time * 23) > 0.7 && Math.sin(time * 1.7) > 0 ? 0.2 : 1;
    this.courtLight.intensity = 14 * flick;
    this.playLight.intensity = Math.sin(time * 3.1) > 0.85 ? 0 : 5;
    this.swing.rotation.x = Math.sin(time * 1.1) * 0.25;
    const h = vehicle.spurHit && vehicle.spurHit.spur === this.spur ? vehicle.spurHit : null;
    // back on the ring: the ball is home again for next time
    if (!h && this.state !== 'waiting' && vehicle.pos.distanceTo(this.ballHome) > 400) this.reset();
    const b = this.ball;
    if (this.state === 'waiting') {
      const d = vehicle.pos.distanceTo(b.position);
      if (d < BALL_R + 2.4 && vehicle.speed > 3) {
        // the shot: aimed at the rim, but how true depends on how square and how fast you hit it
        const toRim = this.rim.clone().sub(b.position);
        const flat = Math.hypot(toRim.x, toRim.z);
        const T = flat / 34;
        const err = 1 - Math.min(1, vehicle.speed / 30);
        const aim = Math.atan2(toRim.x, toRim.z) + (Math.random() - 0.5) * 0.03 * (0.3 + err) + (vehicle.d || 0) * 0.004;
        const reach = flat * (0.95 + Math.min(1, vehicle.speed / 26) * 0.06 + (Math.random() - 0.5) * 0.03);
        this.vel = new THREE.Vector3(Math.sin(aim) * reach / T, (toRim.y + 0.5 * GRAVITY * T * T) / T, Math.cos(aim) * reach / T);
        this.state = 'flying';
        this.spin = new THREE.Vector3(Math.random() - 0.5, 0, 1).multiplyScalar(8);
        out.shot = true;
        this.airT = 0;
      }
    } else if (this.state === 'flying' || this.state === 'falling') {
      this.vel.y -= GRAVITY * dt;
      b.position.addScaledVector(this.vel, dt);
      b.rotation.x += this.spin.z * dt;
      b.rotation.z += this.spin.x * dt;
      if (this.state === 'flying' && this.vel.y < 0 && b.position.y < this.rim.y + 1) {
        const off = Math.hypot(b.position.x - this.rim.x, b.position.z - this.rim.z);
        if (off < 3.3 - BALL_R * 0.35) { out.swish = true; this.vel.set(0, -6, 0); }
        else if (off < 3.3 + BALL_R + 1.5) {
          // close: it hits the iron and hops up, and might still fall through
          out.rim = true;
          this.rattle = Math.random() < 0.5;
          const k = this.rattle ? 0.4 : 1.6;
          this.vel.set((b.position.x - this.rim.x) * -k * (this.rattle ? 1 : -1), 9, (b.position.z - this.rim.z) * -k * (this.rattle ? 1 : -1));
          this.state = 'rimmed';
        } else out.miss = 'air';
        if (this.state === 'flying') this.state = 'falling';
      }
      if (this.state === 'rimmed' && this.vel.y < 0 && b.position.y < this.rim.y + 0.5) {
        if (this.rattle) { out.swish = true; out.rattle = true; b.position.x = this.rim.x; b.position.z = this.rim.z; this.vel.set(0, -4, 0); }
        else out.miss = 'rim';
        this.state = 'falling';
      }
      // down on the ground it bounces, lower each time, and rolls off into the dark
      const floor = this.rim.y - 22 + BALL_R;
      if (b.position.y < floor) {
        b.position.y = floor;
        if (Math.abs(this.vel.y) > 2.5) { out.bounce = Math.min(1, Math.abs(this.vel.y) / 25); this.vel.y = -this.vel.y * 0.62; this.vel.x *= 0.8; this.vel.z *= 0.8; }
        else { this.vel.y = 0; this.vel.x *= Math.exp(-dt * 0.8); this.vel.z *= Math.exp(-dt * 0.8); }
        this.spin.multiplyScalar(0.9);
      }
      this.airT = (this.airT || 0) + dt;
      if (this.airT > 11 || (this.vel.y === 0 && Math.hypot(this.vel.x, this.vel.z) < 0.6)) this.state = 'done';
    }
    return out;
  }

  /** Is the ball in the air (or still bouncing)? main follows it with a camera. */
  get live() { return this.state === 'flying' || this.state === 'rimmed' || this.state === 'falling'; }

  /** A camera off to the side of the hoop, watching the ball come down. */
  watch(cam, dt) {
    const b = this.ball.position;
    const away = new THREE.Vector3(this.ballHome.x - this.rim.x, 0, this.ballHome.z - this.rim.z).normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x);
    const want = this.rim.clone().addScaledVector(away, 34).addScaledVector(side, 18);
    want.y = this.rim.y - 8;
    if (!this.camPos) this.camPos = want.clone();
    this.camPos.lerp(want, Math.min(1, dt * 2));
    cam.position.copy(this.camPos);
    this.camLook = (this.camLook || b.clone()).lerp(b.clone().lerp(this.rim, 0.25), Math.min(1, dt * 5));
    cam.lookAt(this.camLook);
    cam.fov += (50 - cam.fov) * Math.min(1, dt * 2);
  }

  reset() {
    this.state = 'waiting';
    this.ball.position.copy(this.ballHome);
    this.ball.rotation.set(0, 0, 0);
  }

  near(x, z) {
    const bx = this.spur.box;
    if (x < bx.minX - 90 || x > bx.maxX + 90 || z < bx.minZ - 90 || z > bx.maxZ + 90) return false;
    return this.spur.distance(x, z) < 80;
  }
}
