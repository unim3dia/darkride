import * as THREE from 'three';
import { PULSE, ROAD, ZONES } from './config.js';
import { createRenderer } from './render/renderer.js';
import { createSky, createRain } from './render/sky.js';
import { emitPulse, updatePulses, livePulses, dissolveUniforms } from './render/pulseMaterial.js';
import { Particles } from './render/particles.js';
import { Reflections } from './render/environment.js';
import { ChunkManager, warmStart } from './world/chunks.js';
import { Watchers } from './world/watchers.js';
import { Ambient } from './world/ambient.js';
import { Mist } from './world/mist.js';
import { FogLayers } from './world/fogLayers.js';
import { gapAt, zoneIndexAt, sample, rng, project } from './world/track.js';
import { District } from './world/district.js';
import { Narrows } from './world/narrows.js';
import { LOOP_LEN } from './world/track.js';
import { Answerers } from './world/answerers.js';
import { Trail } from './world/trail.js';
import { Forks } from './world/forks.js';
import { DriveInMovie, LOT } from './world/driveIn.js';
import { Race, RACE_PALETTE } from './world/race.js';
import { Hood, hoodHalfWidth } from './world/hood.js';
import { Atmos } from './world/atmos.js';
import { CarWash } from './world/carWash.js';
import { DriveThru } from './world/driveThru.js';
import { Mud } from './world/mud.js';
import { Jumps } from './world/jumps.js';
import { LogJam } from './world/logJam.js';
import { HERD, RACE, HOOD, WASH, DRIVE, MUD, JUMPS } from './world/track.js';
import { Stampede, STAMPEDE, buildHerdRoad, herdRoadMesh, herdHalfWidth } from './world/stampede.js';
import { collidersFrom, updateBodies } from './world/bodies.js';
import { Vehicle } from './player/vehicle.js';
import { CarView } from './player/carView.js';
import { catchUniforms } from './player/catchLight.js';
import { CameraRig } from './player/cameraRig.js';
import { Gauges } from './ui/gauges.js';
import { Screens } from './ui/screens.js';
import { Audio } from './core/audio.js';
import { readInput } from './core/input.js';
import { setupFullscreenButton } from './ui/fullscreen.js';
import { drawMap } from './ui/mapView.js';
import { neonTexture } from './world/neon.js';
import { setupTouch, mergeTouch } from './ui/touch.js';

setupFullscreenButton();
const TOUCH = setupTouch();

const PHYS_STEP = 1 / 120;

const { renderer, scene, camera, composer, post, trails, bloom } = createRenderer(document.getElementById('stage'));

// highway signs live on their own: always lit, flickering a little, never tied to a town that unloads
const ROAD_SIGNS = [];
/** A solid highway board: dark plate, white border, filled bold letters, a big arrow. Reads in any fog. */
function plateTexture(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#062a1c';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#f4f4ec';
  g.lineWidth = 8;
  g.strokeRect(10, 10, 492, 236);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 84px "Syncopate", sans-serif';
  g.fillText(top, 256, 92, 470);
  g.fillStyle = '#ffd84a';
  g.font = '700 46px "IBM Plex Mono", monospace';
  g.fillText(bottom, 256, 190, 470);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function plateSign(top, bottom, pos, yaw, scale = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(13 * scale, 6.5 * scale), new THREE.MeshBasicMaterial({ map: plateTexture(top, bottom), color: new THREE.Color(0.85, 0.85, 0.85), fog: false, toneMapped: false }));
  m.position.copy(pos);
  m.rotation.y = yaw;
  scene.add(m);
  // the gantry: a beam across the road it hangs from, two posts at the edges
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.6, roughness: 0.5 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * ROAD.HALF_WIDTH + 6, 0.4, 0.4), steel);
  beam.position.set(0, 2.7, -0.3);
  m.add(beam);
  for (const x of [-ROAD.HALF_WIDTH - 3, ROAD.HALF_WIDTH + 3]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 10, 0.35), steel); post.position.set(x, -2.3, -0.3); m.add(post); }
}

/** The same board run through a heavy blur: what the sign looks like out of focus. */
function blurredCopy(tex) {
  const src = tex.image;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  g.filter = 'blur(9px)';
  g.drawImage(src, 0, 0);
  g.globalAlpha = 0.6;
  g.drawImage(src, 0, 0); // a second pass so it still glows like the sharp one
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A neon road sign that pulls focus: a soft blur from far off, sharp and readable
 * as you close in, then blown-out and blurry again once you're past.
 */
function roadSign(top, bottom, pos, yaw, colors) {
  const sharpTex = neonTexture(top, bottom, colors);
  const mk = (map) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(0.95, 0.95, 0.95), transparent: true, depthWrite: false, fog: false });
  const mat = mk(sharpTex);
  const blur = mk(blurredCopy(sharpTex));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 4.2), mat);
  const mb = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 4.6), blur);
  for (const o of [m, mb]) { o.position.copy(pos); o.rotation.y = yaw; scene.add(o); }
  ROAD_SIGNS.push({ mat, blur, pos: pos.clone(), nx: Math.sin(yaw), nz: Math.cos(yaw), seed: Math.random() * 10 });
}

const FOCUS_FAR = 150;  // beyond this the sign is a soft glow
const FOCUS_NEAR = 70;  // inside this (and ahead of you) it's sharp
const sky = createSky(scene);
const rain = createRain(scene);
const audio = new Audio();
const particles = new Particles(scene);
const gauges = new Gauges();
const screens = new Screens();
const chunks = new ChunkManager(scene);
const watchers = new Watchers(scene);
const ambient = new Ambient(scene, sky, audio);
const mist = new Mist(scene);
const fogLayers = new FogLayers(scene);
ambient.camPos = camera.position;
const vehicle = new Vehicle();
const carView = new CarView(scene, gauges.texture);
const rig = new CameraRig(camera);
const reflections = new Reflections(renderer, scene);
reflections.set(ZONES[0]);
// the street-level places on the ring: the Underpass at home, the Narrows across the loop
const district = new District(scene);
const narrows = new Narrows(scene, { s0: LOOP_LEN / 2 });
const places = [district, narrows];
const placeAt = (x, z, margin = 0) => places.find((p) => p.inside(x, z, margin));
const answerers = new Answerers(scene);
for (const p of places) chunks.extras.push(p.chunk);
// the off-ramps and the pocket worlds they cross
const forks = new Forks(scene);
vehicle.spurs = [...forks.spurs, ...forks.detours];
for (const c of forks.chunks) chunks.extras.push(c);
chunks.avoid = (x, z) => !!placeAt(x, z, 40) || sidesRef.some((sp) => sp.near(x, z)) || (raceRef && raceRef.near(x, z)) || forks.near(x, z) || (herdRoadRef && herdNear(x, z)) || (hoodRef && hoodRef.near(x, z));
vehicle.street = { contains: (x, z, margin = 0) => !!placeAt(x, z, margin) };
rig.clip = (from, to) => {
  const safe = (placeAt(to.x, to.z, 30) || district).clipCamera(from, to);
  // down in a cave the rock is the wall
  const det = vehicle.spurHit && vehicle.spurHit.spur.clipCamera ? vehicle.spurHit.spur : null;
  return det ? det.clipCamera(safe) : safe;
};

// underground: near-black air, the headlights doing all the work
const CAVE_PALETTE = { fog: 0x030303, skyTop: 0x000000, skyHorizon: 0x030303, glow: 0x060606, light: 0.025, exposure: 0.72, fogMul: 1.5, grain: 1.4, rain: 0 };

let driveInTrail = null;

// ---------------------------------------------------------------- R I D E: somewhere else

