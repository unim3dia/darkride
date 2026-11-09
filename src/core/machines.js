// The game's top-level states, named in one place. No imports, so `npm test` can
// run it without a browser. Local machines (race, wash, hood, drive-thru, watchers)
// keep their own explicit state; see "State machines" in the README.

/** Which state the session is in. Order matters: the first match wins. */
export function flowOf(s) {
  if (s.mode === 'title') return 'title';
  if (s.mode === 'end') return 'end';
  if (s.ending) return 'ending';
  if (s.fall) return 'fall';
  if (s.washTake) return 'wash';
  if (s.warping) return 'warp';
  return 'ride';
}

/** What the player may do in each state. */
export const ALLOWS = {
  title: { drive: false, warp: false, unstick: false, view: false },
  ride: { drive: true, warp: true, unstick: true, view: true },
  warp: { drive: true, warp: false, unstick: false, view: true },
  fall: { drive: false, warp: false, unstick: false, view: true },
  wash: { drive: false, warp: false, unstick: false, view: true },
  ending: { drive: false, warp: false, unstick: false, view: false },
  end: { drive: false, warp: false, unstick: false, view: false },
};

export const HEADING_START = { away: false, best: undefined, idle: 0, far: 0 };
const GAIN = 25;       // metres closer that count as progress
const IDLE_LIMIT = 75; // seconds without progress
const STRAY = 600;     // metres back from the closest point reached
const RETURN = 250;    // metres closed from the farthest point, to count as turning back

/** Is the player still heading home? Returns the next heading; `away` drops the home music and camera. */
export function stepHeading(h, dist, dt) {
  if (h.away) {
    const far = Math.max(h.far, dist);
    return dist < far - RETURN ? { away: false, best: dist, idle: 0, far: 0 } : { ...h, far };
  }
  const gained = h.best === undefined || dist < h.best - GAIN;
  const best = gained ? Math.min(h.best ?? dist, dist) : h.best;
  const idle = gained ? 0 : h.idle + dt;
  return idle > IDLE_LIMIT || dist > best + STRAY ? { away: true, best, idle, far: dist } : { ...h, best, idle };
}
