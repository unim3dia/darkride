// The ring road: a closed loop that climbs out of the district onto the deck,
// circles the dead city through four zones, and comes back down to the street.
import { ROAD, ZONES, HOMES, FORKS as FORK_DEFS, DETOURS as DETOUR_DEFS } from '../config.js';

// ---------------------------------------------------------------- build the loop

function polar(theta) {
  const R = ROAD.LOOP_RADIUS;
  const r = R + 150 * Math.sin(2 * theta + 0.9) + 85 * Math.sin(3 * theta + 2.4) + 35 * Math.sin(5 * theta + 1.0);
  return [r * Math.cos(theta), r * Math.sin(theta)];
}

const FINE = 24000;
const fx = new Float64Array(FINE + 1);
const fz = new Float64Array(FINE + 1);
const fs = new Float64Array(FINE + 1);
for (let i = 0; i <= FINE; i++) {
  // go clockwise so heading math matches the original (forward = (sin h, -cos h))
  const [x, z] = polar(-(i / FINE) * Math.PI * 2);
  fx[i] = x;
  fz[i] = z;
  if (i) fs[i] = fs[i - 1] + Math.hypot(x - fx[i - 1], z - fz[i - 1]);
}
export const LOOP_LEN = fs[FINE];
const N = Math.round(LOOP_LEN);
const STEP = LOOP_LEN / N;
const xs = new Float64Array(N);
const zs = new Float64Array(N);
const hs = new Float64Array(N);
{
  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = i * STEP;
    while (fs[j + 1] < target) j++;
    const t = (target - fs[j]) / (fs[j + 1] - fs[j]);
    xs[i] = fx[j] + (fx[j + 1] - fx[j]) * t;
    zs[i] = fz[j] + (fz[j + 1] - fz[j]) * t;
  }
  for (let i = 0; i < N; i++) {
    const a = (i + 1) % N;
    const b = (i - 1 + N) % N;
    hs[i] = Math.atan2(xs[a] - xs[b], -(zs[a] - zs[b]));
  }
}

export const N_CHUNKS = Math.round(LOOP_LEN / ROAD.CHUNK_LEN);
export const CHUNK_LEN = LOOP_LEN / N_CHUNKS;