/** Every place the ride can drop you, as a function that puts the car there. */
function warpSpots() {
  const spots = [];
  // the middle of each zone on the ring
  const seen = new Map();
  for (let s = 0; s < LOOP_LEN; s += 40) {
    const z = zoneIndexAt(s);
    if (!seen.has(z)) seen.set(z, []);
    seen.get(z).push(s);
  }
  for (const [z, ss] of seen) {
    if (ZONES[z].kind === 'district') continue;
    const s = ss[Math.floor(ss.length / 2)];
    spots.push({ name: `ring ${z}`, go: () => vehicle.reset(s, 0, 0, 22) });
  }
  // out on each ramp, deep in its pocket world
  forks.spurs.forEach((sp) => {
    let t = 0;
    while (t < sp.N - 1 && sp.U[t] < 0.35) t++;
    spots.push({ name: sp.kind, go: () => { const p = sp.sample(t); vehicle.placeAt(p.x, p.y + 0.4, p.z, p.heading, 18); } });
  });
  // down in each cave
  forks.detours.forEach((det) => {
    spots.push({ name: det.name, go: () => { const p = det.sample(det.tCaveA + 25); vehicle.placeAt(p.x, p.y + 0.3, p.z, p.heading, 12); } });
  });
  // the drive-in, nosed toward the screen; the middle of the Narrows
  spots.push({ name: 'drive-in', go: () => { const p = district.toWorld(LOT.u1 - 30, LOT.aisleV); vehicle.placeAt(p.x, 0, p.z, -district.yawToward(-1, 0), 4); } });
  for (const [n, pl, u] of [['wash', wash, 0.4], ['drive-thru', drive, 0.3], ['mud', mud, 0.2], ['jumps', jumps, 0.16]]) spots.push({ name: n, go: () => { const p = pl.spur.sample(pl.tAt(u)); vehicle.placeAt(p.x, p.y + 0.4, p.z, p.heading, 18); } });
  spots.push({ name: 'block', go: () => { const p = hood.spur.sample(hood.spur.N * 0.3); vehicle.placeAt(p.x, p.y + 0.4, p.z, p.heading, 16); } });
  spots.push({ name: 'logs', go: () => vehicle.reset(logJam.s0 - 160, 0, 0, 22) });
  spots.push({ name: 'narrows', go: () => vehicle.reset(narrows.s0, 0, 0, 16) });
  spots.push({ name: 'charge', go: () => { const p = herdRoad.sample(herdRoad.N * 0.2); vehicle.placeAt(p.x, p.y + 0.4, p.z, p.heading, 24); } });
  spots.push({ name: 'stampede', go: () => { const p = herdRoad.sample(herdRoad.N * 0.2); vehicle.placeAt(p.x, p.y + 0.4, p.z, p.heading, 24); } });
  spots.push({ name: 'race', go: () => { const T = race.track; const p = T.sample(T.tGrid - 140); vehicle.placeAt(p.x, p.y + 0.4, p.z, p.heading, 18); } });
  return spots;
}
let WARPS = null;
let lastWarp = -1;
let warpDeck = [];
const HERD_GREY = new THREE.Color();

const raceShot = (camera, v, dt) => { if (!race.shot(camera, v, dt)) rig.cine = null; };

/**
 * The limo's motor: only when it's close, and only now and then — a few seconds
 * of it growling past, then it drops back under your own engine.
 */
function limoSound(dt) {
  const R = race.rival;
  let level = 0;
  if (race.active && R) {
    const d = vehicle.pos.distanceTo(R.mesh.position);
    const L = state.limo || (state.limo = { on: 0, next: 2 });
    L.next -= dt;
    if (L.next < 0) { L.on = L.on ? 0 : 1; L.next = L.on ? 3 + Math.random() * 4 : 4 + Math.random() * 8; }
    const near = Math.max(0, 1 - d / 45);
    level = near * (race.phase === 'countdown' ? 0.6 : L.on);
    const f = vehicle.forward;
    const dx = R.mesh.position.x - vehicle.pos.x, dz = R.mesh.position.z - vehicle.pos.z;
    audio.limoSide(Math.max(-1, Math.min(1, (dx * -f.z + dz * f.x) / Math.max(4, d))));
  }
  audio.limo(level, R ? R.v : 0);
}

/** The circuit: through the gate, the countdown, laps, the result, and home. */
function raceFrame(dt) {
  const rr = race.update(dt, vehicle);
  if (rr.enter) screens.showCard('THE CIRCUIT', 'one long lap · the limo beside you');
  if (rr.lamp) audio.countdown(rr.lamp);
  if (rr.go) audio.raceGo();
  limoSound(dt);
  if (rr.card) screens.showCard(rr.card[0], rr.card[1]);
  if (rr.bump) { audio.bump(4 * rr.bump); rig.shake(0.15 * rr.bump); }
  if (rr.finish) audio.tone(rr.finish === 'win' ? 587 : 196, 0.14, 1.6, { wet: 0.7 });
  // the race's own camera moves, only from the chase view and only if nothing else holds the camera
  const ours = rig.cine === raceShot;
  if ((ours || !rig.cine) && rig.view === 0 && race.wantsShot(dt, vehicle)) rig.cine = raceShot;
  else if (ours) rig.cine = null;
  return rr;
}

/**
 * Wedged somewhere? Holding the gas without going anywhere for a few seconds
 * lifts the car back onto the nearest stretch of road. So does landing off any
 * surface after a warp.
 */
function unstick(dt, input, rr) {
  const trying = state.mode === 'ride' && !state.fall && !rr.hold && (input.throttle > 0.5 || input.brake > 0.5);
  const stuck = trying && vehicle.speed < 1.2 && !vehicle.airborne;
  state.stuckT = stuck ? (state.stuckT || 0) + dt : 0;
  const lost = state.mode === 'ride' && !vehicle.airborne && !vehicle.onRoad && !vehicle.spurHit && !placeAt(vehicle.pos.x, vehicle.pos.z, 0);
  state.lostT = lost ? (state.lostT || 0) + dt : 0;
  if (state.stuckT > 4 || state.lostT > 2.5) {
    state.stuckT = state.lostT = 0;
    const h = vehicle.spurHit;
    if (h) { const p = h.spur.sample(h.t); vehicle.placeAt(p.x, p.y + 1.5, p.z, p.heading, 6); }
    else vehicle.reset(vehicle.s, 0, 1.5, 6);
    rig.offset = undefined;
    state.aberration = 0.8;
    audio.launch(0.5);
  }
}

/**
 * Deep in Ephemera, now and then the camera sinks low behind the car and tilts
 * up at the sky for a few beats, then drifts back to its post.
 */
const skyShot = (cam, v, dt) => {
  const S = state.skyShot;
  S.t += dt;
  const w = THREE.MathUtils.smoothstep(S.t, 0, 1.6) * (1 - THREE.MathUtils.smoothstep(S.t, S.dur - 2, S.dur));
  const f = v.forward.clone();
  const r = new THREE.Vector3(-f.z, 0, f.x);
  const p = v.pos.clone(); p.y += v.bodyY;
  const chase = p.clone().addScaledVector(f, -8.5).addScaledVector(r, 1.8); chase.y += 2.2;
  const chaseLook = p.clone().addScaledVector(f, 7); chaseLook.y += 1;
  const low = p.clone().addScaledVector(f, -3.2).addScaledVector(r, 0.6); low.y += 0.55;
  const up = p.clone().addScaledVector(f, 14); up.y += 14;
  cam.position.copy(chase.lerp(low, w));
  cam.lookAt(chaseLook.lerp(up, w));
  cam.fov += (58 + 14 * w - cam.fov) * Math.min(1, dt * 3);
  if (S.t >= S.dur) { rig.cine = null; state.skyShot = null; }
};
function skyGlide(dt) {
  const h = vehicle.spurHit;
  const deep = h && h.spur.kind === 'ephemera' && forks.weight > 0.6 && rig.view === 0;
  state.nextSky = (state.nextSky ?? 8) - (deep ? dt : 0);
  if (deep && !rig.cine && state.nextSky <= 0) {
    state.skyShot = { t: 0, dur: 6.5 };
    rig.cine = skyShot;
    state.nextSky = 16 + Math.random() * 10;
  }
  if (!deep && rig.cine === skyShot) { rig.cine = null; state.skyShot = null; }
}

