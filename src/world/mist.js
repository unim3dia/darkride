// Low veils of mist drift across the road; steam breathes up out of grates and
// gaps. You drive through them, so the air itself has thickness.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { sample, gapAt } from './track.js';

const COUNT = 34;
const S = {};

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 40; i++) {
    const x = 30 + Math.random() * 68;
    const y = 30 + Math.random() * 68;
    const r = 14 + Math.random() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}

export class Mist {
  constructor(scene) {
    const tex = cloudTexture();
    this.color = new THREE.Color();
    this.vents = [];
    this.items = Array.from({ length: COUNT }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      scene.add(sprite);
      return { sprite, pos: new THREE.Vector3(), vel: new THREE.Vector3(), base: 0, scale: 10, age: 0, steam: false, life: 99 };
    });
    this.primed = false;
  }

  setVents(list) {
    this.vents = list;
  }

  /** Steam rising from a grate near the car. */
  spawnVent(m, car) {
    const near = this.vents.filter((v) => v.distanceTo(car.pos) < 110);
    if (!near.length) return false;
    const v = near[Math.floor(Math.random() * near.length)];
    m.pos.set(v.x + (Math.random() - 0.5) * 1.2, 0.3, v.z + (Math.random() - 0.5) * 1.2);
    m.vel.set((Math.random() - 0.5) * 0.6, 1.1 + Math.random() * 0.9, (Math.random() - 0.5) * 0.6);
    m.steam = true;
    m.base = 0.5;
    m.scale = 2.5 + Math.random() * 2;
    m.life = 4 + Math.random() * 3;
    return true;
  }

  /** A low veil along the road ahead, or steam out of a gap. */
  spawnRoad(m, car, ahead) {
    const s = car.s + (ahead ? 90 + Math.random() * 80 : -10 + Math.random() * 170);
    const gap = gapAt(s + 6) || gapAt(s - 6);
    sample(s, S);
    m.steam = !!gap && Math.random() < 0.7;
    const d = m.steam ? (Math.random() * 2 - 1) * ROAD.HALF_WIDTH : (Math.random() * 2 - 1) * 34;
    m.pos.set(S.x + S.nx * d, S.y + (m.steam ? -10 - Math.random() * 6 : -2 + Math.random() * 6), S.z + S.nz * d);
    m.vel.set((Math.random() - 0.5) * 1.4, m.steam ? 1.6 + Math.random() * 1.2 : 0.05, (Math.random() - 0.5) * 1.4);
    m.base = m.steam ? 0.5 : 0.25 + Math.random() * 0.35;
    m.scale = m.steam ? 7 + Math.random() * 5 : 12 + Math.random() * 14;
    m.life = m.steam ? 7 : 99;
  }

  /** Veils drifting through the streets around the car. */
  spawnStreet(m, car) {
    const a = Math.random() * Math.PI * 2;
    const r = 25 + Math.random() * 90;
    m.pos.set(car.pos.x + Math.cos(a) * r, 0.5 + Math.random() * 3, car.pos.z + Math.sin(a) * r);
    m.vel.set((Math.random() - 0.5) * 1.2, 0.04, (Math.random() - 0.5) * 1.2);
    m.steam = false;
    m.base = 0.22 + Math.random() * 0.3;
    m.scale = 10 + Math.random() * 12;
    m.life = 20 + Math.random() * 20;
  }

  spawn(m, car, inTown, ahead) {
    m.age = 0;
    m.sprite.material.rotation = Math.random() * Math.PI * 2;
    if (inTown) {
      if (Math.random() < 0.55 && this.spawnVent(m, car)) return;
      this.spawnStreet(m, car);
      return;
    }
    this.spawnRoad(m, car, ahead);
  }

  update(dt, car, camera, fogColor, flash, inTown) {
    if (!this.primed) { for (const m of this.items) this.spawn(m, car, inTown, false); this.primed = true; }
    this.color.copy(fogColor).multiplyScalar(2.2).addScalar(0.04 + flash * 0.25);
    for (const m of this.items) {
      m.age += dt;
      m.pos.addScaledVector(m.vel, dt);
      const far = m.pos.distanceTo(car.pos) > 190;
      if (m.age > m.life || far) this.spawn(m, car, inTown, true);
      const sp = m.sprite;
      sp.position.copy(m.pos);
      const grow = m.steam ? 1 + m.age * 0.45 : 1;
      sp.scale.set(m.scale * grow, m.scale * grow * (m.steam ? 1.5 : 0.55), 1);
      const near = THREE.MathUtils.smoothstep(sp.position.distanceTo(camera.position), 3, 14);
      const fadeIn = Math.min(1, m.age / 1.5);
      const fadeOut = Math.min(1, (m.life - m.age) / 2);
      sp.material.opacity = m.base * near * fadeIn * Math.max(0, fadeOut);
      sp.material.color.copy(this.color);
    }
  }
}
