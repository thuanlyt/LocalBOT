import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MusicQueue } from './queue.js';
import { PlayerStateStore } from './player-state.js';
import type { MediaTrack } from './media-types.js';

const track: MediaTrack = {
  provider: 'youtube',
  id: 'restore-track',
  title: 'Restored track',
  url: 'https://www.youtube.com/watch?v=restore-track',
  duration: 180,
  durationText: '03:00',
  channel: 'LocalBot QA',
  channelId: null,
  thumbnail: null
};

test('player state persists bounded pending queue without the current track', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-player-state-'));
  try {
    const filePath = path.join(root, 'player-state.json');
    const store = new PlayerStateStore(filePath);
    await store.load();
    const queue = new MusicQueue();
    queue.add(track);
    queue.setShuffle(true);
    queue.setRepeatMode('all');
    await store.save('guild-1', queue.snapshot(), 64);

    const restarted = new PlayerStateStore(filePath);
    await restarted.load();
    const restored = restarted.get('guild-1');
    assert.ok(restored);
    assert.equal(restored.volumePercent, 64);
    assert.equal(restored.queue.current, null);
    assert.deepEqual(restored.queue.queue, [track]);
    assert.equal(restored.queue.shuffle, true);
    assert.equal(restored.queue.repeatMode, 'all');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('player state rejects malformed data through persistence quarantine', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-player-state-corrupt-'));
  try {
    const filePath = path.join(root, 'player-state.json');
    await writeFile(filePath, JSON.stringify({ version: 1, guilds: { 'guild-1': { queue: { current: null, queue: [], history: [], shuffle: false, repeatMode: 'off' }, volumePercent: 101 } } }), 'utf8');
    const store = new PlayerStateStore(filePath);
    assert.deepEqual((await store.load()).guilds, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
