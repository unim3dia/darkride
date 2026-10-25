// All feel-tuning lives here. Numbers first, code second.

export const ROAD = {
  HALF_WIDTH: 7.5,
  CHUNK_LEN: 40,
  CHUNKS_AHEAD: 9,
  CHUNKS_BEHIND: 3,
  DECK_HEIGHT: 14,
  GAPS: false,            // broken spans are off while the core loop is found
  LOOP_RADIUS: 1700,      // the ring road: long enough that each zone is a real stretch of driving
  GRADE_FLAT: 270,        // how long the road runs at street level through the district
  GRADE_RAMP: 260,        // climb from street to deck
};

export const CAR = {
  MAX_SPEED: 38,          // m/s (~85 mph)
  REVERSE_SPEED: 8,
  ACCEL: 15,
  BRAKE: 34,
  DRAG: 0.35,
  ROLL_FRICTION: 2.2,
  STEER_RATE: 2.0,        // rad/s at low speed
  STEER_RESPONSE: 9,      // how fast the wheel follows input (attack)
  STEER_RETURN: 6,        // release
  GRIP: 5.5,              // lateral velocity damping on wet asphalt
  GRIP_DRIFT: 1.6,
  GRAVITY: 26,
  RISE_GRAVITY_HELD: 17,  // floatier while you keep the switch held on the way up
  FALL_GRAVITY: 34,       // heavier on the way down: arcs, not parabolas
  HOP_MIN: 5.5,
  HOP_MAX: 13.5,
  CHARGE_TIME: 0.75,      // seconds to full charge
  SIDE_HOP: 7,
  AIR_YAW: 2.4,
  AIR_PITCH: 2.0,
  SUSP_K: 260,            // spring
  SUSP_D: 17,             // damper: settles in one soft dip instead of a jiggle
  // hydraulics: a tap pops a corner, a hold charges the jump
  TAP_HOP: 4.4,           // a plain tap: a light hop of the whole car (m/s up)
  TAP_TIME: 0.2,          // released before this = a pop, after = a jump
  POP_SPEED: 6.4,         // how hard a pop throws the corners up (m/s)
  POP_K: 70,              // corner return spring (soft: it floats, then drops)
  POP_D: 4.5,
  LIFT_FRONT: 0.5,        // Shift held: nose up
  LIFT_SIDE: 0.38,        // Q / E held: three-wheel motion
  LIFT_RATE: 5,           // pump speed
};

export const PULSE = {
  MAX: 6,
  SPEED: 46,              // ring expansion m/s
  BASE_RADIUS: 34,
  IMPACT_RADIUS: 5.5,     // extra radius per m/s of landing speed
  LIFE: 2.6,
};

export const WORLD = {
  FOG_DENSITY: 0.0125,
  ZONE_LEN: 1600,
};