/** The new places, each frame: their light, their walls, their moments. */
function sidesFrame(dt) {
  for (const pl of sidesRef) {
    const h = pl.hit(vehicle);
    pl.clamp(vehicle, h, dt);
    if (pl.w > 0.01 && !ambient.pocket) ambient.pocket = { weight: pl.w, palette: SIDE_PALETTES.get(pl) };
    if (h && pl.w > 0.6 && !pl.shown) { pl.shown = true; screens.showCard(pl.name, pl.sub); }
    if (!h) pl.shown = false;
  }
  // the car wash takes the wheel, and the camera climbs inside
  const wo = wash.update(dt, state.time, vehicle, carView.model.body);
  state.washTake = !!wo.take;
  if (wo.start) {
    state.washPrevView = rig.view;
    state.washCam = { t: 0 };
    rig.cine = washCam;
    audio.wash(true);
  }
  state.washHue = wo.take ? wo.hue : null;
  if (wo.end) { audio.wash(false); screens.showCard('CLEAN', 'drive yourself out'); }
  if (wo.out) { rig.view = state.washPrevView ?? 0; rig.offset = undefined; }
  // the drive-thru
  const dr = drive.update(dt, state.time, vehicle);
  if (dr.speak) { audio.drivethru(); screens.showCard('…welcome to burger night…', 'may i take your… order'); }
  if (dr.served) screens.showCard('thank you', 'please drive… forward');
  if (dr.static) { audio.burst('bandpass', 2500, 0.12, 2.5, 0.6, 0.3); screens.showCard('…', 'only static'); }
  // the mud
  const mo = mud.update(dt, state.time, vehicle, rig.name);
  mo.splats.forEach((sp, i) => post.uSplat.value[i].set(sp.x, sp.y, sp.r, sp.a));
  if (mo.hit) audio.bump(3);
  if (mo.land) { emitPulse(vehicle.pos.x, vehicle.pos.z, 0.9, 60); audio.mud(1); audio.bump(6); }
  audio.mud(mo.mud ? Math.min(1, vehicle.speed / 25) : 0);
  // the jumps
  const jo = jumps.update(dt, state.time, vehicle);
  if (jo.through) { audio.tone(880, 0.12, 0.9, { wet: 0.7 }); audio.tone(1320, 0.08, 1.1, { wet: 0.8, delay: 0.08 }); }
  if (jo.air && jo.air > 1.4) screens.showCard(`${jo.air.toFixed(1)} s`, 'of air');
}

const ballCam = (cam, v, dt) => hood.watch(cam, dt);

/** Into the car wash: the camera flies forward through the back glass and settles in the driver's seat. */
const washCam = (cam, v, dt) => {
  const S = state.washCam;
  S.t += dt;
  const k = THREE.MathUtils.smoothstep(S.t, 0, 2.8);
  const f = v.forward.clone();
  const r = new THREE.Vector3(-f.z, 0, f.x);
  const p = v.pos.clone(); p.y += v.bodyY;
  const from = p.clone().addScaledVector(f, -8.5).addScaledVector(r, 1.8); from.y += 2.2;
  const seat = new THREE.Vector3(); carView.model.driver.getWorldPosition(seat);
  seat.addScaledVector(f, 0.12).y += 0.04;
  // a little lift as it comes in over the trunk, then down through the rear window
  const mid = p.clone().addScaledVector(f, 1.6); mid.y += 1.35;
  const a = from.clone().lerp(mid, Math.min(1, k * 1.6));
  cam.position.copy(a.lerp(seat, Math.max(0, (k - 0.55) / 0.45)));
  const look = p.clone().addScaledVector(f, 20); look.y += 0.4;
  cam.lookAt(look);
  cam.fov += (64 - cam.fov) * Math.min(1, dt * 3);
  if (S.t > 2.9) { rig.cine = null; rig.view = 2; }
};

/** R-I-D-E: the switches throw the car up out of the world, a white flash, and you come down somewhere else. */
function warp(name) {
  if (state.warping) return;
  state.warping = { t: 0, name };
  vehicle.vel.y = 17;
  vehicle.airborne = true;
  vehicle.airTime = 0;
  rig.shake(0.35);
  audio.launch(1);
}

function landWarp() {
  WARPS = WARPS || warpSpots();
  const want = (state.warping.name || '').toLowerCase();
  let i = want ? WARPS.findIndex((w) => w.name.toLowerCase().includes(want)) : -1;
  if (i < 0) {
    // a shuffled deck: every place once before any comes round again
    if (!warpDeck.length) {
      warpDeck = WARPS.map((_, k) => k).filter((k) => k !== lastWarp && WARPS[k].name !== 'stampede');
      for (let k = warpDeck.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [warpDeck[k], warpDeck[j]] = [warpDeck[j], warpDeck[k]]; }
    }
    i = warpDeck.pop();
  }
  lastWarp = i;
  WARPS[i].go();
  // drop in from above
  vehicle.pos.y += 6;
  vehicle.rideOff = 0; vehicle.prevY = undefined; vehicle.prevClimb = 0;
  vehicle.vel.y = 0;
  vehicle.airborne = true;
  vehicle.airTime = 0;
  state.lastWarp = WARPS[i].name;
  state.fall = null;
  state.zone = -1;
  state.pocketShown = null;
  state.caveShown = null;
  rig.offset = undefined;
  rig.reach = 1;
  warmStart(chunks, vehicle.s);
  state.aberration = 1.2;
  flashEl.style.transition = 'none';
  flashEl.style.opacity = '0.85';
  requestAnimationFrame(() => { flashEl.style.transition = 'opacity 0.9s ease-out'; flashEl.style.opacity = '0'; });
  state.warping = null;
}

const flashEl = Object.assign(document.createElement('div'), { className: 'warp-flash' });
document.body.appendChild(flashEl);

const state = {
  mode: 'title',
  time: 0,
  passengers: 0,
  zone: -1,
  joint: { front: 0, rear: 0 },
  wet: 0.3,
  timeScale: 1,
  fall: null,
  aberration: 0,
};

chunks.onSpawn = (c) => {
  watchers.spawn(c);
  for (const st of c.sentinels || []) watchers.spawnAt(c, c.group, st.pos, st.yaw, { bystander: true });
};
chunks.onDespawn = (c) => watchers.despawn(c);

// the people of each place
for (const place of places) {
  for (const w of place.watcherSpots) {
    watchers.spawnAt(place.chunk, place.world, place.toWorld(w.u, w.v, w.y), place.yawToward(w.faceU, w.faceV), { bystander: w.bystander, sit: w.sit });
  }
  for (const a of place.answererSpots) {
    const pos = place.toWorld(a.u, a.v, 0);
    answerers.spawn(pos, a.yaw);
    for (const k of [-1.6, 1.6]) {
      const c = place.toLocal(pos.x - Math.sin(a.yaw) * k, pos.z - Math.cos(a.yaw) * k);
      place.circles.push({ u: c.u, v: c.v, r: 1.4, h: 2.2 });
    }
  }
}
// a few figures standing at the road's edge in each pocket world
forks.spurs.forEach((sp, i) => {
  const pocket = forks.pockets[i];
  for (const f of [0.38, 0.5, 0.63]) {
    let t = 0;
    while (t < sp.N - 1 && sp.U[t] < f) t++;
    const side = (i + Math.round(f * 10)) % 2 ? 1 : -1;
    const pos = sp.at(t, side * (ROAD.HALF_WIDTH - 0.9), 0);
    const P = sp.sample(t);
    watchers.spawnAt(pocket.chunk, pocket.group, pos, Math.atan2(side * P.nx, side * P.nz));
  }
});

