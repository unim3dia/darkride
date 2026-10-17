// The only HUD is the dashboard: green numerals, orange needles, and a row of
// little lamps, one pair for every gaze you've carried home.
import * as THREE from 'three';

const W = 640;
const H = 220;

function gauge(g, cx, cy, rad, value, max, label, ticks, warn) {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = 'rgba(70,255,150,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, rad, Math.PI * 0.75, Math.PI * 2.25);
  g.stroke();
  g.shadowColor = '#3dff8f';
  g.shadowBlur = 10;
  g.fillStyle = '#5dff9e';
  g.font = `600 ${Math.round(rad * 0.2)}px "IBM Plex Mono", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i <= ticks; i++) {
    const a = Math.PI * 0.75 + (i / ticks) * Math.PI * 1.5;
    const hot = warn && i / ticks > warn;
    g.strokeStyle = hot ? '#ff5a3a' : '#5dff9e';
    g.beginPath();
    g.moveTo(Math.cos(a) * rad * 0.86, Math.sin(a) * rad * 0.86);
    g.lineTo(Math.cos(a) * rad * 0.98, Math.sin(a) * rad * 0.98);
    g.stroke();
    if (i % 2 === 0) {
      g.fillStyle = hot ? '#ff6a4a' : '#5dff9e';
      g.fillText(String(Math.round((i / ticks) * max)), Math.cos(a) * rad * 0.68, Math.sin(a) * rad * 0.68);
    }
  }
  g.fillStyle = 'rgba(255,170,60,0.85)';
  g.font = `500 ${Math.round(rad * 0.15)}px "IBM Plex Mono", monospace`;
  g.fillText(label, 0, rad * 0.42);
  // needle
  const a = Math.PI * 0.75 + Math.min(1, value / max) * Math.PI * 1.5;
  g.shadowColor = '#ff7a2a';
  g.shadowBlur = 14;
  g.strokeStyle = '#ff6a2a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-Math.cos(a) * rad * 0.12, -Math.sin(a) * rad * 0.12);
  g.lineTo(Math.cos(a) * rad * 0.9, Math.sin(a) * rad * 0.9);
  g.stroke();
  g.fillStyle = '#1a0c06';
  g.beginPath();
  g.arc(0, 0, rad * 0.07, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export class Gauges {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mph = 0;
    this.psi = 0;
    this.eyes = 0;
    this.flash = 0;
    this.frame = 0;
  }

  /** Needles have mass too: they overshoot and settle. */
  update(dt, speed, charge, eyes, time) {
    this.frame++;
    const targetMph = speed * 2.237;
    this.mphV = (this.mphV || 0) + ((targetMph - this.mph) * 60 - (this.mphV || 0) * 9) * dt;
    this.mph += this.mphV * dt;
    const targetPsi = 20 + charge * 160 + Math.sin(time * 13) * 2;
    this.psi += (targetPsi - this.psi) * Math.min(1, dt * 10);
    if (eyes > this.eyes) this.flash = 1;
    this.eyes = eyes;
    this.flash = Math.max(0, this.flash - dt * 0.8);
    if (this.frame % 2) return; // 30fps is plenty for a dashboard
    this.draw(time);
  }

  draw(time) {
    const g = this.g;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(2,4,4,0.0)';
    g.fillRect(0, 0, W, H);
    gauge(g, 120, 112, 92, Math.max(0, this.mph), 120, 'MPH', 12, 0.8);
    gauge(g, 300, 128, 62, this.psi, 200, 'PSI', 8, 0.75);

    // eye lamps
    g.save();
    g.textAlign = 'left';
    g.font = '500 13px "IBM Plex Mono", monospace';
    g.fillStyle = 'rgba(255,170,60,0.8)';
    g.fillText('PASSENGERS', 400, 52);
    const cols = 6;
    for (let i = 0; i < 18; i++) {
      const x = 410 + (i % cols) * 36;
      const y = 82 + Math.floor(i / cols) * 34;
      const lit = i < this.eyes;
      const pulse = lit && i === this.eyes - 1 ? this.flash : 0;
      const k = lit ? 0.75 + 0.25 * Math.sin(time * 1.3 + i) : 0.1;
      g.shadowColor = '#e8f4ff';
      g.shadowBlur = lit ? 12 + pulse * 20 : 0;
      g.fillStyle = `rgba(230,244,255,${k + pulse * 0.3})`;
      for (const dx of [-6, 6]) {
        g.beginPath();
        g.arc(x + dx, y, 4 + pulse * 2, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
    this.texture.needsUpdate = true;
  }
}
