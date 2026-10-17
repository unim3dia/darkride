// Fog that lies in layers: sheets of haze at different heights, drifting at
// different speeds, thick in some streets and torn open in others. Driving
// up a ramp you rise through them; in the Narrows they sit at roof height.
import * as THREE from 'three';

const vert = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const frag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDensity, uTime, uScale, uDrift, uCamY;
  uniform vec3 uCam;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.07 + 5.3; a *= 0.5; }
    return v;
  }
  void main() {
    vec2 p = vWorld.xz * uScale + vec2(uTime * uDrift, uTime * uDrift * 0.37);
    float n = fbm(p);
    float sheet = smoothstep(0.38, 0.85, n);
    float dist = length(vWorld.xz - uCam.xz);
    float far = 1.0 - smoothstep(140.0, 300.0, dist);          // dissolve at the edges of the sheet
    float near = smoothstep(0.4, 3.0, abs(uCamY - vWorld.y));   // don't slice the lens
    gl_FragColor = vec4(uColor, sheet * uDensity * far * near);
  }
`;

const LAYERS = [
  { h: 0.7, scale: 0.035, drift: 0.07, weight: 1.0 },
  { h: 2.6, scale: 0.022, drift: -0.05, weight: 0.8 },
  { h: 7.5, scale: 0.014, drift: 0.035, weight: 0.65 },
  { h: 19, scale: 0.009, drift: -0.02, weight: 0.5 },
  { h: 38, scale: 0.006, drift: 0.012, weight: 0.4 },
];

export class FogLayers {
  constructor(scene) {
    this.sheets = LAYERS.map((L) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color() }, uDensity: { value: 0 }, uTime: { value: 0 },
          uScale: { value: L.scale }, uDrift: { value: L.drift }, uCamY: { value: 0 }, uCam: { value: new THREE.Vector3() },
        },
        vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), mat);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      scene.add(mesh);
      return { mesh, mat, L };
    });
    this.base = 0;
  }

  /** Layers ride on whatever ground the car is near; `thick` comes from zone + weather. */
  update(time, camera, groundY, fogColor, thick, inside) {
    this.base += (groundY - this.base) * 0.02;
    for (const { mesh, mat, L } of this.sheets) {
      mesh.position.set(camera.position.x, this.base + L.h, camera.position.z);
      const u = mat.uniforms;
      u.uTime.value = time;
      u.uCamY.value = camera.position.y;
      u.uCam.value.copy(camera.position);
      u.uColor.value.copy(fogColor).multiplyScalar(1.25);
      // in town the low layers pool in the streets; on the deck the high ones matter more
      const low = L.h < 5 ? (inside ? 1.2 : 0.55) : 1;
      u.uDensity.value = Math.min(0.85, 0.28 * thick * L.weight * low);
    }
  }
}
