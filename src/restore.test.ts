import assert from 'node:assert/strict';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalBotBackup, type BackupPaths, type BackupStoreName } from './backup.js';
import { restoreLocalBotBackup, RestoreValidationError, RestoreTransactionError } from './restore.js';

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

const storeNames: BackupStoreName[] = ['playlists', 'musicPermissions', 'equalizer', 'community', 'audit', 'playerState', 'greetings', 'automod', 'automodReview', 'ollama'];

test('restore writes all known stores and keeps a pre-restore recovery file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-restore-'));
  try {
    const paths = testPaths(root);
    const original = await createLocalBotBackup(paths, new Date('2026-09-02T00:00:00.000Z'));
    const next = structuredClone(original);
    next.exportedAt = '2026-09-03T00:00:00.000Z';
    next.stores.playlists = { version: 1, playlists: [{ name: 'Morning', description: 'Local', tracks: [] }] };

    const result = await restoreLocalBotBackup(next, { paths, now: new Date('2026-09-03T01:02:03.000Z') });
    assert.equal(result.restartRequired, true);
    assert.deepEqual(result.stores, storeNames);
    assert.match(result.recoveryFile, /^localbot-pre-restore-/);
    assert.deepEqual(JSON.parse(await readFile(paths.playlists, 'utf8')), next.stores.playlists);
    for (const name of storeNames) assert.deepEqual(JSON.parse(await readFile(paths[name], 'utf8')), next.stores[name]);
    assert.deepEqual(await readdir(path.join(root, 'recovery')), [result.recoveryFile]);
    const recovery = JSON.parse(await readFile(path.join(root, 'recovery', result.recoveryFile), 'utf8')) as typeof original;
    assert.deepEqual(recovery.stores, original.stores);
    assert.equal(recovery.exportedAt, '2026-09-03T01:02:03.000Z');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restore rejects sensitive-looking keys before touching live files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-restore-invalid-'));
  try {
    const paths = testPaths(root);
    const backup = await createLocalBotBackup(paths);
    backup.stores.playlists = { version: 1, playlists: [{ name: 'Unsafe', token: 'must-not-enter' }] };
    await assert.rejects(() => restoreLocalBotBackup(backup, { paths }), RestoreValidationError);
    await assert.rejects(() => restoreLocalBotBackup({ ...backup, version: 2 }, { paths }), RestoreValidationError);
    assert.equal((await readdir(root)).some((name) => name.includes('.restore-')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restore rolls back original bytes when a staged install fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-restore-rollback-'));
  try {
    const paths = testPaths(root);
    const backup = await createLocalBotBackup(paths);
    const originals = new Map<string, string>();
    for (const name of storeNames) {
      const content = `${JSON.stringify(backup.stores[name])}\n`;
      await writeFile(paths[name], content, 'utf8');
      originals.set(paths[name], content);
    }
    const next = structuredClone(backup);
    next.stores.playlists = { version: 1, playlists: [{ name: 'Replacement', description: '', tracks: [] }] };
    let installCount = 0;
    await assert.rejects(() => restoreLocalBotBackup(next, {
      paths,
      renameFile: async (oldPath, newPath) => {
        if (oldPath.includes('.restore-') && !newPath.includes('.restore-')) {
          installCount += 1;
          if (installCount === 2) throw new Error('injected install failure');
        }
        const { rename } = await import('node:fs/promises');
        await rename(oldPath, newPath);
      },
    }), RestoreTransactionError);
    for (const name of storeNames) assert.equal(await readFile(paths[name], 'utf8'), originals.get(paths[name]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
