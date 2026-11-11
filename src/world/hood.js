// THE BLOCK. A short loop off the Ruins into a neighbourhood everyone forgot:
// crooked houses with one light left on each, a broken playground, and in the
// beside the road a fenced basketball court, a ball, and someone waiting to play (court.js).
import * as THREE from 'three';
import { HOOD } from './track.js';
import { Spur, spurRibbon } from './spur.js';
import { merge } from './props.js';
import { Court } from './court.js';

const P = {};
const HALF = 5.5;           // half width of the street
const COURT_U = 0.5;        // where the court sits along the loop

export const hoodHalfWidth = () => HALF;

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
      if (Math.abs(t - tCourt) < 46) continue;
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
    this.court = new Court(this.group, sp, tCourt);
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

  /** One frame: the playground's bits, then the court and its game. */
  update(dt, time, vehicle, launch = null) {
    this.playLight.intensity = Math.sin(time * 3.1) > 0.85 ? 0 : 5;
    this.swing.rotation.x = Math.sin(time * 1.1) * 0.25;
    return this.court.update(dt, time, vehicle, launch);
  }

  /** What the court is up to: off, yourCall, spiritMatch, spiritCall, yourMatch, over. */
  get state() { return this.court.game.phase; }

  near(x, z) {
    const bx = this.spur.box;
    if (x < bx.minX - 90 || x > bx.maxX + 90 || z < bx.minZ - 90 || z > bx.maxZ + 90) return false;
    return this.spur.distance(x, z) < 80;
  }
}
