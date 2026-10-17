// The last thing light passes through before your eye: a lens that gets rained
// on, a gate that wobbles, stock that grains at 24fps and halates around lamps.
import * as THREE from 'three';

export const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.09 },
    uAberration: { value: 0.0 },
    uVignette: { value: 1.15 },
    uFlash: { value: 0.0 },
    uFade: { value: 0.0 },
    uWet: { value: 0.35 },       // how rained-on the lens is
    uWind: { value: 0.0 },       // drops streak sideways at speed
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uAberration, uVignette, uFlash, uFade, uWet, uWind;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float hash1(float n) { return fract(sin(n) * 43758.5453); }

    // one layer of drops sliding down the glass
    vec3 drops(vec2 uv, float t, float scale, float seed) {
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      vec2 g = uv * aspect * scale + vec2(seed * 13.1, 0.0);
      g.x += uWind * (uv.y - 0.5) * 2.0;
      vec2 id = floor(g);
      vec2 st = fract(g) - 0.5;
      float n = hash(id + seed);
      float life = fract(t * (0.05 + n * 0.08) + n * 7.0);
      vec2 p = vec2((hash(id + 3.1) - 0.5) * 0.55, 0.3 - life * life * 0.8);
      float size = 0.07 + 0.12 * hash(id + 7.7);
      vec2 d = st - p;
      d.y *= 0.85 + life * 0.6;                      // they stretch as they run
      float m = smoothstep(size, size * 0.55, length(d));
      m *= step(1.0 - uWet * 0.85, n) * smoothstep(1.0, 0.75, life) * smoothstep(0.0, 0.08, life);
      return vec3(d / size, m);
    }

    void main() {
      // gate weave: the film never sits perfectly still in the gate
      float frame = floor(uTime * 24.0);
      vec2 weave = vec2(hash1(frame) - 0.5, hash1(frame + 17.0) - 0.5) * vec2(0.0006, 0.0009);
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 uv = 0.5 + c * (1.0 - 0.035 * r2) + weave;   // gentle barrel

      vec3 d1 = drops(vUv, uTime, 7.0, 0.0);
      vec3 d2 = drops(vUv, uTime * 1.3, 13.0, 4.0);
      vec2 refr = (d1.xy * d1.z + d2.xy * d2.z * 0.6) * 0.012;
      float dropMask = max(d1.z, d2.z);
      uv -= refr;

      vec2 off = c * (0.003 + uAberration * 0.03) * (0.4 + r2 * 2.5);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      // drops gather light and soften what's behind them
      vec3 soft = texture2D(tDiffuse, uv + vec2(0.004, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(0.0, 0.004)).rgb;
      col = mix(col, soft * 0.5 * 1.12, dropMask * 0.6);

      // grade: crush blacks, cool the shadows, keep highlights bone-white
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(0.86, 0.96, 1.08), smoothstep(0.35, 0.0, l));
      col = max(col - 0.012, 0.0) * 1.03;

      col *= 1.0 - smoothstep(0.18, 0.78, r2 * uVignette);

      // shutter flicker: exposure is never quite constant
      col *= 1.0 + (hash1(frame * 3.7) - 0.5) * 0.03;

      // grain lives at 24fps and has size; more in the shadows like pushed stock
      vec2 gp = floor(gl_FragCoord.xy / 1.6);
      float g = hash(gp + frame * 1.37) - 0.5;
      g += (hash(floor(gl_FragCoord.xy / 3.4) + frame * 2.11) - 0.5) * 0.6;
      col += g * uGrain * (1.2 - l);

      // the odd speck of dust and hairline scratch
      float dust = step(0.9985, hash(floor(gl_FragCoord.xy / 3.0) + frame * 9.1)) * step(0.6, hash1(frame * 1.3));
      col *= 1.0 - dust * 0.7;
      float sx = hash1(floor(uTime * 6.0) * 5.3);
      float scratch = step(0.93, hash1(floor(uTime * 6.0))) * smoothstep(0.0008, 0.0, abs(vUv.x - sx));
      col += scratch * 0.05;

      col += uFlash * vec3(0.55, 0.6, 0.75);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
