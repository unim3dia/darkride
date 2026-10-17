// Marks painted in something only your pulse can light: eyes over doorways
// where a Watcher waits, arrows down alleys, half-sentences from whoever was here.
import * as THREE from 'three';
import { glyphMat } from '../render/pulseMaterial.js';

const cache = new Map();

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.strokeStyle = g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  draw(g, w, h);
  // chalk: knock holes in the strokes so they read hand-made
  const img = g.getImageData(0, 0, w, h);
  for (let i = 3; i < img.data.length; i += 4) if (Math.random() < 0.28) img.data[i] *= Math.random();
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

const DRAW = {
  eye: (g, w, h) => {
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(20, h / 2);
    g.quadraticCurveTo(w / 2, 10, w - 20, h / 2);
    g.quadraticCurveTo(w / 2, h - 10, 20, h / 2);
    g.stroke();
    g.beginPath();
    g.arc(w / 2, h / 2, h * 0.17, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      g.beginPath();
      g.moveTo(w / 2 + Math.cos(a) * w * 0.36, h / 2 + Math.sin(a) * h * 0.55);
      g.lineTo(w / 2 + Math.cos(a) * w * 0.46, h / 2 + Math.sin(a) * h * 0.75);
      g.stroke();
    }
  },
  arrow: (g, w, h) => {
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(24, h / 2);
    g.lineTo(w - 40, h / 2);
    g.moveTo(w - 90, h / 2 - 50);
    g.lineTo(w - 30, h / 2);
    g.lineTo(w - 90, h / 2 + 50);
    g.stroke();
  },
  spiral: (g, w, h) => {
    g.lineWidth = 8;
    g.beginPath();
    for (let t = 0; t < 26; t += 0.1) {
      const r = t * 4.2;
      const x = w / 2 + Math.cos(t) * r;
      const y = h / 2 + Math.sin(t) * r;
      t === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  },
  car: (g, w, h) => {
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(20, h * 0.65); g.lineTo(w * 0.2, h * 0.65); g.lineTo(w * 0.32, h * 0.38); g.lineTo(w * 0.66, h * 0.38);
    g.lineTo(w * 0.78, h * 0.62); g.lineTo(w - 20, h * 0.66); g.stroke();
    for (const x of [0.28, 0.74]) { g.beginPath(); g.arc(w * x, h * 0.72, h * 0.1, 0, Math.PI * 2); g.stroke(); }
    // little hop lines
    for (const x of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(w * x, h * 0.95); g.lineTo(w * x, h * 0.84); g.stroke(); }
  },
};

function textTexture(text) {
  return canvas(1024, 160, (g, w, h) => {
    g.font = '600 64px "IBM Plex Mono", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
  });
}

function texture(kind) {
  if (!cache.has(kind)) {
    const t = DRAW[kind] ? canvas(512, 256, DRAW[kind]) : textTexture(kind);
    cache.set(kind, t);
  }
  return cache.get(kind);
}

const INKS = { eye: 0xbfeaff, arrow: 0x9fe8ff, spiral: 0xd7c6ff, car: 0xffd2a0 };

/**
 * A mark on a wall. `normalYaw` is the world yaw the painted face looks toward.
 * Text marks are wide and short; symbols are 2:1.
 */
export function glyph(kind, pos, normalYaw, size = 3) {
  const isText = !DRAW[kind];
  const mat = glyphMat(texture(kind), INKS[kind] ?? 0xe8eef2);
  mat.userData.shared = false;
  const geo = new THREE.PlaneGeometry(isText ? size * 3.2 : size, isText ? size * 0.5 : size * 0.5);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos);
  m.rotation.y = normalYaw;
  m.renderOrder = 2;
  return m;
}
