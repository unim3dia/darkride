// Eyes in the dark: pairs of lights in windows and between trees.
// They open when your pulse washes over them, and close again when it passes.
import * as THREE from 'three';

const vert = /* glsl */ `
  attribute float aOpen;
  attribute vec3 aTint;
  varying vec3 vTint;
  varying float vOpen;
  uniform float uSize;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vTint = aTint;
    vOpen = aOpen;
    gl_PointSize = uSize * aOpen * (420.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  varying vec3 vTint;
  varying float vOpen;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    c.y *= 1.0 + (1.0 - vOpen) * 2.5;   // lids: squash vertically as they close
    float d = length(c);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.15, d);
    gl_FragColor = vec4(vTint * core * 4.0, 1.0);
  }
`;

const TINTS = {
  pines: [[0.9, 0.95, 1.0]],
  ruins: [[1.0, 0.95, 0.85], [0.85, 0.95, 1.0]],
  zone9: [[1.0, 0.75, 0.25], [0.35, 0.9, 1.0], [0.6, 1.0, 0.45]],
  trestle: [[1.0, 0.7, 0.35]],
};

export function eyePoints(spots, kind, r) {
  const n = spots.length * 2;
  const pos = new Float32Array(n * 3);
  const open = new Float32Array(n);
  const tint = new Float32Array(n * 3);
  const pairs = [];
  const tints = TINTS[kind] || TINTS.ruins;
  spots.forEach((p, i) => {
    const t = tints[Math.floor(r() * tints.length)];
    const ang = r() * Math.PI;
    const sep = 0.32;
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      const sgn = k ? 1 : -1;
      pos.set([p.x + Math.cos(ang) * sep * sgn, p.y, p.z + Math.sin(ang) * sep * sgn], j * 3);
      tint.set(t, j * 3);
    }
    pairs.push({ x: p.x, y: p.y, z: p.z, open: 0, hold: 0, blink: 0, idle: r() < 0.25, seed: r() * 50 });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aOpen', new THREE.BufferAttribute(open, 1));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: kind === 'pines' ? 0.32 : 0.55 } },
    vertexShader: vert, fragmentShader: frag, transparent: false, depthWrite: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  return {
    points,
    pairs,
    update(dt, pulses, time, flash) {
      for (let i = 0; i < pairs.length; i++) {
        const e = pairs[i];
        for (const p of pulses) {
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (Math.abs(d - p.r) < 4 && p.age < 1.8) e.hold = 3 + Math.sin(e.seed) * 1.5;
        }
        if (flash > 0.5 && Math.sin(e.seed * 7.1) > 0.3) e.hold = Math.max(e.hold, 1.2);
        const idleOpen = e.idle && Math.sin(time * 0.31 + e.seed) > 0.55;
        e.hold = Math.max(0, e.hold - dt);
        const target = e.hold > 0 || idleOpen ? 1 : 0;
        // open slowly, shut quickly
        e.open += (target - e.open) * Math.min(1, dt * (target ? 2.2 : 6));
        e.blink -= dt;
        if (e.blink < 0) e.blink = 2.5 + ((e.seed * 13.37 + time) % 5);
        const lid = e.blink < 0.12 ? 0.1 : 1;
        open[i * 2] = open[i * 2 + 1] = e.open * lid;
      }
      geo.attributes.aOpen.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
