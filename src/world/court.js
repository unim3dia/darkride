// THE COURT, on the Block. A fenced lot beside the street with one live hoop, one
// dead one, and a ball. Roll into the ball slowly and it settles on the hood;
// hold the hop and let go and the car throws it: longer hold, longer shot.
// Someone in a hood is waiting courtside to play you at D-A-R-K: make a shot and
// it has to match it from your spot; when it makes one you match from the ring.
// Miss a match, take a letter. Spell DARK and you've lost.
import * as THREE from 'three';

const LEN = 28;          // half length of the lot, along the street
const FAR = -42;         // the far fence (across, negative = left of the street)
const NEAR = 6;          // the street's far kerb: the lot includes the street
const MID = -22;         // the court's centre line (across)
const R = 0.9;           // the ball
const RIM_R = 1.75;
const RIM_Y = 6.2;       // above the floor
const RIM_A = 20.5;      // the rim's centre, along
const BOARD_A = 22.3;
const FENCE_H = 5;
const G = 22;
const WORD = 'DARK';
const RING = 4.6;        // how close to the spot counts as "from the spot"

const clamp = THREE.MathUtils.clamp;

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#7a3a17'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; g.fillRect(Math.random() * 256, Math.random() * 128, 2, 2); }
  g.strokeStyle = '#140904'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.stroke();
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 128); g.stroke();
  for (const x of [64, 192]) { g.beginPath(); g.ellipse(x, 64, 35, 64, 0, 0, Math.PI * 2); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function courtTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#1c2026'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.4})`; g.fillRect(Math.random() * 512, Math.random() * 512, 3, 3); }
  g.strokeStyle = 'rgba(200,190,160,0.55)'; g.lineWidth = 4;
  // canvas x = along the court (hoop to hoop), y = across
  g.strokeRect(16, 16, 480, 480);
  g.beginPath(); g.moveTo(256, 16); g.lineTo(256, 496); g.stroke();
  g.beginPath(); g.arc(256, 256, 48, 0, Math.PI * 2); g.stroke();
  for (const [x, a0] of [[16, -Math.PI / 2], [496, Math.PI / 2]]) {
    g.beginPath(); g.arc(x, 256, 170, a0, a0 + Math.PI); g.stroke();   // the arc
    g.strokeRect(x === 16 ? 16 : 496 - 110, 256 - 60, 110, 120);        // the key
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(200,225,255,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Court {
  constructor(group, spur, tCourt) {
    this.group = group;
    const O = spur.sample(tCourt, {});
    this.O = O;
    this.floor = O.y + 0.06;
    this.tCourt = tCourt;
    const self = this;
    // the lot is flat ground the car can drive on, street included
    this.pad = { height(x, z) { const [a, c] = self.local(x, z); return Math.abs(a) < LEN && c > FAR && c < NEAR ? O.y + 0.03 : -Infinity; } };
    this.build();
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.mode = 'free';      // the ball: free | carried | gone
    this.cool = 0;
    this.game = { phase: 'off', you: 0, it: 0, spot: null, seq: null, wait: 0 };
    this.drawBoard();
  }

  /** World (x, z) → lot frame: a along the street, c across it (negative = into the court). */
  local(x, z) { const O = this.O; return [(x - O.x) * O.tx + (z - O.z) * O.tz, (x - O.x) * O.nx + (z - O.z) * O.nz]; }
  world(a, c, y = 0, out = new THREE.Vector3()) { const O = this.O; return out.set(O.x + O.tx * a + O.nx * c, this.floor + y, O.z + O.tz * a + O.nz * c); }

  /** Is this point of the street open onto the lot (so the street's own kerb shouldn't hold the car)? */
  open(x, z) { const [a, c] = this.local(x, z); return Math.abs(a) < LEN + 4 && c < 3; }

  build() {
    const O = this.O;
    const yaw = Math.atan2(O.tx, O.tz); // local +z = along
    // a mesh turned to `yaw` has its local z along the street and its local x across it
    const put = (mesh, a, c, y, ry = 0) => { this.world(a, c, y, mesh.position); mesh.rotation.y = yaw + ry; this.group.add(mesh); return mesh; };
    const steel = new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.55, metalness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 1 });
    // the lot's ground, and the painted court on it
    put(new THREE.Mesh(new THREE.PlaneGeometry(NEAR - FAR, LEN * 2).rotateX(-Math.PI / 2), dark), 0, (NEAR + FAR) / 2, -0.03);
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(48, 30).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }));
    put(paint, 0, MID, 0.01, -Math.PI / 2);
    // chain-link on three sides: posts and rails, and a faint wire sheet
    const wire = new THREE.MeshBasicMaterial({ color: 0x8a8f96, wireframe: true, transparent: true, opacity: 0.16 });
    const fence = (a0, c0, a1, c1) => {
      const len = Math.hypot(a1 - a0, c1 - c0);
      const ry = Math.atan2(c1 - c0, a1 - a0);
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(len, FENCE_H, Math.round(len / 0.9), 6), wire);
      put(sheet, (a0 + a1) / 2, (c0 + c1) / 2, FENCE_H / 2, Math.PI / 2 + ry);
      put(new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), steel), (a0 + a1) / 2, (c0 + c1) / 2, FENCE_H, Math.PI / 2 + ry);
      for (let k = 0; k <= len; k += 7) put(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, FENCE_H, 6), steel), a0 + ((a1 - a0) * k) / len, c0 + ((c1 - c0) * k) / len, FENCE_H / 2);
    };
    fence(-LEN, FAR, LEN, FAR);
    fence(-LEN, FAR, -LEN, -14); // the sides stop short of the street: that gap is the way out
    fence(LEN, FAR, LEN, -14);
    // the live hoop
    const hoop = (a, dir, alive) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, RIM_Y + 2.4, 8).translate(0, (RIM_Y + 2.4) / 2, 2.6), steel));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2.6).translate(0, RIM_Y + 1.6, 1.4), steel));
      const board = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.2, 0.18), new THREE.MeshStandardMaterial({ color: alive ? 0xcfd2d4 : 0x4a4c4e, roughness: 0.45, emissive: alive ? 0x1c1e20 : 0x000000 }));
      board.position.set(0, RIM_Y + 1.5, 0.1);
      g.add(board);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.09, 8, 28).rotateX(Math.PI / 2), alive ? new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.5, 0.15) }) : steel);
      rim.position.set(0, RIM_Y, -(BOARD_A - RIM_A));
      if (!alive) { rim.rotation.x = 0.7; rim.position.y -= 0.5; g.rotation.z = 0.06; } // bent down, somebody hung on it once
      g.add(rim);
      if (alive) {
        const net = new THREE.Mesh(new THREE.CylinderGeometry(RIM_R, RIM_R * 0.62, 1.9, 14, 3, true).translate(0, RIM_Y - 0.95, -(BOARD_A - RIM_A)), new THREE.MeshBasicMaterial({ color: 0xbbbbbb, wireframe: true, transparent: true, opacity: 0.5 }));
        g.add(net);
        this.net = net;
      }
      put(g, a, MID, 0, dir > 0 ? 0 : Math.PI);
    };
    hoop(BOARD_A, 1, true);
    hoop(-BOARD_A, -1, false);
    this.rim = this.world(RIM_A, MID, RIM_Y);
    // floodlights: two that still work, mostly
    this.lamps = [];
    for (const [a, on] of [[-13, true], [13, true]]) {
      put(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 12, 6), steel), a, FAR + 0.6, 6);
      const head = put(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.4) })), a, FAR + 1.2, 12);
      const L = new THREE.PointLight(0xffe2b4, 70, 90, 1.2);
      this.world(a, FAR + 6, 11, L.position);
      this.group.add(L);
      if (on) this.lamps.push({ L, head, seed: a });
    }
    // a bench by the fence, and the scoreboard above it
    put(new THREE.Mesh(new THREE.BoxGeometry(7, 0.12, 0.6), steel), 4, FAR + 1.6, 0.55, Math.PI / 2);
    for (const k of [-3, 3]) put(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.5), steel), 4 + k, FAR + 1.6, 0.27);
    this.boardCanvas = document.createElement('canvas');
    this.boardCanvas.width = 512; this.boardCanvas.height = 256;
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    const sb = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false, fog: false }));
    put(sb, -9, FAR + 0.25, FENCE_H + 2.6, -Math.PI / 2); // facing the court
    put(new THREE.Mesh(new THREE.BoxGeometry(9.4, 4.9, 0.2), steel), -9, FAR + 0.1, FENCE_H + 2.6, -Math.PI / 2);
    // the ball
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.8, emissive: 0x2a1206, emissiveIntensity: 0.7 }));
    this.world(0, MID, R, this.ball.position);
    this.group.add(this.ball);
    // the one you play: a hood, two eyes, waiting by the bench
    const tex = glowTexture();
    const sp = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.95 });
    body.userData.pulse = true;
    sp.add(new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.3, 7, 1, true).translate(0, 1.15, 0), body));
    sp.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6).translate(0, 2.4, 0), body));
    this.eyeMat = new THREE.SpriteMaterial({ map: tex, color: 0xcfe6ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = new THREE.Sprite(this.eyeMat);
    halo.scale.set(1.5, 1.5, 1);
    halo.position.set(0, 2.42, 0);
    sp.add(halo);
    this.spiritHome = [-4, FAR + 3.4];
    this.spiritAt = [...this.spiritHome];
    this.world(...this.spiritAt, 0, sp.position);
    this.group.add(sp);
    this.spirit = sp;
    // its shot: a ball made of light
    this.ghost = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xbfe0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.ghost.scale.set(2.4, 2.4, 1);
    this.group.add(this.ghost);
    // the spot to match from: a ring of light on the floor
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.8, 1.5), transparent: true, opacity: 0, toneMapped: false, fog: false, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(RING - 0.35, RING, 48).rotateX(-Math.PI / 2), this.ringMat);
    this.group.add(this.ring);
    // and a thin column of the same light standing in it, so you can find the spot from across the floor
    this.beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.45, 1.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
    this.ring.add(new THREE.Mesh(new THREE.CylinderGeometry(RING - 0.2, RING - 0.2, 9, 32, 1, true).translate(0, 4.5, 0), this.beamMat));
  }

  /** The scoreboard: each side's letters, lit as they're earned. */
  drawBoard() {
    const g = this.boardCanvas.getContext('2d');
    g.fillStyle = '#060607'; g.fillRect(0, 0, 512, 256);
    g.textBaseline = 'middle';
    const row = (label, n, y) => {
      g.font = '500 30px "IBM Plex Mono", monospace'; g.textAlign = 'left'; g.fillStyle = 'rgba(200,205,210,0.75)';
      g.fillText(label, 28, y);
      g.font = '700 64px "Syncopate", sans-serif'; g.textAlign = 'center';
      for (let i = 0; i < 4; i++) { g.fillStyle = i < n ? '#ff7a3a' : 'rgba(255,255,255,0.16)'; g.fillText(WORD[i], 190 + i * 88, y + 2); }
    };
    row('YOU', this.game.you, 76);
    row('IT', this.game.it, 180);
    this.boardTex.needsUpdate = true;
  }

  spiritOdds(a, c) { return clamp(0.9 - Math.hypot(a - RIM_A, c - MID) * 0.022, 0.4, 0.85); }

  /** The spirit glides to (a, c) and shoots; `then(made)` runs when the ball of light comes down. */
  spiritShoots(a, c, then) {
    this.game.seq = { t: 0, from: [...this.spiritAt], to: [a, c + (c > MID ? -3.4 : 3.4)], spot: [a, c], made: Math.random() < this.spiritOdds(a, c), then, shot: false };
  }

  stepSpirit(dt, time, out) {
    const s = this.game.seq;
    let target = this.spiritHome;
    if (s) {
      s.t += dt;
      target = s.to;
      if (s.t > 1.5 && !s.shot) { s.shot = true; out.snd.push('ghostShot'); }
      if (s.shot) {
        const k = Math.min(1, (s.t - 1.5) / 1.5);
        const from = this.world(s.to[0], s.to[1], 2.6);
        const miss = s.made ? 0 : 2.3;
        const to = this.world(RIM_A + miss * 0.4, MID + miss, RIM_Y);
        this.ghost.position.lerpVectors(from, to, k);
        this.ghost.position.y += Math.sin(k * Math.PI) * 5.5;
        this.ghost.material.opacity = k < 1 ? 0.95 : 0;
        if (k >= 1) { this.game.seq = null; out.snd.push(s.made ? 'ghostMade' : 'ghostMiss'); s.then(s.made); }
      }
    } else this.ghost.material.opacity = 0;
    const e = Math.min(1, dt * 2.6);
    this.spiritAt[0] += (target[0] - this.spiritAt[0]) * e;
    this.spiritAt[1] += (target[1] - this.spiritAt[1]) * e;
    this.world(this.spiritAt[0], this.spiritAt[1], 0.15 + 0.08 * Math.sin(time * 2.1), this.spirit.position);
    // it watches the ball
    this.spirit.rotation.y = Math.atan2(this.ball.position.x - this.spirit.position.x, this.ball.position.z - this.spirit.position.z);
    this.eyeMat.opacity = 0.65 + 0.3 * Math.sin(time * 7);
  }

  letter(who, out) {
    const g = this.game;
    g[who]++;
    this.drawBoard();
    out.snd.push('letter');
    if (g[who] >= 4) {
      g.phase = 'over'; g.wait = 7; g.spot = null;
      if (who === 'you') out.card = ['D · A · R · K', 'you spelled it · the court is its'];
      else { out.card = ['IT SPELLS DARK', 'it gets in the car']; out.win = true; this.spiritGone = true; }
      return true;
    }
    return false;
  }

  /** Your shot came down: what does it mean for the game? */
  resolve(made, from, out) {
    const g = this.game;
    if (g.phase === 'yourCall') {
      if (made) {
        g.phase = 'spiritMatch'; g.spot = from;
        out.card = ['GOOD', 'now it has to match that'];
        this.spiritShoots(from[0], from[1], (ok) => {
          const o = this.pending;
          if (ok) o.card = ['IT MATCHED', 'its call'];
          else if (!this.letter('it', o)) o.card = [`IT TAKES ${WORD[g.it - 1]}`, 'its call'];
          if (g.phase !== 'over') { g.phase = 'spiritCall'; g.wait = 2.2; g.spot = null; }
        });
      } else { g.phase = 'spiritCall'; g.wait = 1.8; out.card = ['NO GOOD', 'its call']; }
    } else if (g.phase === 'yourMatch') {
      const onSpot = Math.hypot(from[0] - g.spot[0], from[1] - g.spot[1]) < RING + 0.4;
      if (made && onSpot) out.card = ['MATCHED', 'your call · anywhere you like'];
      else if (!this.letter('you', out)) out.card = [`YOU TAKE ${WORD[g.you - 1]}`, made ? 'not from the ring · your call' : 'your call'];
      if (g.phase !== 'over') { g.phase = 'yourCall'; g.spot = null; }
    } else if (made) out.card = ['SWISH', ''];
  }

  stepGame(dt, out) {
    const g = this.game;
    if (g.phase === 'spiritCall' && !g.seq) {
      g.wait -= dt;
      if (g.wait <= 0) {
        // somewhere out on the floor, not right under the iron
        let a, c;
        do { a = -12 + Math.random() * 26; c = MID - 12 + Math.random() * 24; } while (Math.hypot(a - RIM_A, c - MID) < 7);
        g.spot = [a, c]; g.wait = 99;
        this.spiritShoots(a, c, (ok) => {
          const o = this.pending;
          if (ok) { g.phase = 'yourMatch'; o.card = ['MATCH IT', 'shoot from the ring']; }
          else { g.phase = 'yourCall'; g.spot = null; o.card = ['IT MISSED', 'your call · anywhere you like']; }
        });
      }
    }
    if (g.phase === 'over') {
      g.wait -= dt;
      if (g.wait <= 0) { g.phase = 'off'; g.you = 0; g.it = 0; g.spot = null; this.drawBoard(); }
    }
    // the ring shows wherever the spot is
    const show = g.spot && (g.phase === 'yourMatch' || g.phase === 'spiritCall' || g.phase === 'spiritMatch');
    this.ringMat.opacity += ((show ? (g.phase === 'yourMatch' ? 0.9 : 0.35) : 0) - this.ringMat.opacity) * Math.min(1, dt * 4);
    this.beamMat.opacity = this.ringMat.opacity * 0.14;
    if (g.spot) this.world(g.spot[0], g.spot[1], 0.03, this.ring.position);
    this.spirit.visible = !this.spiritGone;
  }

  /** A fresh ball falls out of the dark onto centre court. */
  dropBall(out) {
    this.mode = 'free';
    this.world((Math.random() - 0.5) * 6, MID + (Math.random() - 0.5) * 6, 16, this.ball.position);
    this.vel.set(0, -2, 0);
    this.shot = null;
    out.snd.push('drop');
  }

  /**
   * @param launch  null, or how hard the car just hopped (0..1): that's the throw
   * @returns { snd: [...names], card?, win?, bounce? }
   */
  update(dt, time, vehicle, launch) {
    const out = { snd: [] };
    this.pending = out;
    for (const l of this.lamps) {
      const f = Math.sin(time * 23 + l.seed) > 0.8 && Math.sin(time * 1.7 + l.seed) > 0 ? 0.25 : 1;
      l.L.intensity = 70 * f;
      l.head.material.color.setRGB(2.2 * f, 1.9 * f, 1.4 * f);
    }
    const [ca, cc] = this.local(vehicle.pos.x, vehicle.pos.z);
    const here = Math.abs(ca) < LEN + 40 && cc > FAR - 40 && cc < NEAR + 40;
    if (!here) {
      // gone from the Block: the court resets itself for next time
      if (this.game.phase !== 'off' || this.mode !== 'free') {
        this.game = { phase: 'off', you: 0, it: 0, spot: null, seq: null, wait: 0 };
        this.drawBoard();
        this.mode = 'free'; this.vel.set(0, 0, 0); this.shot = null;
        this.world(0, MID, R, this.ball.position);
      }
      this.ringMat.opacity = 0; this.beamMat.opacity = 0; this.ghost.material.opacity = 0;
      return out;
    }
    this.contain(vehicle, ca, cc);
    this.cool -= dt;
    const b = this.ball.position;
    const f = vehicle.forward;
    if (this.mode === 'gone') {
      this.goneT -= dt;
      if (this.goneT <= 0) this.dropBall(out);
    } else if (this.mode === 'carried') {
      b.set(vehicle.pos.x + f.x * 2.15, (vehicle.rideY ?? vehicle.pos.y) + 1.55 + (vehicle.liftY || 0), vehicle.pos.z + f.z * 2.15);
      this.ball.rotation.x += vehicle.speed * dt * 0.15;
      const off = Math.abs(ca) > LEN + 3 || cc > NEAR + 3;
      if (launch !== null && launch !== undefined) this.throwBall(vehicle, launch, [ca, cc], out);
      else if (off) { this.mode = 'free'; this.vel.copy(vehicle.vel).multiplyScalar(0.6); this.cool = 1.5; } // it won't leave the court with you
    } else this.stepBall(dt, vehicle, out);
    this.stepSpirit(dt, time, out);
    this.stepGame(dt, out);
    return out;
  }

  throwBall(vehicle, charge, from, out) {
    const f = vehicle.forward;
    const b = this.ball.position;
    // aim is where the car points; if that's nearly at the hoop, the last few degrees are forgiven
    let aim = Math.atan2(f.x, f.z);
    const toRim = Math.atan2(this.rim.x - b.x, this.rim.z - b.z);
    let e = Math.atan2(Math.sin(toRim - aim), Math.cos(toRim - aim));
    if (Math.abs(e) < 0.2) aim += clamp(e, -0.07, 0.07);
    const along = vehicle.vel.x * f.x + vehicle.vel.z * f.z;
    const vh = 6.5 + 14 * charge + Math.max(0, along) * 0.5;
    this.vel.set(Math.sin(aim) * vh, 13.5 + 8 * charge, Math.cos(aim) * vh);
    this.spin.set(-6, 0, 0);
    this.mode = 'free';
    this.cool = 1.2;
    this.shot = { from, live: true, made: false };
    out.snd.push('shot');
  }

  stepBall(dt, vehicle, out) {
    const b = this.ball.position;
    const v = this.vel;
    const prevY = b.y;
    const [pa] = this.local(b.x, b.z);
    v.y -= G * dt;
    b.addScaledVector(v, dt);
    this.ball.rotation.x += Math.hypot(v.x, v.z) * dt / R;
    let [a, c] = this.local(b.x, b.z);
    const O = this.O;
    const bounceA = (k) => { const va = v.x * O.tx + v.z * O.tz; v.x -= (1 + k) * va * O.tx; v.z -= (1 + k) * va * O.tz; };
    const bounceC = (k) => { const vc = v.x * O.nx + v.z * O.nz; v.x -= (1 + k) * vc * O.nx; v.z -= (1 + k) * vc * O.nz; };
    const y = b.y - this.floor;
    // the backboard
    if (pa < BOARD_A - R && a >= BOARD_A - R && Math.abs(c - MID) < 3.3 && y > RIM_Y - 0.6 && y < RIM_Y + 3.8) { bounceA(0.55); this.world(BOARD_A - R - 0.01, c, y, b); a = BOARD_A - R; out.snd.push('rim'); }
    // through the iron, or off it
    if (prevY - this.floor > RIM_Y && y <= RIM_Y && v.y < 0) {
      const off = Math.hypot(b.x - this.rim.x, b.z - this.rim.z);
      if (off < RIM_R - R * 0.3) { this.score(out); }
      else if (off < RIM_R + R * 0.9) {
        out.snd.push('rim');
        if (off < RIM_R + 0.25 && Math.random() < 0.45) { v.set((this.rim.x - b.x) * 2, 4, (this.rim.z - b.z) * 2); this.rattle = 0.5; }
        else { const k = 4.5 / off; v.set((b.x - this.rim.x) * k, 5.5, (b.z - this.rim.z) * k); }
      }
    }
    if (this.rattle > 0) { this.rattle -= dt; if (this.rattle <= 0 && Math.hypot(b.x - this.rim.x, b.z - this.rim.z) < RIM_R) { b.x = this.rim.x; b.z = this.rim.z; this.score(out); } }
    // the fence keeps it in, unless it clears the top
    if (y < FENCE_H) {
      if (c < FAR + R && v.x * O.nx + v.z * O.nz < 0) bounceC(0.5);
      if (c < -8 && Math.abs(a) > LEN - R && (v.x * O.tx + v.z * O.tz) * Math.sign(a) > 0) bounceA(0.5);
    }
    // the floor
    if (y < R) {
      b.y = this.floor + R;
      if (Math.abs(v.y) > 2.2) { out.bounce = Math.min(1, Math.abs(v.y) / 18); v.y = -v.y * 0.62; v.x *= 0.86; v.z *= 0.86; }
      else { v.y = 0; const k = Math.exp(-dt * 0.9); v.x *= k; v.z *= k; }
      if (this.shot && this.shot.live) { this.shot.live = false; if (!this.shot.made) { out.snd.push('miss'); this.resolve(false, this.shot.from, out); } }
    }
    // the car: slow and it climbs onto the hood, fast and it gets hit
    if (y < 2.4 && this.cool <= 0) {
      for (const k of vehicle.circles()) {
        const dx = b.x - k.x, dz = b.z - k.z, d = Math.hypot(dx, dz);
        if (d >= k.r + R || d < 1e-3) continue;
        if (vehicle.speed < 14 && Math.hypot(v.x, v.z) < 5 && y < R + 0.4) {
          this.mode = 'carried'; this.shot = null;
          out.snd.push('pickup');
          if (this.game.phase === 'off' && !this.spiritGone) { this.game.phase = 'yourCall'; out.card = ['D · A · R · K', 'hold the hop to shoot · make one and it has to match']; }
          else if (this.game.phase === 'off') out.card = ['THE COURT', 'hold the hop to shoot'];
          return;
        }
        const nx = dx / d, nz = dz / d;
        b.x = k.x + nx * (k.r + R); b.z = k.z + nz * (k.r + R);
        v.set(vehicle.vel.x * 1.15 + nx * 3, 3 + vehicle.speed * 0.28, vehicle.vel.z * 1.15 + nz * 3);
        this.cool = 0.25;
        out.snd.push('kick');
        if (this.shot) this.shot.live = false;
        break;
      }
    }
    // a ball that has left the lot is gone after a moment, and a new one drops: nobody has to go fetch it
    if (Math.abs(a) > LEN || c < FAR || c > NEAR + 3) this.outT = (this.outT || 0) + dt; else this.outT = 0;
    if (this.outT > 1.5) { this.outT = 0; if (this.shot && this.shot.live && !this.shot.made) { this.shot.live = false; this.resolve(false, this.shot.from, out); } this.mode = 'gone'; this.goneT = 1.2; this.ball.position.y = -500; return; }
    // over the fence or off down the street: that one's gone, another is coming
    if (Math.abs(a) > LEN + 6 || c < FAR - 4 || c > NEAR + 10) {
      if (this.shot && this.shot.live && !this.shot.made) { this.shot.live = false; this.resolve(false, this.shot.from, out); }
      this.mode = 'gone'; this.goneT = 1.6;
      this.ball.position.y = -500;
    }
  }

  score(out) {
    this.vel.set(0, -5, 0);
    if (this.net) this.netKick = 1;
    out.snd.push('made');
    if (this.shot && this.shot.live) { this.shot.made = true; this.shot.live = false; this.resolve(true, this.shot.from, out); }
  }

  /** The fence holds the car too. */
  contain(vehicle, a, c) {
    if (Math.abs(a) > LEN + 6 || c > -7) return;
    const O = this.O;
    const push = (nx, nz, depth) => {
      vehicle.pos.x += nx * depth; vehicle.pos.z += nz * depth;
      const into = -(vehicle.vel.x * nx + vehicle.vel.z * nz);
      if (into > 0) { vehicle.vel.x += nx * into * 1.2; vehicle.vel.z += nz * into * 1.2; }
    };
    if (c < FAR + 2) push(O.nx, O.nz, FAR + 2 - c);
    if (Math.abs(a) > LEN - 2 && c < -9) { const s = Math.sign(a); push(-O.tx * s, -O.tz * s, Math.abs(a) - (LEN - 2)); }
    // the hoops' posts
    for (const pa of [BOARD_A + 2.6, -BOARD_A - 2.6]) {
      const da = a - pa, dc = c - MID, d = Math.hypot(da, dc);
      if (d < 1.6 && d > 1e-3) push((O.tx * da + O.nx * dc) / d, (O.tz * da + O.nz * dc) / d, 1.6 - d);
    }
  }
}
