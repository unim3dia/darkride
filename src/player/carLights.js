// Light you can see the air in: beams through rain, red smear on wet asphalt.
import * as THREE from 'three';
import { glowTexture } from '../world/chunks.js';
import { MATS } from '../world/props.js';

const beamVert = /* glsl */ `
  varying float vAlong;
  varying float vFacing;
  void main() {
    vAlong = 1.0 - uv.y;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);
    vec3 v = normalize(cameraPosition - wp.xyz);
    vFacing = abs(dot(n, v));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const beamFrag = /* glsl */ `
  uniform float uStrength;
  uniform vec3 uColor;
  varying float vAlong;
  varying float vFacing;
  void main() {
    float a = pow(vFacing, 2.2) * pow(1.0 - vAlong, 1.8) * smoothstep(0.0, 0.06, vAlong);
    gl_FragColor = vec4(uColor * a * uStrength, 1.0);
  }
`;

export function buildBeam(len = 26, spread = 4.2) {
  const geo = new THREE.CylinderGeometry(spread, 0.1, len, 24, 1, true);
  geo.rotateX(-Math.PI / 2).translate(0, 0, -len / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0.16 }, uColor: { value: new THREE.Color(1.0, 0.9, 0.72) } },
    vertexShader: beamVert, fragmentShader: beamFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -0.07;
  return m;
}

export function buildTailGlow() {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 7).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff2a1a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  m.position.set(0, 0.04, 4.2);
  return m;
}

/** Two blades parked at the base of the windshield, sweeping across the glass plane. */
export function buildWipers() {
  const plane = new THREE.Group();
  plane.position.set(0, 1.09, -1.16);
  plane.rotation.x = 0.95;
  const blades = [-0.5, 0.32].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0, 0.01);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.78, 0.025).translate(0, 0.39, 0), MATS.steel);
    pivot.add(blade);
    plane.add(pivot);
    return pivot;
  });
  return { group: plane, blades };
}
