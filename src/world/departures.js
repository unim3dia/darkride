// On the drive home the ones you gathered leave you, one by one. They lift out of
// their seats and go three ways: some climb away in a slow spiral, some come
// apart into a cloud of glowing grains that drift and wink out, and some just
// drift off behind you, listless, fading as they go.
import * as THREE from 'three';

const GRAINS = 140;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(210,230,255,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Departures {
  constructor(scene) {
    this.scene = scene;
    this.tex = glowTexture();
    this.list = [];
  }

  /** One leaves from `pos` (world), carried at first by the car's velocity. mode: 'spiral' | 'atoms' | 'drift' */
  release(pos, vel, mode) {
    const g = new THREE.Group();
    g.position.copy(pos);
    this.scene.add(g);
    // the eyes: two lights a hand apart, and the faint shape of a hood around them
    const mat = new THREE.SpriteMaterial({ map: this.tex, color: 0xd6ebff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const eyes = [-0.08, 0.08].map((x) => { const s = new THREE.Sprite(mat); s.scale.set(0.32, 0.32, 1); s.position.set(x, 0, 0); g.add(s); return s; });
    const hoodMat = new THREE.MeshBasicMaterial({ color: 0x0b0c0e, transparent: true, opacity: 0.85, depthWrite: false });
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.1, 7, 1, true), hoodMat);
    hood.position.y = -0.35;
    g.add(hood);
    const d = { g, mat, hoodMat, eyes, mode, t: 0, vel: vel.clone().multiplyScalar(0.92), origin: pos.clone(), phase: Math.random() * 6, life: mode === 'atoms' ? 5 : mode === 'spiral' ? 7.5 : 8 };
    if (mode === 'atoms') {
      // the grains it comes apart into, waiting inside it until it lets go
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(GRAINS * 3), 3));
      d.grainVel = Array.from({ length: GRAINS }, () => new THREE.Vector3((Math.random() - 0.5) * 2.2, Math.random() * 1.6 + 0.2, (Math.random() - 0.5) * 2.2));
      d.grainMat = new THREE.PointsMaterial({ map: this.tex, color: 0xcfe6ff, size: 0.09, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      d.grains = new THREE.Points(geo, d.grainMat);
      d.grains.frustumCulled = false;
      g.add(d.grains);
    }
    this.list.push(d);
  }

  update(dt, time) {
    for (const d of this.list) {
      d.t += dt;
      const k = d.t / d.life;
      // the car's speed bleeds out of them quickly: they're left behind on the road
      d.vel.multiplyScalar(Math.exp(-dt * 1.6));
      d.g.position.addScaledVector(d.vel, dt);
      if (d.mode === 'spiral') {
        const a = d.phase + d.t * 1.6;
        const r = 0.6 + d.t * 0.45;
        d.g.position.x += Math.cos(a) * r * dt * 1.6;
        d.g.position.z += Math.sin(a) * r * dt * 1.6;
        d.g.position.y += dt * (0.7 + d.t * 0.25);
        d.g.rotation.y = -a;
        d.mat.opacity = 1 - k * k;
        d.hoodMat.opacity = 0.85 * (1 - k);
      } else if (d.mode === 'drift') {
        // no hurry: a slow lift, a sway, a long fade
        d.g.position.y += dt * 0.28;
        d.g.position.x += Math.sin(time * 0.7 + d.phase) * dt * 0.25;
        d.g.position.z += Math.cos(time * 0.5 + d.phase) * dt * 0.25;
        d.g.rotation.z = Math.sin(time * 0.9 + d.phase) * 0.25;
        d.mat.opacity = Math.max(0, 1 - k) * (0.75 + 0.25 * Math.sin(time * 3 + d.phase));
        d.hoodMat.opacity = 0.85 * Math.max(0, 1 - k * 1.3);
      } else {
        // hold together for a breath, then let go into grains
        d.g.position.y += dt * 0.35;
        const go = THREE.MathUtils.smoothstep(d.t, 0.9, 1.6);
        d.mat.opacity = 1 - go;
        d.hoodMat.opacity = 0.85 * (1 - go);
        d.grainMat.opacity = go * Math.max(0, 1 - (d.t - 1.6) / (d.life - 1.6));
        const pos = d.grains.geometry.attributes.position.array;
        const spread = Math.max(0, d.t - 0.9);
        for (let i = 0; i < GRAINS; i++) {
          const v = d.grainVel[i];
          // a little Brownian jitter on top of the drift, like something too small to hold still
          pos[i * 3] = v.x * spread * 0.8 + Math.sin(time * 9 + i) * 0.03;
          pos[i * 3 + 1] = v.y * spread * 0.6 - 0.3 + Math.cos(time * 7 + i * 1.3) * 0.03;
          pos[i * 3 + 2] = v.z * spread * 0.8 + Math.sin(time * 8 + i * 0.7) * 0.03;
        }
        d.grains.geometry.attributes.position.needsUpdate = true;
        d.grainMat.size = 0.09 * (1 + Math.sin(time * 20 + d.phase) * 0.15);
      }
    }
    // the gone are gone
    this.list = this.list.filter((d) => {
      if (d.t < d.life) return true;
      this.scene.remove(d.g);
      return false;
    });
  }
}
