// The hop-pulse: every world surface shares these uniforms. When the car slams
// down, a ring of pale light expands and draws the world in contour lines.
import * as THREE from 'three';
import { PULSE } from '../config.js';

export const pulseUniforms = {
  uPulse: { value: Array.from({ length: PULSE.MAX }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uPulseColor: { value: new THREE.Color(0xd8e6ee) },
  uTime: { value: 0 },
};

const VERT_HEAD = /* glsl */ `
varying vec3 vPulseWorld;
varying vec3 vPulseNormal;
`;

const VERT_BODY = /* glsl */ `
#include <fog_vertex>
{
  vec4 pw = vec4(transformed, 1.0);
  vec3 pn = objectNormal;
  #ifdef USE_INSTANCING
    pw = instanceMatrix * pw;
    pn = mat3(instanceMatrix) * pn;
  #endif
  pw = modelMatrix * pw;
  vPulseWorld = pw.xyz;
  vPulseNormal = normalize(mat3(modelMatrix) * pn);
}
`;

const FRAG_HEAD = /* glsl */ `
#define PULSE_MAX ${PULSE.MAX}
uniform vec4 uPulse[PULSE_MAX];
uniform vec3 uPulseColor;
uniform float uTime;
varying vec3 vPulseWorld;
varying vec3 vPulseNormal;

float pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1, 0)), u.x), mix(pHash(i + vec2(0, 1)), pHash(i + vec2(1, 1)), u.x), u.y);
}

vec3 pulseLight(vec3 wp, vec3 wn) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < PULSE_MAX; i++) {
    vec4 p = uPulse[i];
    if (p.w <= 0.001) continue;
    vec2 dv = wp.xz - p.xy;
    float d = length(dv);
    // the ring isn't a perfect circle: it wobbles like a wave over uneven ground
    float ang = atan(dv.y, dv.x);
    float r = p.z + sin(ang * 5.0 + p.z * 0.31) * 0.9 + sin(ang * 13.0 - p.z * 0.17) * 0.45 + (vnoise(wp.xz * 0.35) - 0.5) * 2.2;
    float edge = exp(-pow((d - r) / (1.1 + vnoise(wp.xz * 0.2 + p.z) * 0.9), 2.0));
    float behind = step(d, r) * exp(-(r - d) / 9.0);
    vec3 toC = normalize(vec3(p.x - wp.x, 2.0, p.y - wp.z));
    float face = 0.35 + 0.65 * max(dot(wn, toC), 0.0);
    // contour lines: horizontal bands on walls, concentric rings on floors
    float yl = 1.0 - smoothstep(0.035, 0.11, abs(fract(wp.y * 1.15) - 0.5));
    float dl = 1.0 - smoothstep(0.035, 0.11, abs(fract(d * 0.42) - 0.5));
    float lines = mix(yl, dl, smoothstep(0.6, 0.9, abs(wn.y)));
    lines *= 0.35 + 0.65 * smoothstep(0.25, 0.6, vnoise(wp.xz * 1.7 + wp.y * 2.3)); // chalky, broken scan
    float shimmer = 0.85 + 0.15 * sin(d * 0.9 - uTime * 7.0);
    acc += uPulseColor * p.w * face * (edge * 1.1 + behind * (0.05 + 0.85 * lines * shimmer));
  }
  // never flare the lens: surfaces right next to the camera stay quiet
  return acc * smoothstep(2.0, 10.0, distance(wp, cameraPosition));
}
`;

const PUDDLE = /* glsl */ `
#include <roughnessmap_fragment>
{
  float pud = vnoise(vPulseWorld.xz * 0.11) * 0.7 + vnoise(vPulseWorld.xz * 0.43) * 0.3;
  pud = smoothstep(0.52, 0.66, pud);
  roughnessFactor = mix(roughnessFactor, 0.035, pud);
  diffuseColor.rgb *= mix(1.0, 0.45, pud);
}
`;

function patch(shader) {
  Object.assign(shader.uniforms, pulseUniforms);
  shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <fog_vertex>', VERT_BODY);
  shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    'outgoingLight += pulseLight(vPulseWorld, normalize(vPulseNormal));\n#include <opaque_fragment>'
  );
}

/** A MeshStandardMaterial that the hop-pulse can light. `puddles` adds standing water. */
export function pulseMat(params = {}, { puddles = false } = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1, ...params });
  m.onBeforeCompile = (shader) => {
    patch(shader);
    if (puddles) shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', PUDDLE);
  };
  m.customProgramCacheKey = () => (puddles ? 'pulse-puddle' : 'pulse');
  return m;
}

/** Push a new pulse into the ring buffer. */
const live = [];
export function emitPulse(x, z, strength, maxRadius) {
  if (live.length >= PULSE.MAX) live.shift();
  live.push({ x, z, r: 0, age: 0, strength, maxRadius });
}

