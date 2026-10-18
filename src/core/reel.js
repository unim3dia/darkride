// Dev-only trailer director (?test&reel): scripted shots, recorded straight off
// the canvas with the game's own sound (music cut, effects kept).
import * as THREE from 'three';
import { sample, LOOP_LEN, zoneIndexAt } from '../world/track.js';
import { ZONES } from '../config.js';

const V = new THREE.Vector3();
const L = new THREE.Vector3();

export function installReel(D) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  const tap = async (code, ms = 70) => { key('keydown', code); await sleep(ms); key('keyup', code); };
  const v = D.vehicle;
  let pilot = null;
  let rec = null;
  const parts = [];

  const zoneStart = (kind) => {
    for (let s = 0; s < LOOP_LEN; s += 20) if (ZONES[zoneIndexAt(s)].kind === kind) return s;
    return 0;
  };
  const frame = () => {
    const f = v.forward.clone();
    return { f, r: new THREE.Vector3(-f.z, 0, f.x), p: v.pos.clone() };
  };
  const stopPilot = () => { clearInterval(pilot); pilot = null; };
  const highwayPilot = () => {
    stopPilot();
    pilot = setInterval(() => {
      if (v.airborne) return;
      const S = sample(v.s + 12);
      let e = Math.atan2(S.x - v.pos.x, -(S.z - v.pos.z)) - v.yaw;
      e = Math.atan2(Math.sin(e), Math.cos(e));
      v.yaw += e * 0.15;
    }, 16);
  };
  const spurPilot = (sp) => {
    stopPilot();
    pilot = setInterval(() => {
      if (v.airborne) return;
      const h = v.spurHit || sp.query(v.pos.x, v.pos.z);
      const tg = sp.at((h ? h.t : 0) + 14, 0, 0);
      let e = Math.atan2(tg.x - v.pos.x, -(tg.z - v.pos.z)) - v.yaw;
      e = Math.atan2(Math.sin(e), Math.cos(e));
      v.yaw += e * 0.15;
    }, 16);
  };
  const clearKeys = () => ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft', 'KeyQ', 'KeyE'].forEach((c) => key('keyup', c));
  const settle = async (s) => { D.warmStart(D.chunks, s ?? v.s); D.rig.offset = undefined; await sleep(900); };
  const weather = (rain) => { D.ambient.rain = rain; D.ambient.weather.target = rain; D.ambient.weather.timer = 999; };

  const onHighway = async (s, d, speed) => { v.reset(s, d, 0, speed); await settle(s); };
  const onSpur = async (i, frac, speed) => {
    const sp = D.forks.spurs[i];
    let t = 0;
    while (t < sp.N - 1 && sp.U[t] < frac) t++;
    const p = sp.at(t, 0, 0);
    v.placeAt(p.x, p.y, p.z, sp.sample(t).heading, speed);
    v.airborne = false;
    D.forks.weight = 1;
    spurPilot(sp);
    await settle(sp.ringS(t));
    return sp;
  };

  // ---------------------------------------------------------------- cameras

  const cam = {
    chase: () => { D.rig.cine = null; D.rig.view = 0; D.rig.offset = undefined; },
    cabin: () => { D.rig.cine = null; D.rig.view = 2; },
    hero: () => { D.rig.cine = null; D.rig.view = 1; D.rig.offset = undefined; },
    /** Slow orbit around the car, low. a0 → a1 radians around it over `dur` seconds. */
    orbit: (a0, a1, R, h, dur) => {
      let t = 0;
      D.rig.cine = (c, _v, dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        const a = a0 + (a1 - a0) * (k * k * (3 - 2 * k));
        const { f, r, p } = frame();
        c.position.copy(p).addScaledVector(f, Math.cos(a) * R).addScaledVector(r, Math.sin(a) * R).setY(p.y + h);
        c.fov = 42;
        c.lookAt(L.copy(p).setY(p.y + 0.85 + v.liftY * 0.5));
      };
    },
    /** Locked off at a fixed spot relative to the car (forward, right, up). */
    fixed: (fw, rt, up, fov = 40, lookUp = 0.85) => {
      D.rig.cine = (c) => {
        const { f, r, p } = frame();
        c.position.copy(p).addScaledVector(f, fw).addScaledVector(r, rt).setY(p.y + up);
        c.fov = fov;
        c.lookAt(L.copy(p).setY(p.y + lookUp));
      };
    },
    /** Tracking alongside a moving car, low to the deck. */
    track: (rt, fw, up, fov = 48) => {
      D.rig.cine = (c) => {
        const { f, r, p } = frame();
        V.copy(p).addScaledVector(f, fw).addScaledVector(r, rt).setY(p.y + up);
        c.position.lerp(V, c.position.distanceTo(V) > 20 ? 1 : 0.25);
        c.fov = fov;
        c.lookAt(L.copy(p).addScaledVector(f, 4).setY(p.y + 0.9));
      };
    },
  };

  // ---------------------------------------------------------------- recording

  const begin = () => {
    const canvas = D.renderer.domElement;
    const stream = canvas.captureStream(30);
    const a = D.audio;
    if (a.ctx) {
      const dest = a.ctx.createMediaStreamDestination();
      a.master.connect(dest);
      for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr);
    }
    rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 14e6, audioBitsPerSecond: 192e3 });
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.start(250);
    rec.pause();
  };
  const finish = () => new Promise((res) => {
    rec.onstop = async () => {
      const blob = new Blob(parts, { type: 'video/webm' });
      await fetch('/__reel?name=raw', { method: 'POST', body: blob });
      res(blob.size);
    };
    rec.stop();
  });

  /** Set the shot up off-camera, then roll for `dur` seconds while `action` plays. */
  const shot = async (name, setup, action, dur) => {
    clearKeys();
    await setup();
    const t0 = performance.now();
    rec.resume();
    await Promise.all([action ? action() : null, sleep(dur * 1000)]);
    rec.pause();
    D.reelLog.push(`${name}: ${((performance.now() - t0) / 1000).toFixed(2)}s`);
  };

  // ---------------------------------------------------------------- the reel

  async function run() {
    D.reelLog = [];
    key('keydown', 'Enter'); key('keyup', 'Enter');
    await sleep(600);
    D.audio.silenceMusic(true);
    document.getElementById('hint').style.display = 'none';
    document.getElementById('zone').style.display = 'none';
    begin();
    const start = { s: v.s, pos: v.pos.clone(), yaw: v.yaw };
    const home = async () => { stopPilot(); v.placeAt(start.pos.x, 0, start.pos.z, start.yaw, 0); await settle(start.s); };

    // 1. the car at the curb, wet street, slow push round the front
    await shot('open', async () => { weather(0.7); await home(); cam.orbit(0.75, 0.15, 7.5, 0.9, 3.2); }, async () => { await sleep(2300); await tap('Space'); }, 3.0);
    // 2. hydraulics, side on: nose up on the switch, down, then pop front and back
    await shot('lift', async () => { await home(); cam.fixed(0.2, 8.8, 1.0, 36, 1.0); }, async () => {
      await sleep(250); key('keydown', 'ShiftLeft'); await sleep(1150); key('keyup', 'ShiftLeft');
      await sleep(650); await tap('Space');
      await sleep(800); key('keydown', 'KeyS'); await tap('Space'); key('keyup', 'KeyS');
    }, 3.6);
    // 3. three-wheel motion from the front quarter: lean left, lean right
    await shot('lean', async () => { await home(); cam.fixed(7.2, 3.2, 0.8, 38, 0.95); }, async () => {
      await sleep(200); key('keydown', 'KeyQ'); await sleep(1100); key('keyup', 'KeyQ');
      await sleep(250); key('keydown', 'KeyE'); await sleep(1100); key('keyup', 'KeyE');
    }, 3.0);
    // 4. up on the highway, full charge, the pulse draws the world
    await shot('jump', async () => { weather(0.3); await onHighway(1500, 2, 30); highwayPilot(); key('keydown', 'KeyW'); cam.chase(); }, async () => {
      await sleep(300); key('keydown', 'Space'); await sleep(950); key('keyup', 'Space');
    }, 2.8);
    // 5. behind the wheel
    await shot('cabin', async () => { await onHighway(2350, -2, 32); highwayPilot(); key('keydown', 'KeyW'); cam.cabin(); }, async () => {
      await sleep(500); key('keydown', 'KeyD'); await sleep(350); key('keyup', 'KeyD');
    }, 2.0);
    // 6. the Monoliths: silver grain, blank towers
    await shot('monoliths', async () => { weather(0); await onHighway(zoneStart('monoliths') + 150, 0, 34); highwayPilot(); key('keydown', 'KeyW'); cam.chase(); }, null, 2.2);
    // 7. down into the Narrows
    await shot('narrows', async () => { await onHighway(zoneStart('narrows') + 340, 2, 26); highwayPilot(); key('keydown', 'KeyW'); cam.chase(); }, null, 2.0);
    // 8. the fork: the sign, and the lane peeling away
    await shot('fork', async () => {
      const sp = D.forks.spurs[0];
      await onHighway(sp.sA - 70, sp.side * 3, 30); spurPilot(sp); key('keydown', 'KeyW'); cam.chase();
    }, null, 2.2);
    // 9–12. the pocket worlds
    await shot('dust', async () => { await onSpur(0, 0.42, 28); key('keydown', 'KeyW'); cam.chase(); }, null, 2.0);
    await shot('ether', async () => { await onSpur(1, 0.4, 26); key('keydown', 'KeyW'); cam.hero(); }, null, 2.0);
    await shot('sanctum', async () => { await onSpur(2, 0.44, 24); key('keydown', 'KeyW'); cam.track(5, -3, 0.9, 50); }, null, 2.0);
    await shot('ephemera', async () => { await onSpur(3, 0.38, 26); key('keydown', 'KeyW'); cam.chase(); }, async () => { await sleep(700); key('keydown', 'Space'); await sleep(700); key('keyup', 'Space'); }, 2.2);
    // 13. the life of the place: hop at a parked lowrider and it answers, lighting the block back
    await shot('answer', async () => {
      weather(0.4); stopPilot();
      const d = D.district;
      const a = D.answerers.list[0]; // the one at the gas station, out in the open lot
      const loc = d.toLocal(a.pos.x, a.pos.z);
      const p = d.toWorld(loc.u, d.roadV(loc.u) + 2, 0);
      v.placeAt(p.x, 0, p.z, -d.yawToward(0, 1), 0);
      a.exchanges = 0; a.trusted = false; a.cooldown = 0;
      await settle();
      // wide, low, from behind and beside our car, looking down the line to the other one
      D.rig.cine = (c) => {
        const { f, r, p: me } = frame();
        c.position.copy(me).addScaledVector(f, -8).addScaledVector(r, -5).setY(2.2);
        c.fov = 44;
        c.lookAt(L.copy(me).lerp(a.pos, 0.55).setY(1.1));
      };
    }, async () => { await sleep(150); key('keydown', 'Space'); await sleep(450); key('keyup', 'Space'); }, 3.4);

    clearKeys(); stopPilot();
    const bytes = await finish();
    D.rig.cine = null;
    return { bytes, log: D.reelLog };
  }

  window.REEL = { run };
}
