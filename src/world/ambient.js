// The world breathing: weather, palettes, lamps, chains, signs, fires, eyes.
import * as THREE from 'three';
import { ZONES, WORLD } from '../config.js';
import { zoneIndexAt, zoneBlendAt } from './track.js';

const LIGHT_POOL = 8;
const c1 = new THREE.Color();
const c2 = new THREE.Color();

function lerpZone(key, s, out) {
  const i = zoneIndexAt(s);
  const b = zoneBlendAt(s);
  c1.set(ZONES[i][key]);
  c2.set(ZONES[(i + 1) % ZONES.length][key]);
  return out.copy(c1).lerp(c2, b);
}

function lerpScalar(key, s) {
  const i = zoneIndexAt(s);
  const b = zoneBlendAt(s);
  return ZONES[i][key] + (ZONES[(i + 1) % ZONES.length][key] - ZONES[i][key]) * b;
}

export class Ambient {
  constructor(scene, sky, audio) {
    this.scene = scene;
    this.sky = sky;
    this.audio = audio;
    scene.fog = new THREE.FogExp2(0x121a20, WORLD.FOG_DENSITY);
    this.hemi = new THREE.HemisphereLight(0x4a5a6a, 0x000000, 0.35);
    scene.add(this.hemi);
    this.lights = Array.from({ length: LIGHT_POOL }, () => {
      const l = new THREE.PointLight(0xff9a40, 0, 26, 1.6);
      scene.add(l);
      return l;
    });
    this.flash = 0;
    this.nextStrike = 6 + Math.random() * 8;
    this.strike = null;
    this.rain = 0.6;
    this.lampNear = 0;
    // weather moves through spells: dry and foggy, a drizzle, a real storm
    this.weather = { target: 0.6, timer: 40 };
    this.exposure = 1;
    this.fogThick = 1;
    this.grain = 1;
  }

  update(dt, time, s, carPos, chunks, pulses, slam) {
    // ---- palette follows the zone you're in
    const fog = lerpZone('fog', s, this.scene.fog.color);
    const u = this.sky.uniforms;
    lerpZone('skyTop', s, u.uTop.value);
    lerpZone('skyHorizon', s, u.uHorizon.value);
    lerpZone('glow', s, u.uGlow.value);
    u.uFog.value.copy(fog);
    lerpZone('rim', s, this.hemi.color);
    u.uTime.value = time;
    this.sky.mesh.position.copy(carPos);
    this.updateWeather(dt, s);
    // fog comes in banks: you drive into soup, then out under clearer sky. Dry spells are the foggiest.
    const bank = Math.sin(s / 173) * 0.5 + Math.sin(s / 61 + 1.3) * 0.3 + Math.sin(s / 29 + 4.1) * 0.2 + Math.sin(time * 0.021) * 0.25;
    this.fogThick = lerpScalar('fogMul', s) * (1 + (1 - this.rain) * 0.45);
    this.scene.fog.density = WORLD.FOG_DENSITY * this.fogThick * (1 + Math.max(0, bank) * 1.1 - Math.max(0, -bank) * 0.3);
    this.exposure = lerpScalar('exposure', s);
    this.light = lerpScalar('light', s);
    this.grain = lerpScalar('grain', s);
    this.applyPocket(time);

    // ---- lightning: a double-flicker, then thunder arrives late
    this.nextStrike -= dt * (this.rain > 0.55 ? 1 : 0); // lightning only in a real storm
    if (this.nextStrike <= 0) {
      this.strike = { t: 0, pattern: [0, 0.07, 0.16, 0.3].map((x) => x + Math.random() * 0.05) };
      const a = Math.random() * Math.PI * 2;
      u.uFlashDir.value.set(Math.cos(a), Math.sin(a));
      this.nextStrike = 9 + Math.random() * 16;
      this.audio.thunder(1 + Math.random() * 2.5);
    }
    this.flash = 0;
    if (this.strike) {
      this.strike.t += dt;
      for (const p of this.strike.pattern) {
        const k = this.strike.t - p;
        if (k > 0) this.flash = Math.max(this.flash, Math.exp(-k * 18) * (p === this.strike.pattern[0] ? 1 : 0.7));
      }
      if (this.strike.t > 1.2) this.strike = null;
    }
    u.uFlash.value = this.flash;
    this.hemi.intensity = this.light + this.flash * 2.4;
    this.scene.fog.color.lerp(c1.setRGB(0.25, 0.25, 0.32), this.flash * 0.35);

    this.updateLamps(dt, time, carPos, chunks, pulses, slam);
    this.updateChains(dt, time, chunks, pulses, slam);
    for (const c of chunks.all()) {
      for (const sg of c.signs) {
        const on = Math.sin(time * 23 + sg.seed) > -0.85 && Math.sin(time * 1.7 + sg.seed * 3) > -0.6;
        if (sg.tube) {
          // fluorescent tubes: mostly on, sometimes they strike and stutter
          const strike = Math.sin(time * 0.45 + sg.seed) > 0.75;
          sg.mat.color.setRGB(2.2, 2.6, 2.3).multiplyScalar(strike ? (Math.random() < 0.5 ? 0.1 : 1) : 0.95);
        } else sg.mat.color.setScalar(on ? 1.5 + Math.sin(time * 60) * 0.05 : 0.15);
      }
      for (const f of c.fires) {
        const k = 0.75 + 0.15 * Math.sin(time * 9 + f.seed) + 0.1 * Math.sin(time * 23 + f.seed * 2);
        f.sprite.scale.set(f.base * k, f.base * k * 1.2, 1);
      }
      if (c.eyes) c.eyes.update(dt, pulses, time, this.flash);
    }
  }

