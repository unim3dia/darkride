// Three ways to watch the ride:
//  CHASE  – low and wide, like the hero shots in the references
//  HERO   – out ahead, looking back at the driver through the glass
//  CABIN  – behind the wheel, gauges glowing
import * as THREE from 'three';

export const VIEWS = ['chase', 'hero', 'cabin'];

const tmp = new THREE.Vector3();
const look = new THREE.Vector3();
const ride = new THREE.Vector3();

function noise1(t) {
  return Math.sin(t * 1.0) * 0.5 + Math.sin(t * 2.31 + 1.3) * 0.3 + Math.sin(t * 5.7 + 0.2) * 0.2;
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.view = 0;
    this.pos = new THREE.Vector3(0, 20, 20);
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.trauma = 0;
    this.fovKick = 0;
    this.blend = 1;
    this.t = 0;
  }

  get name() { return VIEWS[this.view]; }

  cycle() {
    this.view = (this.view + 1) % VIEWS.length;
    this.blend = 0;
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt, v, model) {
    // a scripted shot (used for trailers): someone else is holding the camera
    if (this.cine) {
      model.driver.visible = true;
      this.cine(this.camera, v, dt);
      this.camera.updateProjectionMatrix();
      return;
    }
    this.t += dt;
    // follow the eased ride height so curbs and seams don't kick the frame
    const vp = ride.copy(v.pos);
    vp.y = v.rideY ?? v.pos.y;
    const f = v.forward.clone();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const speed = v.speed;
    const carY = vp.y + v.bodyY;
    let desired;
    let fov;
    let stiffness;

    if (this.name === 'cabin') {
      model.driver.getWorldPosition(tmp);
      // in the driver's own seat, close behind the wheel: the windshield, the side glass, the mirror
      desired = tmp.clone().addScaledVector(f, 0.12).addScaledVector(r, -0.02).add(new THREE.Vector3(0, 0.04, 0));
      look.copy(desired).addScaledVector(f, 20).addScaledVector(r, -3.0).y += -3.6 + v.airPitch * -8;
      fov = 64 + speed * 0.1;
      stiffness = 60;
      model.driver.visible = false;
      // the arm is only a sleeve and a hand from here
      const st = model.steering;
      st.upper.visible = st.shoulderJoint.visible = st.elbowJoint.visible = false;
    } else if (this.name === 'hero') {
      { const st = model.steering; st.upper.visible = st.shoulderJoint.visible = st.elbowJoint.visible = true; }
      desired = vp.clone().addScaledVector(f, 8.5 + speed * 0.06).addScaledVector(r, -4.2).setY(carY + 1.1);
      look.copy(vp).addScaledVector(f, 0.5).setY(carY + 1.0);
      fov = 50;
      stiffness = 14;
      model.driver.visible = true;
    } else {
      { const st = model.steering; st.upper.visible = st.shoulderJoint.visible = st.elbowJoint.visible = true; }
      // (somewhere tight, like the cave, it pulls in close behind you)
      const back = (7.8 + speed * 0.05 + (v.airborne ? 1.5 : 0)) * (1 - 0.42 * (this.close || 0));
      // set off to the right of the car: a three-quarter view down its flank, not a dead-center bumper shot
      // (in the herd's country: lower and looking up, so the beasts take the frame)
      const h = this.herd || 0;
      desired = vp.clone().addScaledVector(f, -back).addScaledVector(r, 1.8 * (1 - 0.4 * (this.close || 0))).setY(carY + 2.0 - h * 0.7 - (this.close || 0) * 0.6 + (v.airborne ? 0.9 : 0));
      look.copy(vp).addScaledVector(f, 7).addScaledVector(r, 0.2).setY(carY + 1.1 + h * 2.6);
      fov = 56 + speed * 0.32;
      stiffness = 7;
      model.driver.visible = true;
    }

    // Spring the camera's offset *relative to the car*, not its world position:
    // swing and settle without trailing 20m behind at speed.
    const offset = desired.clone().sub(vp);
    if (this.offset === undefined || this.offset.distanceTo(offset) > 40) {
      this.offset = offset.clone();
      this.offsetVel = new THREE.Vector3();
      this.target.copy(look);
    }
    const k = stiffness * (this.blend < 1 ? 3 : 1) * 4;
    this.blend = Math.min(1, this.blend + dt * 2);
    const w = Math.sqrt(k) * 2;
    const acc = offset.sub(this.offset).multiplyScalar(k).addScaledVector(this.offsetVel, -w);
    this.offsetVel.addScaledVector(acc, dt);
    this.offset.addScaledVector(this.offsetVel, dt);
    this.pos.copy(vp).add(this.offset);
    if (this.name === 'cabin') this.pos.copy(desired);
    else if (this.clip) {
      // pull in front of walls; ease back out so it doesn't pop
      const pivot = vp.clone().setY(vp.y + 1.4);
      const wanted = this.pos.clone();
      const safe = this.clip(pivot, wanted);
      const want = safe.distanceTo(pivot) / Math.max(0.01, wanted.distanceTo(pivot));
      this.reach = Math.min(want, (this.reach ?? 1) + dt * 0.8);
      // never pull in closer than the car's own bodywork
      const minReach = Math.min(1, 3.6 / Math.max(0.01, wanted.distanceTo(pivot)));
      this.pos.copy(pivot).lerp(wanted, Math.max(minReach, this.reach));
    }
    // look target leads slightly so turns feel anticipated
    const lookRel = look.clone().sub(vp);
    this.lookRel = this.lookRel ? this.lookRel.lerp(lookRel, 1 - Math.exp(-dt * (this.name === 'cabin' ? 40 : 8))) : lookRel;
    this.target.copy(vp).add(this.lookRel);

    // trauma-based shake: squared so small bumps whisper and big ones shout
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const s = this.trauma * this.trauma;
    const t = this.t * 22;
    this.camera.position.copy(this.pos).add(new THREE.Vector3(noise1(t) * s * 0.5, noise1(t + 40) * s * 0.4, noise1(t + 80) * s * 0.5));
    this.camera.lookAt(this.target);
    this.camera.rotateZ(noise1(t + 120) * s * 0.06 - v.steer * 0.02 * Math.min(1, speed / 20));
    // an operator, not a tripod: slow breathing drift, plus the road buzzing through the mount
    const hand = this.name === 'cabin' ? 0.0025 : 0.005;
    this.camera.rotateY(noise1(this.t * 0.37 + 7) * hand);
    this.camera.rotateX(noise1(this.t * 0.29 + 3) * hand * 0.8);
    if (!v.airborne && this.name !== 'hero') {
      const buzz = Math.min(1, speed / 35) * 0.0007;
      this.camera.rotateX(noise1(this.t * 9 + 11) * buzz);
      this.camera.rotateY(noise1(this.t * 7 + 23) * buzz * 0.6);
    }

    this.fovKick *= Math.exp(-dt * 5);
    const fovTarget = fov + this.fovKick;
    this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
  }
}
