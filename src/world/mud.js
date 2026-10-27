// THE MUD FLATS. Off the Pines the road gives up and turns to a wide, churned-up
// field of mud. Floor it and the wheels throw it everywhere: sideways, sky-high,
// back at you. Sometimes a clod hits the lens and you drive half-blind until it
// runs off.
import * as THREE from 'three';
import { MUD } from './track.js';
import { SidePlace } from './sidePlace.js';
import { spurRibbon } from './spur.js';

const P = {};
const CLODS = 900;

function mudTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  // near-black, wet: brown only where it's thick, the rest a sheet of water holding the dark sky
  g.fillStyle = '#0b0806';
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * 256, y = Math.random() * 512, r = 6 + Math.random() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${30 + Math.random() * 22},${18 + Math.random() * 12},${8 + Math.random() * 6},${0.25 + Math.random() * 0.35})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // ruts: two dark grooves where everyone's tyres went
  g.fillStyle = 'rgba(2,1,1,0.55)';
  for (const x of [82, 174]) g.fillRect(x - 10, 0, 20, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Mud extends SidePlace {
  constructor(scene) {
    super(scene, MUD, { name: 'THE MUD FLATS', sub: 'floor it', mapSub: 'floor it', color: '#b07a4a', halfWidth: 12 });
    const sp = this.spur;
    this.tM0 = this.tAt(0.14);
    this.tM1 = this.tAt(0.86);
    // asphalt at either end, mud in the middle
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.7 });
    this.buildRoad(asphalt, sp.tSepA, this.tM0 + 6, 7);
    this.buildRoad(asphalt, this.tM1 - 6, sp.tSepB, 7);
    const tex = mudTexture();
    const pos = [];
    const uv = [];
    const A = {}, B = {};
    for (let t = this.tM0; t < this.tM1; t += 3) {
      sp.sample(t, A); sp.sample(t + 3, B);
      const row = (Q, v) => {
        const pts = [];
        for (let k = 0; k <= 12; k++) {
          const d = -this.half - 6 + (k / 12) * (this.half + 6) * 2;
          const lump = 0.18 * Math.sin(d * 1.3 + t * 0.21) + 0.12 * Math.sin(t * 0.7 + d * 0.4);
          pts.push([Q.x + Q.nx * d, Q.y + 0.08 + lump * (Math.abs(d) > 3 ? 1.6 : 0.6), Q.z + Q.nz * d, k / 12, v]);
        }
        return pts;
      };
      const ra = row(A, t / 24), rb = row(B, (t + 3) / 24);
      for (let k = 0; k < 12; k++) {
        const q = [ra[k], rb[k], rb[k + 1], ra[k], rb[k + 1], ra[k + 1]];
        for (const p of q) { pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    this.group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.12, metalness: 0.15, envMapIntensity: 1.6 })));
    // berms either side, dark and heaped
    for (const s of [-1, 1]) this.group.add(new THREE.Mesh(spurRibbon(sp, this.tM0, this.tM1, s * (this.half + 5), s * (this.half + 14), 1.6, -2, 6), new THREE.MeshStandardMaterial({ color: 0x1a120b, roughness: 1 })));
    this.buildClods();
    this.splats = Array.from({ length: 8 }, () => ({ x: 0, y: 0, r: 0, a: 0 }));
  }

  buildClods() {
    // a lump, not a gem: a sphere pushed in and out
    const geo = new THREE.IcosahedronGeometry(0.16, 1);
    const gp = geo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const k = 0.7 + 0.5 * Math.abs(Math.sin(gp.getX(i) * 31 + gp.getY(i) * 17) * Math.cos(gp.getZ(i) * 23));
      gp.setXYZ(i, gp.getX(i) * k, gp.getY(i) * k, gp.getZ(i) * k);
    }
    geo.computeVertexNormals();
    this.clodMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x2a1b10, roughness: 0.2, metalness: 0.1, envMapIntensity: 1.2 }), CLODS);
    this.clodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.clodMesh.frustumCulled = false;
    this.group.add(this.clodMesh);
    this.cp = new Float32Array(CLODS * 3);
    this.cv = new Float32Array(CLODS * 3);
    this.cl = new Float32Array(CLODS);
    this.cs = new Float32Array(CLODS);
    this.next = 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < CLODS; i++) this.clodMesh.setMatrixAt(i, zero);
  }

  inMud(h) { return !!h && h.t > this.tM0 && h.t < this.tM1; }

  /** Throw mud off the wheels: rearward and up mostly, sideways on turns, and at you. */
  fling(vehicle, n) {
    const f = vehicle.forward;
    const r = { x: -f.z, z: f.x };
    const sp = vehicle.speed;
    for (let j = 0; j < n; j++) {
      const i = this.next++ % CLODS;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.cp[i * 3] = vehicle.pos.x - f.x * 1.8 + r.x * side * 0.9;
      this.cp[i * 3 + 1] = vehicle.pos.y + 0.3;
      this.cp[i * 3 + 2] = vehicle.pos.z - f.z * 1.8 + r.z * side * 0.9;
      const back = -(0.3 + Math.random() * 0.6) * sp;
      const out = side * (2 + Math.random() * 7 + Math.abs(vehicle.steer) * 8);
      this.cv[i * 3] = f.x * back + r.x * out;
      this.cv[i * 3 + 1] = 3 + Math.random() * (6 + sp * 0.25);
      this.cv[i * 3 + 2] = f.z * back + r.z * out;
      this.cl[i] = 1.2 + Math.random() * 1.4;
      // mostly spatter and drops, now and then a fat clump
      this.cs[i] = 0.25 + Math.pow(Math.random(), 3) * 2.6;
    }
  }

  /** @returns { w, mud: true while you're in it, splat: lens splats for the film shader } */
  update(dt, time, vehicle, cameraView) {
    const h = this.hit(vehicle);
    this.w += (this.weightAt(h) - this.w) * Math.min(1, dt * 2);
    const out = { w: this.w, mud: this.inMud(h) && !vehicle.airborne };
    if (out.mud) {
      // the mud drags at you a little and squirms the tail
      vehicle.vel.multiplyScalar(Math.exp(-dt * 0.12));
      vehicle.yaw += Math.sin(time * 3.1) * 0.0025 * Math.min(1, vehicle.speed / 15);
      // it comes in waves, like the wheels digging and catching: a slow swell with a beat on top
      this.beat = (this.beat || 0) + dt * (0.9 + vehicle.speed * 0.05);
      const pulse = Math.pow(Math.max(0, Math.sin(this.beat * Math.PI * 2)), 3) * (0.6 + 0.4 * Math.sin(time * 0.37));
      const swell = 0.5 + 0.5 * Math.sin(time * 0.53 + Math.sin(time * 0.21) * 2);
      const rate = Math.min(1, vehicle.speed / 22) * (40 + 520 * pulse * swell);
      this.fling(vehicle, Math.floor(rate * dt + Math.random()));
      // now and then one lands on the lens
      if (vehicle.speed > 9 && Math.random() < dt * (cameraView === 'cabin' ? 0.5 : 0.9)) {
        const s = this.splats.find((q) => q.a <= 0.02) || this.splats[Math.floor(Math.random() * 8)];
        s.x = 0.15 + Math.random() * 0.7; s.y = 0.2 + Math.random() * 0.65; s.r = 0.05 + Math.random() * 0.14; s.a = 1;
        out.hit = true;
      }
    }
    for (const s of this.splats) s.a = Math.max(0, s.a - dt * (0.18 + (out.mud ? 0 : 0.25)));
    out.splats = this.splats;
    // clods arc and fall
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let live = false;
    for (let i = 0; i < CLODS; i++) {
      if (this.cl[i] <= 0) continue;
      live = true;
      this.cl[i] -= dt;
      if (this.cl[i] <= 0) { this.clodMesh.setMatrixAt(i, zero); continue; }
      this.cv[i * 3 + 1] -= 22 * dt;
      for (let c = 0; c < 3; c++) this.cp[i * 3 + c] += this.cv[i * 3 + c] * dt;
      v.set(this.cp[i * 3], this.cp[i * 3 + 1], this.cp[i * 3 + 2]);
      this.clodMesh.setMatrixAt(i, m.compose(v, q.set(i * 0.1, i * 0.3, 0, 1).normalize(), sc.set(this.cs[i] * 0.8, this.cs[i] * 0.6, this.cs[i] * (1 + Math.min(1.4, Math.hypot(this.cv[i * 3], this.cv[i * 3 + 2]) * 0.06)))));
    }
    if (live) this.clodMesh.instanceMatrix.needsUpdate = true;
    return out;
  }
}
