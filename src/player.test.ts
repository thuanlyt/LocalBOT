import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVolumePercent } from './player.js';

test('normalizes Discord volume to a safe integer percentage', () => {
  assert.equal(normalizeVolumePercent(-10), 0);
  assert.equal(normalizeVolumePercent(64.4), 64);
  assert.equal(normalizeVolumePercent(64.6), 65);
  assert.equal(normalizeVolumePercent(120), 100);
  assert.equal(normalizeVolumePercent(Number.NaN), 100);
});
