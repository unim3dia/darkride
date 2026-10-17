// The way out: faint chevrons painted on the street from where you start to the
// ramp, with a slow wave of light running along them toward the bridge. Once
// you're up on the deck the trail has done its job and fades.
import * as THREE from 'three';

const SPACING = 7;

function chevronTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(38, 22);
  g.lineTo(88, 64);
  g.lineTo(38, 106);
  g.stroke();
  // worn paint
  const img = g.getImageData(0, 0, 128, 128);
  for (let i = 3; i < img.data.length; i += 4) if (Math.random() < 0.3) img.data[i] *= Math.random();
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

/** Resample a polyline of world points into evenly spaced stations with headings. */
function stations(points) {
  const out = [];
  let carry = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).normalize();
    for (let t = carry; t < len; t += SPACING) {
      out.push({ pos: a.clone().addScaledVector(dir, t), dir });
    }
    carry = (carry - len) % SPACING;
    if (carry < 0) carry += SPACING;
  }
  return out;
}

export class Trail {
  constructor(scene, points) {
    this.stations = stations(points);
    const n = this.stations.length;
    const geo = new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({
      map: chevronTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    this.stations.forEach((st, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-st.dir.z, st.dir.x));
      m.compose(st.pos.clone().setY(st.pos.y + 0.17), q, one); // above sidewalk slabs (0.12–0.14)
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, new THREE.Color(0, 0, 0));
    });
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.strength = 1;
    this.done = false;
    this.c = new THREE.Color();
  }

  update(dt, time, vehicle) {
    if (vehicle.pos.y > 7 && vehicle.onRoad) this.done = true;
    this.strength += ((this.done ? 0 : 1) - this.strength) * Math.min(1, dt * 0.6);
    this.mesh.visible = this.strength > 0.01;
    if (!this.mesh.visible) return;
    const n = this.stations.length;
    for (let i = 0; i < n; i++) {
      // a soft pulse travelling from the start toward the bridge, every few seconds
      const phase = ((time * 9 - i * SPACING) % 70 + 70) % 70;
      const wave = Math.exp(-((phase - 8) ** 2) / 40);
      const v = (0.3 + wave * 1.8) * this.strength; // HDR: the passing wave catches the bloom
      this.mesh.setColorAt(i, this.c.setRGB(v * 0.9, v * 0.95, v));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
}
