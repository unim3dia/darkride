// Procedural geometry: the '70s land yacht, hooded figures, ruins, pines, steel.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pulseMat } from '../render/pulseMaterial.js';

export const MATS = {
  paint: pulseMat({ color: 0x0b0c0f, roughness: 0.18, metalness: 0.6, envMapIntensity: 1.6 }),
  paintDull: pulseMat({ color: 0x131312, roughness: 0.62, metalness: 0.35, envMapIntensity: 0.5 }),
  chrome: pulseMat({ color: 0x9aa0a8, roughness: 0.22, metalness: 1.0, envMapIntensity: 1.5 }),
  glass: pulseMat({ color: 0x05070a, roughness: 0.04, metalness: 0.9, envMapIntensity: 1.4, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
  rubber: pulseMat({ color: 0x080808, roughness: 0.9, envMapIntensity: 0.1 }),
  whitewall: pulseMat({ color: 0x9a9a96, roughness: 0.6, envMapIntensity: 0.4 }),
  cloth: pulseMat({ color: 0x07080a, roughness: 0.95, envMapIntensity: 0.05 }),
  asphalt: pulseMat({ color: 0x0e1012, roughness: 0.3, metalness: 0.15, envMapIntensity: 0.6 }, { puddles: true }),
  concrete: pulseMat({ color: 0x1a1b1d, roughness: 0.92, envMapIntensity: 0.15 }),
  paint_line: pulseMat({ color: 0x6d7074, roughness: 0.4, envMapIntensity: 0.3 }),
  steel: pulseMat({ color: 0x101114, roughness: 0.55, metalness: 0.8, envMapIntensity: 0.35 }),
  ruin: pulseMat({ color: 0x0d0d10, roughness: 0.95, envMapIntensity: 0.08 }),
  pine: pulseMat({ color: 0x080b0a, roughness: 1.0, envMapIntensity: 0.05 }),
  rust: pulseMat({ color: 0x1a120d, roughness: 0.85, metalness: 0.4, envMapIntensity: 0.2 }),
  // abstract zones: plain cast surfaces in three greys, no detail to read as "building"
  slab: pulseMat({ color: 0x141518, roughness: 0.8, envMapIntensity: 0.12 }),
  slabLight: pulseMat({ color: 0x1d1e22, roughness: 0.7, envMapIntensity: 0.18 }),
  pillar: pulseMat({ color: 0x18191c, roughness: 0.75, envMapIntensity: 0.15 }),
};

export const EYE_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 5.4), fog: false });
export const HEADLIGHT_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.35, 0.95) });
export const TAIL_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.08, 0.05) });
export const SODIUM_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.4, 0.7) });

/** Materials many objects share; never disposed when a chunk streams out. */
export const SHARED_MATS = new Set([...Object.values(MATS), EYE_MAT, HEADLIGHT_MAT, TAIL_MAT, SODIUM_MAT]);

/** Free everything a streamed-out group owns, leaving shared resources alone. */
export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (!SHARED_MATS.has(m) && !m.userData.shared) m.dispose();
  });
}

export const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** Merge anything: strips to position+normal, non-indexed, so mixed sources always combine. */
export function merge(geos) {
  const clean = geos.filter(Boolean).map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', n.attributes.position);
    if (!n.attributes.normal) n.computeVertexNormals();
    out.setAttribute('normal', n.attributes.normal);
    return out;
  });
  return clean.length ? mergeGeometries(clean) : new THREE.BufferGeometry();
}

// ------------------------------------------------------------------ hooded figure

let figureGeo = null;
export function buildFigure() {
  if (!figureGeo) {
    figureGeo = merge([
      new THREE.CylinderGeometry(0.26, 0.44, 1.35, 10).translate(0, 0.72, 0),      // long coat
      new THREE.SphereGeometry(0.4, 10, 8).scale(1.05, 0.5, 0.62).translate(0, 1.42, 0), // shoulders
      box(0.14, 0.75, 0.14, -0.13, 0.05, 0),                                       // legs
      box(0.14, 0.75, 0.14, 0.13, 0.05, 0),
    ]).translate(0, 0.35, 0);
    figureGeo.userData.shared = true;
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(figureGeo, MATS.cloth));
  const head = new THREE.Group();
  head.position.y = 2.02;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10).scale(1, 1.2, 1.05), MATS.cloth);
  const peak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 8).translate(0, 0.32, 0.04), MATS.cloth);
  head.add(hood, peak);
  const eyes = [];
  for (const x of [-0.09, 0.09]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), EYE_MAT.clone());
    e.position.set(x, 0.02, -0.23);
    e.scale.set(1, 1, 0.4);
    head.add(e);
    eyes.push(e);
  }
  g.add(head);
  return { root: g, head, eyes };
}

// ------------------------------------------------------------------ set dressing (merged per chunk)

export function ruinTower(r, x, z, height) {
  const geos = [];
  const w = 8 + r() * 16;
  const d = 8 + r() * 14;
  geos.push(box(w, height, d, x, height / 2 - 30, z));
  // broken crown: jagged teeth and a missing corner
  const teeth = 3 + Math.floor(r() * 5);
  for (let i = 0; i < teeth; i++) {
    const tw = w * (0.12 + r() * 0.25);
    const th = 2 + r() * 9;
    geos.push(box(tw, th, d * (0.3 + r() * 0.7), x + (r() - 0.5) * (w - tw), height - 30 + th / 2, z + (r() - 0.5) * d * 0.3));
  }
  // gutted floors poking out
  if (r() < 0.6) geos.push(box(w * 1.12, 0.6, d * 0.4, x, height * (0.4 + r() * 0.4) - 30, z));
  return geos;
}

export function pineTree(r, x, y, z) {
  const geos = [];
  const h = 14 + r() * 16;
  const layers = 5;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const rad = (1 - t) * (2.6 + r() * 1.2) + 0.4;
    geos.push(new THREE.ConeGeometry(rad, h * 0.32, 7).translate(x, y + h * (0.18 + t * 0.62), z));
  }
  geos.push(new THREE.CylinderGeometry(0.2, 0.3, h * 0.3, 5).translate(x, y + h * 0.12, z));
  return geos;
}

/** A pole with a curved arm; returns geometry and the lamp-head world offset. */
export function lampPost(side) {
  const geos = [
    new THREE.CylinderGeometry(0.1, 0.16, 9, 6).translate(0, 4.5, 0),
    box(2.2, 0.1, 0.1, -side * 1.1, 9, 0),
    box(0.7, 0.18, 0.36, -side * 2.1, 8.92, 0),
  ];
  return { geos, head: new THREE.Vector3(-side * 2.1, 8.85, 0) };
}

export function signTexture(lines) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#050607';
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = '#3fd1c4';
  g.lineWidth = 4;
  g.strokeRect(8, 8, 240, 144);
  g.textAlign = 'center';
  g.font = '700 46px "Syncopate", sans-serif';
  g.fillStyle = '#5ff2e2';
  g.fillText(lines[0], 128, 62);
  g.font = '700 26px "IBM Plex Mono", monospace';
  g.fillStyle = '#ff3b3b';
  g.fillText(lines[1], 128, 104);
  g.font = '400 16px "IBM Plex Mono", monospace';
  g.fillText(lines[2], 128, 134);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
