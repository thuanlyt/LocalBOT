import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MusicPermissionStore } from './music-permissions.js';

const dataRoot = path.resolve('.tmp-permission-tests');

test('music permissions default to allow-list and persist user access', async () => {
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const store = new MusicPermissionStore(path.join(dataRoot, 'permissions.json'));
  assert.equal(await store.canUse('guild-a', 'user-a', false), false);
  assert.equal(await store.canUse('guild-a', 'admin', true), true);
  await store.addUser('guild-a', 'user-a');
  assert.equal(await store.canUse('guild-a', 'user-a', false), true);
  await store.setMode('guild-a', 'all');
  assert.equal(await store.canUse('guild-a', 'user-b', false), true);
  await store.setMode('guild-a', 'allowlist');
  assert.equal(await store.removeUser('guild-a', 'user-a'), true);
  assert.equal(await store.canUse('guild-a', 'user-a', false), false);
  await rm(dataRoot, { recursive: true, force: true });
});

test('music permission store quarantines an unsupported version and recovers with defaults', async () => {
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'permissions.json');
  await writeFile(filePath, JSON.stringify({ version: 2, guilds: {} }), 'utf8');

  const store = new MusicPermissionStore(filePath);
  assert.deepEqual(await store.get('guild-a'), { mode: 'allowlist', userIds: [] });
  await store.addUser('guild-a', 'user-a');
  assert.equal(await store.canUse('guild-a', 'user-a', false), true);

  const entries = await readdir(dataRoot);
  assert.ok(entries.some((entry) => entry.includes('.corrupt-')));
  await rm(dataRoot, { recursive: true, force: true });
});
