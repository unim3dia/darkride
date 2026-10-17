// Only loaded with ?test — drives the car for automated visual checks.
import { sample, gapAt } from '../world/track.js';

export function installTestKit(D) {
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let pilot = null;
  const kit = {
    sleep,
    async go(s, speed = 24, { view = 0 } = {}) {
      key('keydown', 'KeyW');
      await sleep(60);
      D.vehicle.reset(s, 0, 0, speed);
      D.rig.view = view;
      document.getElementById('hint').style.display = 'none';
    },
    autopilot(on = true, clear = true) {
      clearInterval(pilot);
      if (!on) return;
      pilot = setInterval(() => {
        const v = D.vehicle;
        if (clear) D.chunks.chunks.forEach((c) => { c.bodies.length = 0; });
        if (v.airborne) return;
        // jump gaps: hold the switch when one is coming, release at the lip
        const lead = v.speed * 0.9;
        if (!kit.hopping && gapAt(v.s + lead) && !gapAt(v.s + 2)) {
          kit.hopping = true;
          key('keydown', 'Space');
          setTimeout(() => { key('keyup', 'Space'); kit.hopping = false; }, 700);
        }
        const S = sample(v.s + 12);
        let e = Math.atan2(S.x - v.pos.x, -(S.z - v.pos.z)) - v.yaw;
        e = Math.atan2(Math.sin(e), Math.cos(e));
        v.yaw += e * 0.15;
      }, 16);
    },
    /** Drop the car anywhere in the district, facing (faceU, faceV). */
    place(u, v, faceU = 1, faceV = 0, view = 0, where = D.district) {
      const p = where.toWorld(u, v, 0);
      D.vehicle.placeAt(p.x, 0, p.z, -where.yawToward(faceU, faceV));
      D.rig.view = view;
      D.rig.offset = undefined;
      document.getElementById('hint').style.display = 'none';
    },
    async hop(ms = 500) {
      key('keydown', 'Space');
      await sleep(ms);
      key('keyup', 'Space');
    },
    press: (c) => key('keydown', c),
    release: (c) => key('keyup', c),
  };
  window.T = kit;
}
