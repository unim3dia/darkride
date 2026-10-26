# DARKRIDE — batch of 2026-10-26

Status: [ ] to do · [x] done · [~] partly done (see note)

## A. Bugs (do first)
- [x] A1. iPad: diagonal parallel bands jitter over the film grain (fine on PC). Fix the grain hash for mobile GPUs. → sin-free hash (needs a look on the iPad to confirm).
- [x] A2. Monoliths: car gets stuck inside the round shell structures on the left. → cause: the Hollow cave road runs under the highway there and its walls were applied to the car above. Fixed; plus hold gas 4 s while stuck = lifted back to the road.
- [x] A3. Respawn / R-I-D-E warp sometimes leaves the car below the ground. → every warp spot tested lands on its surface; if the car ever ends up off any surface it's lifted back after 2.5 s.
- [x] A4. Remove the "THE DUST" countdown sign that stands before the bridge (wrong place/direction). Keep the highway ones.

## B. Car and camera
- [x] B1. Cabin view: sit closer to the wheel (not the back seat). Only the wrist and hand visible, wrapped in black cloth; very dark, fingers dark too.
- [x] B2. Cabin view: see more of the windshield, the left side window and the driver's side mirror (add a mirror). → camera in the driver's seat, 64° lens; glass is now a faint tint from inside (it was a dark mirror that hid the view); big round driver's mirror.
- [x] B3. Tail-light wash: each time it comes back in, the stains/water spots on the ground should be in a different pattern. Keep the flicker/fade behaviour.
- [x] B4. Every parked/standing car gets at least one glowing-eyed figure standing in front of it, so you can see the car in the dark. → highway wrecks + street cars (not the drive-in rows).

## C. Atmosphere, zone by zone
- [ ] C1. Under the Trestle: foggier in the distance; top quarter of the frame a dark grey fog.
- [ ] C2. Ephemera: every so often the camera glides low behind the car, looking up at the sky for 2–3 s (something happening up there), then glides back.
- [ ] C3. Zone 9: fog banks fly in and dissipate; trees/buildings ambiguous; one or two giant trees, ~5x taller than the rest, in the distance.
- [ ] C4. Pale: fog gusts that sweep right up to the camera, nearly washing the screen out, then clear.
- [ ] C5. Monoliths: more fog; a ~30 s hail shower now and then; distant unique clouds in the sky.
- [ ] C6. Ruins: wider purple gradient in the sky; dark clouds brewing.
- [ ] C7. Hollow: keep it dark (it works). Camera too far away in there: bring it in.

## D. New places
- [ ] D1. Colonnade, off-ramp right: rest stop with a huge gas station (18 pumps) and a drive-through car wash. Drive in → it stops you → conveyor pulls you through → camera flies forward through the rear window into the cabin view → suds, long hanging cloth strips, spinning brushes, psychedelic colour on the glass → spits you out → back to the road.
- [ ] D2. Under the Trestle (the purple zone with cars hanging on chains): off-ramp down a parkway to an abandoned fast-food drive-thru. At the menu board, a muffled leftover recording plays. Get your order, back onto the road.
- [ ] D3. MUD level: the car churns through mud flinging it left, right, up, back; clods splat on the camera lens and smear, then drip away. A crazy fun mud storm.
- [ ] D4. JUMP level: abstract, a field of ramps and hills that launch you; land on the next one; big flight.

## E. Menus and names
- [ ] E1. Title screen: a MAP option showing the whole course clearly (no overlapping words), with all the new places.
- [x] E2. Rename THE STAMPEDE → THE CHARGE.

## Notes
- Live site: https://unim3dia.github.io/darkride/ · `?at=<place>` jumps there for testing.
- Test with audio muted (Playwright init script), and stop the dev server afterwards.