// Zone palettes: drawn from the reference set.
// Zone palettes, drawn from the reference set.
// light: ambient fill · exposure: film speed · fogMul: thickness · rainy: how often it rains (0..1)
// grain: how hard the film stock is pushed (the silver wash)
export const ZONES = [
  {
    name: 'THE UNDERPASS',
    sub: 'lower yards · where the road comes down',
    fog: 0x2e2621, skyTop: 0x0d0a08, skyHorizon: 0x43352a, glow: 0x6e4a32,
    rim: 0xc8a37a, kind: 'district', light: 0.2, exposure: 0.82, fogMul: 1.1, rainy: 0.4, grain: 1.0,
  },
  {
    name: 'ROUTE 9 · PINES',
    sub: 'wet asphalt, no lights for miles',
    fog: 0x26333d, skyTop: 0x0d1419, skyHorizon: 0x3a4a56, glow: 0x3a4652,
    rim: 0x8fa7b8, kind: 'pines', light: 0.32, exposure: 1.0, fogMul: 1.0, rainy: 0.7, grain: 1.0,
  },
  {
    name: 'THE RUINS',
    sub: 'the city that stayed up too late',
    fog: 0x252334, skyTop: 0x0e0c18, skyHorizon: 0x463a62, glow: 0x6b4f8f,
    rim: 0xa497c8, kind: 'ruins', light: 0.3, exposure: 1.0, fogMul: 1.0, rainy: 0.5, grain: 1.05,
  },
  {
    name: 'THE MONOLITHS',
    sub: 'they were here before the road',
    fog: 0x3a3c40, skyTop: 0x0a0a0c, skyHorizon: 0x4c4e53, glow: 0x5c5f66,
    rim: 0xa0a6ae, kind: 'monoliths', light: 0.12, exposure: 0.9, fogMul: 1.5, rainy: 0.15, grain: 1.45,
  },
  {
    name: 'THE NARROWS',
    sub: 'inner city · the dark here is listening',
    fog: 0x34363a, skyTop: 0x08080a, skyHorizon: 0x45474c, glow: 0x55585e,
    rim: 0x9aa0a8, kind: 'narrows', light: 0.1, exposure: 0.84, fogMul: 1.45, rainy: 0.1, grain: 1.35,
  },
  {
    name: 'THE COLONNADE',
    sub: 'a hall with no building around it',
    fog: 0x303236, skyTop: 0x070708, skyHorizon: 0x3e4045, glow: 0x4a4d53,
    rim: 0x9aa0a8, kind: 'colonnade', light: 0.1, exposure: 0.86, fogMul: 1.35, rainy: 0.2, grain: 1.3,
  },
  {
    name: 'PALE',
    sub: 'nothing out here but the car',
    fog: 0x56595e, skyTop: 0x1a1b1e, skyHorizon: 0x62656b, glow: 0x70737a,
    rim: 0xb0b6be, kind: 'pale', light: 0.16, exposure: 0.92, fogMul: 1.8, rainy: 0.0, grain: 1.65,
  },
  {
    name: 'ZONE 9',
    sub: 'danger · no trespassing',
    fog: 0x262130, skyTop: 0x0d0b14, skyHorizon: 0x4a3a5c, glow: 0x7a4f80,
    rim: 0xb59ac2, kind: 'zone9', light: 0.28, exposure: 0.95, fogMul: 1.1, rainy: 0.5, grain: 1.0,
  },
  {
    name: 'UNDER THE TRESTLE',
    sub: 'sodium light, steel, and rain',
    fog: 0x2e261f, skyTop: 0x100c0a, skyHorizon: 0x4a3a2c, glow: 0x6a4a30,
    rim: 0xc8a37a, kind: 'trestle', light: 0.28, exposure: 0.95, fogMul: 1.0, rainy: 0.6, grain: 1.0,
  },
];

// Off-ramps: at `at` (fraction of the loop) a road peels off to `side` (+1 right, -1 left
// when driving with the loop), crosses a pocket world `D` meters out, and merges back
// `len` meters further on. `lift` raises (or sinks) the far part of the road.
export const FORKS = [
  { at: 0.1, side: 1, kind: 'dust', len: 780, D: 250, lift: -8 },
  { at: 0.36, side: -1, kind: 'ether', len: 820, D: 280, lift: 22 },
  { at: 0.6, side: 1, kind: 'sanctum', len: 800, D: 270, lift: 4 },
  { at: 0.8, side: -1, kind: 'ephemera', len: 780, D: 260, lift: 10 },
];

// Detours: off a left-hand ramp, a hard right that spirals down under the ring
// road into a cave, and climbs back out to merge onto the highway from the left.
export const DETOURS = [
  { fork: 'ether', name: 'THE HOLLOW', sub: 'under the road · no wind down here' },
  { fork: 'ephemera', name: 'THE QUIET', sub: 'a cave beneath the ring road' },
];

export const HOMES = [
  { s: 0, kind: 'district' },     // the Underpass
  { s: 0.5, kind: 'narrows' },    // the Narrows, halfway round the ring (fraction of the loop)
];
