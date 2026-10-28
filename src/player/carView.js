// Dresses the physics body: suspension, wheels, rams, headlights, the dash,
// and the passengers you've picked up, riding in the back seat as two lights each.
import * as THREE from 'three';
import { buildPlayerCar, buildRider, WHEEL_RADIUS } from './carModel.js';
import { buildBeam, buildTailGlow, buildWipers, stainTexture } from './carLights.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Two-bone IK: where the elbow goes so both segments keep their length, bending toward `pole`. */
function solveElbow(S, W, a, b, pole) {
  const d = W.clone().sub(S);
  const len = Math.min(d.length(), a + b - 1e-4);
  const dir = d.normalize();
  const x = (a * a - b * b + len * len) / (2 * len);    // distance along S→W to the elbow's foot
  const h = Math.sqrt(Math.max(0, a * a - x * x));      // how far the elbow sits off that line
  const side = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return S.clone().addScaledVector(dir, x).addScaledVector(side, h);
}

/** Stretch a unit-tall cylinder between two points. */
function limb(mesh, A, B) {
  const v = B.clone().sub(A);
  mesh.position.copy(A).addScaledVector(v, 0.5);
  mesh.scale.set(1, v.length(), 1);
  mesh.quaternion.setFromUnitVectors(UP, v.normalize());
}

const SEATS = [
  [0.45, 1.22, 0.28],    // shotgun
  [-0.55, 1.2, 1.3],     // back left
  [0.0, 1.2, 1.33],      // back middle
  [0.55, 1.2, 1.3],      // back right
];

