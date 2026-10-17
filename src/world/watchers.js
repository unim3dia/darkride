// The Watchers. Hooded figures with lantern eyes, standing where no one should be.
// Wash one in your pulse and it turns to look at you. Land close while it's
// looking, and its light comes with you.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { buildFigure, MATS, box } from './props.js';
import { buildStaticCar } from '../player/carModel.js';
import { roadPoint, roadHeading } from './builders.js';
import { glowTexture } from './chunks.js';
import { makeBody } from './bodies.js';

const HW = ROAD.HALF_WIDTH;
const NOTICE_TIME = 7;
const COLLECT_SLAM_RANGE = 17;
const COLLECT_PASS_RANGE = 6.5;

function place(w, chunk) {
  const { spot, s, side } = w;
  if (spot === 'overpass' && chunk.perches.length) return { pos: chunk.perches[Math.floor(w.seed * chunk.perches.length)].clone(), car: false };
  if (spot === 'rail') return { pos: roadPoint(s, side * (HW + 0.35), 0.95), car: false };
  if (spot === 'far') return { pos: roadPoint(s, side * (HW + 7 + w.seed * 6), 0.2), car: false, pillar: true };
  return { pos: roadPoint(s, side * (HW - 0.9), 0), car: true };
}

export class Watchers {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.flights = [];
    this.onNotice = () => {};
    this.onCollect = () => {};
    this.onArrive = () => {};
  }

  spawn(chunk) {
    const w = chunk.f.watcher;
    if (!w) return;
    const { pos, car, pillar } = place(w, chunk);
    const h = roadHeading(w.s);
    this.spawnAt(chunk, chunk.group, pos, -h + Math.PI + (w.side > 0 ? -0.6 : 0.6), { seed: w.seed });

    if (car) {
      const parked = buildStaticCar(false);
      parked.position.copy(roadPoint(w.s - 1.5, w.side * (HW - 2.9), 0));
      parked.rotation.y = -h + (w.seed < 0.5 ? 0 : Math.PI);
      chunk.group.add(parked);
      chunk.bodies.push(makeBody(parked, w.s - 1.5));
    }
    if (pillar) {
      const col = new THREE.Mesh(box(1.6, 60, 1.6, 0, -30, 0), MATS.concrete);
      col.position.copy(pos);
      chunk.group.add(col);
    }
  }

  /**
   * A figure anywhere: `owner` ties its lifetime to a chunk (or the district).
   * Bystanders watch but don't come with you; sitters perch on a car's trunk.
   */
  spawnAt(owner, parent, pos, yaw, { seed = Math.random(), bystander = false, sit = false } = {}) {
    const fig = buildFigure();
    fig.root.position.copy(pos);
    fig.root.rotation.y = yaw;
    if (sit) fig.root.children[0].scale.y = 0.55;
    parent.add(fig.root);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xcfe6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(0.9, 0.9, 1);
    fig.head.add(glow);
    glow.position.set(0, 0.02, -0.25);

    if (sit) fig.head.position.y -= 0.75;
    const w = {
      chunk: owner, fig, glow, pos: pos.clone(), state: 'dormant', notice: 0, light: 0.18,
      baseYaw: yaw, yaw: 0, pitch: 0, seed, tilt: 0, bystander,
    };
    this.list.push(w);
    return w;
  }

  despawn(chunk) {
    this.list = this.list.filter((w) => w.chunk !== chunk);
  }

  /** @param slam {x,y,z,strength}|null — a hydraulic landing this frame */
  update(dt, time, carPos, pulses, slam) {
    for (const w of this.list) {
      const dx = carPos.x - w.pos.x;
      const dz = carPos.z - w.pos.z;
      const dist = Math.hypot(dx, dz);

      if (w.state === 'dormant') {
        for (const p of pulses) {
          const d = Math.hypot(w.pos.x - p.x, w.pos.z - p.z);
          if (d < p.r + 1 && d > p.r - 6 && p.age < 1.6) {
            w.state = 'noticed';
            w.notice = NOTICE_TIME;
            w.tilt = 0.35;
            this.onNotice(w, dist);
          }
        }
      } else if (w.state === 'noticed') {
        w.notice -= dt;
        const dy = Math.abs(carPos.y - w.pos.y);
        const slamNear = slam && Math.hypot(slam.x - w.pos.x, slam.z - w.pos.z) < COLLECT_SLAM_RANGE && dy < 14;
        if (!w.bystander && (slamNear || (dist < COLLECT_PASS_RANGE && dy < 4))) this.collect(w);
        else if (w.notice <= 0) w.state = 'dormant';
      }

      // head tracking: everyone near watches you a little; the noticed stare
      const near = THREE.MathUtils.clamp(1 - dist / 60, 0, 1);
      const want = w.state === 'noticed' ? 1 : w.state === 'taken' ? 0.15 : near * 0.55;
      const targetYaw = Math.atan2(-dx, -dz) - w.baseYaw;
      const wrapped = Math.atan2(Math.sin(targetYaw), Math.cos(targetYaw));
      const limited = THREE.MathUtils.clamp(wrapped, -1.3, 1.3) * want;
      w.yaw += (limited - w.yaw) * Math.min(1, dt * (w.state === 'noticed' ? 5 : 1.2));
      const targetPitch = Math.atan2(carPos.y - w.pos.y - 2, Math.max(dist, 1)) * want * -0.8;
      w.pitch += (targetPitch - w.pitch) * Math.min(1, dt * 3);
      w.tilt *= Math.exp(-dt * 2.5);
      w.fig.head.rotation.set(w.pitch, w.yaw, Math.sin(time * 3 + w.seed) * w.tilt);

      // eye light
      const targetLight = w.state === 'noticed' ? 1 + 0.25 * Math.sin(time * 9) : w.state === 'taken' ? 0 : 0.22 + near * 0.3;
      w.light += (targetLight - w.light) * Math.min(1, dt * (w.state === 'noticed' ? 10 : 2.5));
      const blink = (Math.sin(time * 0.7 + w.seed * 40) > 0.985) ? 0.05 : 1;
      for (const e of w.fig.eyes) {
        e.material.color.setScalar(3.4 * w.light * blink);
        e.scale.y = blink;
      }
      w.glow.material.opacity = Math.min(1, w.light) * 0.45 * blink * THREE.MathUtils.smoothstep(dist, 4, 14);
    }
    this.updateFlights(dt, carPos);
  }

  collect(w) {
    w.state = 'taken';
    this.flyEyes(w.fig.eyes);
    this.onCollect(w);
  }

  /** Two lights leave whoever owned them and arc into your back seat. */
  flyEyes(eyes) {
    const from = new THREE.Vector3();
    eyes.forEach((e, k) => {
      e.getWorldPosition(from);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0xeaf4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      s.scale.set(1.4, 1.4, 1);
      s.position.copy(from);
      this.scene.add(s);
      this.flights.push({ sprite: s, from: from.clone(), t: 0, dur: 1.1 + k * 0.18, arc: 5 + Math.random() * 4, wob: Math.random() * 6, last: k === 1 });
    });
  }

  updateFlights(dt, carPos) {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.t += dt / f.dur;
      const t = Math.min(1, f.t);
      const e = t * t * (3 - 2 * t);
      const target = carPos.clone().setY(carPos.y + 1.3);
      f.sprite.position.lerpVectors(f.from, target, e);
      f.sprite.position.y += Math.sin(t * Math.PI) * f.arc;
      f.sprite.position.x += Math.sin(t * Math.PI * 2 + f.wob) * (1 - t) * 1.5;
      f.sprite.material.opacity = 1 - Math.max(0, t - 0.85) / 0.15;
      if (f.t >= 1) {
        this.scene.remove(f.sprite);
        f.sprite.material.dispose();
        this.flights.splice(i, 1);
        if (f.last) this.onArrive();
      }
    }
  }
}