const hearing = (dist) => Math.max(0.12, 1 - dist / 80);
answerers.onHop = (a, dist) => audio.launch(0.5 * hearing(dist));
answerers.onLand = (a, dist) => {
  emitPulse(a.pos.x, a.pos.z, 0.45 + a.strength * 0.5, 26 + a.strength * 16);
  audio.slam(a.strength * 0.8 * hearing(dist), 0.5);
  particles.spray(a.pos.x, 0, a.pos.z, 24, 4);
  if (dist < 30) rig.shake(0.12 * (1 - dist / 30));
};
answerers.onTrust = (a) => {
  watchers.flyEyes(a.rider.eyes);
  audio.collect();
};

watchers.onNotice = () => audio.notice();
watchers.onCollect = () => { audio.collect(); rig.shake(0.15); };
watchers.onArrive = () => {
  state.passengers++;
  carView.setPassengers(state.passengers);
  audio.arrive();
  post.uFlash.value = 0.08;
};

// you start at the curb on the main drag, pointed at the ramp: W and you're on your way
const START_U = 150;
{
  const p = sample(district.s0 + START_U);
  vehicle.placeAt(p.x + p.nx * 3.2, 0, p.z + p.nz * 3.2, p.heading);
}
mist.setVents(places.flatMap((p) => p.vents));

// marks down the lane to the bridge, and a sign where the road starts to climb
const trail = new Trail(scene, (() => {
  const pts = [];
  for (let u = START_U + 8; u <= district.DU + 170; u += 8) {
    const p = sample(district.s0 + u);
    pts.push(new THREE.Vector3(p.x + p.nx * 3.2, p.y, p.z + p.nz * 3.2));
  }
  return pts;
})());
{
  const p = sample(district.s0 + START_U + 60);
  district.signAt('RING ROAD', '↑ bridge straight ahead', new THREE.Vector3(p.x + p.nx * (ROAD.HALF_WIDTH + 2.5), 5.2, p.z + p.nz * (ROAD.HALF_WIDTH + 2.5)), Math.atan2(-p.tx, -p.tz) + 0.35, [0xd9e2e6, 0x9fb4c4]);
}
// left before the bridge: a neon arrow, chevrons down the avenue, and the drive-in
const movie = new DriveInMovie(district, district.driveIn.booth);
{
  const u = 228;
  const v = district.roadV(u) - (ROAD.HALF_WIDTH + 4);
  district.signAt('DRIVE-IN', '← races tonight', district.toWorld(u, v, 5.4), district.faceYaw(-1, -0.45), [0xffd27a, 0xff4a3a]);
  const route = [[226, district.roadV(226) - 5], [240, district.roadV(240) - 10], [245, -70], [245, LOT.aisleV], [LOT.u1 - 4, LOT.aisleV], [LOT.u1 - 30, LOT.aisleV]];
  const pts = [];
  for (let i = 0; i < route.length - 1; i++) {
    const [a, b] = [route[i], route[i + 1]];
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6);
    for (let k = 0; k < n; k++) pts.push(district.toWorld(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, 0.04));
  }
  driveInTrail = new Trail(scene, pts, { persistent: true });
}
// just past the Narrows, a left-hand exit: the road becomes the circuit, one long lap, and comes back
const race = new Race(scene, rng(5150));
vehicle.spurs.push(race.track);
for (const [dist, scale] of [[600, 1], [150, 1.5]]) {
  const A = sample(race.track.sA - dist);
  const v = new THREE.Vector3(A.x - A.nx * 2.5, A.y + 8 + (scale - 1) * 3, A.z - A.nz * 2.5); // hung over the left lane, gantry-style
  plateSign('← THE RACE', dist > 200 ? `${dist} m · exit left` : 'FOLLOW THE ARROWS', v, Math.atan2(-A.tx, -A.tz), scale);
}
raceChevrons();

/** Glowing arrows painted on the road from the last sign, across into the exit and down it to the grid. */
function raceChevrons() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.6); shape.lineTo(1.6, -0.4); shape.lineTo(1.0, -0.9); shape.lineTo(0, 0.4); shape.lineTo(-1.0, -0.9); shape.lineTo(-1.6, -0.4); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 0.5), toneMapped: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });
  const put = (x, y, z, tx, tz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y + 0.06, z); m.rotation.y = Math.atan2(tx, tz) + Math.PI; scene.add(m); };
  // on the ring: drifting from the middle of the road over to the left edge where the exit leaves
  for (let k = 140; k >= 0; k -= 10) {
    const A = sample(race.track.sA - k);
    const d = -(1 - k / 140) * (ROAD.HALF_WIDTH - 1.5);
    put(A.x + A.nx * d, A.y, A.z + A.nz * d, A.tx, A.tz);
  }
  // and down the exit itself
  const T = race.track;
  for (let t = 4; t < Math.min(T.tGrid - 20, 160); t += 10) { const P = T.sample(t); put(P.x, P.y, P.z, P.tx, P.tz); }
}
const atmos = new Atmos(scene);
const stampede = new Stampede(scene);
let herdRoadRef = null;
let hoodRef = null;
let raceRef = null;
let sidesRef = [];
function herdNear(x, z) {
  const b = herdRoadRef.box;
  if (x < b.minX - 200 || x > b.maxX + 200 || z < b.minZ - 200 || z > b.maxZ + 200) return false;
  return herdRoadRef.distance(x, z) < 180;
}
// the herd lives in its own country: a gate of light across the highway takes you there
const herdRoad = buildHerdRoad();
scene.add(herdRoadMesh(herdRoad));
stampede.plant(herdRoad, scene);
vehicle.spurs.push(herdRoad);
herdRoadRef = herdRoad;
// the forgotten block off the Ruins, and its one shot
const hood = new Hood(scene, rng(7777));
vehicle.spurs.push(hood.spur);
hoodRef = hood;
raceRef = { near: (x, z) => { const b = race.track.box; if (x < b.minX - 150 || x > b.maxX + 150 || z < b.minZ - 150 || z > b.maxZ + 150) return false; return race.track.distance(x, z) < 120; } };
for (const dist of [400, 200]) {
  const A = sample(hood.spur.sA - dist);
  const v = new THREE.Vector3(A.x - A.nx * (ROAD.HALF_WIDTH + 4), A.y + 6.4, A.z - A.nz * (ROAD.HALF_WIDTH + 4));
  roadSign('THE BLOCK', `${dist} m · ← one shot`, v, Math.atan2(-A.tx, -A.tz), [0xffa860, 0xe8d2a8]);
}
// the new places: rest stop + car wash, the drive-thru, the mud flats, the jumps
const wash = new CarWash(scene);
const drive = new DriveThru(scene);
vehicle.pads.push(drive.pad);
const mud = new Mud(scene);
const jumps = new Jumps(scene);
// across the Pines highway: a spilled load of logs to jump and rattle over
const logJam = new LogJam(scene, [HERD, RACE, HOOD, WASH, DRIVE, MUD, JUMPS].map((e) => e.sA ?? e.at * LOOP_LEN));
vehicle.logJam = logJam;
for (const dist of [400, 200, 80]) {
  const A = sample(logJam.s0 - dist);
  const v = new THREE.Vector3(A.x + A.nx * (ROAD.HALF_WIDTH + 4), A.y + 6.4, A.z + A.nz * (ROAD.HALF_WIDTH + 4));
  roadSign('LOGS ON ROAD', `${dist} m · jump it`, v, Math.atan2(-A.tx, -A.tz), [0xffd27a, 0xd8a868]);
}
const sides = [wash, drive, mud, jumps];
for (const sp of sides) vehicle.spurs.push(sp.spur);
sidesRef = sides;
const SIDE_SIGNS = [[wash, 'REST STOP', 'gas · car wash →'], [drive, 'BURGER NIGHT', 'drive-thru →'], [mud, 'THE MUD FLATS', '← floor it'], [jumps, 'THE JUMPS', 'big air →']];
for (const [pl, title, sub] of SIDE_SIGNS) {
  for (const dist of [400, 200]) {
    const A = sample(pl.spur.sA - dist);
    const side = pl.def.side;
    const v = new THREE.Vector3(A.x + A.nx * side * (ROAD.HALF_WIDTH + 4), A.y + 6.4, A.z + A.nz * side * (ROAD.HALF_WIDTH + 4));
    roadSign(title, `${dist} m · ${sub}`, v, Math.atan2(-A.tx, -A.tz), [0xffe0b0, 0xffa060]);
  }
}
const SIDE_PALETTES = new Map([
  [wash, { fog: 0x1c1d20, skyTop: 0x050506, skyHorizon: 0x24262a, glow: 0x30343a, light: 0.2, exposure: 0.95, fogMul: 1.0, grain: 1.3, rain: 0.2 }],
  [drive, { fog: 0x1e1612, skyTop: 0x060404, skyHorizon: 0x2c1e16, glow: 0x3a2618, light: 0.14, exposure: 0.92, fogMul: 1.1, grain: 1.4, rain: 0.3 }],
  [mud, { fog: 0x1a1410, skyTop: 0x030202, skyHorizon: 0x22190f, glow: 0x30241a, light: 0.22, exposure: 0.95, fogMul: 1.0, grain: 1.5, rain: 0.45 }],
  [jumps, { fog: 0x0a1220, skyTop: 0x02040a, skyHorizon: 0x14243c, glow: 0x2a4a7a, light: 0.3, exposure: 1.0, fogMul: 0.7, grain: 1.4, rain: 0 }],
]);
// almost no light: the street lives on its windows
const HOOD_PALETTE = { fog: 0x1a1714, skyTop: 0x050506, skyHorizon: 0x221d18, glow: 0x2c241c, light: 0.16, exposure: 0.95, fogMul: 0.9, grain: 1.5, rain: 0.2 };
{
  // the way in looks like any other exit: signs counting down, the right lane peeling off
  for (const dist of [600, 300, 120]) {
    const A = sample(STAMPEDE.a - dist);
    const v = new THREE.Vector3(A.x + A.nx * (ROAD.HALF_WIDTH + 4), A.y + 6.4, A.z + A.nz * (ROAD.HALF_WIDTH + 4));
    roadSign('THE CHARGE', `${dist} m · keep right`, v, Math.atan2(-A.tx, -A.tz), [0xbfe2ff, 0x7fa8d8]);
  }
}
// the herd's air: cold blue fog the animals come apart in
const DUST_PALETTE = { fog: 0x6f8a92, skyTop: 0x22303e, skyHorizon: 0x8aa6b0, glow: 0xa6c2cc, light: 0.55, exposure: 1.12, fogMul: 0.95, grain: 1.7, rain: 0.6 };
const ETHER_CHOIR = forks.pockets[forks.spurs.findIndex((sp) => sp.kind === 'ether')].choir;
warmStart(chunks, vehicle.s);
rig.view = 1; // the title shot looks back at the driver

