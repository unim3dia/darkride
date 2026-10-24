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
import { Stampede, STAMPEDE, buildHerdRoad, herdRoadMesh } from './world/stampede.js';
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
import { setupTouch, mergeTouch } from './ui/touch.js';

setupFullscreenButton();
const TOUCH = setupTouch();

const PHYS_STEP = 1 / 120;

const { renderer, scene, camera, composer, post, trails, bloom } = createRenderer(document.getElementById('stage'));
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
chunks.avoid = (x, z) => !!placeAt(x, z, 40) || forks.near(x, z);
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
let raceTrail = null;

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
  spots.push({ name: 'narrows', go: () => vehicle.reset(narrows.s0, 0, 0, 16) });
  spots.push({ name: 'stampede', go: () => enterHerd(24) });
  spots.push({ name: 'race', go: () => { const p = narrows.toWorld(RACE_U, -60, 0); vehicle.placeAt(p.x, 0, p.z, -narrows.yawToward(0, -1), 10); } });
  return spots;
}
let WARPS = null;
let lastWarp = -1;

const raceShot = (camera, v, dt) => { if (!race.shot(camera, v, dt)) rig.cine = null; };

/** The circuit: through the gate, the countdown, laps, the result, and home. */
function raceFrame(dt) {
  const rr = race.update(dt, vehicle);
  const flash = () => { state.aberration = 1.4; rig.offset = undefined; rig.reach = 1; state.fall = null; };
  if (rr.enter) {
    race.enter(vehicle);
    flash();
    audio.launch(0.9);
    screens.showCard('THE CIRCUIT', 'three laps · the rival on your right');
  }
  if (rr.lamp) audio.tone(392, 0.12, 0.35, { wet: 0.4 });
  if (rr.go) audio.tone(784, 0.16, 0.8, { wet: 0.5 });
  if (rr.card) screens.showCard(rr.card[0], rr.card[1]);
  if (rr.bump) { audio.bump(4 * rr.bump); rig.shake(0.15 * rr.bump); }
  if (rr.finish) audio.tone(rr.finish === 'win' ? 587 : 196, 0.14, 1.6, { wet: 0.7 });
  // the race's own camera moves, only from the chase view and only if nothing else holds the camera
  const ours = rig.cine === raceShot;
  if ((ours || !rig.cine) && rig.view === 0 && race.wantsShot(dt, vehicle)) rig.cine = raceShot;
  else if (ours) rig.cine = null;
  if (rr.done) {
    race.leave(vehicle);
    flash();
    state.zone = -1;
    warmStart(chunks, vehicle.s);
  }
  return rr;
}

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
  if (race.active) race.phase = 'idle', race.set.group.visible = false;
  WARPS = WARPS || warpSpots();
  const want = (state.warping.name || '').toLowerCase();
  let i = want ? WARPS.findIndex((w) => w.name.toLowerCase().includes(want)) : -1;
  if (i < 0) {
    i = Math.floor(Math.random() * WARPS.length);
    if (i === lastWarp) i = (i + 1 + Math.floor(Math.random() * (WARPS.length - 1))) % WARPS.length;
  }
  lastWarp = i;
  WARPS[i].go();
  // drop in from above
  vehicle.pos.y += 6;
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

