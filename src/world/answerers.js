// The Answerers: lowriders parked in the dark with someone behind the wheel.
// Hit your switches near one and, after a breath, it hits its own: a hop that
// lights the block from somewhere else. Trade three hops and it trusts you —
// its lamps come on, and its driver's light comes to ride with you.
import * as THREE from 'three';
import { buildStaticCar, buildRider } from '../player/carModel.js';
import { buildBeam } from '../player/carLights.js';
import { HEADLIGHT_MAT } from './props.js';

const HEAR_RANGE = 48;
const TRUST = 3;
const GRAVITY = 26;

export class Answerers {
  constructor(parent) {
    this.parent = parent;
    this.list = [];
    this.onHop = () => {};
    this.onLand = () => {};
    this.onTrust = () => {};
  }

  spawn(pos, yaw) {
    const root = new THREE.Group();
    root.position.copy(pos);
    root.rotation.set(0, yaw, 0, 'YXZ');
    const car = buildStaticCar(false);
    root.add(car);
    const rider = buildRider();
    rider.group.position.set(-0.45, 1.22, 0.28);
    car.add(rider.group);
    const beams = [-0.86, 0.86].map((x) => {
      const b = buildBeam(22, 3.6);
      b.position.set(x, 0.74, -2.95);
      b.visible = false;
      car.add(b);
      return b;
    });
    const lamps = [-0.97, -0.75, 0.75, 0.97].map((x) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.075, 14), HEADLIGHT_MAT);
      m.position.set(x, 0.74, -2.885);
      m.rotation.y = Math.PI;
      m.visible = false;
      car.add(m);
      return m;
    });
    this.parent.add(root);
    const a = {
      root, car, rider, beams, lamps, pos: pos.clone(),
      y: 0, vy: 0, air: false, pitch: 0, pitchV: 0,
      pending: null, cooldown: 0, exchanges: 0, trusted: false, seed: Math.random() * 10,
    };
    this.list.push(a);
    return a;
  }

  update(dt, time, carPos, slam) {
    for (const a of this.list) {
      const dx = carPos.x - a.pos.x;
      const dz = carPos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      a.cooldown -= dt;

      // a hop nearby is a question; answer after a breath
      if (slam && !a.trusted && !a.pending && !a.air && a.cooldown <= 0) {
        const d = Math.hypot(slam.x - a.pos.x, slam.z - a.pos.z);
        if (d < HEAR_RANGE && d > 3) a.pending = { t: 0.45 + Math.random() * 0.25, strength: Math.min(1.2, slam.strength) };
      }
      if (a.pending) {
        a.pending.t -= dt;
        if (a.pending.t <= 0) {
          a.vy = 4.5 + a.pending.strength * 6.5;
          a.air = true;
          a.pitchV += (Math.random() - 0.5) * 1.5;
          a.strength = a.pending.strength;
          a.pending = null;
          this.onHop(a, dist);
        }
      }

      if (a.air) {
        a.vy -= GRAVITY * dt;
        a.y += a.vy * dt;
        if (a.y <= 0) {
          a.y = 0;
          a.air = false;
          a.pitchV -= a.vy * 0.05;
          a.cooldown = 0.6;
          a.exchanges++;
          this.onLand(a, dist);
          if (a.exchanges >= TRUST) this.trust(a);
        }
      }
      a.pitchV += (-a.pitch * 90 - a.pitchV * 7) * dt;
      a.pitch += a.pitchV * dt;
      a.root.position.y = a.pos.y + a.y;
      a.root.rotation.x = a.pitch * 0.25;

      // the driver turns to look at you
      const want = Math.atan2(-dx, -dz) - a.root.rotation.y;
      const wrapped = Math.atan2(Math.sin(want), Math.cos(want));
      a.rider.group.rotation.y += (THREE.MathUtils.clamp(wrapped, -1.2, 1.2) * (dist < 60 ? 1 : 0) - a.rider.group.rotation.y) * Math.min(1, dt * 2);
      const glow = a.trusted ? 0 : 3.2 * (0.35 + 0.65 * Math.min(1, a.exchanges / TRUST + (dist < 40 ? 0.3 : 0)));
      for (const e of a.rider.eyes) e.material.color.setScalar(glow);

      if (a.trusted) {
        const flick = 0.85 + 0.15 * Math.sin(time * 40 + a.seed);
        for (const b of a.beams) b.material.uniforms.uStrength.value = 0.13 * flick;
      }
    }
  }

  trust(a) {
    a.trusted = true;
    for (const b of a.beams) b.visible = true;
    for (const l of a.lamps) l.visible = true;
    this.onTrust(a);
  }
}