export function updatePulses(dt, time) {
  pulseUniforms.uTime.value = time;
  for (let i = live.length - 1; i >= 0; i--) {
    const p = live[i];
    p.age += dt;
    p.r = Math.min(p.maxRadius, p.r + PULSE.SPEED * dt * (1.15 - p.r / p.maxRadius * 0.7));
    if (p.age > PULSE.LIFE) live.splice(i, 1);
  }
  const arr = pulseUniforms.uPulse.value;
  for (let i = 0; i < PULSE.MAX; i++) {
    const p = live[i];
    if (!p) { arr[i].set(0, 0, 0, 0); continue; }
    const fade = Math.pow(1 - p.age / PULSE.LIFE, 1.6);
    arr[i].set(p.x, p.z, p.r, p.strength * fade);
  }
}

/** Rings currently expanding, for gameplay reactions (watchers, lamps, chains). */
export function livePulses() {
  return live;
}

// ---------------------------------------------------------------- hidden marks

const GLYPH_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const GLYPH_FRAG = /* glsl */ `
#define PULSE_MAX ${PULSE.MAX}
uniform vec4 uPulse[PULSE_MAX];
uniform sampler2D uMap;
uniform vec3 uInk;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
#include <fog_pars_fragment>
void main() {
  float reveal = 0.0;
  for (int i = 0; i < PULSE_MAX; i++) {
    vec4 p = uPulse[i];
    if (p.w <= 0.001) continue;
    float d = length(vWorld.xz - p.xy);
    float edge = exp(-pow((d - p.z) / 2.0, 2.0));
    float behind = step(d, p.z) * exp(-(p.z - d) / 14.0);
    reveal += p.w * (edge * 1.6 + behind);
  }
  float ink = texture2D(uMap, vUv).a;
  float flick = 0.9 + 0.1 * sin(uTime * 31.0 + vWorld.x);
  gl_FragColor = vec4(uInk * ink * min(reveal, 1.6) * flick * 2.2, 1.0);
  #ifdef USE_FOG
    // additive ink fades into fog instead of mixing toward it
    gl_FragColor.rgb *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #endif
}
`;

/**
 * Paint that only exists in pulse light: marks on walls that point the way
 * to things, invisible until you land nearby.
 */
export function glyphMat(texture, ink = 0x9fe8ff) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uMap: { value: texture },
      uInk: { value: new THREE.Color(ink) },
      uPulse: pulseUniforms.uPulse,
      uTime: pulseUniforms.uTime,
    },
    vertexShader: GLYPH_VERT,
    fragmentShader: GLYPH_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
}

// ---------------------------------------------------------------- evaporating structure

/** Shared by every dissolving surface: where the car is, and the near/far dissolve band. */
export const dissolveUniforms = {
  uCar: { value: new THREE.Vector3() },
  uDissolve: { value: new THREE.Vector2(26, 95) },
};

const DISSOLVE_HEAD = /* glsl */ `
uniform vec3 uCar;
uniform vec2 uDissolve;
float dissolveEdge = 0.0;
`;

const DISSOLVE_BODY = /* glsl */ `
{
  float dd = distance(vPulseWorld.xz, uCar.xz);
  float gone = smoothstep(uDissolve.y, uDissolve.x, dd);   // solid far away, evaporating up close
  float n = vnoise(vPulseWorld.xz * 0.33 + vPulseWorld.y * 0.21) * 0.6 + vnoise(vPulseWorld.xy * 1.4 + vPulseWorld.z * 0.7) * 0.4;
  if (n < gone) discard;
  dissolveEdge = smoothstep(0.07, 0.0, n - gone) * step(0.001, gone);
}
`;

/**
 * Structure you can make out from a distance that comes apart as you near it:
 * a pulse-lit surface whose fragments drop away around the car, edges faintly lit.
 */
export function dissolveMat(params = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide, ...params });
  m.onBeforeCompile = (shader) => {
    patch(shader);
    Object.assign(shader.uniforms, dissolveUniforms);
    shader.fragmentShader = DISSOLVE_HEAD + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + DISSOLVE_BODY)
      .replace('#include <opaque_fragment>', 'outgoingLight += vec3(0.55, 0.52, 0.48) * dissolveEdge * 0.5;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'pulse-dissolve';
  return m;
}

// ---------------------------------------------------------------- the road that isn't there

const FADE_BODY = /* glsl */ `
{
  // only the ground right under you exists; past that it comes apart into nothing
  float dd = distance(vPulseWorld.xz, uCar.xz);
  float gone = smoothstep(9.0, 34.0, dd);
  float n = vnoise(vPulseWorld.xz * 0.5) * 0.65 + vnoise(vPulseWorld.xz * 2.1) * 0.35;
  if (n < gone) discard;
  dissolveEdge = smoothstep(0.08, 0.0, n - gone) * step(0.001, gone);
}
`;

/** Road surface deep in a pocket world: solid beneath the car, evaporating ahead and behind. */
export function fadingRoadMat(params = {}) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.15, envMapIntensity: 0.6, ...params });
  m.onBeforeCompile = (shader) => {
    patch(shader);
    Object.assign(shader.uniforms, dissolveUniforms);
    shader.fragmentShader = DISSOLVE_HEAD + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FADE_BODY)
      .replace('#include <opaque_fragment>', 'outgoingLight += vec3(0.6, 0.62, 0.66) * dissolveEdge * 0.35;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'pulse-fade-road';
  return m;
}