chunks.onSpawn = (c) => watchers.spawn(c);
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
// in the Narrows: a sign calls you left, down a street to a gate of light, and the circuit
const RACE_U = -133;
const race = new Race(scene, {
  pos: narrows.toWorld(RACE_U, -100, 0),
  yaw: narrows.faceYaw(0, 1),
  back: (v) => { const p = narrows.toWorld(RACE_U, -86, 0); v.placeAt(p.x, 0, p.z, -narrows.yawToward(0, 1), 8); },
}, narrows.s0, rng(5150));
vehicle.spurs.push(race.track);
{
  const u = -162;
  narrows.signAt('RACE', '← tonight · three laps', narrows.toWorld(u, narrows.roadV(u) - (ROAD.HALF_WIDTH + 5), 6), narrows.faceYaw(-1, -0.45), [0xe8f0ff, 0x7fd8ff]);
  const route = [[-152, narrows.roadV(-152) - 5], [RACE_U, narrows.roadV(RACE_U) - 14], [RACE_U, -94]];
  const pts = [];
  for (let i = 0; i < route.length - 1; i++) {
    const [a, b] = [route[i], route[i + 1]];
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6);
    for (let k = 0; k < n; k++) pts.push(narrows.toWorld(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, 0.04));
  }
  raceTrail = new Trail(scene, pts, { persistent: true });
}
const stampede = new Stampede(scene);
// the herd lives in its own country: a gate of light across the highway takes you there
const herdRoad = buildHerdRoad(STAMPEDE.a);
scene.add(herdRoadMesh(herdRoad));
vehicle.spurs.push(herdRoad);
const herdGate = (() => {
  const S = sample(STAMPEDE.a);
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.3, 1.8), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const veil = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 0.26, 0.36), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const W = ROAD.HALF_WIDTH * 2 + 3;
  const H = 14;
  for (const [sx, sy, px, py] of [[0.35, H, -W / 2, H / 2], [0.35, H, W / 2, H / 2], [W, 0.35, 0, H]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.35), mat);
    m.position.set(px, py, 0);
    g.add(m);
  }
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(W, H), veil);
  sheet.position.y = H / 2;
  g.add(sheet);
  g.position.set(S.x, S.y, S.z);
  g.rotation.y = -S.heading;
  scene.add(g);
  for (const dist of [600, 300]) {
    const A = sample(STAMPEDE.a - dist);
    const v = new THREE.Vector3(A.x + A.nx * (ROAD.HALF_WIDTH + 4), A.y + 5.4, A.z + A.nz * (ROAD.HALF_WIDTH + 4));
    district.signAt('STAMPEDE', `${dist} m · through the light`, v, Math.atan2(-A.tx, -A.tz), [0xbfe2ff, 0x7fa8d8]);
  }
  return { veil };
})();
function enterHerd(speed) {
  const p = herdRoad.sample(4);
  vehicle.placeAt(p.x, p.y + 0.4, p.z, p.heading, speed);
  rig.offset = undefined; rig.reach = 1;
  state.aberration = 1.4;
  state.fall = null;
  audio.launch(0.9);
}
function leaveHerd() {
  const speed = Math.max(18, vehicle.speed);
  vehicle.reset(STAMPEDE.b, 0, 0, speed);
  rig.offset = undefined; rig.reach = 1;
  state.aberration = 1.2;
  state.zone = -1;
  warmStart(chunks, vehicle.s);
}
// the herd's air: cold blue fog the animals come apart in
const DUST_PALETTE = { fog: 0x6c829a, skyTop: 0x2a3848, skyHorizon: 0x8ca2b8, glow: 0x9ab2c8, light: 0.45, exposure: 1.0, fogMul: 0.9, grain: 1.8, rain: 0.45 };
const ETHER_CHOIR = forks.pockets[forks.spurs.findIndex((sp) => sp.kind === 'ether')].choir;
warmStart(chunks, vehicle.s);
rig.view = 1; // the title shot looks back at the driver

