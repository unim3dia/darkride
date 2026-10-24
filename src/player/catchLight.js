// Parked cars are black on black, so they used to arrive all at once.
// Their lamp glass catches your headlights a beat early: a faint warm
// glint up front, a dull red one behind. Only when your beam is on them.
import * as THREE from 'three';

/** Where your headlights are and which way they point; main.js updates these every frame. */
export const catchUniforms = {
  uSrc: { value: new THREE.Vector3(0, -1e4, 0) },
  uDir: { value: new THREE.Vector3(0, 0, -1) },
};

const vert = /* glsl */ `
  uniform vec3 uSrc;
  uniform vec3 uDir;
  varying vec2 vUv;
  varying float vI;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);
    vec3 toSrc = uSrc - wp.xyz;
    float d = length(toSrc);
    vec3 l = toSrc / max(d, 0.001);
    float facing = smoothstep(0.05, 0.6, dot(n, l));          // glass turned toward you
    float inBeam = smoothstep(0.8, 0.96, dot(-l, uDir));     // inside your headlight cone
    float range = smoothstep(60.0, 16.0, d) * smoothstep(3.0, 9.0, d);
    vI = facing * inBeam * range;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const frag = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vI;
  void main() {
    vec2 q = (vUv - 0.5) * 2.0;
    float soft = 1.0 - smoothstep(0.0, 1.0, dot(q, q));
    gl_FragColor = vec4(uColor * vI * soft, 1.0);
  }
`;

function glintMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { ...catchUniforms, uColor: { value: color } },
    vertexShader: vert,
    fragmentShader: frag,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
}

export const CATCH_MATS = {
  head: glintMat(new THREE.Color(0.55, 0.47, 0.34)),
  tail: glintMat(new THREE.Color(0.32, 0.03, 0.02)),
};

/** Soft quads just proud of the quad headlamps and the tail lamps. */
export function catchGeos() {
  const heads = [];
  for (const sx of [-1, 1]) for (const dx of [-0.11, 0.11]) {
    heads.push(new THREE.PlaneGeometry(0.26, 0.26).rotateY(Math.PI).translate(sx * 0.86 + dx, 0.74, -2.89));
  }
  const tails = [-1, 1].map((sx) => new THREE.PlaneGeometry(0.16, 0.48).translate(sx * 0.9, 0.74, 2.885));
  return { heads, tails };
}
