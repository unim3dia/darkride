// THE UNDERPASS — the ground-level district where the ring road comes down.
// Four quarters around the main drag: brick alleys, the container yard,
// vacant lots with fire barrels, and the works under the rail trestle.
// The class doubles as the base for every street-level place on the ring:
// each has its own frame (u along the road, v across it) at some s on the loop.
import * as THREE from 'three';
import { ROAD } from '../config.js';
import { sample, project, rng } from './track.js';
import { merge, SODIUM_MAT, lampPost, disposeGroup } from './props.js';
import { glowTexture } from './chunks.js';
import { eyePoints } from './eyes.js';
import { glyph } from './glyphs.js';
import { neonTexture } from './neon.js';
import { buildStaticCar } from '../player/carModel.js';
import { makeBody } from './bodies.js';
import { inLotBlock, layoutLot, seatRider } from './driveIn.js';
import {
  DMATS, boxUV, boxAt, warehouse, container, tank, fence, trestle, gasStation, motel, fireBarrel, rubble, ruinedWall,
} from './districtKit.js';

const HALF = 26;
const U_CENTERS = [-280, -210, -140, -70, 0, 70, 140, 210, 280];
const V_CENTERS = [-245, -175, -105, -35, 35, 105, 175, 245];
const U_STREETS = [-245, -175, -105, -35, 35, 105, 175, 245];
const V_STREETS = [-210, -140, -70, 0, 70, 140, 210];
const TRESTLE_Y = 10;

// ---------------------------------------------------------------- kit collector

function makeKit() {
  const bins = {};
  const K = {
    bins,
    boxes: [],
    circles: [],
    eyeSpots: [],
    fence: [],
    wallLamps: [],
    add(mat, geo) { (bins[mat] = bins[mat] || []).push(geo); },
    box(u0, u1, v0, v1, h) { K.boxes.push({ u0, u1, v0, v1, h }); },
    circle(u, v, r, h) { K.circles.push({ u, v, r, h }); },
  };
  return K;
}

function chainLinkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(160,165,170,0.9)';
  g.lineWidth = 2;
  for (let i = -64; i < 128; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- the district

export class District {
  constructor(scene, { s0 = 0, seed = 9001, DU = 320, DV = 285, name = 'underpass' } = {}) {
    this.scene = scene;
    this.name = name;
    this.s0 = s0;
    this.DU = DU;
    this.DV = DV;
    const O = sample(s0);
    this.O = O;
    this.T = { x: O.tx, z: O.tz };
    this.N = { x: O.nx, z: O.nz };
    this.yaw0 = -O.heading;
    this.group = new THREE.Group();        // static architecture, district-local
    this.group.position.set(O.x, 0, O.z);
    this.group.rotation.y = this.yaw0;
    this.world = new THREE.Group();        // dynamic things in world space
    scene.add(this.group, this.world);

    this.chunk = { lamps: [], chains: [], bodies: [], fires: [], signs: [], eyes: null, group: this.world, perches: [] };
    this.watcherSpots = [];
    this.answererSpots = [];
    this.vents = [];
    this.tubes = [];
    this.hash = new Map();
    this.parked = [];
    this.barrels = [];
    this.alleys = [];
    this.walls = [];

    const K = makeKit();
    this.K = K;
    this.r = rng(seed);
    this.layout(K);
    this.finish(K);
    if (this.trestleV !== undefined) this.buildTrain();
  }

  // ------------------------------------------------------------ frame

  toWorld(u, v, y = 0, out = new THREE.Vector3()) {
    const { O, T, N } = this;
    return out.set(O.x + u * T.x + v * N.x, y, O.z + u * T.z + v * N.z);
  }

  toLocal(x, z) {
    const dx = x - this.O.x;
    const dz = z - this.O.z;
    return { u: dx * this.T.x + dz * this.T.z, v: dx * this.N.x + dz * this.N.z };
  }

  /** World yaw for something facing along district direction (du, dv). */
  yawToward(du, dv) {
    const wx = du * this.T.x + dv * this.N.x;
    const wz = du * this.T.z + dv * this.N.z;
    return Math.atan2(-wx, -wz);
  }

  /** Yaw that turns a plane's +Z normal toward district direction (du, dv). */
  faceYaw(du, dv) {
    return Math.atan2(du * this.T.x + dv * this.N.x, du * this.T.z + dv * this.N.z);
  }

  nearRoad(u, v, margin) {
    const w = this.toWorld(u, v);
    const p = project(w.x, w.z, this.s0 + u);
    return p.ok && Math.abs(p.d) < ROAD.HALF_WIDTH + margin;
  }

  /** True if the road (with a little shoulder) runs through this rectangle. */
  blocksRoad(u0, u1, v0, v1, margin = 6) {
    for (let a = 0; a <= 4; a++) {
      for (let b = 0; b <= 4; b++) {
        if (this.nearRoad(u0 + ((u1 - u0) * a) / 4, v0 + ((v1 - v0) * b) / 4, margin)) return true;
      }
    }
    return false;
  }

  /**
   * Streets from (u, v) out to the ramp: forward out of the alley, along the
   * cross street to the nearest avenue, down it to the main drag, then along
   * the drag and up onto the deck. Returns world points.
   */
  routeToBridge(u, v, faceV) {
    const exitSign = u < 0 ? -1 : 1;
    // cross streets run every 70m (…, -140, -70, 0, 70, …); take the next one ahead
    const streetV = faceV < 0 ? Math.floor((v - 1) / 70) * 70 : Math.ceil((v + 1) / 70) * 70;
    const avenues = [-245, -175, -105, -35, 35, 105, 175, 245];
    const ahead = avenues.filter((a) => Math.sign(a - u) === exitSign || a === u);
    const avenue = (ahead.length ? ahead : avenues).reduce((best, a) => (Math.abs(a - u) < Math.abs(best - u) ? a : best));
    const pts = [
      this.toWorld(u, v), this.toWorld(u, streetV), this.toWorld(avenue, streetV),
      this.toWorld(avenue, this.roadV(avenue)),
    ];
    // along the drag and up the ramp
    const startS = this.s0 + avenue;
    const endS = this.s0 + exitSign * (this.DU + 170);
    for (let s = startS; exitSign < 0 ? s >= endS : s <= endS; s += exitSign * 10) {
      const p = sample(s);
      pts.push(new THREE.Vector3(p.x, p.y, p.z));
    }
    this.corner = { u: avenue, v: streetV, exitSign };
    return pts;
  }

  /** Where the main drag crosses a given u (district v of the centerline). */
  roadV(u) {
    const s = sample(this.s0 + u);
    return this.toLocal(s.x, s.z).v;
  }

  // ------------------------------------------------------------ layout

  layout(K) {
    const r = this.r;
    this.trestleV = 140;
    K.add('ground', new THREE.PlaneGeometry(this.DV * 2 + 40, this.DU * 2 + 40).rotateX(-Math.PI / 2).translate(0, -0.01, 0));

    for (const cu of U_CENTERS) {
      for (const cv of V_CENTERS) {
        const pts = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]];
        const roadside = pts.some(([a, b]) => this.nearRoad(cu + a * HALF, cv + b * HALF, 12));
        if (roadside) { this.roadsideLot(K, cu, cv); continue; }
        if (this.name === 'underpass' && inLotBlock(cu, cv)) continue; // the drive-in takes these
        const edge = Math.abs(cu) === 280 || Math.abs(cv) === 245;
        if (edge) { this.wallBlock(K, cu, cv); continue; }
        // sidewalk apron around every real block
        K.add('sidewalk', boxUV(cu - HALF - 2.5, cu + HALF + 2.5, cv - HALF - 2.5, cv + HALF + 2.5, 0, 0.12));
        if (cu < 0 && cv < 0) this.alleyBlock(K, cu, cv);
        else if (cu > 0 && cv < 0) this.yardBlock(K, cu, cv);
        else if (cu < 0) this.lotBlock(K, cu, cv);
        else this.worksBlock(K, cu, cv);
      }
    }

    if (this.name === 'underpass') this.driveIn = layoutLot(this, K);
    trestle(K, this.trestleV, -this.DU - 40, this.DU + 40, TRESTLE_Y);
    this.perimeter(K);
    this.roadside(K);
    this.streets(K);
  }

  wallBlock(K, cu, cv) {
    const r = this.r;
    const n = 2 + Math.floor(r() * 2);
    const w = (HALF * 2) / n;
    for (let i = 0; i < n; i++) {
      const u0 = cu - HALF + i * w;
      warehouse(K, r, u0, u0 + w - 1, cv - HALF, cv + HALF, 22 + r() * 34, { mat: r() < 0.5 ? 'brick' : 'brickDark' });
    }
  }

  alleyBlock(K, cu, cv) {
    const r = this.r;
    const gap = 8;
    const h1 = 14 + r() * 14;
    const h2 = 12 + r() * 16;
    warehouse(K, r, cu - HALF, cu - gap / 2, cv - HALF, cv + HALF, h1);
    warehouse(K, r, cu + gap / 2, cu + HALF, cv - HALF, cv + HALF, h2);
    // fire escapes cling to the alley faces
    this.alleyEscapes(K, cu - gap / 2, cv, 1, h1);
    this.alleyEscapes(K, cu + gap / 2, cv, -1, h2);
    // dumpsters and junk in the alley
    for (let i = 0; i < 2; i++) {
      const v = cv + (r() - 0.5) * 36;
      const u = cu + (r() < 0.5 ? -2.4 : 2.4);
      K.add('containerGreen', boxAt(u, v, 0, 1.4, 2.4, 1.4));
      K.box(u - 0.7, u + 0.7, v - 1.2, v + 1.2, 1.4);
    }
    this.alleys.push({ u: cu, v: cv, h: Math.min(h1, h2) });
    this.walls.push({ u: cu - HALF - 0.08, v: cv, du: -1, dv: 0 }, { u: cu + HALF + 0.08, v: cv, du: 1, dv: 0 });
  }

  alleyEscapes(K, uFace, cv, side, h) {
    for (let y = 4; y < h - 1; y += 3.6) {
      K.add('steel', boxAt(uFace + side * 0.8, cv, y, 1.6, 30, 0.06));
      K.add('steel', boxAt(uFace + side * 1.58, cv, y + 0.9, 0.04, 30, 0.04));
      for (let v = cv - 15; v <= cv + 15; v += 2) K.add('steel', boxAt(uFace + side * 1.58, v, y, 0.04, 0.04, 0.9));
    }
  }

  yardBlock(K, cu, cv) {
    const r = this.r;
    fence(K, cu - HALF, cu + HALF, cv - HALF, cv + HALF, { side: 'u0', at: cv + (r() - 0.5) * 20 });
    const crane = r() < 0.25;
    // stacks of containers in rows
    for (let row = -1; row <= 1; row++) {
      const turned = r() < 0.4;
      const u = cu + row * 14 + (r() - 0.5) * 3;
      const v = cv + (r() - 0.5) * 16;
      if (r() < 0.25) {
        tank(K, u, v, 3 + r() * 2.5, 7 + r() * 8);
        continue;
      }
      const levels = 1 + Math.floor(r() * 3);
      const long = r() < 0.6;
      for (let l = 0; l < levels; l++) container(K, r, u, v, l * 2.6, turned, long);
      if (levels > 1 && r() < 0.5) this.watcherSpots.push({ u, v, y: levels * 2.6, faceU: -1, faceV: 0 });
    }
    if (crane) this.crane(K, cu + 18, cv - 18);
    if (r() < 0.6) this.vents.push(this.toWorld(cu - HALF - 9, cv + HALF + 9, 0));
  }

  crane(K, u, v) {
    const H = 34;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      K.add('steel', boxAt(u + a * 1.2, v + b * 1.2, 0, 0.25, 0.25, H));
    }
    for (let y = 2; y < H; y += 3) K.add('steel', boxAt(u, v, y, 2.6, 2.6, 0.12));
    K.add('steel', boxAt(u + 10, v, H, 30, 1.2, 1.2));
    K.add('steel', boxAt(u - 6, v, H - 2.5, 4, 3, 3));
    K.circle(u, v, 2, H);
  }

  lotBlock(K, cu, cv) {
    const r = this.r;
    K.add('dirt', boxUV(cu - HALF, cu + HALF, cv - HALF, cv + HALF, 0, 0.03));
    ruinedWall(K, r, cu - HALF + 2, cv, HALF * 1.6, false);
    if (r() < 0.6) ruinedWall(K, r, cu, cv + HALF - 2, HALF * 1.4, true);
    rubble(K, r, cu + 8, cv - 8, 14);
    // a burnt-out car somewhere in the weeds
    if (r() < 0.7) this.parked.push({ u: cu + (r() - 0.5) * 20, v: cv + (r() - 0.5) * 20, yaw: r() * Math.PI * 2, dull: true });
    // fire barrels draw people
    if (r() < 0.75) {
      const bu = cu + (r() - 0.5) * 18;
      const bv = cv + (r() - 0.5) * 18;
      fireBarrel(K, bu, bv);
      this.barrels.push({ u: bu, v: bv });
    }
  }

  worksBlock(K, cu, cv) {
    const r = this.r;
    const under = Math.abs(cv - this.trestleV) < 40;
    const h = 6 + r() * 5;
    warehouse(K, r, cu - HALF, cu + HALF - (under ? 18 : 4), cv - HALF + 6, cv + HALF - 6, h, { mat: 'brickDark' });
    // corrugated loading shed and roll-up doors
    K.add('corrugated', boxUV(cu + HALF - (under ? 17 : 3), cu + HALF, cv - HALF + 6, cv - HALF + 20, 0, h - 1.5));
    K.box(cu + HALF - (under ? 17 : 3), cu + HALF, cv - HALF + 6, cv - HALF + 20, h - 1.5);
    for (let v = cv - 14; v < cv + 15; v += 7) K.add('steel', boxAt(cu + HALF - (under ? 18 : 4) + 0.06, v, 0, 0.05, 4, 4.2));
    if (cu === 70 && cv === 105) this.signAt('BODY SHOP', 'open late', this.toWorld(cu + HALF - 4, cv + HALF - 6.1, 4.6), this.faceYaw(0, 1), [0xff6a3a, 0x5ff2e2]);
    this.walls.push({ u: cu, v: cv + HALF - 6.08, du: 0, dv: 1 });
  }

  /** Blocks the main drag cuts through become roadside lots: low sheds, parked cars, nothing tall. */
  roadsideLot(K, cu, cv) {
    const r = this.r;
    const rv = this.roadV(cu);
    const side = cv > rv ? 1 : -1;
    const setback = rv + side * 34;
    if (Math.abs(setback - cv) < 40 && !this.nearRoad(cu, setback, 14) && r() < 0.55) {
      const h = 4 + r() * 3;
      warehouse(K, r, cu - 12, cu + 12, setback - 7, setback + 7, h, { mat: r() < 0.5 ? 'brickDark' : 'brick' });
    }
    if (r() < 0.5) this.parked.push({ u: cu + (r() - 0.5) * 30, v: rv + side * (16 + r() * 8), yaw: Math.PI / 2 * (r() < 0.5 ? 1 : -1) + (r() - 0.5) * 0.3, dull: r() < 0.6 });
  }

  /** The far walls: a ragged skyline you can't drive through, open where the road leaves. */
  perimeter(K) {
    const r = this.r;
    const mat = () => (r() < 0.5 ? 'brick' : 'brickDark');
    for (const su of [-1, 1]) {
      const g = this.roadV(su * this.DU);
      const [u0, u1] = su > 0 ? [this.DU, this.DU + 12] : [-this.DU - 12, -this.DU];
      for (let v = -this.DV - 12; v < this.DV + 12; v += 18) {
        if (Math.abs(v + 9 - g) < ROAD.HALF_WIDTH + 10 || this.blocksRoad(u0, u1, v, v + 18)) continue;
        K.add(mat(), boxUV(u0, u1, v, v + 18, 0, 20 + r() * 45));
      }
    }
    for (const sv of [-1, 1]) {
      const [v0, v1] = sv > 0 ? [this.DV, this.DV + 12] : [-this.DV - 12, -this.DV];
      for (let u = -this.DU; u < this.DU; u += 18) {
        if (this.blocksRoad(u, u + 18, v0, v1)) continue;
        K.add(mat(), boxUV(u, u + 18, v0, v1, 0, 20 + r() * 45));
      }
    }
  }

  roadside(K) {
    const r = this.r;
    // abandoned gas station on the right of the drag, a motel on the left
    const gu = -150;
    const gv = this.roadV(gu) + 26;
    this.tubes = gasStation(K, gu, gv);
    this.signAt('GAS', 'no service', this.toWorld(gu - 9, gv + 6, 6.2), this.faceYaw(-1, 0), [0xff3b3b, 0xffab5a]);
    this.watcherSpots.push({ u: gu + 4, v: gv, y: 0, faceU: -1, faceV: -0.5 });
    this.answererSpots.push({ u: gu - 1, v: gv + 1.5, yaw: this.yawToward(-1, -0.3) });

    const mu = 125;
    const mv = this.roadV(mu) - 30;
    motel(K, r, mu, mv, 44, 1);
    this.signAt('MOTEL', 'vacancy', this.toWorld(mu - 24, mv + 12, 6.5), this.faceYaw(-1, 0.4), [0xff2f4f, 0x5ff2e2]);
    this.watcherSpots.push({ u: mu + 6, v: mv + 6.5, y: 0, faceU: 0, faceV: 1 });
    this.answererSpots.push({ u: mu - 8, v: mv + 12, yaw: this.yawToward(0, 1) });
    this.parked.push({ u: mu + 10, v: mv + 12, yaw: this.yawToward(0, 1), dull: false });

    // under the trestle: the lowriders gather here
    this.answererSpots.push({ u: -60, v: this.trestleV - 9, yaw: this.yawToward(1, 0) });
    this.parked.push({ u: 40, v: this.trestleV + 8, yaw: this.yawToward(1, 0), dull: false, sitter: true });
    this.watcherSpots.push({ u: -45, v: this.trestleV, y: 0, faceU: -1, faceV: 0 });

    // a figure and a car waiting at the far end of a street, in the fog
    this.parked.push({ u: 245, v: -70, yaw: this.yawToward(-1, 0), dull: false });
    this.watcherSpots.push({ u: 245, v: -73.5, y: 0, faceU: -1, faceV: 0 });
  }

  streets(K) {
    const r = this.r;
    for (const u of U_STREETS) {
      for (const v of V_STREETS) {
        if (this.nearRoad(u, v, 4)) continue;
        if (r() < 0.8) this.lampAt(u + 5, v + 5, r);
        if ((u < 0 || v < 0) && r() < 0.35) {
          this.vents.push(this.toWorld(u, v, 0));
          K.add('steel', new THREE.CylinderGeometry(0.6, 0.6, 0.04, 14).translate(v, 0.02, -u));
        }
      }
    }
    // lamps all along the main drag too
    for (let u = -this.DU + 20; u < this.DU; u += 34) {
      const s = sample(u);
      const side = (Math.floor(u / 34) % 2) ? 1 : -1;
      const p = this.toLocal(s.x + s.nx * side * (ROAD.HALF_WIDTH + 2), s.z + s.nz * side * (ROAD.HALF_WIDTH + 2));
      this.lampAt(p.u, p.v, r, side);
    }
  }

  lampAt(u, v, r, armSide = r() < 0.5 ? -1 : 1, kind = 'sodium') {
    const cold = kind === 'mercury';
    const base = this.toWorld(u, v, 0);
    const yaw = this.yaw0;
    const { geos, head } = lampPost(armSide);
    for (const g of geos) this.K.add('steel', g.translate(v, 0, -u));
    head.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(base);
    const bulbMat = SODIUM_MAT.clone();
    if (cold) bulbMat.color.setRGB(2.2, 2.4, 2.6);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.26), bulbMat);
    bulb.position.copy(head).y -= 0.12;
    bulb.rotation.y = yaw;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: cold ? 0xb8c8d8 : 0xffa04a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(cold ? 5 : 7, cold ? 5 : 7, 1);
    halo.position.copy(bulb.position);
    const glare = new THREE.Mesh(
      new THREE.CircleGeometry(4.5, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: cold ? 0x8fa0b0 : 0xff8a3a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glare.position.set(head.x, 0.04, head.z);
    this.world.add(bulb, halo, glare);
    this.chunk.lamps.push({ pos: head.clone(), bulb, halo, glare, level: 1, flicker: 0, dead: r() < (cold ? 0.3 : 0.15), seed: r() * 100, kind });
  }

  /** A caged bulb over a door: small, warm, sometimes failing. */
  wallLamp({ u, v, y, du, dv }, r) {
    const pos = this.toWorld(u, v, y);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), SODIUM_MAT.clone());
    bulb.position.copy(pos);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb070, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(2.6, 2.6, 1);
    halo.position.copy(pos);
    const glare = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 18).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff9a50, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glare.position.copy(this.toWorld(u + du * 2, v + dv * 2, 0.05));
    this.world.add(bulb, halo, glare);
    this.chunk.lamps.push({ pos: pos.clone(), bulb, halo, glare, level: 1, flicker: 0, dead: r() < 0.1, seed: r() * 100, kind: 'wall' });
  }

  signAt(top, bottom, pos, yaw, colors) {
    const mat = new THREE.MeshBasicMaterial({ map: neonTexture(top, bottom, colors), color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, depthWrite: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), mat);
    sign.position.copy(pos);
    sign.rotation.y = yaw;
    this.world.add(sign);
    this.chunk.signs.push({ mat, seed: this.r() * 10 });
  }

  // ------------------------------------------------------------ assembly

  finish(K) {
    const r = this.r;
    for (const [name, geos] of Object.entries(K.bins)) {
      this.group.add(new THREE.Mesh(merge(geos), DMATS[name]));
    }
    if (K.fence.length) {
      const tex = chainLinkTexture();
      const fm = new THREE.MeshStandardMaterial({ map: tex, alphaMap: tex, transparent: true, alphaTest: 0.3, color: 0x6a6e72, roughness: 0.6, metalness: 0.7, side: THREE.DoubleSide });
      const fg = merge(K.fence);
      // planar uvs so the mesh tiles evenly
      const pos = fg.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = (pos.getX(i) + pos.getZ(i)) * 0.6;
        uv[i * 2 + 1] = pos.getY(i) * 0.6;
      }
      fg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      this.group.add(new THREE.Mesh(fg, fm));
    }

    // colliders to world-facing form + a coarse spatial hash over district space
    this.boxes = K.boxes.map((b) => ({ u0: Math.min(b.u0, b.u1), u1: Math.max(b.u0, b.u1), v0: Math.min(b.v0, b.v1), v1: Math.max(b.v0, b.v1), h: b.h || 1.2 }));
    this.boxes.forEach((b, i) => {
      for (let a = Math.floor(b.u0 / 40); a <= Math.floor(b.u1 / 40); a++) {
        for (let c = Math.floor(b.v0 / 40); c <= Math.floor(b.v1 / 40); c++) {
          const k = a + ',' + c;
          if (!this.hash.has(k)) this.hash.set(k, []);
          this.hash.get(k).push(i);
        }
      }
    });
    this.circles = K.circles;

    // parked cars are bodies you can shove
    for (const p of this.parked) {
      const car = buildStaticCar(p.dull);
      car.position.copy(this.toWorld(p.u, p.v, 0));
      car.rotation.y = p.yaw;
      this.world.add(car);
      this.chunk.bodies.push(makeBody(car, 0));
      if (p.rider) seatRider(car);
      // a figure out in front of every street car, so it shows in the dark (not the drive-in rows)
      else {
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
        const w0 = this.toWorld(p.u, p.v, 0);
        const L = this.toLocal(w0.x + fx * 4.2, w0.z + fz * 4.2);
        const F = this.toLocal(w0.x + fx * 10, w0.z + fz * 10);
        if (this.r() < 0.5) this.watcherSpots.push({ u: L.u, v: L.v, y: 0, faceU: F.u - L.u, faceV: F.v - L.v, bystander: true });
        else {
        const B = this.toLocal(w0.x - fx * 4.4, w0.z - fz * 4.4);
        const BF = this.toLocal(w0.x - fx * 10, w0.z - fz * 10);
        this.watcherSpots.push({ u: B.u, v: B.v, y: 0, faceU: BF.u - B.u, faceV: BF.v - B.v, bystander: true });
        }
      }
      if (p.sitter) this.watcherSpots.push({ u: p.u + 2.2, v: p.v, y: 0.55, faceU: 0, faceV: -1, sit: true });
    }
    for (const b of this.barrels) {
      const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7a2a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      fire.position.copy(this.toWorld(b.u, b.v, 1.3));
      fire.scale.set(1.6, 2.2, 1);
      this.world.add(fire);
      this.chunk.fires.push({ sprite: fire, base: 1.6, seed: r() * 100 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), SODIUM_MAT.clone());
      bulb.position.copy(this.toWorld(b.u, b.v, 1.0));
      const glare = new THREE.Mesh(new THREE.CircleGeometry(5, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff6a20, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      glare.position.copy(this.toWorld(b.u, b.v, 0.05));
      this.world.add(bulb, glare);
      this.chunk.lamps.push({ pos: bulb.position.clone().setY(1.6), bulb, halo: fire, glare, level: 1, flicker: 0, dead: false, seed: r() * 100, kind: 'fire' });
      // people around the fire: one of them is watching for you
      const n = 2 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r();
        this.watcherSpots.push({ u: b.u + Math.cos(a) * 1.6, v: b.v + Math.sin(a) * 1.6, y: 0, faceU: -Math.cos(a), faceV: -Math.sin(a), bystander: k > 0 });
      }
    }
    for (const a of this.alleys.slice(0, 3)) this.watcherSpots.push({ u: a.u, v: a.v + 6, y: 0, faceU: 0, faceV: -1 });
    const roof = this.alleys[this.alleys.length - 1];
    if (roof) this.watcherSpots.push({ u: roof.u - 5, v: roof.v - HALF + 1, y: roof.h, faceU: 0, faceV: -1 });

    for (const w of K.wallLamps) this.wallLamp(w, r);

    // windows that open their eyes
    if (K.eyeSpots.length) {
      this.chunk.eyes = eyePoints(K.eyeSpots.map(([u, y, v]) => this.toWorld(u, v, y)), 'ruins', r);
      this.world.add(this.chunk.eyes.points);
    }

    // gas-station tubes, failing
    if (this.tubes.length) {
      const tubeMat = DMATS.tube.clone();
      this.group.add(new THREE.Mesh(merge(this.tubes), tubeMat));
      this.chunk.signs.push({ mat: tubeMat, seed: 3.3, tube: true });
    }

    this.paint();
  }

  /** The marks: only your pulse shows them. */
  paint() {
    this.paintWith({
      lines: ['LAND WHERE THEY LOOK', 'THE CARS HERE ANSWER', 'THE ROAD COMES DOWN TO MEET YOU', 'THEY RIDE WITH YOU NOW', 'HIT THE SWITCHES TWICE', 'LISTEN FOR THE TRAIN'],
      arrows: [-200, -100, 0, 100, 200].map((u) => ({ u, v: this.roadV(u) + 14, du: 0, dv: 1 })).concat([{ u: -120, v: this.roadV(-120) + 12, du: -1, dv: 0.6 }]),
      spirals: [{ u: 0, v: this.trestleV, size: 6 }],
    });
  }

  paintWith({ lines, arrows, spirals }) {
    const ground = (kind, u, v, du, dv, size) => {
      const m = glyph(kind, this.toWorld(u, v, 0.17), 0, size);
      m.rotation.order = 'YXZ';
      const w = { x: du * this.T.x + dv * this.N.x, z: du * this.T.z + dv * this.N.z };
      m.rotation.set(-Math.PI / 2, Math.atan2(-w.z, w.x), 0);
      this.world.add(m);
    };
    const wall = (kind, u, v, y, du, dv, size) => {
      this.world.add(glyph(kind, this.toWorld(u, v, y), this.faceYaw(du, dv), size));
    };
    // eyes on the ground where someone is waiting
    for (const w of this.watcherSpots) if (!w.bystander && w.y < 1) ground('eye', w.u + w.faceU * 3.5, w.v + w.faceV * 3.5, 1, 0, 3.2);
    for (const a of arrows) ground('arrow', a.u, a.v, a.du, a.dv, 4);
    // cars drawn where the answerers wait
    for (const a of this.answererSpots) ground('car', a.u + 5, a.v, 1, 0, 3.6);
    for (const sp of spirals) ground('spiral', sp.u, sp.v, 1, 0, sp.size);
    // half-sentences on walls
    this.walls.forEach((w, i) => {
      if (i % 2) return;
      wall(lines[(i / 2) % lines.length], w.u + w.du * 0.12, w.v + w.dv * 0.12, 3.2, w.du, w.dv, 3.2);
    });
  }

  // ------------------------------------------------------------ the train

  buildTrain() {
    const g = new THREE.Group();
    const geos = { steel: [], windowLit: [] };
    for (let i = 0; i < 7; i++) {
      const u = -i * 15.5;
      geos.steel.push(boxAt(u, 0, 0.3, 14.6, 3, 3.6));
      geos.steel.push(boxAt(u, 0, 3.9, 13.6, 2.4, 0.35));
      if (i > 0) for (const side of [-1, 1]) geos.windowLit.push(boxAt(u, side * 1.52, 1.9, 12, 0.04, 0.7));
    }
    for (const [m, list] of Object.entries(geos)) g.add(new THREE.Mesh(merge(list), m === 'steel' ? DMATS.corrugated : DMATS.windowLit));
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.6, 2.6) }));
    head.position.set(0, 2.6, -7.31 - 0.05);
    head.rotation.y = Math.PI;
    g.add(head);
    g.position.set(this.trestleV, TRESTLE_Y + 0.9, 0);
    this.group.add(g);
    this.train = { group: g, u: -this.DU - 400, dir: 1, speed: 17, wait: 20, head };
  }

  /** Advance the train; returns 0..1 how close it is to (u, v). */
  updateTrain(dt, carLocal) {
    const t = this.train;
    if (t.wait > 0) {
      t.wait -= dt;
      t.group.visible = false;
      return 0;
    }
    t.group.visible = true;
    t.u += t.dir * t.speed * dt;
    t.group.position.z = -t.u;
    t.group.rotation.y = t.dir > 0 ? 0 : Math.PI;
    if (Math.abs(t.u) > this.DU + 420) {
      t.dir *= -1;
      t.u = Math.sign(t.u) * (this.DU + 420);
      t.wait = 55 + Math.random() * 40;
    }
    const du = Math.max(0, Math.abs(carLocal.u - (t.u - t.dir * 45)) - 50);
    const dv = Math.abs(carLocal.v - this.trestleV);
    return Math.max(0, 1 - Math.hypot(du, dv) / 220);
  }

  // ------------------------------------------------------------ physics hooks

  inside(x, z, margin = 0) {
    const p = this.toLocal(x, z);
    return Math.abs(p.u) < this.DU + margin && Math.abs(p.v) < this.DV + margin;
  }

  /** Push the car's contact circles out of walls, containers, pillars. */
  collide(vehicle, ev) {
    const y = vehicle.pos.y;
    if (y > 60 || !this.inside(vehicle.pos.x, vehicle.pos.z, 20)) return;
    for (const k of vehicle.circles()) {
      const p = this.toLocal(k.x, k.z);
      const cell = this.hash.get(Math.floor(p.u / 40) + ',' + Math.floor(p.v / 40)) || [];
      for (const i of cell) {
        const b = this.boxes[i];
        if (y > b.h - 0.2) continue;
        const qu = Math.min(b.u1, Math.max(b.u0, p.u));
        const qv = Math.min(b.v1, Math.max(b.v0, p.v));
        let du = p.u - qu;
        let dv = p.v - qv;
        let dist = Math.hypot(du, dv);
        if (dist >= k.r) continue;
        if (dist < 1e-4) {
          // center inside the box: leave by the nearest face
          const exits = [[p.u - b.u0, -1, 0], [b.u1 - p.u, 1, 0], [p.v - b.v0, 0, -1], [b.v1 - p.v, 0, 1]].sort((a, c) => a[0] - c[0]);
          [, du, dv] = exits[0];
          dist = 0;
        } else {
          du /= dist;
          dv /= dist;
        }
        this.push(vehicle, ev, du, dv, k.r - dist);
      }
      for (const c of this.circles) {
        if (y > c.h - 0.2) continue;
        const du = p.u - c.u;
        const dv = p.v - c.v;
        const dist = Math.hypot(du, dv);
        if (dist >= k.r + c.r || dist < 1e-4) continue;
        this.push(vehicle, ev, du / dist, dv / dist, k.r + c.r - dist);
      }
    }
  }

  push(vehicle, ev, nu, nv, depth) {
    const nx = nu * this.T.x + nv * this.N.x;
    const nz = nu * this.T.z + nv * this.N.z;
    vehicle.pos.x += nx * depth;
    vehicle.pos.z += nz * depth;
    const into = -(vehicle.vel.x * nx + vehicle.vel.z * nz);
    if (into <= 0) return;
    vehicle.vel.x += nx * into * 1.25;
    vehicle.vel.z += nz * into * 1.25;
    vehicle.vel.multiplyScalar(0.97);
    if (into > 4) {
      vehicle.pitchV -= into * 0.08;
      if (!ev.bump || ev.bump.force < into) ev.bump = { force: into, x: vehicle.pos.x, z: vehicle.pos.z };
    } else {
      ev.scrape = Math.max(ev.scrape, Math.min(1, vehicle.speed / 25));
    }
  }

  /** True if a world point sits inside a wall, container or pillar. */
  solidAt(x, y, z, pad = 0.6) {
    const p = this.toLocal(x, z);
    const cell = this.hash.get(Math.floor(p.u / 40) + ',' + Math.floor(p.v / 40)) || [];
    for (const i of cell) {
      const b = this.boxes[i];
      if (y < b.h + pad && p.u > b.u0 - pad && p.u < b.u1 + pad && p.v > b.v0 - pad && p.v < b.v1 + pad) return true;
    }
    for (const c of this.circles) {
      if (y < c.h + pad && Math.hypot(p.u - c.u, p.v - c.v) < c.r + pad) return true;
    }
    return false;
  }

  /**
   * Walk from the car toward where the camera wants to be; stop short of the
   * first wall so the lens never ends up inside brick.
   */
  clipCamera(from, to) {
    if (!this.inside(to.x, to.z, 30)) return to;
    const steps = 14;
    let last = from.clone();
    for (let i = 1; i <= steps; i++) {
      const p = from.clone().lerp(to, i / steps);
      if (this.solidAt(p.x, p.y, p.z)) return last;
      last = p;
    }
    return to;
  }

  /** Keep the car inside the district unless it's leaving on the road. */
  boundary(vehicle, onRoad) {
    if (onRoad || vehicle.pos.y > 2) return;
    const p = this.toLocal(vehicle.pos.x, vehicle.pos.z);
    const lu = this.DU - 3;
    const lv = this.DV - 3;
    if (Math.abs(p.u) <= lu && Math.abs(p.v) <= lv) return;
    if (Math.abs(p.u) > lu + 30 || Math.abs(p.v) > lv + 30) return; // out on the ring, not our business
    const cu = Math.max(-lu, Math.min(lu, p.u));
    const cv = Math.max(-lv, Math.min(lv, p.v));
    const w = this.toWorld(cu, cv);
    const nx = w.x - vehicle.pos.x;
    const nz = w.z - vehicle.pos.z;
    const len = Math.hypot(nx, nz) || 1;
    vehicle.pos.x = w.x;
    vehicle.pos.z = w.z;
    const into = -(vehicle.vel.x * nx + vehicle.vel.z * nz) / len;
    if (into < 0) {
      vehicle.vel.x -= (nx / len) * into * 1.3;
      vehicle.vel.z -= (nz / len) * into * 1.3;
    }
  }

  dispose() {
    disposeGroup(this.group);
    disposeGroup(this.world);
  }
}