function startRide() {
  if (state.mode !== 'title') return;
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
  if (state.mode === 'title' && input.any) startRide();
  if (input.mute) audio.toggleMute();
  if (input.view && state.mode === 'ride') rig.cycle();
  if (input.warp && state.mode === 'ride') warp();
  if (state.warping && (state.warping.t += raw) > 0.45) landWarp();

  const rr = state.mode === 'ride' ? raceFrame(dt) : {};
  const riding = state.mode === 'ride' && !state.fall && !rr.hold;
  const drive = riding ? input : { throttle: 0, brake: 0, steer: 0, hopHeld: false, hopPressed: false };
  if (rr.hold) vehicle.vel.set(0, 0, 0);
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
  // through the gate, along the bridge, and back to the highway at its far end
  herdGate.veil.opacity = 0.5 + 0.25 * Math.sin(state.time * 3);
  if (state.mode === 'ride' && !vehicle.spurHit && vehicle.onRoad && Math.abs(((vehicle.s - STAMPEDE.a) % LOOP_LEN + LOOP_LEN) % LOOP_LEN) < 3) {
    const S = sample(vehicle.s);
    if (vehicle.vel.x * S.tx + vehicle.vel.z * S.tz > 2) enterHerd(Math.max(20, vehicle.speed));
  }
  const onHerd = vehicle.spurHit && vehicle.spurHit.spur === herdRoad ? vehicle.spurHit : null;
  if (onHerd && onHerd.t > herdRoad.N - 12) leaveHerd();
  const herd = stampede.update(dt, state.time, vehicle, herdRoad);
  if (herd.w > 0.01 && !ambient.pocket) ambient.pocket = { weight: Math.min(1, herd.w * 1.2), palette: DUST_PALETTE };
  // the bridge is a strip: lean on its edge and the dark leans back
  if (onHerd && Math.abs(onHerd.d) > 2.4 && !vehicle.airborne) {
    const side = Math.sign(onHerd.d);
    const over = Math.abs(onHerd.d) - 2.4;
    vehicle.pos.x -= onHerd.nx * side * over * Math.min(1, dt * 12);
    vehicle.pos.z -= onHerd.nz * side * over * Math.min(1, dt * 12);
    const into = (vehicle.vel.x * onHerd.nx + vehicle.vel.z * onHerd.nz) * side;
    if (into > 0) { vehicle.vel.x -= onHerd.nx * side * into; vehicle.vel.z -= onHerd.nz * side * into; }
  }
  audio.stampede(herd.w, herd.near);
  if (herd.w > 0.5 && !state.herdShown) { state.herdShown = true; screens.showCard('THE STAMPEDE', 'they were running long before the road'); }
  if (herd.w < 0.05) state.herdShown = false;
  if (pk.pocket && pk.weight > 0.55 && state.pocketShown !== pk.pocket) {
    state.pocketShown = pk.pocket;
    screens.showCard(pk.pocket.name, pk.pocket.sub);
  }
  if (!pk.pocket && state.pocketShown) { state.pocketShown = null; state.zone = -1; }
  // under the road: no rain, no wind, its own name
  state.cave = pk.cave;
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
  if (z !== state.zone && state.mode === 'ride' && !pk.pocket && pk.cave < 0.01 && !race.active) {
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
  raceTrail.update(dt, state.time, vehicle);
  const film = movie.update(dt, renderer, vehicle.pos);
  audio.movie(film.level, film.roar, film.hit);
  fogLayers.update(state.time, camera, vehicle.groundY, scene.fog.color, ambient.fogThick, inTown);
  renderer.toneMappingExposure += (ambient.exposure * 1.05 - renderer.toneMappingExposure) * Math.min(1, raw);
  const rainHere = ambient.rain * (1 - (state.cave || 0));
  rain.update(dt, camera.position, vehicle.vel, rainHere);
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
    if (fx) trails.uniforms.damp.value += (fx.trails - trails.uniforms.damp.value) * w;
    bloom.strength = 0.7 + (fx ? (fx.bloom - 0.7) * w : 0);
  }
  post.uFlash.value = Math.max(post.uFlash.value * Math.exp(-raw * 3), ambient.flash * 0.05);
  composer.render();
}

// expose a tiny handle for debugging in the console
window.__darkride = { vehicle, state, chunks, rig, ROAD, particles, watchers, carView, scene, renderer, district, narrows, places, answerers, emitPulse, ambient, forks, audio, warmStart, race, movie, stampede, herdRoad };
if (TEST) import('./core/testkit.js').then((m) => m.installTestKit(window.__darkride));
if (new URLSearchParams(location.search).has('reel')) import('./core/reel.js').then((m) => m.installReel(window.__darkride));
schedule(tick);
