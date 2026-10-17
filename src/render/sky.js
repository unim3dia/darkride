import * as THREE from 'three';

const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const frag = /* glsl */ `
  uniform vec3 uTop, uHorizon, uGlow, uFog;
  uniform float uTime, uFlash;
  uniform vec2 uFlashDir;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec2 uv = d.xz / max(h + 0.18, 0.05);
    float clouds = fbm(uv * 0.9 + vec2(uTime * 0.012, uTime * 0.004));
    float churn = fbm(uv * 2.3 - vec2(uTime * 0.02, 0.0));
    float c = smoothstep(0.35, 0.85, clouds * 0.75 + churn * 0.35);

    vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.45, h));
    // the bruised glow that sits behind cloud breaks
    float band = exp(-pow((h - 0.08) / 0.16, 2.0));
    col += uGlow * band * (0.35 + 0.65 * (1.0 - c)) * 0.55;
    col = mix(col, col * 0.55, c * smoothstep(0.0, 0.3, h));

    // lightning lights the undersides of clouds
    float fd = length(normalize(d.xz) - uFlashDir);
    col += vec3(0.62, 0.6, 0.82) * uFlash * (0.25 + c * 0.9) * exp(-fd * 1.6) * smoothstep(-0.05, 0.25, h);

    col = mix(uFog, col, smoothstep(-0.06, 0.12, h));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSky(scene) {
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uFlashDir: { value: new THREE.Vector2(0, -1) },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 32, 16),
    new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, uniforms };
}

// ------------------------------------------------------------------ rain

const RAIN_COUNT = 3200;
const BOX = { x: 70, y: 40, z: 70 };

export function createRain(scene) {
  const pos = new Float32Array(RAIN_COUNT * 6);
  const seeds = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i++) {
    seeds[i * 3] = Math.random() * BOX.x - BOX.x / 2;
    seeds[i * 3 + 1] = Math.random() * BOX.y;
    seeds[i * 3 + 2] = Math.random() * BOX.z - BOX.z / 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x8a9aa8, transparent: true, opacity: 0.13, fog: true });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  scene.add(lines);

  let fall = 0;
  return {
    mat,
    update(dt, center, vel, intensity) {
      fall += dt * 34;
      const sx = -vel.x * 0.035;
      const sz = -vel.z * 0.035;
      const len = 0.9 + vel.length() * 0.012;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const k = i * 6;
        const on = i < RAIN_COUNT * intensity;
        const bx = ((seeds[i * 3] - center.x) % BOX.x + BOX.x * 1.5) % BOX.x - BOX.x / 2 + center.x;
        const bz = ((seeds[i * 3 + 2] - center.z) % BOX.z + BOX.z * 1.5) % BOX.z - BOX.z / 2 + center.z;
        const by = center.y - 12 + ((seeds[i * 3 + 1] - fall) % BOX.y + BOX.y) % BOX.y;
        pos[k] = bx; pos[k + 1] = on ? by : -9999; pos[k + 2] = bz;
        pos[k + 3] = bx + sx * len; pos[k + 4] = on ? by + len * 1.6 : -9999; pos[k + 5] = bz + sz * len;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