export const wrap = (s) => ((s % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
/** Where each street-level place sits on the loop. */
export const HOME_S = HOMES.map((h) => h.s * LOOP_LEN);
const loopDist = (a, b) => { const d = Math.abs(wrap(a) - wrap(b)); return Math.min(d, LOOP_LEN - d); };
/** Distance along the loop to the nearest place where the road comes down. */
export const fromHome = (s) => Math.min(...HOME_S.map((h) => loopDist(s, h)));

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 0 at street level, 1 up on the deck. */
export function gradeAt(s) {
  return smooth(ROAD.GRADE_FLAT, ROAD.GRADE_FLAT + ROAD.GRADE_RAMP, fromHome(s));
}

// rolling hills: how much of the roller-coaster each meter of the loop gets (built lazily,
// eased in and out over a few hundred meters so the zones that have them fade in)
const HILL_ZONES = new Set(); // the highway stays level; the rollers live out in the pocket worlds
let HILL = null;
function hillWeight(s) {
  if (!HILL) {
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) raw[i] = HILL_ZONES.has(ZONES[zoneIndexAt(i * STEP)].kind) ? 1 : 0;
    HILL = new Float32Array(N);
    const R = 180;
    let acc = 0;
    for (let i = -R; i <= R; i++) acc += raw[(i + N) % N];
    for (let i = 0; i < N; i++) {
      HILL[i] = acc / (2 * R + 1);
      acc += raw[(i + R + 1) % N] - raw[(i - R + N) % N];
    }
  }
  return HILL[Math.floor(wrap(s) / STEP) % N];
}

export function elevation(s) {
  const k = gradeAt(s);
  if (k === 0) return 0;
  const w = (wrap(s) / LOOP_LEN) * Math.PI * 2;
  const hills = hillWeight(s) * (2.0 * Math.sin(s / 14) + 0.6 * Math.sin(s / 7.3 + 1.7));
  return k * (ROAD.DECK_HEIGHT + 2.6 * Math.sin(w * 9) + 1.4 * Math.sin(w * 23 + 2.1) + hills);
}

/** Point + frame on the centerline at distance s. Reuses `out` to avoid garbage. */
export function sample(s, out = {}) {
  const t = wrap(s) / STEP;
  const i = Math.floor(t) % N;
  const j = (i + 1) % N;
  const f = t - Math.floor(t);
  let dh = hs[j] - hs[i];
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const h = hs[i] + dh * f;
  out.x = xs[i] + (xs[j] - xs[i]) * f;
  out.z = zs[i] + (zs[j] - zs[i]) * f;
  out.y = elevation(s);
  out.heading = h;
  out.tx = Math.sin(h);   // forward
  out.tz = -Math.cos(h);
  out.nx = Math.cos(h);   // right
  out.nz = Math.sin(h);
  return out;
}

const tmp = {};
/**
 * Project a world XZ point onto the centerline. `hint` = last known s.
 * `ok` is false when the point is far from the road and the search didn't settle.
 */
export function project(x, z, hint) {
  let s = hint;
  for (let k = 0; k < 6; k++) {
    sample(s, tmp);
    const step = (x - tmp.x) * tmp.tx + (z - tmp.z) * tmp.tz;
    s = wrap(s + Math.max(-80, Math.min(80, step)));
  }
  sample(s, tmp);
  const along = (x - tmp.x) * tmp.tx + (z - tmp.z) * tmp.tz;
  const d = (x - tmp.x) * tmp.nx + (z - tmp.z) * tmp.nz;
  return { s, d, ok: Math.abs(along) < 3 };
}

// ---------------------------------------------------------------- zones

export function rng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOME = 520;                 // each street-level stretch of road, each direction
const BLEND = 200;
const HIGHWAY_KINDS = ZONES.map((z, i) => i).filter((i) => !HOMES.some((h) => h.kind === ZONES[i].kind));
const homeZone = (kind) => ZONES.findIndex((z) => z.kind === kind);

/**
 * The loop, in order: home, two highway zones, home, two highway zones.
 * Each stretch between homes is split between the highway zones that follow it in ZONES.
 */
function zoneSpan(s) {
  const w = wrap(s);
  const n = HOMES.length;
  for (let k = 0; k < n; k++) {
    const start = HOME_S[k] - HOME;
    const local = wrap(w - start);
    if (local < HOME * 2) return { i: homeZone(HOMES[k].kind), local, len: HOME * 2 };
    const next = HOME_S[(k + 1) % n] - HOME;
    const stretch = wrap(next - (start + HOME * 2)) || LOOP_LEN - HOME * 2;
    const into = local - HOME * 2;
    if (into < stretch) {
      const kinds = HIGHWAY_KINDS.filter((i) => i > homeZone(HOMES[k].kind) && (k + 1 >= n || i < homeZone(HOMES[k + 1].kind)));
      const seg = stretch / kinds.length;
      const j = Math.min(kinds.length - 1, Math.floor(into / seg));
      return { i: kinds[j], local: into - j * seg, len: seg };
    }
  }
  return { i: 0, local: 0, len: 1 };
}

export function zoneIndexAt(s) {
  return zoneSpan(s).i;
}

/** 0..1 blend toward the next zone over the last stretch of each zone. */
export function zoneBlendAt(s) {
  const z = zoneSpan(s);
  return z.local < z.len - BLEND ? 0 : (z.local - (z.len - BLEND)) / BLEND;
}

export const isHomeKind = (kind) => HOMES.some((h) => h.kind === kind);
/** The pared-back zones: fog, grain, and shapes that don't resolve into buildings. */
export const ABSTRACT = new Set(['monoliths', 'colonnade', 'pale']);

// ---------------------------------------------------------------- seeded features

const featureCache = new Map();

/** Deterministic set-dressing decisions for one chunk. */
export function chunkFeatures(index) {
  const idx = ((index % N_CHUNKS) + N_CHUNKS) % N_CHUNKS;
  if (featureCache.has(idx)) return featureCache.get(idx);
  const r = rng(idx + 17);
  const s0 = idx * CHUNK_LEN;
  const kind = ZONES[zoneIndexAt(s0 + CHUNK_LEN / 2)].kind;
  const home = isHomeKind(kind);
  const abstract = ABSTRACT.has(kind);

  const gapChance = kind === 'zone9' ? 0.34 : kind === 'pines' ? 0.14 : 0.22;
  const hasGap = ROAD.GAPS && !home && r() < gapChance;
  const gapLen = 9 + r() * (kind === 'zone9' ? 15 : 11);
  const gapStart = 12 + r() * 6;

  const f = {
    index: idx,
    kind,
    gap: hasGap ? { start: s0 + gapStart, end: s0 + gapStart + gapLen } : null,
    overpass: !home && !abstract && kind !== 'pines' && r() < 0.22,
    truss: kind === 'trestle' ? r() < 0.75 : kind === 'ruins' && r() < 0.18,
    lamps: abstract ? false : kind === 'district' || kind === 'trestle' || kind === 'ruins' ? r() < 0.6 : kind === 'narrows' ? r() < 0.15 : r() < 0.12,
    wrecks: [],
    watcher: null,
    sign: kind === 'zone9' && r() < 0.18,
    fires: kind === 'zone9' ? Math.floor(r() * 3) : kind === 'ruins' ? Math.floor(r() * 1.6) : 0,
    seed: Math.floor(r() * 1e9),
  };

  const nWrecks = home ? 0 : Math.floor(r() * (kind === 'pines' || abstract ? 1.3 : 2.2));
  for (let i = 0; i < nWrecks; i++) {
    const at = s0 + 4 + r() * (CHUNK_LEN - 8);
    if (f.gap && at > f.gap.start - 6 && at < f.gap.end + 6) continue;
    f.wrecks.push({ s: at, d: (r() * 2 - 1) * (ROAD.HALF_WIDTH - 2.2), yaw: (r() - 0.5) * 1.2 });
  }

  if (!home && r() < 0.42) {
    const spots = ['shoulder', 'rail', 'overpass', 'far'];
    let spot = spots[Math.floor(r() * spots.length)];
    if (spot === 'overpass' && !f.overpass) spot = 'shoulder';
    f.watcher = { spot, s: s0 + 6 + r() * 28, side: r() < 0.5 ? -1 : 1, seed: r() };
  }

  featureCache.set(idx, f);
  return f;
}

export function gapAt(s) {
  if (!ROAD.GAPS) return null;
  const i = Math.floor(wrap(s) / CHUNK_LEN);
  for (const k of [i - 1, i, i + 1]) {
    const g = chunkFeatures(k).gap;
    if (g && wrap(s) > g.start && wrap(s) < g.end) return g;
  }
  return null;
}

/** Jersey barriers stand wherever the road is lifted off the street. */
export function hasBarrier(s) {
  const i = Math.floor(wrap(s) / CHUNK_LEN);
  return elevation(i * CHUNK_LEN) > 1.2 || elevation((i + 1) * CHUNK_LEN) > 1.2;
}

// ---------------------------------------------------------------- forks

/** Where each off-ramp leaves and rejoins the loop, and how long the two roads overlap. */
export const FORKS = FORK_DEFS.map((f) => {
  const sA = f.at * LOOP_LEN;
  // the off-ramp separates once its deck no longer touches the highway's
  const uSep = Math.asin(Math.sqrt((2 * (ROAD.HALF_WIDTH + 0.8)) / f.D)) / Math.PI;
  return { ...f, sA, sB: sA + f.len, uSep };
});

/**
 * Each detour, planned in ring coordinates (s along the loop, d to the right of it).
 * It leaves its ramp at u = U_BRANCH turning hard right, makes one descending loop,
 * swings under the highway into the cave, veers out left and climbs, then merges.
 */
export const DETOUR = { U_BRANCH: 0.15, R: 26, S_LEN: 130, CAVE_LEN: 300, VEER: 110, CLIMB: 400, MERGE: 180, CAVE_Y: -9, OUT_D: -30 };
export const DETOUR_PLANS = DETOUR_DEFS.map((def) => {
  const f = FORKS.find((k) => k.kind === def.fork);
  const u = DETOUR.U_BRANCH;
  const sB = f.sA + u * f.len;
  const dB = f.side * f.D * Math.sin(Math.PI * u) ** 2;
  const theta0 = Math.atan(f.side * f.D * (Math.PI / f.len) * Math.sin(2 * Math.PI * u));
  const sL = sB - DETOUR.R * Math.sin(theta0);
  const dL = dB + DETOUR.R * Math.cos(theta0) - DETOUR.R;
  const sC0 = sL + DETOUR.S_LEN;
  const sC1 = sC0 + DETOUR.CAVE_LEN;
  const sV = sC1 + DETOUR.VEER;
  const sM0 = sC1 + DETOUR.CLIMB;
  const sEnd = sM0 + DETOUR.MERGE;
  return { ...def, fork: f, sBranch: sB, dB, theta0, sL, dL, sC0, sC1, sV, sM0, sEnd, open: [sM0 + 0.4 * DETOUR.MERGE, sEnd + 3] };
});

/**
 * The herd's road: far round the ring from the start, it peels off to the right
 * like any off-ramp, bows out across the dark, and merges back further on.
 */
export const HERD = (() => {
  const f = { at: 0.68, side: 1, len: 1250, D: 300, lift: -4, kind: 'herd' };
  const sA = f.at * LOOP_LEN;
  const uSep = Math.asin(Math.sqrt((2 * (ROAD.HALF_WIDTH + 0.8)) / f.D)) / Math.PI;
  return { ...f, sA, sB: sA + f.len, uSep };
})();

/** Stretches where the highway's barrier is open on `side`, beyond the forks themselves. */
function extraOpenings(side) {
  if (side < 0) return DETOUR_PLANS.map((p) => p.open);
  const lap = HERD.uSep * HERD.len;
  return [[HERD.sA - 3, HERD.sA + lap], [HERD.sB - lap, HERD.sB + 3]];
}

const BARE = [];

/** Is the highway's jersey barrier open on this side here (where an off-ramp peels away)? */
export function forkOpen(s, side) {
  const w = wrap(s);
  for (const f of FORKS) {
    if (Math.sign(side) !== f.side) continue;
    const lap = f.uSep * f.len;
    if ((w > f.sA - 3 && w < f.sA + lap) || (w > f.sB - lap && w < f.sB + 3)) return true;
  }
  for (const [o0, o1] of extraOpenings(Math.sign(side))) if (w > o0 && w < o1) return true;
  return false;
}

/** The open stretches on one side within [a, b], for drawing the barrier in pieces. */
export function barrierSpans(a, b, side) {
  let spans = [[a, b]];
  for (const f of FORKS) {
    if (f.side !== side) continue;
    const lap = f.uSep * f.len;
    for (const [o0, o1] of [[f.sA - 3, f.sA + lap], [f.sB - lap, f.sB + 3]]) {
      spans = spans.flatMap(([x, y]) => (o1 <= x || o0 >= y ? [[x, y]] : [[x, o0], [o1, y]].filter(([p, q]) => q - p > 0.5)));
    }
  }
  for (const [o0, o1] of [...extraOpenings(side), ...BARE]) {
    spans = spans.flatMap(([x, y]) => (o1 <= x || o0 >= y ? [[x, y]] : [[x, o0], [o1, y]].filter(([p, q]) => q - p > 0.5)));
  }
  return spans;
}
