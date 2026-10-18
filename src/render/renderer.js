import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { FilmShader } from './filmShader.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  // phones and tablets draw at 1x: the grain hides it, and the frame rate needs it
  const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1400);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // persistence of vision: bright things leave short trails (max-blend), darks don't smear
  const trails = new AfterimagePass(0.55);
  composer.addPass(trails);
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.32, 0.85);
  // halation: the wide bloom mips go red-orange, like light scattering back through film base
  bloom.bloomTintColors = [
    new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 0.92, 0.85), new THREE.Vector3(1, 0.72, 0.55),
    new THREE.Vector3(1, 0.5, 0.36), new THREE.Vector3(0.9, 0.36, 0.26),
  ];
  bloom.compositeMaterial.uniforms.bloomTintColors.value = bloom.bloomTintColors;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const final = new ShaderPass(FilmShader);
  composer.addPass(final);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    final.uniforms.uResolution.value.set(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, composer, bloom, trails, post: final.uniforms };
}
