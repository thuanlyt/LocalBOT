import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PlaylistStore } from './playlists.js';
import type { MediaTrack } from './media-types.js';

const dataRoot = path.resolve('.tmp-playlist-tests');
const track: MediaTrack = {
  provider: 'youtube',
  id: 'dQw4w9WgXcQ',
  title: 'Test track',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  duration: 120,
  durationText: '2:00',
  channel: 'Test artist',
  channelId: null,
  thumbnail: null
};

test('playlist store persists CRUD operations atomically by guild', async () => {
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'playlists.json');
  const store = new PlaylistStore({ filePath });
  const created = await store.create('guild-a', 'Focus', 'Work music');
  assert.equal((await store.list('guild-b')).length, 0);
  await store.addTrack('guild-a', 'focus', track);
  await store.addTrack('guild-a', 'focus', { ...track, id: 'M7lc1UVf-VE', title: 'Second track' });
  await store.addTrack('guild-a', 'focus', track);
  assert.equal((await store.find('guild-a', 'focus'))?.tracks.length, 2);
  assert.equal((await store.find('guild-a', 'FOCUS'))?.tracks[0]?.id, track.id);
  assert.equal((await store.moveTrack('guild-a', 'focus', 1, 2))?.tracks[1]?.id, track.id);
  await store.update('guild-a', 'focus', { name: 'Focus 2' });
  assert.equal((await store.find('guild-a', 'Focus 2'))?.description, 'Work music');
  assert.equal(await store.moveTrack('guild-a', 'Focus 2', 1, 3), null);
  assert.equal((await store.removeTrack('guild-a', 'Focus 2', 2))?.id, track.id);
  assert.equal((await store.remove('guild-a', 'Focus 2'))?.id, created.id);
  assert.equal((await store.list('guild-a')).length, 0);
  await rm(dataRoot, { recursive: true, force: true });
});

test('playlist store quarantines a corrupted file and recovers with an empty store', async () => {
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'playlists.json');
  await writeFile(filePath, '{ this is not valid json', 'utf8');

  const store = new PlaylistStore({ filePath });
  assert.deepEqual(await store.list('guild-a'), []);
  await store.create('guild-a', 'Recovered');
  assert.equal((await store.list('guild-a')).length, 1);

  const entries = await readdir(dataRoot);
  const quarantined = entries.find((entry) => entry.includes('.corrupt-'));
  assert.ok(quarantined, 'expected a quarantined backup of the corrupted file');
  assert.equal(await readFile(path.join(dataRoot, quarantined!), 'utf8'), '{ this is not valid json');
  await rm(dataRoot, { recursive: true, force: true });
});
