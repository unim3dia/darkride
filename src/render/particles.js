// One pooled particle system for sparks, spray and dust.
import * as THREE from 'three';

const MAX = 900;

const vert = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vColor = aColor;
    vAlpha = aAlpha * smoothstep(1.5, 5.0, -mv.z);
    gl_PointSize = min(aSize * (300.0 / -mv.z), 90.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor * vAlpha * pow(smoothstep(0.5, 0.0, d), 1.6), 1.0);
  }
`;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.p = Array.from({ length: MAX }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, size: 1, r: 1, gg: 1, b: 1 }));
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, { life = 0.6, size = 0.15, color = [3, 1.4, 0.4], gravity = 18, drag = 0.5 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const p = this.p[i];
    p.life = p.max = life * (0.7 + Math.random() * 0.6);
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.g = gravity; p.drag = drag; p.size = size;
    [p.r, p.gg, p.b] = color;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
  }

  sparks(x, y, z, dirX, dirZ, n, speed = 9) {
    for (let i = 0; i < n; i++) {
      const s = speed * (0.4 + Math.random());
      this.emit(x, y, z,
        dirX * s + (Math.random() - 0.5) * 6, 1 + Math.random() * 5, dirZ * s + (Math.random() - 0.5) * 6,
        { life: 0.5, size: 0.09 + Math.random() * 0.08, color: [4, 1.6 + Math.random(), 0.35], gravity: 22, drag: 0.6 });
    }
  }

  spray(x, y, z, n, power, tint = [0.3, 0.3, 0.31]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = power * (0.4 + Math.random() * 0.8);
      this.emit(x + Math.cos(a) * 1.5, y + 0.1, z + Math.sin(a) * 2.2,
        Math.cos(a) * s, 1.5 + Math.random() * power * 0.5, Math.sin(a) * s,
        { life: 1.1, size: 0.9 + Math.random() * 1.2, color: tint.map((c) => c * 0.35), gravity: 7, drag: 2.2 });
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (p.life <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.g * dt;
      this.pos[i * 3] += p.vx * dt;
      this.pos[i * 3 + 1] += p.vy * dt;
      this.pos[i * 3 + 2] += p.vz * dt;
      const t = Math.max(0, p.life / p.max);
      this.alpha[i] = t;
      this.size[i] = p.size * (0.5 + t * 0.5);
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.gg * (0.6 + 0.4 * t); this.col[i * 3 + 2] = p.b;
    }
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[k].needsUpdate = true;
  }
}
