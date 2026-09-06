import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadJsonStore, saveJsonStoreAtomic, type JsonStoreMigration } from './persistence.js';

type StoreFile = { version: 1; items: string[] };

function isStoreFile(parsed: unknown): parsed is StoreFile {
  return Boolean(parsed) && typeof parsed === 'object' && (parsed as StoreFile).version === 1 && Array.isArray((parsed as StoreFile).items);
}

function createDefault(): StoreFile {
  return { version: 1, items: [] };
}

test('loadJsonStore returns the default for a missing file without quarantine', async () => {
  const dataRoot = path.resolve('.tmp-persistence-missing-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'store.json');

  const result = await loadJsonStore(filePath, isStoreFile, createDefault, 'read error');
  assert.equal(result.recoveredFromCorruption, false);
  assert.equal(result.migrated, false);
  assert.deepEqual(result.data, { version: 1, items: [] });
  assert.deepEqual(await readdir(dataRoot), []);
  await rm(dataRoot, { recursive: true, force: true });
});

test('loadJsonStore quarantines invalid JSON and recovers with the default', async () => {
  const dataRoot = path.resolve('.tmp-persistence-invalid-json-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'store.json');
  await writeFile(filePath, '{ not valid json', 'utf8');

  const result = await loadJsonStore(filePath, isStoreFile, createDefault, 'read error');
  assert.equal(result.recoveredFromCorruption, true);
  assert.equal(result.migrated, false);
  assert.deepEqual(result.data, { version: 1, items: [] });

  const remaining = await readdir(dataRoot);
  assert.equal(remaining.length, 1);
  const quarantined = remaining[0]!;
  assert.match(quarantined, /^store\.json\.corrupt-\d+\.json$/);
  assert.equal(await readFile(path.join(dataRoot, quarantined), 'utf8'), '{ not valid json');
  await rm(dataRoot, { recursive: true, force: true });
});

test('loadJsonStore quarantines an unsupported version and recovers with the default', async () => {
  const dataRoot = path.resolve('.tmp-persistence-bad-version-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'store.json');
  await writeFile(filePath, JSON.stringify({ version: 2, items: ['a'] }), 'utf8');

  const result = await loadJsonStore(filePath, isStoreFile, createDefault, 'read error');
  assert.equal(result.recoveredFromCorruption, true);
  assert.equal(result.migrated, false);
  assert.deepEqual(result.data, { version: 1, items: [] });

  const remaining = await readdir(dataRoot);
  assert.equal(remaining.length, 1);
  assert.match(remaining[0]!, /^store\.json\.corrupt-\d+\.json$/);
  await rm(dataRoot, { recursive: true, force: true });
});

test('loadJsonStore returns well-formed data unchanged', async () => {
  const dataRoot = path.resolve('.tmp-persistence-valid-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'store.json');
  await writeFile(filePath, JSON.stringify({ version: 1, items: ['a', 'b'] }), 'utf8');

  const result = await loadJsonStore(filePath, isStoreFile, createDefault, 'read error');
  assert.equal(result.recoveredFromCorruption, false);
  assert.equal(result.migrated, false);
  assert.deepEqual(result.data, { version: 1, items: ['a', 'b'] });
  await rm(dataRoot, { recursive: true, force: true });
});

test('saveJsonStoreAtomic writes the file and leaves no temp file behind', async () => {
  const dataRoot = path.resolve('.tmp-persistence-save-test');
  await rm(dataRoot, { recursive: true, force: true });
  const filePath = path.join(dataRoot, 'nested', 'store.json');

  await saveJsonStoreAtomic(filePath, { version: 1, items: ['x'] } satisfies StoreFile);
  const remaining = await readdir(path.dirname(filePath));
  assert.deepEqual(remaining, ['store.json']);
  assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), { version: 1, items: ['x'] });
  await rm(dataRoot, { recursive: true, force: true });
});

test('loadJsonStore applies a multi-step migration chain and persists the current version atomically', async () => {
  const dataRoot = path.resolve('.tmp-persistence-migration-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'store.json');
  await writeFile(filePath, JSON.stringify({ version: 0, items: ['legacy'], label: 'old' }), 'utf8');
  const migrations: JsonStoreMigration[] = [
    { from: 0, to: 1, migrate: (value) => ({ ...(value as Record<string, unknown>), version: 1, items: ['v1'] }) },
    { from: 1, to: 2, migrate: (value) => ({ ...(value as Record<string, unknown>), version: 2, items: [...((value as { items: string[] }).items), 'v2'] }) }
  ];
  const isCurrent = (value: unknown): value is { version: 2; items: string[]; label: string } => Boolean(value)
    && typeof value === 'object'
    && (value as { version?: unknown }).version === 2
    && Array.isArray((value as { items?: unknown }).items)
    && (value as { items: unknown[] }).items.every((item) => typeof item === 'string')
    && typeof (value as { label?: unknown }).label === 'string';

  const result = await loadJsonStore(filePath, isCurrent, () => ({ version: 2 as const, items: [] as string[], label: '' }), 'read error', {
    currentVersion: 2,
    migrations,
    migrationWriteError: 'migration write error'
  });

  assert.deepEqual(result.data, { version: 2, items: ['v1', 'v2'], label: 'old' });
  assert.equal(result.recoveredFromCorruption, false);
  assert.equal(result.migrated, true);
  assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), result.data);
  await rm(dataRoot, { recursive: true, force: true });
});

test('loadJsonStore does not migrate a future version and quarantines it safely', async () => {
  const dataRoot = path.resolve('.tmp-persistence-future-version-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'store.json');
  await writeFile(filePath, JSON.stringify({ version: 9, items: ['future'] }), 'utf8');
  const result = await loadJsonStore(filePath, isStoreFile, createDefault, 'read error', {
    currentVersion: 1,
    migrations: [{ from: 0, to: 1, migrate: (value) => value }]
  });

  assert.deepEqual(result.data, { version: 1, items: [] });
  assert.equal(result.recoveredFromCorruption, true);
  assert.equal(result.migrated, false);
  const files = await readdir(dataRoot);
  assert.equal(files.some((name) => name.startsWith('store.json.corrupt-')), true);
  await rm(dataRoot, { recursive: true, force: true });
});
