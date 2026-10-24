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
import { gapAt, zoneIndexAt, sample } from './world/track.js';
import { District } from './world/district.js';
import { Narrows } from './world/narrows.js';
import { LOOP_LEN } from './world/track.js';
import { Answerers } from './world/answerers.js';
import { Trail } from './world/trail.js';
import { Forks } from './world/forks.js';
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
vehicle.spurs = forks.spurs;
for (const c of forks.chunks) chunks.extras.push(c);
chunks.avoid = (x, z) => !!placeAt(x, z, 40) || forks.near(x, z);
vehicle.street = { contains: (x, z, margin = 0) => !!placeAt(x, z, margin) };
rig.clip = (from, to) => (placeAt(to.x, to.z, 30) || district).clipCamera(from, to);

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
  district.signAt('RING ROAD', 'the bridge ->', new THREE.Vector3(p.x + p.nx * (ROAD.HALF_WIDTH + 2.5), 5.2, p.z + p.nz * (ROAD.HALF_WIDTH + 2.5)), Math.atan2(-p.tx, -p.tz) + 0.35, [0xd9e2e6, 0x9fb4c4]);
}
warmStart(chunks, vehicle.s);
rig.view = 1; // the title shot looks back at the driver

function startRide() {
  if (state.mode !== 'title') return;
  state.mode = 'ride';
  audio.start();
  screens.begin();
  rig.view = 0;
  rig.blend = 0;
}
window.addEventListener('pointerdown', startRide);

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

  const riding = state.mode === 'ride' && !state.fall;
  const drive = riding ? input : { throttle: 0, brake: 0, steer: 0, hopHeld: false, hopPressed: false };
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
  ambient.pocket = pk.pocket ? { weight: pk.weight, palette: pk.pocket.palette } : null;
  audio.choir(pk.pocket ? pk.pocket.choir : null, pk.weight);
  if (pk.pocket && pk.weight > 0.55 && state.pocketShown !== pk.pocket) {
    state.pocketShown = pk.pocket;
    screens.showCard(pk.pocket.name, pk.pocket.sub);
  }
  if (!pk.pocket && state.pocketShown) { state.pocketShown = null; state.zone = -1; }
  dissolveUniforms.uCar.value.copy(vehicle.pos);
  // your headlights, for the parked cars' lamp glass to catch
  catchUniforms.uDir.value.copy(vehicle.forward).setY(0).normalize();
  catchUniforms.uSrc.value.copy(vehicle.pos).addScaledVector(catchUniforms.uDir.value, 2.9).y += 0.8;

  const z = zoneIndexAt(vehicle.s);
  if (z !== state.zone && state.mode === 'ride' && !pk.pocket) {
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
  fogLayers.update(state.time, camera, vehicle.groundY, scene.fog.color, ambient.fogThick, inTown);
  renderer.toneMappingExposure += (ambient.exposure * 1.05 - renderer.toneMappingExposure) * Math.min(1, raw);
  rain.update(dt, camera.position, vehicle.vel, ambient.rain);
  carView.sync(vehicle, state.time, dt);
  if (!state.fall || !state.fall.reset || state.fall.t > 2.2) {
    if (state.fall && !state.fall.reset) rig.camera.lookAt(vehicle.pos);
    else rig.update(raw, vehicle, carView.model);
  }
  gauges.update(raw, vehicle.speed, Math.max(vehicle.charge, vehicle.liftY * 1.4), state.passengers, state.time);

  audio.frame({
    speed: vehicle.speed, throttle: drive.throttle, charge: Math.max(vehicle.charge, vehicle.pumping * 0.35), charging: vehicle.charging || vehicle.pumping > 0,
    scrape: ev.scrape, lampNear: ambient.lampNear, rain: ambient.rain, airborne: vehicle.airborne, view: rig.name, train: trainNear,
  });

  state.aberration *= Math.exp(-raw * 4);
  post.uAberration.value = state.aberration + (vehicle.airborne ? 0.08 : 0);
  post.uTime.value = state.time;
  post.uGrain.value = 0.085 * ambient.grain + (vehicle.airborne ? 0.03 : 0);
  // lens weather: the windshield is wiped; the outside camera just gets rained on
  carView.raining = ambient.rain > 0.12;
  const wetTarget = rig.name === 'cabin'
    ? ambient.rain * (0.12 + 0.85 * carView.glassWetness(state.time))
    : Math.max(0, ambient.rain * 0.36 - Math.min(0.15, vehicle.speed * 0.004));
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
window.__darkride = { vehicle, state, chunks, rig, ROAD, particles, watchers, carView, scene, renderer, district, narrows, places, answerers, emitPulse, ambient, forks, audio, warmStart };
if (TEST) import('./core/testkit.js').then((m) => m.installTestKit(window.__darkride));
if (new URLSearchParams(location.search).has('reel')) import('./core/reel.js').then((m) => m.installReel(window.__darkride));
schedule(tick);
