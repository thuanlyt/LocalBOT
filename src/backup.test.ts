import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalBotBackup, isLocalBotBackup, type BackupPaths } from './backup.js';

function testPaths(root: string): BackupPaths {
  return {
    playlists: path.join(root, 'playlists.json'),
    musicPermissions: path.join(root, 'music-permissions.json'),
    equalizer: path.join(root, 'equalizer.json'),
    community: path.join(root, 'community.json'),
    audit: path.join(root, 'audit-log.json'),
    playerState: path.join(root, 'player-state.json'),
    greetings: path.join(root, 'greetings.json'),
    automod: path.join(root, 'automod.json'),
    automodReview: path.join(root, 'automod-review.json'),
    ollama: path.join(root, 'ollama.json'),
  };
}

test('backup export fills missing stores with safe version-one defaults', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-backup-'));
  try {
    const backup = await createLocalBotBackup(testPaths(root), new Date('2026-09-03T00:00:00.000Z'));
    assert.equal(backup.format, 'localbot-backup');
    assert.equal(backup.version, 1);
    assert.equal(backup.exportedAt, '2026-09-03T00:00:00.000Z');
    assert.deepEqual(backup.stores.playlists, { version: 1, playlists: [] });
    assert.deepEqual(backup.stores.audit, { version: 1, entries: [] });
    assert.deepEqual(backup.stores.playerState, { version: 1, guilds: {} });
    assert.deepEqual(backup.stores.greetings, { version: 1, guilds: {} });
    assert.deepEqual(backup.stores.automod, { version: 1, guilds: {} });
    assert.deepEqual(backup.stores.automodReview, { version: 1, entries: [] });
    assert.deepEqual(backup.stores.ollama, { version: 1, settings: { enabled: false, baseUrl: 'http://127.0.0.1:11434', model: '', timeoutMs: 5000 } });
    assert.equal(JSON.stringify(backup).includes('discordToken'), false);
    assert.equal(JSON.stringify(backup).includes('clientSecret'), false);
    assert.equal(isLocalBotBackup(backup), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('backup export preserves valid local stores and rejects malformed files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-backup-'));
  try {
    const paths = testPaths(root);
    await writeFile(paths.playlists, JSON.stringify({ version: 1, playlists: [] }), 'utf8');
    const backup = await createLocalBotBackup(paths);
    assert.deepEqual(backup.stores.playlists, { version: 1, playlists: [] });

    await writeFile(paths.equalizer, '{ broken', 'utf8');
    await assert.rejects(() => createLocalBotBackup(paths), /file dữ liệu local không hợp lệ/);

    await writeFile(paths.equalizer, JSON.stringify({ version: 1, guilds: [] }), 'utf8');
    await assert.rejects(() => createLocalBotBackup(paths), /file dữ liệu local không hợp lệ/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('backup envelope validator rejects the wrong format or store version', () => {
  assert.equal(isLocalBotBackup({ format: 'other', version: 1, exportedAt: 'now', stores: {} }), false);
  assert.equal(isLocalBotBackup({
    format: 'localbot-backup',
    version: 1,
    exportedAt: 'now',
    stores: {
      playlists: { version: 2 },
      musicPermissions: { version: 1 },
      equalizer: { version: 1 },
      community: { version: 1 },
      audit: { version: 1 },
      playerState: { version: 1 },
      greetings: { version: 1 },
      automod: { version: 1 },
      automodReview: { version: 1 },
      ollama: { version: 1 },
    },
  }), false);
  assert.equal(isLocalBotBackup({
    format: 'localbot-backup',
    version: 1,
    exportedAt: 'now',
    stores: {
      playlists: { version: 1, playlists: [] },
      musicPermissions: { version: 1, guilds: [] },
      equalizer: { version: 1, guilds: {} },
      community: { version: 1, guilds: {} },
      audit: { version: 1, entries: [] },
      playerState: { version: 1, guilds: {} },
      greetings: { version: 1, guilds: {} },
      automod: { version: 1, guilds: {} },
      automodReview: { version: 1, entries: [] },
      ollama: { version: 1, settings: { enabled: false, baseUrl: 'http://127.0.0.1:11434', model: '', timeoutMs: 5000 } },
    },
  }), false);
});
