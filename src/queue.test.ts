import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicQueue } from './queue.js';
import type { MediaTrack } from './media-types.js';

const track = (id: string): MediaTrack => ({
  provider: 'youtube',
  id,
  title: `Track ${id}`,
  url: `https://www.youtube.com/watch?v=${id}`,
  duration: 120,
  durationText: '2:00',
  channel: 'Test artist',
  channelId: null,
  thumbnail: null
});

test('queue starts in order and reports positions after the current track', () => {
  const queue = new MusicQueue();
  assert.equal(queue.add(track('a')), 1);
  assert.equal(queue.takeNext()?.id, 'a');
  assert.equal(queue.add(track('b')), 1);
  assert.equal(queue.add(track('c')), 2);
  assert.deepEqual(queue.snapshot().queue.map((item) => item.id), ['b', 'c']);
});

test('queue supports remove and move operations without touching current track', () => {
  const queue = new MusicQueue();
  queue.add(track('a'));
  queue.add(track('b'));
  queue.add(track('c'));
  assert.equal(queue.takeNext()?.id, 'a');
  assert.equal(queue.move(0, 1), true);
  assert.equal(queue.removeAt(0)?.id, 'c');
  assert.deepEqual(queue.snapshot().queue.map((item) => item.id), ['b']);
  assert.equal(queue.current?.id, 'a');
});

test('repeat modes have predictable completion behavior', () => {
  const queue = new MusicQueue();
  queue.add(track('a'));
  queue.add(track('b'));
  assert.equal(queue.takeNext()?.id, 'a');
  queue.setRepeatMode('one');
  assert.equal(queue.completeCurrent()?.id, 'a');
  assert.equal(queue.current?.id, 'a');
  queue.setRepeatMode('all');
  assert.equal(queue.completeCurrent()?.id, 'b');
  assert.equal(queue.completeCurrent()?.id, 'a');
});

test('clearing pending queue preserves the current track', () => {
  const queue = new MusicQueue();
  queue.add(track('a'));
  queue.add(track('b'));
  assert.equal(queue.takeNext()?.id, 'a');
  queue.clearPending();
  assert.equal(queue.current?.id, 'a');
  assert.equal(queue.snapshot().queue.length, 0);
});

test('previous returns no track until playback history exists', () => {
  const queue = new MusicQueue();
  queue.add(track('a'));
  assert.equal(queue.takeNext()?.id, 'a');
  assert.equal(queue.previous(), null);

  queue.add(track('b'));
  assert.equal(queue.completeCurrent()?.id, 'b');
  assert.equal(queue.previous()?.id, 'a');
  assert.equal(queue.current?.id, 'a');
  assert.deepEqual(queue.snapshot().queue.map((item) => item.id), ['b']);
});