function startRide() {
  if (state.mode !== 'title' || state.mapOpen) return;
  // browsers keep quiet until you touch something: the first press wakes the title's beat
  if (!audio.ctx || audio.ctx.state !== 'running') {
    audio.start();
    audio.ctx.resume();
    audio.menu(true);
    const prompt = document.querySelector('.start');
    if (prompt) prompt.textContent = TOUCH ? 'tap again to ride' : 'press again to ride';
    return;
  }
  state.mode = 'ride';
  audio.menu(false);
  screens.begin();
  // ?at=stampede (or race, drive-in, narrows, dust, ether, …) starts you there
  const at = new URLSearchParams(location.search).get('at');
  if (at) setTimeout(() => { state.warping = { t: 1, name: at }; landWarp(); }, 400);
  rig.view = 0;
  rig.blend = 0;
}
window.addEventListener('pointerdown', startRide);
// the map: type M-A-P any time. It shows the whole course, drawn from the game itself,
// with you on it; the ride holds still until a tap or Esc brings you back
const mapView = document.getElementById('map');
function openMap() {
  // off the ring, name the place you're in rather than the stretch of ring beside it
  const side = vehicle.spurHit && sidesRef.find((pl) => pl.hit(vehicle));
  const z = side ? { name: side.name } : ZONES[zoneIndexAt(vehicle.s)];
  const D = {
    forks, herdRoad, hood, race, district, narrows,
    driveIn: district.toWorld((LOT.u0 + LOT.u1) / 2, LOT.aisleV),
    start: district.toWorld(150, district.roadV(150)),
    extras: sidesRef.map((pl) => pl.mapPin()),
    here: state.mode === 'ride' ? { x: vehicle.pos.x, z: vehicle.pos.z, yaw: vehicle.yaw, name: z?.name ?? '' } : null,
  };
  const src = drawMap(D, 2000);
  const cv = document.getElementById('map-canvas');
  cv.width = src.width; cv.height = src.height;
  cv.getContext('2d').drawImage(src, 0, 0);
  mapView.hidden = false;
  state.mapOpen = true;
}
function closeMap(e) {
  if (!state.mapOpen) return;
  e?.stopPropagation();
  mapView.hidden = true;
  setTimeout(() => { state.mapOpen = false; }, 50);
}
mapView.addEventListener('pointerdown', closeMap);
window.addEventListener('keydown', (e) => { if (state.mapOpen) { e.stopImmediatePropagation(); if (e.code === 'Escape') closeMap(e); } }, true);
// some browsers let a page make sound straight away; if this one does, the beat is already playing
try {
  audio.start();
  audio.menu(true);
  if (audio.ctx.state === 'running') {
    const prompt = document.querySelector('.start');
    if (prompt) prompt.dataset.awake = '1';
  }
} catch { /* no audio here; the title is silent */ }

// ---------------------------------------------------------------- events → feel

function onSlam(slam) {
  if (slam.pop) {
    // a pop lights the block, not the district: small ring, a hard metallic bang
    emitPulse(slam.x, slam.z, 0.45, 22);
    rig.shake(0.12);
    state.aberration = Math.max(state.aberration, 0.25);
    audio.slam(0.42, 1);
    particles.spray(slam.x, slam.y, slam.z, 14, 3);
    screens.hopped();
    return;
  }
  const radius = PULSE.BASE_RADIUS + slam.impact * PULSE.IMPACT_RADIUS * (0.6 + 0.4 * slam.clean);
  emitPulse(slam.x, slam.z, 0.55 + slam.strength * 0.7, radius);
  rig.shake(0.18 + slam.strength * 0.45);
  rig.fovKick = -3 * slam.strength;
  state.aberration = 0.4 + slam.strength * 0.6;
  audio.slam(slam.strength, slam.clean);
  particles.spray(slam.x, slam.y, slam.z, 26 + Math.floor(slam.strength * 30), 4 + slam.impact * 0.5);
  if (slam.clean < 0.6) {
    const f = vehicle.forward;
    particles.sparks(slam.x + f.x * 2.5, slam.y + 0.2, slam.z + f.z * 2.5, f.x, f.z, 30, 12);
  }
  screens.hopped();
}

