import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildEqualizerFilter, EqualizerStore, getPresetSettings, normalizeEqualizer } from './equalizer.js';

test('equalizer clamps gains and creates a safe FFmpeg filter chain', () => {
  assert.deepEqual(normalizeEqualizer({ bass: 20, mid: -20, treble: 2.35 }), { bass: 12, mid: -12, treble: 2.4 });
  assert.equal(buildEqualizerFilter({ bass: 0, mid: 0, treble: 0 }), undefined);
  assert.equal(buildEqualizerFilter({ bass: 4, mid: 0, treble: -2 }), 'equalizer=f=100:t=q:w=1:g=4,equalizer=f=1000:t=q:w=1:g=0,equalizer=f=10000:t=q:w=1:g=-2');
});

test('equalizer presets stay within the supported gain range', () => {
  for (const preset of ['flat', 'focus', 'warm'] as const) {
    const settings = getPresetSettings(preset);
    assert.ok(Object.values(settings).every((gain) => gain >= -12 && gain <= 12));
  }
});

test('equalizer store persists per-guild settings', async () => {
  const dataRoot = path.resolve('.tmp-equalizer-store-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'equalizer.json');
  const store = new EqualizerStore(filePath);

  assert.deepEqual(await store.getAsync('guild-a'), { bass: 0, mid: 0, treble: 0 });
  await store.set('guild-a', { bass: 4, mid: 0, treble: -2 });
  assert.deepEqual(await store.getAsync('guild-a'), { bass: 4, mid: 0, treble: -2 });
  await rm(dataRoot, { recursive: true, force: true });
});

test('equalizer store quarantines invalid JSON and recovers with defaults', async () => {
  const dataRoot = path.resolve('.tmp-equalizer-corrupt-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'equalizer.json');
  await writeFile(filePath, '{ broken', 'utf8');

  const store = new EqualizerStore(filePath);
  assert.deepEqual(await store.getAsync('guild-a'), { bass: 0, mid: 0, treble: 0 });
  await store.setPreset('guild-a', 'warm');
  assert.deepEqual(await store.getAsync('guild-a'), getPresetSettings('warm'));

  const entries = await readdir(dataRoot);
  assert.ok(entries.some((entry) => entry.includes('.corrupt-')));
  await rm(dataRoot, { recursive: true, force: true });
});
