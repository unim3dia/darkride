// The map, from the title screen: the ring, every exit, every place, drawn from
// the live game data so it is always true to the course.
import { sample, zoneIndexAt, LOOP_LEN } from '../world/track.js';
import { ZONES } from '../config.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/**
 * @param D the game handle: { forks, herdRoad, hood, race, district, narrows, places }
 * @returns a canvas with the map drawn on it
 */
export function drawMap(D, size = 2000) {
  const W = size;
  const H = size;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const roads = [...D.forks.spurs, D.herdRoad, D.hood.spur, D.race.track];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const grow = (x, z) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); };
  for (let s = 0; s < LOOP_LEN; s += 50) { const q = sample(s); grow(q.x, q.z); }
  for (const sp of roads) for (let t = 0; t < sp.N; t += 20) grow(sp.X[t], sp.Z[t]);
  const pad = W * 0.16;
  const scale = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const X = (x) => W / 2 + (x - cx) * scale;
  const Y = (z) => H / 2 + 30 + (z - cz) * scale;
  const k = W / 2000;
  g.fillStyle = '#0b0c0d';
  g.fillRect(0, 0, W, H);
  const font = (s) => `700 ${s * k}px "Syncopate", sans-serif`;
  const mono = (s) => `500 ${s * k}px "IBM Plex Mono", monospace`;
  const text = (t, x, y, f, col, align = 'center') => {
    g.font = f; g.textAlign = align; g.textBaseline = 'middle'; g.letterSpacing = `${3 * k}px`;
    g.lineJoin = 'round'; g.strokeStyle = 'rgba(11,12,13,0.95)'; g.lineWidth = 8 * k; g.strokeText(t, x, y);
    g.fillStyle = col; g.fillText(t, x, y); g.letterSpacing = '0px';
  };
  const line = (pts, col, w, dash = []) => {
    g.strokeStyle = col; g.lineWidth = w * k; g.setLineDash(dash.map((d) => d * k)); g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.stroke(); g.setLineDash([]);
  };
  const path = (sp, t0 = 0, t1 = sp.N, step = 5) => { const p = []; for (let t = t0; t < t1; t += step) p.push([sp.X[t], sp.Z[t]]); return p; };

  // the ring, coloured zone by zone
  let cur = null;
  let seg = [];
  const segs = [];
  for (let s = 0; s <= LOOP_LEN; s += 10) {
    const z = zoneIndexAt(s % LOOP_LEN);
    const q = sample(s % LOOP_LEN);
    if (z !== cur) { if (seg.length) segs.push({ z: cur, pts: seg }); seg = seg.length ? [seg[seg.length - 1]] : []; cur = z; }
    seg.push([q.x, q.z]);
  }
  segs.push({ z: cur, pts: seg });
  for (const sg of segs) line(sg.pts, 'rgba(0,0,0,0.9)', 14);
  for (const sg of segs) line(sg.pts, hex(ZONES[sg.z].rim), 6);
  let rx = 0, rz = 0, n = 0;
  for (let s = 0; s < LOOP_LEN; s += 100) { const q = sample(s); rx += q.x; rz += q.z; n++; }
  rx /= n; rz /= n;
  const out = (x, z, d) => { const dx = x - rx, dz = z - rz, l = Math.hypot(dx, dz); return [X(x + dx / l * d), Y(z + dz / l * d)]; };
  const mid = (sp, u = 0.5) => { let t = 0; while (t < sp.N - 1 && sp.U[t] < u) t++; return t; };

  // exits
  for (const sp of D.forks.spurs) { line(path(sp), 'rgba(0,0,0,0.9)', 10); line(path(sp), 'rgba(217,226,230,0.75)', 3, [10, 7]); }
  for (const det of D.forks.detours) {
    line(path(det, 0, det.N, 3), 'rgba(0,0,0,0.9)', 9); line(path(det, 0, det.N, 3), '#7fb7c9', 2.5);
    line(path(det, det.tCaveA, det.tCaveB, 3), '#7fb7c9', 9);
  }
  const special = [[D.herdRoad, '#d6aa6e'], [D.hood.spur, '#ff9a5a'], [D.race.track, '#bfe9ff']];
  for (const [sp, col] of special) { line(path(sp), 'rgba(0,0,0,0.9)', 10); line(path(sp), col, 4); }
  for (const pl of D.extras || []) if (pl.spur) { line(path(pl.spur), 'rgba(0,0,0,0.9)', 10); line(path(pl.spur), pl.color, 4); }

  // the street-level towns
  const town = (d) => {
    const cs = [[-d.DU, -d.DV], [d.DU, -d.DV], [d.DU, d.DV], [-d.DU, d.DV]].map(([u, v]) => d.toWorld(u, v));
    g.beginPath(); cs.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.z)) : g.moveTo(X(q.x), Y(q.z)))); g.closePath();
    g.fillStyle = 'rgba(200,163,122,0.12)'; g.fill(); g.strokeStyle = 'rgba(200,163,122,0.6)'; g.lineWidth = 1.5 * k; g.stroke();
    return d.toWorld(0, 0);
  };
  const uo = town(D.district);
  const no = town(D.narrows);

  // labels: placed in a ring outside the course, pushed apart so none overlap
  const labels = [];
  const zoneMid = {};
  for (const sg of segs) if (!zoneMid[sg.z] || sg.pts.length > zoneMid[sg.z].length) zoneMid[sg.z] = sg.pts;
  for (const [z, pts] of Object.entries(zoneMid)) {
    const Z = ZONES[z];
    if (Z.kind === 'district' || Z.kind === 'narrows') continue;
    const [x, zz] = pts[Math.floor(pts.length / 2)];
    labels.push({ t: Z.name, col: hex(Z.rim), size: 15, at: [X(x), Y(zz)], d: -1 });
  }
  const pocket = (sp, i) => ({ t: D.forks.pockets[i].name || sp.kind.toUpperCase(), sub: 'pocket world', col: '#e6edf0', size: 18, at: [X(sp.X[mid(sp)]), Y(sp.Z[mid(sp)])], d: 1 });
  D.forks.spurs.forEach((sp, i) => labels.push(pocket(sp, i)));
  for (const det of D.forks.detours) { const m = Math.floor((det.tCaveA + det.tCaveB) / 2); labels.push({ t: det.name, sub: 'cave', col: '#9fd4e4', size: 15, at: [X(det.X[m]), Y(det.Z[m])], d: -1 }); }
  labels.push({ t: 'THE CHARGE', sub: 'the herd', col: '#e8bd80', size: 18, at: [X(D.herdRoad.X[mid(D.herdRoad)]), Y(D.herdRoad.Z[mid(D.herdRoad)])], d: 1 });
  labels.push({ t: 'THE BLOCK', sub: 'one shot', col: '#ffb07a', size: 15, at: [X(D.hood.spur.X[mid(D.hood.spur)]), Y(D.hood.spur.Z[mid(D.hood.spur)])], d: -1 });
  labels.push({ t: 'THE CIRCUIT', sub: 'one long lap', col: '#bfe9ff', size: 17, at: [X(D.race.track.X[mid(D.race.track)]), Y(D.race.track.Z[mid(D.race.track)])], d: 1 });
  for (const pl of D.extras || []) labels.push({ t: pl.name, sub: pl.sub, col: pl.color, size: 15, at: [X(pl.at.x), Y(pl.at.z)], d: pl.d || 1 });
  labels.push({ t: 'THE UNDERPASS', sub: 'start', col: '#e8c9a0', size: 19, at: [X(uo.x), Y(uo.z)], d: -1 });
  labels.push({ t: 'THE NARROWS', sub: 'the inner city', col: '#e8c9a0', size: 19, at: [X(no.x), Y(no.z)], d: -1 });
  labels.push({ t: 'DRIVE-IN', sub: '', col: '#ffd27a', size: 13, at: [X(D.driveIn.x), Y(D.driveIn.z)], d: 1 });

  // start each label pushed out from (or into) the ring, then relax overlaps
  const cX = X(rx), cY = Y(rz);
  for (const L of labels) {
    const dx = L.at[0] - cX, dy = L.at[1] - cY, l = Math.hypot(dx, dy) || 1;
    const push = (L.d > 0 ? 120 : -150) * k;
    L.x = L.at[0] + (dx / l) * push;
    L.y = L.at[1] + (dy / l) * push;
    g.font = font(L.size);
    L.w = g.measureText(L.t).width + L.t.length * 3 * k + 16 * k;
    L.h = (L.size + (L.sub ? 24 : 6)) * k;
  }
  for (let it = 0; it < 200; it++) {
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const A = labels[i], B = labels[j];
        const ox = (A.w + B.w) / 2 - Math.abs(A.x - B.x);
        const oy = (A.h + B.h) / 2 - Math.abs(A.y - B.y);
        if (ox > 0 && oy > 0) {
          if (oy < ox) { const s = Math.sign(A.y - B.y) || 1; A.y += s * oy / 2; B.y -= s * oy / 2; }
          else { const s = Math.sign(A.x - B.x) || 1; A.x += s * ox / 2; B.x -= s * ox / 2; }
        }
      }
    }
    for (const L of labels) { L.x = Math.min(W - L.w / 2 - 20 * k, Math.max(L.w / 2 + 20 * k, L.x)); L.y = Math.min(H - 60 * k, Math.max(170 * k, L.y)); }
  }
  for (const L of labels) {
    const far = Math.hypot(L.x - L.at[0], L.y - L.at[1]) > 40 * k;
    if (far) {
      g.strokeStyle = 'rgba(230,237,240,0.3)'; g.lineWidth = 1.2 * k;
      g.beginPath(); g.moveTo(L.at[0], L.at[1]); g.lineTo(L.x, L.y + (L.y > L.at[1] ? -L.h / 2 : L.h / 2)); g.stroke();
      g.beginPath(); g.arc(L.at[0], L.at[1], 4 * k, 0, 7); g.fillStyle = L.col; g.fill();
    }
    text(L.t, L.x, L.y, font(L.size), L.col);
    if (L.sub) text(L.sub, L.x, L.y + (L.size + 6) * k, mono(13), 'rgba(230,237,240,0.65)');
  }
  // the start
  const st = D.start;
  g.beginPath(); g.arc(X(st.x), Y(st.z), 8 * k, 0, 7); g.fillStyle = '#fff'; g.fill();

  // you: a pulsing red arrow pointing the way the car faces, and where that is
  if (D.here) {
    const hx = X(D.here.x), hy = Y(D.here.z);
    for (const [r, a] of [[70, 0.12], [44, 0.25]]) { g.beginPath(); g.arc(hx, hy, r * k, 0, 7); g.fillStyle = `rgba(255,60,50,${a})`; g.fill(); }
    g.save();
    g.translate(hx, hy);
    g.rotate(Math.atan2(-Math.cos(D.here.yaw), Math.sin(D.here.yaw)));
    g.beginPath(); g.moveTo(26 * k, 0); g.lineTo(-16 * k, 16 * k); g.lineTo(-8 * k, 0); g.lineTo(-16 * k, -16 * k); g.closePath();
    g.fillStyle = '#ff3c32'; g.strokeStyle = '#fff'; g.lineWidth = 4 * k; g.fill(); g.stroke();
    g.restore();
    text('YOU ARE HERE', hx, hy - 90 * k, font(26), '#ff5a4e');
    if (D.here.name) text(D.here.name, hx, hy + 92 * k, mono(22), '#e6edf0');
    text('you are near ' + (D.here.name || 'the ring').toLowerCase(), 92 * k, 190 * k, mono(22), '#ff5a4e', 'left');
  }
  text('DARKRIDE', 90 * k, 100 * k, font(50), '#e6edf0', 'left');
  text('the ring road and everything off it', 92 * k, 150 * k, mono(17), 'rgba(230,237,240,0.6)', 'left');
  return c;
}