function frameEvents(ev) {
  if (ev.launch) {
    audio.launch(ev.launch.charge);
    rig.fovKick = 4 * ev.launch.charge;
    // on the circuit a jump is a turbo: the switches throw you forward as well as up
    if (race.phase === 'racing') {
      const f = vehicle.forward;
      const kick = 12 + 18 * ev.launch.charge;
      vehicle.vel.x += f.x * kick;
      vehicle.vel.z += f.z * kick;
      rig.fovKick = 9 + 8 * ev.launch.charge;
      state.aberration = Math.max(state.aberration, 0.5 + ev.launch.charge * 0.6);
      audio.tone(220, 0.08, 0.6, { type: 'sawtooth', to: 660, wet: 0.4 });
    }
    particles.spray(vehicle.pos.x, vehicle.pos.y, vehicle.pos.z, 10, 2.5);
  }
  if (ev.pop) audio.launch(0.32);
  if (ev.slam) onSlam(ev.slam);
  if (ev.scrape > 0.1) {
    const side = Math.sign(vehicle.d);
    const S = sample(vehicle.s);
    if (Math.random() < ev.scrape) {
      particles.sparks(vehicle.pos.x + S.nx * side * 1.1, vehicle.pos.y + 0.4, vehicle.pos.z + S.nz * side * 1.1, -vehicle.vel.x * 0.05, -vehicle.vel.z * 0.05, 3, 6);
    }
    rig.shake(ev.scrape * 0.02);
  }
  if (ev.bump) {
    audio.bump(ev.bump.force);
    rig.shake(Math.min(0.6, ev.bump.force * 0.05));
    const f = vehicle.forward;
    particles.sparks(vehicle.pos.x + f.x * 2.6, vehicle.pos.y + 0.6, vehicle.pos.z + f.z * 2.6, -f.x, -f.z, 18, 7);
  }
}

// ---------------------------------------------------------------- the road under the tires

const JOINT_SPACING = 20;
function roadFeel(dt) {
  if (vehicle.airborne) return;
  const f = vehicle.forward;
  const speed = vehicle.speed;
  // expansion joints: front then rear axle, ka-thunk
  for (const [axle, off] of [['front', 1.75], ['rear', -1.85]]) {
    const j = Math.floor((vehicle.s + off) / JOINT_SPACING);
    if (j !== state.joint[axle] && !gapAt(j * JOINT_SPACING)) {
      if (speed > 3) {
        vehicle.bodyVY -= 0.12 + speed * 0.005;
        vehicle.pitchV += (axle === 'front' ? -1 : 1) * speed * 0.0018;
        audio.joint(Math.min(1, speed / 30), axle === 'rear');
        rig.shake(0.012);
      }
    }
    state.joint[axle] = j;
  }
  // rooster tails off the rear tires on wet asphalt
  if (speed > 7) {
    const n = 2 + Math.floor(speed / 12);
    const r = { x: -f.z, z: f.x };
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const back = 2.0 + Math.random() * 1.2;
      const x = vehicle.pos.x - f.x * back + r.x * side * (0.7 + Math.random() * 0.5);
      const z = vehicle.pos.z - f.z * back + r.z * side * (0.7 + Math.random() * 0.5);
      const k = 0.15 + Math.random() * 0.2;
      particles.emit(x, vehicle.pos.y + 0.15 + Math.random() * 0.3, z,
        -f.x * speed * k + r.x * side * Math.random() * 2, 0.6 + Math.random() * 1.8, -f.z * speed * k + r.z * side * Math.random() * 2,
        { life: 0.8, size: 0.8 + Math.random() * 1.0, color: [0.03, 0.028, 0.026], gravity: 3, drag: 2.2 });
    }
  }
}

function grind(b, speed) {
  if (Math.random() > Math.min(0.6, speed * 0.06)) return;
  const p = b.obj.position;
  particles.sparks(p.x + (Math.random() - 0.5) * 3, p.y + 0.15, p.z + (Math.random() - 0.5) * 3, b.vx * 0.1, b.vz * 0.1, 2, 3);
}

// ---------------------------------------------------------------- the payphone in the Narrows

/** It rings until you land next to it. Then every eye on the block turns to you. */
function updatePhone(dt, slam) {
  const ph = narrows.phone;
  if (!ph) return;
  const d = ph.pos.distanceTo(vehicle.pos);
  if (ph.ringing && slam && Math.hypot(slam.x - ph.pos.x, slam.z - ph.pos.z) < 9) {
    ph.ringing = false;
    ph.cooldown = 140;
    audio.pickup();
    for (const w of watchers.list) {
      if (w.state === 'dormant' && w.pos.distanceTo(ph.pos) < 120) {
        w.state = 'noticed';
        w.notice = 12;
        w.tilt = 0.4;
      }
    }
    emitPulse(ph.pos.x, ph.pos.z, 0.6, 120);
  }
  if (!ph.ringing) {
    ph.cooldown -= dt;
    if (ph.cooldown <= 0) ph.ringing = true;
  }
  audio.phone(ph.ringing ? Math.max(0, 1 - d / 140) : 0, state.time);
}

// ---------------------------------------------------------------- falling, gracefully

function updateFall(dt) {
  const fl = state.fall;
  fl.t += dt;
  state.timeScale = fl.t < 1.6 ? 0.45 : 1;
  post.uFade.value = THREE.MathUtils.clamp((fl.t - 1.2) / 0.7, 0, 1);
  if (fl.t > 2.0 && !fl.reset) {
    fl.reset = true;
    const g = gapAt(fl.s) || gapAt(fl.s + 10);
    const s = g ? g.end + 14 : fl.s + 30;
    vehicle.reset(s, 0, 9, 14);
    rig.offset = undefined; // snap the camera to the new spot
  }
  if (fl.reset) post.uFade.value = Math.max(0, 1 - (fl.t - 2.0) / 0.9);
  if (fl.t > 3.0) { state.fall = null; state.timeScale = 1; }
}

// ---------------------------------------------------------------- the loop

function physics(dt, input) {
  let ev = null;
  const steps = Math.max(1, Math.ceil(dt / PHYS_STEP)); // a zero-length first frame still yields events
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const e = vehicle.update(h, input);
    const colliders = collidersFrom(chunks.each('bodies'), []);
    vehicle.collide(colliders, e);
    const here = placeAt(vehicle.pos.x, vehicle.pos.z, 40);
    if (here) {
      here.collide(vehicle, e);
      here.boundary(vehicle, vehicle.onRoad);
    }
    hangingCars(e);
    if (!ev) ev = e;
    else {
      ev.slam = ev.slam || e.slam;
      ev.launch = ev.launch || e.launch;
      ev.pop = ev.pop || e.pop;
      ev.bump = ev.bump || e.bump;
      ev.scrape = Math.max(ev.scrape, e.scrape);
    }
    input = { ...input, hopPressed: false };
  }
  return ev;
}

const hangPos = new THREE.Vector3();
function hangingCars(ev) {
  for (const ch of chunks.each('chains')) {
    if (!ch.car) continue;
    ch.car.getWorldPosition(hangPos);
    const dx = vehicle.pos.x - hangPos.x;
    const dz = vehicle.pos.z - hangPos.z;
    const dy = vehicle.pos.y + 1 - hangPos.y;
    if (Math.hypot(dx, dz) < 3 && Math.abs(dy) < 1.6) {
      if (vehicle.vel.y > 0) vehicle.vel.y = -2;
      ch.omega += 0.8;
      ev.bump = { force: 9, x: hangPos.x, z: hangPos.z };
    }
  }
}

// ?test runs the loop on a timer so it keeps going in a hidden tab
const TEST = new URLSearchParams(location.search).has('test');
const schedule = TEST ? (f) => setTimeout(() => f(performance.now()), 16) : requestAnimationFrame;

