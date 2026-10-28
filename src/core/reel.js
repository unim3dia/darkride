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
  const finish = (name = 'raw') => new Promise((res) => {
    rec.onstop = async () => {
      const blob = new Blob(parts, { type: 'video/webm' });
      await fetch(`/__reel?name=${name}`, { method: 'POST', body: blob });
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

  // ---------------------------------------------------------------- reel two: the mystery cut

  /** Drop the car at a named warp spot (no fall), settled, with the pilot on whatever road it's on. */
  const at = async (name, speed) => {
    stopPilot();
    const w = D.spots().find((q) => q.name.toLowerCase().includes(name));
    w.go();
    if (speed !== undefined) v.vel.setLength(speed);
    v.airborne = false;
    await settle();
  };
  const follow = (sp) => (sp ? spurPilot(sp) : highwayPilot());
  /** Camera nailed to a spot in the world, watching the car go by. */
  const post = (pos, fov = 40, lookUp = 0.9) => {
    D.rig.cine = (c) => { c.position.copy(pos); c.fov = fov; c.lookAt(L.copy(v.pos).setY(v.pos.y + lookUp)); };
  };
  const ahead = (dist, side, up) => { const { f, r, p } = frame(); return p.addScaledVector(f, dist).addScaledVector(r, side).setY(p.y + up); };
  const charge = async (ms) => { key('keydown', 'Space'); await sleep(ms); key('keyup', 'Space'); };

  async function run2() {
    D.reelLog = [];
    key('keydown', 'Enter'); key('keyup', 'Enter');
    await sleep(600);
    D.audio.silenceMusic(true);
    for (const id of ['hint', 'zone']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
    begin();
    const start = { s: v.s, pos: v.pos.clone(), yaw: v.yaw };
    const home = async () => { stopPilot(); v.placeAt(start.pos.x, 0, start.pos.z, start.yaw, 0); await settle(start.s); };
    const drive = () => key('keydown', 'KeyW');

    // HOOK. pitch dark highway, a camera on the deck; the car comes down right in front of it and the world draws itself
    await shot('hook', async () => {
      weather(0); await onHighway(zoneStart('pines') + 300, 0, 30); highwayPilot(); drive();
      post(ahead(150, -7, 0.4), 46, 1.2);
    }, async () => { await sleep(500); await charge(1000); }, 6.5);
    // THE CAR. at the curb, rain, slow push; nose up; three-wheel
    await shot('curb', async () => { weather(0.7); await home(); cam.orbit(0.8, 0.2, 7.5, 0.9, 3.4); }, async () => { await sleep(2500); await tap('Space'); }, 3.2);
    await shot('lift', async () => { await home(); cam.fixed(0.2, 8.8, 1.0, 36, 1.0); }, async () => {
      await sleep(200); key('keydown', 'ShiftLeft'); await sleep(1100); key('keyup', 'ShiftLeft'); await sleep(500); await tap('Space');
    }, 2.6);
    await shot('lean', async () => { await home(); cam.fixed(7.2, 3.2, 0.8, 38, 0.95); }, async () => {
      await sleep(150); key('keydown', 'KeyQ'); await sleep(1000); key('keyup', 'KeyQ'); await sleep(200); key('keydown', 'KeyE'); await sleep(900); key('keyup', 'KeyE');
    }, 2.6);
    // THE RING. behind the wheel, the silver towers, the inner city
    await shot('cabin', async () => { weather(0.3); await onHighway(2350, -2, 32); highwayPilot(); drive(); cam.cabin(); }, null, 2.4);
    await shot('monoliths', async () => { weather(0); await onHighway(zoneStart('monoliths') + 150, 0, 34); highwayPilot(); drive(); cam.track(-4.5, -6, 1.2, 50); }, null, 2.4);
    await shot('narrows', async () => { await onHighway(zoneStart('narrows') + 340, 2, 26); highwayPilot(); drive(); cam.chase(); }, null, 2.2);
    await shot('ringjump', async () => { await onHighway(zoneStart('colonnade') + 200 || 4000, 0, 32); highwayPilot(); drive(); cam.orbit(-0.6, 0.6, 9, 1.2, 3); }, async () => { await sleep(200); await charge(900); }, 3.0);
    // THE EXITS. a run of places, cut on the landings
    await shot('logs', async () => { await at('logs', 26); D.vehicle.reset(D.logJam.s0 - 40, 0, 0, 26); await settle(); highwayPilot(); drive(); cam.track(6, -10, 2.4, 50); }, async () => { await sleep(500); await charge(700); }, 3.6);
    await shot('charge', async () => { await at('charge', 26); follow(D.herdRoad); drive(); cam.chase(); }, null, 2.6);
    await shot('mud', async () => { stopPilot(); { const m = D.mud, p = m.spur.sample(m.tM0 + 60); v.placeAt(p.x, p.y + 0.3, p.z, p.heading, 24); v.airborne = false; await settle(); } follow(D.mud.spur); drive(); cam.track(-4, -6, 1.3, 50); }, async () => { await sleep(1300); await charge(600); }, 3.0);
    await shot('race', async () => {
      const T = D.race.track; const p = T.sample(T.tGrid - 6);
      v.placeAt(p.x, p.y + 0.3, p.z, p.heading, 4); v.airborne = false; spurPilot(T); await settle();
      D.rig.cine = (c) => { const { f, r, p: me } = frame(); c.position.copy(me).addScaledVector(f, -9).addScaledVector(r, 2.5).setY(me.y + 1.4); c.fov = 46; c.lookAt(L.copy(me).addScaledVector(f, 20).setY(me.y + 4)); };
    }, async () => { await sleep(3600); drive(); }, 5.6);
    await shot('wash', async () => { stopPilot(); const w = D.wash, p = w.spur.sample(w.tA - 5); v.placeAt(p.x, p.y + 0.3, p.z, p.heading, 3); v.airborne = false; follow(w.spur); await settle(); cam.cabin(); await sleep(2500); }, null, 3.6);
    await shot('burger', async () => {
      const dr = D.drive; stopPilot(); const p = dr.spur.sample(dr.tAt(0.36)); v.placeAt(p.x, p.y + 0.3, p.z, p.heading, 16); v.airborne = false; follow(dr.spur); await settle(); drive();
      const eye = dr.world(-14, -12, 1.0), sign = dr.world(-38, -14, 34);
      D.rig.cine = (c) => { c.position.copy(eye); c.fov = 50; c.lookAt(L.copy(v.pos).lerp(sign, 0.45)); };
    }, null, 3.0);
    await shot('jumps', async () => { await at('jumps', 30); follow(D.jumps.spur); drive(); cam.chase(); }, async () => { await sleep(400); await charge(1000); }, 3.4);
    await shot('ether', async () => { await onSpur(1, 0.4, 26); drive(); cam.hero(); }, null, 2.4);
    await shot('dust', async () => { await onSpur(0, 0.42, 28); drive(); cam.track(5, -3, 0.9, 50); }, null, 2.2);
    // THE TURN. quiet. hop at a parked lowrider, and it hops back
    await shot('answer', async () => {
      weather(0.4); stopPilot();
      const d = D.district;
      const a = D.answerers.list[0];
      const loc = d.toLocal(a.pos.x, a.pos.z);
      const p = d.toWorld(loc.u, d.roadV(loc.u) + 2, 0);
      v.placeAt(p.x, 0, p.z, -d.yawToward(0, 1), 0);
      a.exchanges = 0; a.trusted = false; a.cooldown = 0;
      await settle();
      D.rig.cine = (c) => { const { f, r, p: me } = frame(); c.position.copy(me).addScaledVector(f, -8).addScaledVector(r, -5).setY(2.2); c.fov = 44; c.lookAt(L.copy(me).lerp(a.pos, 0.55).setY(1.1)); };
    }, async () => { await sleep(300); await charge(450); }, 4.2);
    // GONE. the car pulls away from a camera left behind on the road, into the fog
    await shot('gone', async () => { weather(0.2); await onHighway(zoneStart('pale') + 200, 0, 6); highwayPilot(); drive(); post(ahead(-3, 1.5, 0.7), 38, 0.8); }, null, 5.0);

    clearKeys(); stopPilot();
    const bytes = await finish('two');
    D.rig.cine = null;
    return { bytes, log: D.reelLog };
  }

  // ---------------------------------------------------------------- reel three: same car, different worlds

  async function run3() {
    D.reelLog = [];
    key('keydown', 'Enter'); key('keyup', 'Enter');
    await sleep(600);
    D.audio.silenceMusic(true);
    for (const id of ['hint', 'zone']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
    begin();
    const drive = () => key('keydown', 'KeyW');
    // the one framing: in front and off the left fender, looking back at the car. The car never moves in frame; the world does
    const lock = () => cam.fixed(6.5, -4.6, 1.15, 46, 0.9);
    const long = async () => { await sleep(900); }; // extra settle so nothing pops on the first frame

    // HOOK: three worlds, same shot
    await shot('w1', async () => { weather(0.6); await onHighway(zoneStart('pines') + 400, 0, 30); highwayPilot(); drive(); lock(); await long(); }, null, 2.4);
    await shot('w2', async () => { weather(0); await onHighway(zoneStart('monoliths') + 200, 0, 30); highwayPilot(); drive(); lock(); await long(); }, null, 2.4);
    await shot('w3', async () => { await onSpur(3, 0.4, 30); drive(); lock(); await long(); }, null, 2.4);
    await shot('w4', async () => { await onSpur(1, 0.42, 30); drive(); lock(); await long(); }, null, 2.4);
    // THE JUMP: the neon jumps, then a full-charge leap on the ring with the camera swinging round
    await shot('jumps', async () => { await at('jumps', 30); follow(D.jumps.spur); drive(); cam.chase(); await long(); }, async () => { await sleep(400); await charge(1000); }, 3.6);
    await shot('leap', async () => { weather(0.2); await onHighway(zoneStart('ruins') + 300, 0, 34); highwayPilot(); drive(); cam.orbit(-0.9, 0.9, 10, 1.0, 3.4); await long(); }, async () => { await sleep(200); await charge(1000); }, 3.4);
    // THE RACE: lights, then gone
    await shot('race', async () => {
      const T = D.race.track; const p = T.sample(T.tGrid - 6);
      v.placeAt(p.x, p.y + 0.3, p.z, p.heading, 4); v.airborne = false; spurPilot(T); await settle(); await long();
      D.rig.cine = (c) => { const { f, r, p: me } = frame(); c.position.copy(me).addScaledVector(f, -9).addScaledVector(r, 2.5).setY(me.y + 1.4); c.fov = 46; c.lookAt(L.copy(me).addScaledVector(f, 20).setY(me.y + 4)); };
    }, async () => { await sleep(3600); drive(); }, 7.5);
    // MONTAGE: places, quick
    await shot('narrows', async () => { await onHighway(zoneStart('narrows') + 340, 2, 26); highwayPilot(); drive(); cam.chase(); await long(); }, null, 1.6);
    await shot('wash', async () => { stopPilot(); const w = D.wash, p = w.spur.sample(w.tA - 5); v.placeAt(p.x, p.y + 0.3, p.z, p.heading, 3); v.airborne = false; follow(w.spur); await settle(); cam.cabin(); await sleep(2800); }, null, 1.6);
    await shot('dust', async () => { await onSpur(0, 0.42, 28); drive(); cam.track(5, -3, 0.9, 50); await long(); }, null, 1.6);
    await shot('burger', async () => {
      const dr = D.drive; stopPilot(); const p = dr.spur.sample(dr.tAt(0.36)); v.placeAt(p.x, p.y + 0.3, p.z, p.heading, 16); v.airborne = false; follow(dr.spur); await settle(); drive(); await long();
      const eye = dr.world(-14, -12, 1.0), sign = dr.world(-38, -14, 34);
      D.rig.cine = (c) => { c.position.copy(eye); c.fov = 50; c.lookAt(L.copy(v.pos).lerp(sign, 0.45)); };
    }, null, 2.6);
    await shot('sanctum', async () => { await onSpur(2, 0.44, 26); drive(); cam.hero(); await long(); }, null, 1.6);
    await shot('logs', async () => { D.vehicle.reset(D.logJam.s0 - 40, 0, 0, 26); await settle(); highwayPilot(); drive(); cam.track(6, -10, 2.4, 50); await long(); }, async () => { await sleep(300); await charge(700); }, 2.4);
    await shot('drivein', async () => { await at('drive-in', 4); cam.orbit(2.6, 2.2, 9, 1.6, 2); await long(); }, null, 1.6);
    await shot('ether', async () => { await onSpur(1, 0.36, 26); drive(); cam.chase(); await long(); }, null, 1.6);
    // THE CHARGE, to the end
    await shot('charge', async () => { await at('charge', 26); follow(D.herdRoad); drive(); cam.chase(); await long(); }, null, 3.4);
    await shot('charge2', async () => { const p = D.herdRoad.sample(D.herdRoad.N * 0.32); v.placeAt(p.x, p.y + 0.4, p.z, p.heading, 28); v.airborne = false; follow(D.herdRoad); await settle(); drive(); cam.track(-5, -2, 1.0, 54); await long(); }, async () => { await sleep(1200); await charge(900); }, 4.0);

    clearKeys(); stopPilot();
    const bytes = await finish('three');
    D.rig.cine = null;
    return { bytes, log: D.reelLog };
  }

  /** Just the hook: the same locked shot in several worlds, to pick three from. */
  async function hook3() {
    D.reelLog = [];
    key('keydown', 'Enter'); key('keyup', 'Enter');
    await sleep(600);
    D.audio.silenceMusic(true);
    for (const id of ['hint', 'zone']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
    begin();
    const drive = () => key('keydown', 'KeyW');
    const lock = () => cam.fixed(6.5, -4.6, 1.15, 46, 0.9);
    const long = async () => { await sleep(1200); };
    await shot('pines', async () => { weather(0.6); await onHighway(zoneStart('pines') + 400, 0, 30); highwayPilot(); drive(); lock(); await long(); }, null, 3.0);
    await shot('ruins', async () => { weather(0.2); await onHighway(zoneStart('ruins') + 300, 0, 30); highwayPilot(); drive(); lock(); await long(); }, null, 3.0);
    await shot('zone9', async () => { weather(0.3); await onHighway(zoneStart('zone9') + 300, 0, 30); highwayPilot(); drive(); lock(); await long(); }, null, 3.0);
    await shot('ether', async () => { await onSpur(1, 0.3, 26); drive(); lock(); await long(); }, null, 3.0);
    await shot('sanctum', async () => { await onSpur(2, 0.44, 26); drive(); lock(); await long(); }, null, 3.0);
    await shot('racepale', async () => { const T = D.race.track; const p = T.sample(T.tGrid + 200); v.placeAt(p.x, p.y + 0.3, p.z, p.heading, 30); v.airborne = false; spurPilot(T); await settle(); drive(); lock(); await long(); }, null, 3.0);
    clearKeys(); stopPilot();
    const bytes = await finish('hook');
    D.rig.cine = null;
    return { bytes, log: D.reelLog };
  }

  /** The race already under way: dropped mid-lap with the limo alongside. */
  async function midrace() {
    D.reelLog = [];
    key('keydown', 'Enter'); key('keyup', 'Enter');
    await sleep(600);
    D.audio.silenceMusic(true);
    for (const id of ['hint', 'zone']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
    begin();
    const drive = () => key('keydown', 'KeyW');
    const T = D.race.track, R = D.race.rival;
    const midLap = async (frac, lead) => {
      stopPilot();
      const t = T.tGrid + (T.tFinish - T.tGrid) * frac;
      const p = T.at(t, 1.6, 0), a = T.sample(t);
      v.placeAt(p.x, p.y + 0.3, p.z, a.heading, 34); v.airborne = false;
      spurPilot(T); drive();
      await sleep(200);
      const race = D.race;
      race.enter({ t, d: 1.6 }); race.raced = true;
      race.phase = 'racing'; race.t = 3;
      R.t = t + lead; R.dist = t + lead; R.v = 34; R.lane = -3.2;
      race.playerDist = t; race.playerLastT = t;
      race.set.lamps.forEach((l) => l.material.color.setRGB(0.3, 3, 0.6));
      await settle(); await sleep(900);
    };
    await shot('mid1', async () => { await midLap(0.35, 2); cam.track(-6, 1, 1.2, 50); }, null, 3.2);
    await shot('mid2', async () => { await midLap(0.55, -4); cam.chase(); }, null, 3.2);
    await shot('mid3', async () => { await midLap(0.7, 6); cam.fixed(9, 2.5, 0.7, 44, 1.0); }, null, 3.2);
    clearKeys(); stopPilot();
    const bytes = await finish('race');
    D.rig.cine = null;
    return { bytes, log: D.reelLog };
  }

  window.REEL = { run, run2, run3, hook3, midrace };
}
