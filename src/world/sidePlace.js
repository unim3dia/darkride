// The common shape of a place off the ring: an exit road (a Spur), a surface
// to drive on, signs counting down to it, its own light, low walls, a title
// card the first time you're properly in, and a pin on the map.
import * as THREE from 'three';
import { Spur, spurRibbon } from './spur.js';

const P = {};

export class SidePlace {
  /**
   * @param def    the exit (from track.js)
   * @param opts   { name, sub, color, halfWidth, palette, road: material }
   */
  constructor(scene, def, opts) {
    this.def = def;
    this.spur = def.raw ? new Spur(def) : new Spur(def);
    this.opts = opts;
    this.name = opts.name;
    this.sub = opts.sub;
    this.color = opts.color;
    this.half = opts.halfWidth ?? 6;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.w = 0;
    this.shown = false;
  }

  /** A plain road surface from where the exit leaves the deck to where it rejoins. */
  buildRoad(mat, t0 = this.spur.tSepA, t1 = this.spur.tSepB, half = this.half) {
    const m = new THREE.Mesh(spurRibbon(this.spur, t0, t1, -half, half, 0.05, -1.2, 3), mat);
    this.group.add(m);
    return m;
  }

  /** Point on the exit road at fraction u, `d` across it, `y` above it. */
  at(u, d = 0, y = 0) {
    const t = this.tAt(u);
    return this.spur.at(t, d, y);
  }

  tAt(u) {
    const sp = this.spur;
    let t = 0;
    while (t < sp.N - 1 && sp.U[t] < u) t++;
    return t;
  }

  frame(u) { return this.spur.sample(this.tAt(u), P); }

  /** Your hit on this road this frame, or null. */
  hit(vehicle) {
    return vehicle.spurHit && vehicle.spurHit.spur === this.spur ? vehicle.spurHit : null;
  }

  /** 0 on the ring, 1 well inside: for light and sound. */
  weightAt(h) {
    if (!h) return 0;
    const u = h.t / this.spur.N;
    return Math.min(1, u * 6, (1 - u) * 6);
  }

  /** Keep the car between the edges of the road while it's off the deck. */
  clamp(vehicle, h, dt) {
    if (!h || vehicle.airborne || h.t < this.spur.tSepA || h.t > this.spur.tSepB) return;
    const lim = this.half - 1.2;
    if (Math.abs(h.d) <= lim) return;
    const side = Math.sign(h.d);
    const over = Math.abs(h.d) - lim;
    vehicle.pos.x -= h.nx * side * over;
    vehicle.pos.z -= h.nz * side * over;
    const into = (vehicle.vel.x * h.nx + vehicle.vel.z * h.nz) * side;
    if (into > 0) { vehicle.vel.x -= h.nx * side * into; vehicle.vel.z -= h.nz * side * into; }
  }

  near(x, z, margin = 90) {
    const b = this.spur.box;
    if (x < b.minX - margin || x > b.maxX + margin || z < b.minZ - margin || z > b.maxZ + margin) return false;
    return this.spur.distance(x, z) < margin;
  }

  /** For the map: where the label goes and how it's coloured. */
  mapPin() {
    const p = this.at(0.5);
    return { name: this.name, sub: this.opts.mapSub || '', color: this.color, at: p, spur: this.spur, d: this.def.side > 0 ? 1 : -1 };
  }
}