let last = performance.now();
function tick(now) {
  schedule(tick);
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dt = raw * state.timeScale;
  state.time += dt;

  const input = TOUCH ? mergeTouch(readInput()) : readInput();
  if (input.map && !state.mapOpen) { audio.toggleMute(); openMap(); } // the M of M-A-P muted; put it back
  if (state.mapOpen) { last = now; return; }
  if (state.mode === 'title' && input.any) startRide();
  if (input.mute) audio.toggleMute();
  if (input.view && state.mode === 'ride') rig.cycle();
  if (input.warp && state.mode === 'ride') warp(typeof input.warp === 'string' ? input.warp : undefined);
  if (state.warping && (state.warping.t += raw) > 0.45) landWarp();

  const rr = state.mode === 'ride' ? raceFrame(dt) : {};
  unstick(dt, input, rr);
  const riding = state.mode === 'ride' && !state.fall && !rr.hold && !state.washTake;
  const drive = riding ? input : { throttle: 0, brake: 0, steer: 0, hopHeld: false, hopPressed: false };
  if (rr.hold) vehicle.vel.multiplyScalar(Math.exp(-dt * 3.5)); // you roll to a stop on the line
  const ev = physics(dt, drive);
  frameEvents(ev);

  if (riding && vehicle.offDeck) state.fall = { t: 0, s: vehicle.s, reset: false };
  if (state.fall) updateFall(raw);

  roadFeel(dt);
  updateBodies(chunks.each('bodies'), dt, grind);
  const along = sample(vehicle.s);
  chunks.update(vehicle.s, vehicle.vel.x * along.tx + vehicle.vel.z * along.tz >= 0 ? 1 : -1);
  // out in a pocket world: its own light, its own name, a choir instead of the road
  const pk = forks.update(dt, state.time, vehicle, camera);
  ambient.pocket = pk.pocket ? { weight: pk.weight, palette: pk.pocket.palette }
    : pk.cave > 0.01 ? { weight: pk.cave, palette: CAVE_PALETTE } : null;
  if (race.fade > 0.001) {
    // on the circuit: its own pale air and a choir under the engines
    ambient.pocket = { weight: race.fade, palette: RACE_PALETTE };
    audio.choir(ETHER_CHOIR, race.fade * 0.7);
  } else audio.choir(pk.pocket ? pk.pocket.choir : null, pk.weight);
  // the stampede: the herd runs with you, and leans on you if you drift into it
  const onHerd = vehicle.spurHit && vehicle.spurHit.spur === herdRoad ? vehicle.spurHit : null;
  const logs = logJam.update(state.time, vehicle);
  if (logs.on) {
    // every wheel rolling over a different log: the whole car rattles
    rig.shake(0.05 * logs.on);
    vehicle.yaw += (Math.random() - 0.5) * 0.006 * logs.on;
    if (Math.random() < dt * 9 * logs.on) audio.bump(0.6 + Math.random() * 1.4);
  }
  if (vehicle.hitLogs) { vehicle.hitLogs = false; rig.shake(0.5); audio.bump(5); }
  const herd = stampede.update(dt, state.time, vehicle, herdRoad);
  rig.herd = herd.w;
  state.herdFog = herd.whiteout || 0;
  if (herd.w > 0.01 && !ambient.pocket) ambient.pocket = { weight: Math.min(1, herd.w * 1.2), palette: DUST_PALETTE };
  // the bridge is a strip: lean on its edge and the dark leans back
  const edge = onHerd ? herdHalfWidth(herdRoad.sample(onHerd.t).u) - 1.2 : 0;
  if (onHerd && onHerd.t > herdRoad.tSepA && onHerd.t < herdRoad.tSepB && Math.abs(onHerd.d) > edge && !vehicle.airborne) {
    const side = Math.sign(onHerd.d);
    const over = Math.abs(onHerd.d) - edge;
    vehicle.pos.x -= onHerd.nx * side * over * Math.min(1, dt * 12);
    vehicle.pos.z -= onHerd.nz * side * over * Math.min(1, dt * 12);
    const into = (vehicle.vel.x * onHerd.nx + vehicle.vel.z * onHerd.nz) * side;
    if (into > 0) { vehicle.vel.x -= onHerd.nx * side * into; vehicle.vel.z -= onHerd.nz * side * into; }
  }
  // the block: one shot at the hoop
  const onHood = vehicle.spurHit && vehicle.spurHit.spur === hood.spur ? vehicle.spurHit : null;
  const hu = onHood ? onHood.t / hood.spur.N : 0;
  state.hoodW = (state.hoodW || 0) + ((onHood ? Math.min(1, hu * 6, (1 - hu) * 6) : 0) - (state.hoodW || 0)) * Math.min(1, dt * 2);
  if (state.hoodW > 0.01 && !ambient.pocket) ambient.pocket = { weight: state.hoodW, palette: HOOD_PALETTE };
  if (onHood && onHood.t > hood.spur.tSepA && onHood.t < hood.spur.tSepB && Math.abs(onHood.d) > hoodHalfWidth() - 1.2 && !vehicle.airborne) {
    const side = Math.sign(onHood.d);
    const over = Math.abs(onHood.d) - (hoodHalfWidth() - 1.2);
    vehicle.pos.x -= onHood.nx * side * over; vehicle.pos.z -= onHood.nz * side * over;
    const into = (vehicle.vel.x * onHood.nx + vehicle.vel.z * onHood.nz) * side;
    if (into > 0) { vehicle.vel.x -= onHood.nx * side * into; vehicle.vel.z -= onHood.nz * side * into; }
  }
  if (onHood && hu > 0.15 && !state.hoodShown) { state.hoodShown = true; screens.showCard('THE BLOCK', 'one ball · one shot'); }
  if (!onHood) state.hoodShown = false;
  const hev = hood.update(dt, state.time, vehicle);
  if (hev.shot) { audio.bump(12); audio.tone(90, 0.3, 0.5, { to: 50, wet: 0.5 }); rig.shake(0.4); }
  if (hev.swish) { audio.tone(523.25, 0.12, 1.2, { wet: 0.7 }); audio.tone(659.25, 0.1, 1.4, { wet: 0.7, delay: 0.12 }); audio.tone(783.99, 0.1, 1.8, { wet: 0.8, delay: 0.24 }); screens.showCard('SWISH', 'from downtown'); }
  if (hev.miss === 'rim') { audio.tone(220, 0.2, 0.6, { type: 'triangle', to: 180, wet: 0.6 }); screens.showCard('OFF THE RIM', 'so close'); }
  if (hev.miss === 'air') screens.showCard('AIRBALL', 'the block saw that');
  if (hev.rim) audio.tone(260, 0.22, 0.5, { type: 'triangle', to: 200, wet: 0.6 });
  if (hev.bounce) { audio.tone(70, 0.4 * hev.bounce, 0.35, { to: 45, wet: 0.5 }); audio.burst('lowpass', 500, 0.15 * hev.bounce, 0.15, 1, 0.4); }
  // watch the ball: a camera by the hoop until it's down and still (any key-held view comes back after)
  if (hev.shot && !rig.cine) { hood.camPos = null; hood.camLook = null; rig.cine = ballCam; }
  if (rig.cine === ballCam && !hood.live) rig.cine = null;
  sidesFrame(dt);
  audio.stampede(herd.w, herd.near, herd.intensity || 0, herd.score ? herd.score.vortex : 0);
  if (herd.w > 0.5 && !state.herdShown) { state.herdShown = true; screens.showCard('THE CHARGE', 'they were running long before the road'); }
  if (herd.w < 0.05) state.herdShown = false;
  if (pk.pocket && pk.weight > 0.55 && state.pocketShown !== pk.pocket) {
    state.pocketShown = pk.pocket;
    screens.showCard(pk.pocket.name, pk.pocket.sub);
  }
  if (!pk.pocket && state.pocketShown) { state.pocketShown = null; state.zone = -1; }
  // under the road: no rain, no wind, its own name
  state.cave = pk.cave;
  rig.close = pk.cave;
  skyGlide(dt);
  audio.cave(pk.cave);
  if (pk.detour && pk.cave > 0.6 && state.caveShown !== pk.detour) {
    state.caveShown = pk.detour;
    screens.showCard(pk.detour.name, pk.detour.sub);
  }
  if (!pk.detour && state.caveShown) { state.caveShown = null; state.zone = -1; }
  dissolveUniforms.uCar.value.copy(vehicle.pos);
  // your headlights, for the parked cars' lamp glass to catch
  catchUniforms.uDir.value.copy(vehicle.forward).setY(0).normalize();
  catchUniforms.uSrc.value.copy(vehicle.pos).addScaledVector(catchUniforms.uDir.value, 2.9).y += 0.8;

  const z = zoneIndexAt(vehicle.s);
  if (z !== state.zone && state.mode === 'ride' && !pk.pocket && pk.cave < 0.01 && !race.active && stampede.w < 0.05 && !(state.hoodW > 0.05)) {
    state.zone = z;
    screens.showZone(z);
    audio.setZone(z);
    reflections.set(ZONES[z]);
  }

  updatePulses(dt, state.time);
  const pulses = livePulses();
  watchers.update(dt, state.time, vehicle.pos, pulses, ev.slam);
  answerers.update(dt, state.time, vehicle.pos, ev.slam);
  const trainNear = district.updateTrain(dt, district.toLocal(vehicle.pos.x, vehicle.pos.z));
  updatePhone(dt, ev.slam);
  if (trainNear > 0.75) rig.shake(dt * (trainNear - 0.75) * 0.8);
  ambient.update(dt, state.time, vehicle.s, vehicle.pos, chunks, pulses, ev.slam);
  particles.update(dt);
  const inTown = !!placeAt(vehicle.pos.x, vehicle.pos.z, 30) || forks.weight > 0.05;
  mist.update(dt, vehicle, camera, scene.fog.color, ambient.flash, inTown);
  trail.update(dt, state.time, vehicle);
  driveInTrail.update(dt, state.time, vehicle);
  const film = movie.update(dt, renderer, vehicle.pos);
  audio.movie(film.level, film.roar, film.hit);
  fogLayers.update(state.time, camera, vehicle.groundY, scene.fog.color, ambient.fogThick, inTown);
  renderer.toneMappingExposure += (ambient.exposure * 1.05 - renderer.toneMappingExposure) * Math.min(1, raw);
  const rainHere = ambient.rain * (1 - (state.cave || 0));
  rain.update(dt, camera.position, vehicle.vel, rainHere);
  carView.inside = (rig.name === 'cabin' && !rig.cine) || (rig.cine === washCam && state.washCam && state.washCam.t > 1.8);
  carView.sync(vehicle, state.time, dt);
  if (!state.fall || !state.fall.reset || state.fall.t > 2.2) {
    if (state.fall && !state.fall.reset) rig.camera.lookAt(vehicle.pos);
    else rig.update(raw, vehicle, carView.model);
  }
  gauges.update(raw, vehicle.speed, Math.max(vehicle.charge, vehicle.liftY * 1.4), state.passengers, state.time);

  audio.frame({
    speed: vehicle.speed, throttle: drive.throttle, charge: Math.max(vehicle.charge, vehicle.pumping * 0.35), charging: vehicle.charging || vehicle.pumping > 0,
    scrape: ev.scrape, lampNear: ambient.lampNear, rain: state.mode === 'title' ? 0 : rainHere, airborne: vehicle.airborne, view: rig.name, train: trainNear,
  });

  state.aberration *= Math.exp(-raw * 4);
  post.uAberration.value = state.aberration + (vehicle.airborne ? 0.08 : 0);
  post.uTime.value = state.time;
  for (const sg of ROAD_SIGNS) {
    const flick = Math.sin(state.time * 23 + sg.seed) > -0.9 ? 1 : 0.4;
    const dx = vehicle.pos.x - sg.pos.x, dz = vehicle.pos.z - sg.pos.z;
    const ahead = dx * sg.nx + dz * sg.nz > 0; // you're on the side it faces: still coming up to it
    const focus = ahead ? 1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dz), FOCUS_NEAR, FOCUS_FAR) : 0;
    sg.f = (sg.f ?? focus) + (focus - (sg.f ?? focus)) * Math.min(1, raw * 3);
    sg.mat.opacity = sg.f;
    sg.blur.opacity = 1 - sg.f;
    sg.mat.color.setScalar(1.6 * flick);
    sg.blur.color.setScalar((ahead ? 1.4 : 2.4) * flick); // past it, it flares bright
  }
  // the place's own weather: a lid of fog, banks at the lens, hail
  const sky = state.mode === 'ride' && !vehicle.spurHit ? atmos.update(raw, state.time, vehicle.s, camera) : atmos.update(raw, state.time, null, camera);
  post.uTopFog.value = sky.top;
  post.uGust.value = Math.max(sky.gust, (state.herdFog || 0) * 0.97);
  // the Charge's held breath: the fog closes right in around the car
  if (state.herdFog > 0.01) {
    if (scene.fog.isFogExp2) scene.fog.density *= 1 + state.herdFog * 9;
    else { scene.fog.near *= 1 - state.herdFog * 0.95; scene.fog.far = THREE.MathUtils.lerp(scene.fog.far, 14, state.herdFog); }
  }
  post.uGustCol.value.copy(scene.fog.color).lerp(new THREE.Color(0.75, 0.77, 0.8), 0.5);
  if (state.herdFog > 0.01) {
    // banks of darker grey rolling through it, charcoal to ash
    const g = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(state.time * 0.7) * Math.sin(state.time * 0.23 + 1.3));
    post.uGustCol.value.lerp(HERD_GREY.setRGB(g, g * 1.02, g * 1.05), state.herdFog);
    scene.fog.color.lerp(HERD_GREY, state.herdFog * 0.8);
  }
  scene.fog.density *= 1 + sky.gust * 1.5 + sky.hail * 0.4;
  audio.hail(sky.hail);
  post.uGrain.value = 0.085 * ambient.grain + (vehicle.airborne ? 0.03 : 0);
  // lens weather: the windshield is wiped; the outside camera just gets rained on
  carView.raining = rainHere > 0.12;
  const wetTarget = rig.name === 'cabin'
    ? rainHere * (0.12 + 0.85 * carView.glassWetness(state.time))
    : Math.max(0, rainHere * 0.36 - Math.min(0.15, vehicle.speed * 0.004));
  state.wet += (wetTarget - state.wet) * Math.min(1, raw * (rig.name === 'cabin' ? 12 : 1.5));
  post.uWet.value = state.wet;
  post.uWind.value = rig.name === 'cabin' ? 0 : Math.min(0.6, vehicle.speed * 0.012);
  trails.uniforms.damp.value = 0.45 + Math.min(0.32, vehicle.speed * 0.009);
  // in a pocket world the film itself changes: hue wash, echoes, soft focus, long ghosts
  {
    const w = forks.weight;
    const fx = forks.active ? forks.active.post : null;
    post.uWashAmt.value = fx ? fx.washAmt * w : 0;
    if (fx) post.uWash.value.setRGB(...fx.wash);
    post.uEcho.value = fx ? fx.echo * w : 0;
    post.uSoft.value = fx ? fx.soft * w : 0;
    // inside the car wash, light through coloured soap
    if (state.washHue != null) { /* the colour is on the glass and the tunnel lamps, never the cabin */ }
    if (fx) trails.uniforms.damp.value += (fx.trails - trails.uniforms.damp.value) * w;
    bloom.strength = 0.7 + (fx ? (fx.bloom - 0.7) * w : 0);
  }
  post.uFlash.value = Math.max(post.uFlash.value * Math.exp(-raw * 3), ambient.flash * 0.05);
  carView.renderMirror(renderer, scene);
  composer.render();
}

// expose a tiny handle for debugging in the console
window.__darkride = { vehicle, state, chunks, rig, ROAD, particles, watchers, carView, scene, renderer, district, narrows, places, answerers, emitPulse, ambient, forks, audio, warmStart, race, movie, stampede, herdRoad, atmos, hood, wash, drive, mud, jumps };
if (TEST) import('./core/testkit.js').then((m) => m.installTestKit(window.__darkride));
if (new URLSearchParams(location.search).has('reel')) import('./core/reel.js').then((m) => m.installReel(window.__darkride));
schedule(tick);
