import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ProviderSettingsStore } from './provider-settings.js';

test('provider settings default to enabled and persist an explicit SoundCloud disable', async () => {
  const dataRoot = path.resolve('.tmp-provider-settings-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'provider-settings.json');

  const store = new ProviderSettingsStore(filePath);
  assert.deepEqual(await store.getSoundCloud(), { enabled: true });
  await store.setSoundCloudEnabled(false);

  const restored = new ProviderSettingsStore(filePath);
  assert.deepEqual(await restored.getSoundCloud(), { enabled: false });
  assert.equal(restored.isSoundCloudEnabled(), false);
  await rm(dataRoot, { recursive: true, force: true });
});

test('provider settings quarantine an invalid shape and recover safely', async () => {
  const dataRoot = path.resolve('.tmp-provider-settings-corrupt-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'provider-settings.json');
  await writeFile(filePath, JSON.stringify({ version: 1, soundcloud: { enabled: 'yes' } }), 'utf8');

  const store = new ProviderSettingsStore(filePath);
  assert.deepEqual(await store.getSoundCloud(), { enabled: true });
  const entries = await readdir(dataRoot);
  assert.ok(entries.some((entry) => entry.includes('.corrupt-')));
  await rm(dataRoot, { recursive: true, force: true });
});
