# DARKRIDE

A night drive. Your headlights are dead; the hydraulics still work.

A Three.js lowrider game: every hydraulic landing sends a pulse of light that draws the dark world in contour lines. Drive the ring road from the Underpass through the Pines, the Ruins, the Monoliths, the Narrows, the Colonnade, Pale, Zone 9 and the Trestle.

**Play:** https://unim3dia.github.io/darkride/ (best in Chrome, sound on)

## Controls

| Key | |
|---|---|
| W A S D | drive |
| Space (tap) | pop the front · with S / A / D: the back or a side |
| Space (hold) | charge and jump |
| Shift | lift the nose |
| Q / E | three-wheel |
| C | camera |
| M | mute |
| F | fullscreen |

On a phone or iPad, touch controls appear automatically: a steering pad on the left, GAS / BRAKE / HOP on the right, CAM and LIFT up top.

Watch for the exits on the ring road: they lead off into pocket worlds (the Dust, the Ether, the Sanctum, Ephemera) and merge back further on.

## Run locally

```bash
npm install
npm run dev
```

## Going private and back

On a free GitHub plan, making this repo private takes the Pages site offline. When you make it public again, turn Pages back on (Settings → Pages → Source: GitHub Actions) and click **Actions → Deploy to GitHub Pages → Run workflow**.

## State machines

`src/core/machines.js` holds the top-level session states (`title`, `ride`, `warp`, `fall`, `wash`, `ending`, `end`), what the player may do in each, and the "still heading home" logic. Add a new takeover there, then run `npm test`.

Local machines keep their own state: `race.phase`, `wash.state`, `hood.state`, `drive.state`, and each watcher's `state`. In the browser console, `__darkride.flow()` shows the current state of all of them except the watchers.
