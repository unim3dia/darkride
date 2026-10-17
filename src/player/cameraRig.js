// Three ways to watch the ride:
//  CHASE  – low and wide, like the hero shots in the references
//  HERO   – out ahead, looking back at the driver through the glass
//  CABIN  – behind the wheel, gauges glowing
import * as THREE from 'three';

export const VIEWS = ['chase', 'hero', 'cabin'];

const tmp = new THREE.Vector3();
const look = new THREE.Vector3();

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
    this.t += dt;
    const f = v.forward.clone();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const speed = v.speed;
    const carY = v.pos.y + v.bodyY;
    let desired;
    let fov;
    let stiffness;

    if (this.name === 'cabin') {
      model.driver.getWorldPosition(tmp);
      desired = tmp.clone().addScaledVector(f, -0.05).add(new THREE.Vector3(0, 0.12, 0));
      look.copy(desired).addScaledVector(f, 20).y += -1.2 + v.airPitch * -8;
      fov = 72 + speed * 0.15;
      stiffness = 60;
      model.driver.visible = false;
    } else if (this.name === 'hero') {
      desired = v.pos.clone().addScaledVector(f, 8.5 + speed * 0.06).addScaledVector(r, -4.2).setY(carY + 1.1);
      look.copy(v.pos).addScaledVector(f, 0.5).setY(carY + 1.0);
      fov = 50;
      stiffness = 14;
      model.driver.visible = true;
    } else {
      const back = 7.8 + speed * 0.05 + (v.airborne ? 1.5 : 0);
      // set off to the right of the car: a three-quarter view down its flank, not a dead-center bumper shot
      desired = v.pos.clone().addScaledVector(f, -back).addScaledVector(r, 1.8).setY(carY + 2.0 + (v.airborne ? 0.9 : 0));
      look.copy(v.pos).addScaledVector(f, 7).addScaledVector(r, 0.2).setY(carY + 1.1);
      fov = 56 + speed * 0.32;
      stiffness = 7;
      model.driver.visible = true;
    }

    // Spring the camera's offset *relative to the car*, not its world position:
    // swing and settle without trailing 20m behind at speed.
    const offset = desired.clone().sub(v.pos);
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
    this.pos.copy(v.pos).add(this.offset);
    if (this.name === 'cabin') this.pos.copy(desired);
    else if (this.clip) {
      // pull in front of walls; ease back out so it doesn't pop
      const pivot = v.pos.clone().setY(v.pos.y + 1.4);
      const wanted = this.pos.clone();
      const safe = this.clip(pivot, wanted);
      const want = safe.distanceTo(pivot) / Math.max(0.01, wanted.distanceTo(pivot));
      this.reach = Math.min(want, (this.reach ?? 1) + dt * 0.8);
      // never pull in closer than the car's own bodywork
      const minReach = Math.min(1, 3.6 / Math.max(0.01, wanted.distanceTo(pivot)));
      this.pos.copy(pivot).lerp(wanted, Math.max(minReach, this.reach));
    }
    // look target leads slightly so turns feel anticipated
    const lookRel = look.clone().sub(v.pos);
    this.lookRel = this.lookRel ? this.lookRel.lerp(lookRel, 1 - Math.exp(-dt * (this.name === 'cabin' ? 40 : 8))) : lookRel;
    this.target.copy(v.pos).add(this.lookRel);

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
      const buzz = Math.min(1, speed / 35) * 0.0016;
      this.camera.rotateX((Math.random() - 0.5) * buzz);
      this.camera.rotateY((Math.random() - 0.5) * buzz * 0.6);
    }

    this.fovKick *= Math.exp(-dt * 5);
    const fovTarget = fov + this.fovKick;
    this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
  }
}
