// Arcade lowrider physics. Goals from Swink: instant response (the squat starts
// the frame you press), organic arcs (gravity changes with intent), and a
// landing that always reads clearly (big slam = big pulse).
import * as THREE from 'three';
import { CAR, ROAD } from '../config.js';
import { project, sample, elevation, gapAt, hasBarrier, forkOpen, LOOP_LEN } from '../world/track.js';
import { shove } from '../world/bodies.js';

const HW = ROAD.HALF_WIDTH;
const CAR_HALF_W = 1.05;
const BARRIER_H = 0.95;
const F = new THREE.Vector3();
const R = new THREE.Vector3();
const S = {};
const CREST_LIFT = 21; // m/s²: lighter than a fall, so good crests give a moment of float

const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export class Vehicle {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.steer = 0;
    this.s = 0;
    this.d = 0;
    this.airborne = false;
    this.airTime = 0;
    this.charge = 0;
    this.charging = false;
    this.chargeSide = 0;
    this.chargeNose = 0;
    // body springs (visual + feel)
    this.bodyY = 0; this.bodyVY = 0;
    this.pitch = 0; this.pitchV = 0;
    this.roll = 0; this.rollV = 0;
    this.airPitch = 0; this.airPitchV = 0;
    this.airRoll = 0;
    this.wheelSpin = 0;
    this.groundY = 0;
    this.offDeck = false;
    // four hydraulic corners: front-left, front-right, rear-left, rear-right
    this.corners = [0, 1, 2, 3].map(() => ({ y: 0, v: 0, popping: false }));
    this.liftY = 0;
    this.liftPitch = 0;
    this.liftRoll = 0;
    this.pumping = 0;
    this.chargeTime = 0;
    // the street: set by the game to answer "is there ground under (x, z)?"
    this.street = { contains: () => false };
    this.spurs = [];       // off-ramps (set by the game)
    this.spurHit = null;
    this.prevGround = NaN;
    this.prevGV = 0;
  }

  /** Put the car anywhere (in the district, say), facing yaw. */
  placeAt(x, y, z, yaw, speed = 0) {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.vel.set(Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed);
    // find the nearest stretch of road from a handful of starting guesses round the loop
    let best = null;
    for (let k = 0; k < 24; k++) {
      const p = project(x, z, (k / 24) * LOOP_LEN);
      const miss = Math.abs(p.d) + (p.ok ? 0 : 1e4);
      if (!best || miss < best.miss) best = { s: p.s, miss };
    }
    this.s = best.s;
    this.airborne = y > 0.05;
    this.rideOff = 0; this.prevY = undefined; this.prevClimb = 0;
    this.airPitch = this.airPitchV = this.airRoll = 0;
    this.offDeck = false;
    this.charge = 0;
    this.charging = false;
  }

  reset(s, d = 0, drop = 0, speed = 14) {
    sample(s, S);
    this.s = s;
    this.yaw = S.heading;
    this.pos.set(S.x + S.nx * d, S.y + drop, S.z + S.nz * d);
    this.vel.set(S.tx * speed, 0, S.tz * speed);
    this.airborne = drop > 0;
    this.rideOff = 0; this.prevY = undefined; this.prevClimb = 0;
    this.airPitch = this.airPitchV = this.airRoll = 0;
    this.offDeck = false;
    this.charge = 0;
    this.charging = false;
  }

  get forward() { return F.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }

  /** @returns events: { slam, scrape, bump, launch } */
  update(dt, input) {
    const ev = { slam: null, scrape: 0, bump: null, launch: null, chargeStart: false, pop: null };
    const f = F.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = R.set(Math.cos(this.yaw), 0, Math.sin(this.yaw));

    // steering wheel: fast attack, softer release
    const steerRate = Math.abs(input.steer) > Math.abs(this.steer) ? CAR.STEER_RESPONSE : CAR.STEER_RETURN;
    this.steer = approach(this.steer, input.steer, steerRate, dt);

    const p = project(this.pos.x, this.pos.z, this.s);
    if (p.ok) this.s = p.s;
    this.d = p.ok ? p.d : Infinity;
    const gap = gapAt(p.s);
    const deckY = elevation(p.s);
    const onRoadPlan = p.ok && !gap && Math.abs(p.d) < HW + 0.8;

    if (!this.airborne) this.driveGround(dt, input, f, r, ev);
    else this.flyAir(dt, input, ev);

    const y0 = this.pos.y; // where we were before this step: a fast drop must not tunnel through a road
    this.pos.addScaledVector(this.vel, dt);

    // ---- ground: the deck when you're on it, the street when you're down in the district,
    // or an off-ramp out across one of the pocket worlds
    const street = this.street.contains(this.pos.x, this.pos.z) ? 0 : -Infinity;
    // a surface counts if you're near it now, or were on/above it a moment ago (no falling through)
    const above = (y) => this.pos.y > y - 2.5 || y0 >= y - 0.4;
    // a log jam across the deck: the stacked face stops you dead unless you're over it
    let deckTop = deckY;
    const logH = this.logJam && onRoadPlan ? this.logJam.height(p.s) : 0;
    if (logH > 0) {
      const top = deckY + logH;
      if (this.logJam.isWall(p.s) && y0 < top - 0.3 && this.pos.y < top - 0.3) {
        this.pos.x -= this.vel.x * dt * 1.5;
        this.pos.z -= this.vel.z * dt * 1.5;
        this.vel.x *= -0.2; this.vel.z *= -0.2;
        this.hitLogs = true;
      } else if (y0 >= top - 0.6 || this.pos.y >= top - 0.6) deckTop = top;
    }
    const deck = onRoadPlan && above(deckTop) ? deckTop : -Infinity;
    let spurHit = null;
    for (const sp of this.spurs) {
      const h = sp.query(this.pos.x, this.pos.z, this.pos.y);
      // only a road you're actually on (or just above): not one running far below, whose walls would trap you
      if (h && Math.abs(h.d) < HW + 0.8 && above(h.y) && this.pos.y < h.y + 12 && (!spurHit || h.y > spurHit.y)) spurHit = h;
    }
    const ramp = spurHit ? spurHit.y : -Infinity;
    const ground = Math.max(street, deck, ramp);
    this.spurHit = spurHit;
    // out on a ramp, the loop position follows the ramp so the world streams around you
    if (spurHit && !onRoadPlan) this.s = spurHit.spur.ringS(spurHit.t);
    this.groundY = Number.isFinite(ground) ? ground : deckY;
    // cresting a hill fast: if the road drops away faster than a light float, the car leaves it
    if (!this.airborne && Number.isFinite(ground) && Number.isFinite(this.prevGround)) {
      const gv = (ground - this.prevGround) / dt;
      if (Math.abs(gv) < 25 && this.prevGV - gv > CREST_LIFT * dt && this.prevGV > -3 && this.speed > 18) {
        this.airborne = true;
        this.airTime = 0;
        this.vel.y = this.prevGV;
        this.pos.y = this.prevGround + this.prevGV * dt;
      }
      this.prevGV = Math.abs(gv) < 25 ? gv : 0;
    }
    this.prevGround = this.airborne ? NaN : ground;
    if (this.pos.y <= ground) {
      if (this.airborne) this.land(ev, f);
      this.pos.y = ground;
      this.vel.y = 0;
      this.airborne = false;
    } else if (!this.airborne && this.pos.y > ground + 0.05) {
      // drove off the end of something: fall (a short drop onto the street, usually)
      if (this.pos.y - ground < 0.35) this.pos.y = ground; // just a ramp lip — stay planted
      else { this.airborne = true; this.airTime = 0; }
    }

    // ---- jersey barriers: low walls in town (hop them), tall invisible fences over the void
    if (p.ok && !gap && hasBarrier(p.s) && !forkOpen(p.s, Math.sign(p.d)) && this.pos.y > deckY - 1.5) {
      const overVoid = !this.street.contains(this.pos.x, this.pos.z, 25);
      const wallTop = deckY + (overVoid ? 9 : BARRIER_H + 0.2);
      const lim = HW - CAR_HALF_W;
      if (this.pos.y < wallTop && Math.abs(p.d) > lim && Math.abs(p.d) < HW + 1.5) {
        sample(p.s, S);
        const side = Math.sign(p.d);
        const push = Math.abs(p.d) - lim;
        this.pos.x -= S.nx * side * push;
        this.pos.z -= S.nz * side * push;
        const into = this.vel.x * S.nx * side + this.vel.z * S.nz * side;
        if (into > 0) {
          this.vel.x -= S.nx * side * into * 1.35;
          this.vel.z -= S.nz * side * into * 1.35;
          ev.scrape = Math.min(1, into / 8 + this.speed / 60);
          this.vel.multiplyScalar(1 - Math.min(0.25, into * 0.02));
          this.rollV -= side * into * 0.4;
        } else {
          ev.scrape = Math.max(ev.scrape, this.speed > 6 && this.pos.y < deckY + 1.2 ? 0.15 : 0);
        }
      }
    }
    // ---- off-ramp walls: invisible-tall over the void, from where it leaves the highway to where it rejoins
    if (spurHit && spurHit.spur.walled(spurHit.t, Math.sign(spurHit.d))) {
      const lim = HW - CAR_HALF_W;
      const d = spurHit.d;
      if (Math.abs(d) > lim && this.pos.y < spurHit.y + 9) {
        const side = Math.sign(d);
        const push = Math.abs(d) - lim;
        this.pos.x -= spurHit.nx * side * push;
        this.pos.z -= spurHit.nz * side * push;
        const into = this.vel.x * spurHit.nx * side + this.vel.z * spurHit.nz * side;
        if (into > 0) {
          this.vel.x -= spurHit.nx * side * into * 1.35;
          this.vel.z -= spurHit.nz * side * into * 1.35;
          ev.scrape = Math.min(1, into / 8 + this.speed / 60);
          this.vel.multiplyScalar(1 - Math.min(0.25, into * 0.02));
        }
      }
    }
    this.onRoad = (onRoadPlan && this.pos.y > deckY - 1.5) || !!spurHit;
    this.offDeck = !Number.isFinite(ground) && this.pos.y < (spurHit ? spurHit.y : deckY) - 6;

    this.updateSprings(dt);
    this.settleAttitude(dt);
    this.updateCorners(dt, input, ev);
    this.wheelSpin += (this.vel.dot(f) / 0.37) * dt;
    this.easeSteps(dt);
    this.followSlope(dt, f, onRoadPlan && this.pos.y > deckY - 2.5 ? p.s : null);
    return ev;
  }

  /**
   * Tilt with the road: nose up a climb, nose down a drop, so the body sits on
   * the surface instead of floating over crests and sinking into dips.
   */
  followSlope(dt, f, deckS) {
    let want = 0;
    if (!this.airborne) {
      const h = this.spurHit;
      let ahead;
      let behind;
      if (h) {
        const sp = h.spur;
        const A = sp.sample(h.t);
        const dir = Math.sign(A.tx * f.x + A.tz * f.z) || 1;
        ahead = sp.sample(h.t + dir * 1.8).y;
        behind = sp.sample(h.t - dir * 1.8).y;
      } else if (deckS !== null) {
        const A = sample(deckS);
        const dir = Math.sign(A.tx * f.x + A.tz * f.z) || 1;
        ahead = elevation(deckS + dir * 1.8);
        behind = elevation(deckS - dir * 1.8);
      }
      want = ahead === undefined ? 0 : Math.atan2(ahead - behind, 3.6);
    }
    // in the air the flight's own attitude takes over; let the road's tilt go gently
    this.groundPitch = (this.groundPitch || 0) + (want - (this.groundPitch || 0)) * Math.min(1, dt * (this.airborne ? 3 : 14));
  }

  /**
   * Curbs, ramp lips and seams snap pos.y in one frame. What you see (body and
   * camera) takes the step over a few frames instead; physics is untouched.
   */
  easeSteps(dt) {
    // compare against last frame's climb, so a steady hill never counts as a step
    const climb = this.pos.y - (this.prevY ?? this.pos.y);
    const jump = climb - (this.prevClimb || 0);
    this.prevY = this.pos.y;
    // a step is a one-frame event: the next frame compares against level ground again
    this.prevClimb = this.airborne || Math.abs(jump) > 0.06 ? 0 : climb;
    const grounded = !this.airborne && !this.wasAirborne;
    this.wasAirborne = this.airborne;
    if (grounded && Math.abs(jump) > 0.06 && Math.abs(jump) < 1.2) this.rideOff = (this.rideOff || 0) - jump;
    this.rideOff = THREE.MathUtils.clamp((this.rideOff || 0) * Math.exp(-dt * 12), -1.2, 1.2);
    this.rideY = this.pos.y + this.rideOff;
  }

  driveGround(dt, input, f, r, ev) {
    let vf = this.vel.dot(f);
    let vr = this.vel.dot(r);
    const accel0 = vf;

    if (input.throttle > 0) vf += CAR.ACCEL * input.throttle * Math.max(0, 1 - vf / CAR.MAX_SPEED) ** 0.6 * dt;
    if (input.brake > 0) {
      if (vf > 0.5) vf -= CAR.BRAKE * dt;
      else vf = Math.max(-CAR.REVERSE_SPEED, vf - CAR.ACCEL * 0.6 * dt);
    }
    if (!input.throttle && !input.brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), CAR.ROLL_FRICTION * dt);
    vf -= vf * Math.abs(vf) * CAR.DRAG * 0.004 * dt;

    const grip = Math.abs(this.steer) > 0.7 && vf > 26 ? CAR.GRIP_DRIFT : CAR.GRIP;
    vr *= Math.exp(-grip * dt);

    const speedFactor = THREE.MathUtils.clamp(vf / 7, -1, 1) * (1 - 0.5 * Math.min(1, Math.abs(vf) / CAR.MAX_SPEED));
    this.yaw += this.steer * CAR.STEER_RATE * speedFactor * dt;

    const f2 = F.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r2 = R.set(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    this.vel.set(f2.x * vf + r2.x * vr, 0, f2.z * vf + r2.z * vr);

    // weight transfer feeds the body springs
    this.pitchV += ((vf - accel0) / dt) * -0.0035;
    this.rollV += this.steer * vf * 0.004;

    // ---- hydraulics: squat while held, launch on release
    // a tap pops a corner (front, or rear with S, or a side with A / D); a hold charges the jump
    if (input.hopPressed || (this.hopQueued && input.hopHeld)) {
      this.hopQueued = false;
      this.charging = true;
      this.charge = 0;
      this.chargeTime = 0;
      this.bodyVY -= 2.2; // the dump before the pop: instant visible response
      ev.chargeStart = true;
    }
    if (this.charging) {
      this.chargeTime += dt;
      this.charge = this.chargeTime < CAR.TAP_TIME ? 0 : Math.min(1, (this.chargeTime - CAR.TAP_TIME) / CAR.CHARGE_TIME);
      this.chargeSide = approach(this.chargeSide, input.steer, 8, dt);
      this.chargeNose = approach(this.chargeNose, input.throttle - input.brake, 8, dt);
      if (!input.hopHeld) {
        // a plain tap is a light hop of the whole car; tap with S / A / D pops that end or side
        const aimed = input.brake > 0 || Math.abs(input.steer) > 0.3;
        if (this.chargeTime < CAR.TAP_TIME && aimed) this.pop(input, ev);
        else if (this.chargeTime < CAR.TAP_TIME) this.hop(ev);
        else this.launch(f2, r2, ev);
      }
    }
  }

  /** Throw one end (or one side) of the car up on the rams. */
  pop(input, ev) {
    this.charging = false;
    this.charge = 0;
    let which = [0, 1];                                 // front
    if (input.brake > 0) which = [2, 3];                // rear
    else if (input.steer < -0.3) which = [0, 2];        // left side
    else if (input.steer > 0.3) which = [1, 3];         // right side
    for (const i of which) {
      this.corners[i].v += CAR.POP_SPEED * (0.9 + Math.random() * 0.2);
      this.corners[i].popping = true;
    }
    ev.pop = { which };
  }

  /** The light hop: all four rams at once, a little air, a soft landing. */
  hop(ev) {
    this.vel.y = CAR.TAP_HOP;
    this.bodyVY += 5;
    this.airborne = true;
    this.airTime = 0;
    this.charging = false;
    this.charge = 0;
    ev.launch = { charge: 0.05, side: 0 };
  }

  launch(f, r, ev) {
    const c = Math.max(0.12, this.charge);
    const up = THREE.MathUtils.lerp(CAR.HOP_MIN, CAR.HOP_MAX, c ** 0.85);
    this.vel.y = up;
    this.vel.addScaledVector(r, this.chargeSide * CAR.SIDE_HOP * c);
    this.airPitchV += this.chargeNose * 0.35 * c; // a nudge of attitude, not a flip
    this.airRoll = 0;
    this.bodyVY += 6 + 6 * c;
    this.airborne = true;
    this.airTime = 0;
    this.charging = false;
    ev.launch = { charge: c, side: this.chargeSide };
    this.charge = 0;
  }

  flyAir(dt, input, ev) {
    this.airTime += dt;
    const rising = this.vel.y > 0;
    const g = rising ? (input.hopHeld ? CAR.RISE_GRAVITY_HELD : CAR.GRAVITY) : CAR.FALL_GRAVITY;
    this.vel.y -= g * dt;
    // air control: a little yaw spin and nose attitude, like leaning in your seat
    this.yaw += input.steer * CAR.AIR_YAW * dt * 0.6;
    // attitude follows the arc: nose lifts on the way up, dips on the way down, never flips.
    // (W is how you keep driving, so it must not tip the car — S just tucks the nose a touch.)
    const arc = THREE.MathUtils.clamp(this.vel.y * 0.02, -0.28, 0.28) - input.brake * 0.08;
    this.airPitchV += ((arc - this.airPitch) * 16 - this.airPitchV * 5) * dt;
    this.airPitch += this.airPitchV * dt;
    this.airRoll = approach(this.airRoll, -input.steer * 0.25, 3, dt);
    this.charging = false;
    // press early and the switch is armed for the moment you touch down
    if (input.hopPressed && this.vel.y < 0) this.hopQueued = true;
    if (!input.hopHeld) this.hopQueued = false;
  }

  land(ev, f) {
    const impact = -this.vel.y;
    const vh = Math.hypot(this.vel.x, this.vel.z);
    const align = vh > 1 ? Math.abs((this.vel.x * f.x + this.vel.z * f.z) / vh) : 1;
    const attitude = Math.abs(Math.sin(this.airPitch));
    const clean = THREE.MathUtils.clamp(align - attitude * 1.4, 0, 1);
    // velocity snaps toward where the car points (rubber bites)
    const keep = 0.55 + 0.45 * clean;
    const fv = (this.vel.x * f.x + this.vel.z * f.z);
    this.vel.x = f.x * fv * keep + this.vel.x * (1 - keep) * 0.6;
    this.vel.z = f.z * fv * keep + this.vel.z * (1 - keep) * 0.6;
    this.bodyVY -= impact * 0.55;
    // the body takes the hit and rocks; leftover attitude settles over a beat, never snaps
    this.pitchV += THREE.MathUtils.clamp(this.airPitch, -0.3, 0.3) * 4;
    this.airPitchV *= 0.25;
    if (impact < 2.5) return; // a soft touchdown off a hill crest: a bounce, not a slam
    ev.slam = {
      x: this.pos.x, y: this.groundY, z: this.pos.z,
      impact, clean, airTime: this.airTime,
      strength: THREE.MathUtils.clamp(impact / 14, 0.25, 1.25) * (0.7 + 0.3 * clean),
    };
  }

  /** Corner rams: held lifts pump toward a height, pops fly and drop back with a bang. */
  updateCorners(dt, input, ev) {
    const target = [0, 0, 0, 0];
    if (input.liftFront) { target[0] += CAR.LIFT_FRONT; target[1] += CAR.LIFT_FRONT; }
    if (input.liftLeft) { target[0] += CAR.LIFT_SIDE; target[2] += CAR.LIFT_SIDE; }
    if (input.liftRight) { target[1] += CAR.LIFT_SIDE; target[3] += CAR.LIFT_SIDE; }
    let pumping = 0;
    const slammed = [];
    this.corners.forEach((c, i) => {
      if (c.popping) {
        c.v -= 26 * dt;                                   // a popped end falls under its own weight
        c.v += (-(c.y - target[i]) * 10 - c.v * 0.6) * dt;
      } else {
        const err = target[i] - c.y;
        pumping = Math.max(pumping, Math.abs(err) > 0.02 ? 1 : 0);
        c.v += (err * CAR.POP_K - c.v * CAR.POP_D * 2) * dt;
      }
      c.y += c.v * dt;
      if (c.popping && c.y <= target[i] && c.v < 0) {
        if (c.v < -2) slammed.push(i);
        c.y = target[i];
        c.v = -c.v * 0.18;                                // a little bounce on the stops
        c.popping = false;
      }
      c.y = THREE.MathUtils.clamp(c.y, -0.1, 1.6);
    });
    if (slammed.length && !this.airborne) {
      const f = this.forward;
      const front = slammed.some((i) => i < 2);
      const k = front ? 1.8 : -1.85;
      ev.slam = ev.slam || {
        x: this.pos.x + f.x * k, y: this.groundY, z: this.pos.z + f.z * k,
        impact: 4, clean: 1, airTime: 0, strength: 0.38, pop: true,
      };
      this.pitchV += (front ? -1 : 1) * 1.2;
      this.bodyVY -= 1.2;
    }
    const c = this.corners.map((q) => q.y);
    this.liftY = (c[0] + c[1] + c[2] + c[3]) / 4;
    this.liftPitch = Math.atan2((c[0] + c[1]) / 2 - (c[2] + c[3]) / 2, 3.58);
    this.liftRoll = Math.atan2((c[1] + c[3]) / 2 - (c[0] + c[2]) / 2, 1.72);
    this.pumping = pumping;
  }

  /** How far each wheel leaves the ground: rams top out and the tire comes with them. */
  wheelLift(i) {
    return Math.max(0, this.corners[i].y - 0.55);
  }

  /** Back on the ground: any attitude from the air springs back to level. */
  settleAttitude(dt) {
    if (this.airborne) return;
    this.airPitchV += (-this.airPitch * 70 - this.airPitchV * 15) * dt;
    this.airPitch += this.airPitchV * dt;
    this.airRoll = approach(this.airRoll, 0, 6, dt);
  }

  updateSprings(dt) {
    const squat = this.charging ? -0.32 * this.charge : 0;
    const sideLean = this.charging ? this.chargeSide * 0.12 * this.charge : 0;
    const noseLean = this.charging ? -this.chargeNose * 0.08 * this.charge : 0;
    // body bob
    this.bodyVY += (-(this.bodyY - squat) * CAR.SUSP_K - this.bodyVY * CAR.SUSP_D) * dt;
    this.bodyY += this.bodyVY * dt;
    this.bodyY = THREE.MathUtils.clamp(this.bodyY, -0.42, 0.9);
    // pitch and roll
    this.pitchV += (-(this.pitch - noseLean) * 140 - this.pitchV * 10) * dt;
    this.pitch += this.pitchV * dt;
    this.rollV += (-(this.roll - sideLean) * 150 - this.rollV * 10) * dt;
    this.roll += this.rollV * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.2, 0.2);
    this.roll = THREE.MathUtils.clamp(this.roll, -0.18, 0.18);
  }

  /** Front & rear contact circles for obstacle tests. */
  circles() {
    const f = this.forward;
    return [
      { x: this.pos.x + f.x * 1.55, z: this.pos.z + f.z * 1.55, r: 1.1 },
      { x: this.pos.x - f.x * 1.55, z: this.pos.z - f.z * 1.55, r: 1.1 },
    ];
  }

  /** Push out of round obstacles (wrecks, parked doubles). Hop high enough and you clear them. */
  collide(colliders, ev) {
    for (const c of colliders) {
      if (this.pos.y > c.y + 1.45) continue;
      for (const k of this.circles()) {
        const dx = k.x - c.x;
        const dz = k.z - c.z;
        const dist = Math.hypot(dx, dz);
        const min = k.r + c.r;
        if (dist >= min || dist < 1e-4) continue;
        const nx = dx / dist;
        const nz = dz / dist;
        const push = min - dist;
        this.pos.x += nx * push;
        this.pos.z += nz * push;
        const into = -(this.vel.x * nx + this.vel.z * nz);
        if (into > 0) {
          const give = c.body ? 0.75 : 1.3; // movable things soak up the hit
          this.vel.x += nx * into * give;
          this.vel.z += nz * into * give;
          this.vel.multiplyScalar(c.body ? 0.9 : 0.82);
          if (c.body) shove(c, nx, nz, into);
          this.yaw += (Math.random() - 0.5) * 0.25 * Math.min(1, into / 10);
          this.pitchV -= into * 0.12;
          this.bodyVY += into * 0.1;
          if (!ev.bump || ev.bump.force < into) ev.bump = { force: into, x: c.x, z: c.z };
        }
      }
    }
  }
}
