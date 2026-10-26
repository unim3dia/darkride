// THE JUMPS. Off the trestle road, out into the void: the road becomes a run of
// kickers with nothing between them. Hit a lip fast and you fly; land on the
// next ramp down and carry the speed into the one after. Rings of light hang
// over the gaps for you to fly through.
import * as THREE from 'three';
import { JUMPS } from './track.js';
import { SidePlace } from './sidePlace.js';
import { spurRibbon } from './spur.js';
import { merge } from './props.js';

const P = {};
const PERIOD = 110;
const LIP = 26;          // kicker length
const GAP0 = 27;         // the road stops here...
const GAP1 = 40;         // ...and starts again on the landing ramp

/** Height of the run at phase p (m into a kicker cycle). */
function profile(p) {
  if (p < LIP) return 6.5 * Math.pow(p / LIP, 1.6);
  if (p < 30) return 6.5 + (-7 - 6.5) * (p - LIP) / (30 - LIP);
  if (p < 37) return -7;
  if (p < GAP1) return -7 + (4.5 + 7) * (p - 37) / (GAP1 - 37);
  const k = (p - GAP1) / (PERIOD - GAP1);
  return 4.5 * (1 - k * k * (3 - 2 * k));
}

export class Jumps extends SidePlace {
  constructor(scene) {
    super(scene, JUMPS, { name: 'THE JUMPS', sub: 'hit the lip fast', mapSub: 'big air', color: '#7ff0ff', halfWidth: 6 });
    const sp = this.spur;
    this.t0 = this.tAt(0.2);
    this.t1 = this.tAt(0.8);
    // carve the kickers into the road's own height, easing in and out at the ends
    for (let t = 0; t < sp.N; t++) {
      if (t < this.t0 || t > this.t1) continue;
      const p = (t - this.t0) % PERIOD;
      const fade = Math.min(1, (t - this.t0) / 20, (this.t1 - t) / 20);
      sp.Y[t] += profile(p) * fade;
    }
    // the road only where there's road: none across the gaps
    const road = new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.4, metalness: 0.3, emissive: 0x061020 });
    const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.0, 2.4) });
    const parts = [];
    const edges = [];
    let a = sp.tSepA;
    for (let t = sp.tSepA; t <= sp.tSepB; t++) {
      const inGap = t > this.t0 && t < this.t1 - 20 && ((t - this.t0) % PERIOD) > GAP0 && ((t - this.t0) % PERIOD) < GAP1 - 1;
      if (inGap || t === sp.tSepB) {
        if (t - a > 2) {
          parts.push(spurRibbon(sp, a, t, -this.half, this.half, 0.05, -0.8, 1.5));
          for (const s of [-1, 1]) edges.push(spurRibbon(sp, a, t, s * this.half - 0.12, s * this.half + 0.12, 0.12, 0.05, 1.5));
        }
        a = t + 1;
      }
    }
    this.group.add(new THREE.Mesh(merge(parts), road));
    this.group.add(new THREE.Mesh(merge(edges), edge));
    // a ring of light over each gap, and slabs drifting far off in the dark
    this.rings = [];
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.8, 2.2), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let t = this.t0 + (GAP0 + GAP1) / 2; t < this.t1 - 20; t += PERIOD) {
      sp.sample(t, P);
      const r = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.18, 8, 48), ringMat);
      r.position.set(P.x, P.y + 16, P.z); // above the gap, where a good jump peaks
      r.rotation.y = -P.heading;
      this.group.add(r);
      this.rings.push(r);
    }
    const slabs = [];
    for (let i = 0; i < 60; i++) {
      sp.sample(this.t0 + Math.random() * (this.t1 - this.t0), P);
      const s = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 220);
      slabs.push(new THREE.BoxGeometry(4 + Math.random() * 20, 1 + Math.random() * 3, 4 + Math.random() * 20)
        .rotateY(Math.random() * 3).rotateZ((Math.random() - 0.5) * 0.4)
        .translate(P.x + P.nx * s, P.y - 20 + Math.random() * 60, P.z + P.nz * s));
    }
    this.group.add(new THREE.Mesh(merge(slabs), new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.8, emissive: 0x050912 })));
    this.bestAir = 0;
  }

  /** @returns { w, air: the jump you just landed (s), through: flew a ring } */
  update(dt, time, vehicle) {
    const h = this.hit(vehicle);
    this.w += (this.weightAt(h) - this.w) * Math.min(1, dt * 2);
    const out = { w: this.w };
    for (const r of this.rings) r.rotation.z += dt * 0.6;
    const inRun = this.w > 0.3;
    if (inRun && vehicle.airborne) this.airT = (this.airT || 0) + dt;
    if (!vehicle.airborne && this.airT > 0.6) { out.air = this.airT; this.bestAir = Math.max(this.bestAir, this.airT); }
    if (!vehicle.airborne) this.airT = 0;
    if (vehicle.airborne) {
      for (const r of this.rings) {
        if (r.userData.hit) continue;
        if (vehicle.pos.distanceTo(r.position) < 4) { r.userData.hit = true; out.through = true; r.material = r.material.clone(); r.material.color.setRGB(2.5, 2.5, 2.5); }
      }
    }
    if (!h) for (const r of this.rings) if (r.userData.hit) { r.userData.hit = false; r.material.color.setRGB(1.6, 0.8, 2.2); }
    return out;
  }
}
