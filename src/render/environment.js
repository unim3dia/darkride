// A tiny procedural reflection world: fog-lit sky, a darker ground, and a few
// soft strips of sodium light. Black paint and wet asphalt only exist in
// what they reflect, so this is what makes the car readable at night.
import * as THREE from 'three';

const vert = /* glsl */ `
  varying vec3 vDir;
  void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const frag = /* glsl */ `
  uniform vec3 uSky, uHorizon, uGround, uWarm;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 c = mix(uHorizon, uSky, smoothstep(0.0, 0.6, h));
    c = mix(c, uGround, smoothstep(0.02, -0.25, h));
    c += uHorizon * 0.8 * exp(-pow(h / 0.06, 2.0));             // bright fog line
    float strip = smoothstep(0.985, 1.0, sin(atan(vDir.z, vDir.x) * 3.0)) * smoothstep(0.1, 0.35, h) * smoothstep(0.7, 0.4, h);
    c += uWarm * strip * 1.6;                                    // distant lamp smears
    gl_FragColor = vec4(c, 1.0);
  }
`;

export class Reflections {
  constructor(renderer, scene) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.scene = scene;
    this.envScene = new THREE.Scene();
    this.uniforms = {
      uSky: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color(0x020203) },
      uWarm: { value: new THREE.Color(0xff9a50) },
    };
    this.envScene.add(new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide })
    ));
    this.target = null;
  }

  /** Rebuild for a zone palette (cheap; done only on zone change). */
  set(zone) {
    this.uniforms.uSky.value.set(zone.skyTop).multiplyScalar(1.4);
    this.uniforms.uHorizon.value.set(zone.skyHorizon).multiplyScalar(1.5);
    this.uniforms.uWarm.value.set(['pines', 'monoliths', 'colonnade', 'pale', 'narrows'].includes(zone.kind) ? 0x7a8a98 : 0xff9a50);
    const old = this.target;
    this.target = this.pmrem.fromScene(this.envScene, 0.02);
    this.scene.environment = this.target.texture;
    old?.dispose();
  }
}
