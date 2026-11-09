import test from 'node:test';
import assert from 'node:assert/strict';
import { flowOf, ALLOWS, HEADING_START, stepHeading } from './machines.js';

test('the ending outranks every other ride state', () => {
  assert.equal(flowOf({ mode: 'ride', ending: {}, fall: {}, washTake: true, warping: {} }), 'ending');
});

test('title and end outrank ride flags', () => {
  assert.equal(flowOf({ mode: 'title', fall: {} }), 'title');
  assert.equal(flowOf({ mode: 'end', ending: {} }), 'end');
});

test('every state declares every permission', () => {
  for (const a of Object.values(ALLOWS)) assert.deepEqual(Object.keys(a).sort(), ['drive', 'unstick', 'view', 'warp']);
});

test('nothing can warp or unstick the car during the ending', () => {
  assert.equal(ALLOWS.ending.warp, false);
  assert.equal(ALLOWS.ending.unstick, false);
});

test('75 seconds without progress counts as wandering', () => {
  let h = stepHeading(HEADING_START, 1000, 0.1);
  h = stepHeading(h, 1000, 75);
  assert.equal(h.away, false);
  assert.equal(stepHeading(h, 1000, 0.1).away, true);
});

test('driving 600 m back counts as wandering, and turning back 250 m resumes', () => {
  let h = stepHeading(HEADING_START, 1000, 0.1);
  h = stepHeading(h, 1601, 0.1);
  assert.equal(h.away, true);
  h = stepHeading(h, 1800, 0.1);
  assert.equal(stepHeading(h, 1600, 0.1).away, true);
  assert.equal(stepHeading(h, 1549, 0.1).away, false);
});

test('stepHeading does not change its input', () => {
  const h = Object.freeze({ ...HEADING_START });
  assert.doesNotThrow(() => stepHeading(h, 500, 0.1));
});