export class CarView {
  constructor(scene, gaugeTexture) {
    this.model = buildPlayerCar();
    this.model.root.rotation.order = 'YXZ';
    this.model.headlights[0].material = this.model.headlights[0].material.clone();
    scene.add(this.model.root);
    // the player's own glass: dark mirror from outside, a faint tint from the driver's seat
    this.glassOut = null;
    this.glassIn = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
    this.glassMeshes = [];
    this.model.root.traverse((o) => { if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0x05070a && o.material.transparent) { this.glassOut = o.material; this.glassMeshes.push(o); } });
    this.inside = false;
    // the driver's side mirror: a chrome housing with real glass framed inside it,
    // sat low on the door so from the seat it reads just above the middle of the wheel
    const mount = new THREE.Group();
    mount.position.set(-1.13, 1.12, -0.98);
    const toEye = new THREE.Vector3(-0.47 + 1.13, 1.26 - 1.12, 0.16 + 0.98).normalize();
    const normal = toEye.add(new THREE.Vector3(0, 0, 1)).normalize();
    mount.lookAt(mount.position.clone().add(normal));
    const chrome = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.3, metalness: 0.9, envMapIntensity: 1 });
    const housing = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12).scale(0.148, 0.09, 0.05).translate(0, 0, -0.035), chrome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 28).scale(1.42, 0.86, 1), chrome);
    // the glass shows what a little camera out on the door sees looking back, flipped like a mirror
    this.mirrorTarget = new THREE.WebGLRenderTarget(320, 190, { colorSpace: THREE.SRGBColorSpace });
    const mirrorGeo = new THREE.CircleGeometry(1, 40).scale(0.137, 0.08, 1);
    const uv = mirrorGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    this.mirror = new THREE.Mesh(mirrorGeo, new THREE.MeshBasicMaterial({ map: this.mirrorTarget.texture, color: new THREE.Color(1.5, 1.55, 1.6), toneMapped: false }));
    this.mirrorCam = new THREE.PerspectiveCamera(36, 320 / 190, 1.0, 600);
    // out past the door, looking back down the side of the car and a little outward
    this.mirrorCam.position.set(-1.7, 1.4, -0.9);
    this.mirrorCam.lookAt(-3.6, 1.1, 12);
    this.model.body.add(this.mirrorCam);
    this.mirror.position.z = 0.022; // proud of the housing shell, which bulges forward to z 0.015
    // the arm back to the door
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6).rotateZ(Math.PI / 2).translate(0.15, -0.04, -0.05), chrome);
    mount.add(housing, rim, this.mirror, arm);
    this.mirrorMount = mount;
    this.mirror.visible = false;
    this.model.body.add(mount);

    // one weak, tired headlight beam; the left bulb is going
    this.beam = new THREE.SpotLight(0xffd9a0, 22, 42, 0.42, 0.7, 1.5);
    this.beam.position.set(0, 0.78, -2.9);
    this.beam.target.position.set(0, -0.6, -16);
    this.model.body.add(this.beam, this.beam.target);

    // beams you can see in the rain, one per side; the left one is failing
    this.beams = [-0.86, 0.86].map((x) => {
      const b = buildBeam();
      b.position.set(x, 0.74, -2.95);
      this.model.body.add(b);
      return b;
    });
    this.tailGlow = buildTailGlow();
    this.model.root.add(this.tailGlow);
    this.wipers = buildWipers();
    this.model.body.add(this.wipers.group);
    this.wipePhase = 0;
    this.lastWipe = 0;

    // gauge glow on the driver's face (the green from the reference)
    this.dashLight = new THREE.PointLight(0x3dff8f, 0.6, 1.6, 2);
    this.dashLight.position.set(-0.45, 1.05, -0.55);
    this.model.body.add(this.dashLight);

    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.19),
      new THREE.MeshBasicMaterial({ map: gaugeTexture, transparent: true, color: new THREE.Color(1.5, 1.5, 1.5), depthWrite: false })
    );
    dash.position.set(-0.42, 1.07, -0.7);
    dash.rotation.x = -0.75;
    this.model.body.add(dash);

    this.passengers = SEATS.map(([x, y, z]) => {
      const { group: g, eyes } = buildRider(0.95);
      g.position.set(x, y, z);
      g.visible = false;
      g.userData = { eyes, look: Math.random() * 6 };
      this.model.body.add(g);
      return g;
    });
  }

  /** Draw what the side mirror sees (only from the driver's seat, before the frame is rendered). */
  renderMirror(renderer, scene) {
    if (!this.inside) return;
    this.mirrorCam.updateMatrixWorld();
    this.mirror.visible = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.mirrorTarget);
    renderer.render(scene, this.mirrorCam);
    renderer.setRenderTarget(prev);
    this.mirror.visible = true;
  }

  /**
   * The red wash the tail lamps throw on the road has moods: it breathes, it
   * flickers like a tired bulb, it eases on, it fades out and stays dark a while.
   * Each mood lasts a few seconds, then it drifts into another. Returns 0..1.
   */
  tailMood(dt) {
    const M = this.mood || (this.mood = { kind: 'breathe', t: 0, dur: 6, k: 1, period: 4.5, hold: 0 });
    M.t += dt;
    if (M.t > M.dur) {
      const moods = ['breathe', 'breathe', 'flicker', 'rise', 'fade', 'dark', 'steady'];
      let next = moods[Math.floor(Math.random() * moods.length)];
      if (next === M.kind) next = 'breathe';
      Object.assign(M, { kind: next, t: 0, dur: 3.5 + Math.random() * 6, period: 3 + Math.random() * 4, from: M.k });
    }
    let target;
    let rate = 3;
    switch (M.kind) {
      case 'breathe': target = 0.5 - 0.5 * Math.cos((M.t / M.period) * Math.PI * 2 + Math.PI); rate = 6; break;
      case 'flicker':
        // a loose connection: mostly on, dropping out in stutters
        M.hold -= dt;
        if (M.hold <= 0) { M.flick = Math.random() < 0.35 ? 0.04 : 0.55 + Math.random() * 0.45; M.hold = 0.03 + Math.random() * 0.12; }
        target = M.flick;
        rate = 40;
        break;
      case 'rise': target = Math.min(1, M.t / 3); rate = 4; break;
      case 'fade': target = Math.max(0, 1 - M.t / 3); rate = 4; break;
      case 'dark': target = 0; rate = 2; break;
      default: target = 0.85;
    }
    M.k += (target - M.k) * Math.min(1, dt * rate);
    // while it's out, the puddles rearrange: it comes back on a different patch of road
    if (M.k < 0.04 && !M.reshuffled) {
      M.reshuffled = true;
      const old = this.tailGlow.material.map;
      this.tailGlow.material.map = stainTexture();
      old.dispose();
    }
    if (M.k > 0.2) M.reshuffled = false;
    return M.k;
  }

  /** 0 right after a wipe, rising toward 1 as rain builds back up. */
  glassWetness(time) {
    return Math.min(1, (time - this.lastWipe) / 2.4);
  }

  setPassengers(n) {
    this.passengers.forEach((p, i) => { p.visible = i < n; });
  }

  sync(v, time, dt) {
    const m = this.model;
    for (const g of this.glassMeshes) g.material = this.inside ? this.glassIn : this.glassOut;
    this.mirror.visible = this.inside; // only rendered from the driver's seat
    m.root.position.copy(v.pos);
    m.root.position.y = v.rideY ?? v.pos.y;
    m.root.rotation.set(v.airPitch + (v.groundPitch || 0), -v.yaw, v.airRoll);
    m.body.position.y = v.bodyY + v.liftY;
    m.body.rotation.set(v.pitch + v.liftPitch, 0, v.roll + v.liftRoll);

    // wheels hang as the body flies (lowrider rams fully extended)
    const droop = v.airborne ? Math.min(0.35, v.airTime * 1.2) : 0;
    m.wheels.forEach((w, i) => {
      // a popped corner tops out its ram and pulls the tire off the ground
      w.position.y = WHEEL_RADIUS - droop * 0.4 + v.wheelLift(i);
      w.rotation.x = -v.wheelSpin;
      if (i < 2) w.rotation.y = -v.steer * 0.45;
      const ram = m.rams[i];
      const top = 0.5 + v.bodyY + v.corners[i].y + (i < 2 ? -1 : 1) * v.pitch * 1.8;
      const bottom = w.position.y;
      ram.position.y = (top + bottom) / 2;
      ram.scale.y = Math.max(0.05, top - bottom);
    });

    // the wheel turns with the steering; the hand rides it, the forearm follows
    const st = m.steering;
    st.spin.rotation.z = v.steer * 1.9;
    st.wrist.getWorldPosition(this._wrist || (this._wrist = new THREE.Vector3()));
    m.body.worldToLocal(this._wrist);
    const elbow = solveElbow(st.shoulder, this._wrist, st.upperLen, st.foreLen, st.pole);
    limb(st.upper, st.shoulder, elbow);
    limb(st.forearm, elbow, this._wrist);
    st.elbowJoint.position.copy(elbow);
    st.shoulderJoint.position.copy(st.shoulder);

    // the driver glances toward the turn, and at the sky when you fly
    const d = m.driver;
    d.rotation.y += ((-v.steer * 0.35) - d.rotation.y) * Math.min(1, dt * 4);
    d.rotation.x += ((v.airborne ? 0.12 : 0) - d.rotation.x) * Math.min(1, dt * 3);

    const flick = Math.sin(time * 31) > 0.6 && Math.sin(time * 2.3) > 0.2 ? 0.25 : 1;
    m.headlights[0].material.color.setRGB(1.6 * flick, 1.35 * flick, 0.95 * flick);
    this.beam.intensity = 22 * (0.78 + 0.22 * flick);
    this.beams[0].material.uniforms.uStrength.value = 0.16 * flick;
    this.beams[1].material.uniforms.uStrength.value = 0.16;
    this.tailGlow.material.opacity = 0.12 * this.tailMood(dt) * THREE.MathUtils.clamp(1 - Math.abs(v.pos.y - v.groundY) / 2.5, 0, 1);

    // wipers: a sweep every few seconds; returns how clear the glass is (0 = just wiped)
    // wipers only run when it's actually raining; they park otherwise
    if (this.raining || this.wipePhase < 1) this.wipePhase += dt / 1.1;
    if (this.wipePhase > 2.6) { this.wipePhase = 0; this.lastWipe = time; }
    const sweep = this.wipePhase < 1 ? Math.sin(this.wipePhase * Math.PI) : 0;
    for (const b of this.wipers.blades) b.rotation.z = Math.PI / 2 - 0.08 - sweep * 1.75;

    for (const p of this.passengers) {
      if (!p.visible) continue;
      p.rotation.y = Math.sin(time * 0.3 + p.userData.look) * 0.5;
      const blink = Math.sin(time * 0.9 + p.userData.look * 9) > 0.98 ? 0.05 : 1;
      p.userData.eyes.forEach((e) => { e.scale.y = blink; });
    }
  }
}