  /** Out on a ramp, the pocket world's own light and air take over, by `pocket.weight`. */
  applyPocket(time) {
    const pk = this.pocket;
    if (!pk || pk.weight <= 0.001) return;
    const w = pk.weight;
    const P = pk.palette;
    const u = this.sky.uniforms;
    this.scene.fog.color.lerp(c1.set(P.fog), w);
    u.uTop.value.lerp(c1.set(P.skyTop), w);
    u.uHorizon.value.lerp(c1.set(P.skyHorizon), w);
    u.uGlow.value.lerp(c1.set(P.glow), w);
    u.uFog.value.copy(this.scene.fog.color);
    const breathe = 1 + 0.18 * Math.sin(time * 0.13) + 0.1 * Math.sin(time * 0.31);
    this.scene.fog.density += (WORLD.FOG_DENSITY * P.fogMul * breathe - this.scene.fog.density) * w;
    this.fogThick += (P.fogMul - this.fogThick) * w;
    this.light += (P.light - this.light) * w;
    this.exposure += (P.exposure - this.exposure) * w;
    this.grain += (P.grain - this.grain) * w;
  }

  updateWeather(dt, s) {
    const w = this.weather;
    w.timer -= dt;
    if (w.timer <= 0) {
      const rainy = lerpScalar('rainy', s);
      const roll = Math.random();
      w.target = roll < rainy * 0.45 ? 0.75 + Math.random() * 0.25 : roll < rainy ? 0.2 + Math.random() * 0.25 : 0;
      w.timer = 50 + Math.random() * 90;
    }
    // in a zone that hardly rains, the sky lets up even mid-spell
    const cap = 0.15 + lerpScalar('rainy', s) * 1.2;
    let target = Math.min(w.target, cap);
    if (this.pocket && this.pocket.weight > 0) target += (this.pocket.palette.rain - target) * this.pocket.weight;
    this.rain += (target - this.rain) * Math.min(1, dt * 0.08);
  }

  updateLamps(dt, time, carPos, chunks, pulses, slam) {
    const lamps = [...chunks.each('lamps')];
    let near = 0;
    for (const L of lamps) {
      const d = L.pos.distanceTo(carPos);
      near = Math.max(near, 1 - d / 28);
      // a pulse passing through makes the ballast stutter
      for (const p of pulses) {
        if (Math.abs(Math.hypot(L.pos.x - p.x, L.pos.z - p.z) - p.r) < 2) L.flicker = Math.max(L.flicker, 0.6);
      }
      if (slam && L.kind !== 'fire' && slam.strength > 0.95 && d < 14 && !L.dead && Math.random() < 0.5) {
        L.dead = true;
        L.popped = 1;
        this.audio.pop();
      }
      L.flicker = Math.max(0, L.flicker - dt);
      const stutter = L.flicker > 0 ? (Math.sin(time * 70 + L.seed) > 0 ? 1 : 0.1) : 1;
      const dying = L.dead ? (Math.sin(time * 3 + L.seed) > 0.93 ? 0.6 : 0.02) : 1;
      L.level = stutter * dying * (0.94 + 0.06 * Math.sin(time * 120 + L.seed));
      if (L.kind === 'fire') L.level = 0.7 + 0.18 * Math.sin(time * 9 + L.seed) + 0.12 * Math.sin(time * 23 + L.seed * 2);
      if (L.kind === 'mercury') L.bulb.material.color.setRGB(2.2 * L.level, 2.4 * L.level, 2.6 * L.level);
      else L.bulb.material.color.setRGB(5 * L.level, 2.4 * L.level, 0.7 * L.level);
      // halos are for distance; right at the lens they'd just be fog-colored blobs
      const lens = this.camPos ? THREE.MathUtils.smoothstep(L.pos.distanceTo(this.camPos), 3, 12) : 1;
      L.halo.material.opacity = (L.kind === 'wall' ? 0.5 : 0.55) * L.level * lens;
      L.glare.material.opacity = (L.kind === 'wall' ? 0.22 : 0.32) * L.level;
      L.dist = d;
    }
    this.lampNear = Math.max(0, near);
    // the closest lamps borrow the real lights
    lamps.sort((a, b) => a.dist - b.dist);
    this.lights.forEach((l, i) => {
      const L = lamps[i];
      if (!L) { l.intensity = 0; return; }
      l.position.copy(L.pos).y -= 0.6;
      l.color.set(L.kind === 'fire' ? 0xff6a24 : L.kind === 'wall' ? 0xffb070 : L.kind === 'mercury' ? 0xb9cadb : 0xff9a40);
      l.intensity = (L.kind === 'fire' ? 26 : L.kind === 'wall' ? 14 : 60) * L.level;
    });
  }

  updateChains(dt, time, chunks, pulses, slam) {
    for (const ch of chunks.each('chains')) {
      const g = 9.8 / Math.max(2, ch.len);
      const wx = ch.pivot.position;
      for (const p of pulses) {
        const d = Math.hypot(wx.x - p.x, wx.z - p.z);
        if (Math.abs(d - p.r) < 1.5) ch.omega += 0.9 * p.strength / (1 + d * 0.05);
      }
      if (slam) {
        const d = Math.hypot(wx.x - slam.x, wx.z - slam.z);
        if (d < 30) ch.omegaZ += slam.strength * 0.5 * (1 - d / 30);
      }
      ch.omega += (-g * Math.sin(ch.theta) - ch.omega * 0.12) * dt + Math.sin(time * 0.4 + ch.phi) * 0.02 * dt;
      ch.theta += ch.omega * dt;
      ch.omegaZ += (-g * Math.sin(ch.thetaZ) - ch.omegaZ * 0.12) * dt;
      ch.thetaZ += ch.omegaZ * dt;
      ch.pivot.rotation.set(ch.theta, ch.phi * 0, ch.thetaZ);
    }
  }
}
