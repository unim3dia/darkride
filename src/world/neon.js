// Neon on a black board: two lines, two colors, a soft tube glow.
import * as THREE from 'three';

export function neonTexture(top, bottom, [c1, c2]) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const tube = (text, y, font, color) => {
    g.font = font;
    g.shadowColor = color;
    for (const [blur, width, alpha] of [[28, 10, 0.35], [12, 5, 0.7], [0, 2.4, 1]]) {
      g.shadowBlur = blur;
      g.lineWidth = width;
      g.strokeStyle = color;
      g.globalAlpha = alpha;
      g.strokeText(text, 256, y);
    }
    g.globalAlpha = 1;
  };
  tube(top, 100, '700 92px "Syncopate", sans-serif', hex(c1));
  tube(bottom, 190, '500 40px "IBM Plex Mono", monospace', hex(c2));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
