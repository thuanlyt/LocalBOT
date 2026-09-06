import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AuditLogStore, redactAuditText } from './audit-log.js';

test('audit log store records and lists entries scoped by guild', async () => {
  const dataRoot = path.resolve('.tmp-audit-log-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'audit-log.json');
  const store = new AuditLogStore(filePath);

  await store.record({ actor: 'user-a', action: 'guild.join', guildId: 'guild-a', detail: 'joined voice' });
  await store.record({ actor: 'user-b', action: 'guild.join', guildId: 'guild-b', detail: 'joined voice' });

  assert.equal((await store.list(50)).length, 2);
  const scoped = await store.list(50, 'guild-a');
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0]?.actor, 'user-a');

  await store.record({ actor: 'native', action: 'player.play', guildId: 'guild-a', detail: 'youtube track started' });
  await store.record({ actor: 'native', action: 'queue.clear', guildId: 'guild-a', detail: 'pending queue cleared' });
  assert.equal((await store.list(50, 'guild-a', { action: 'player' })).length, 1);
  assert.equal((await store.list(50, 'guild-a', { search: 'YOUTUBE' }))[0]?.action, 'player.play');
  assert.equal((await store.list(1, 'guild-a'))[0]?.action, 'queue.clear');
  await rm(dataRoot, { recursive: true, force: true });
});

test('audit log store quarantines an unsupported version and recovers with an empty log', async () => {
  const dataRoot = path.resolve('.tmp-audit-log-corrupt-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'audit-log.json');
  await writeFile(filePath, JSON.stringify({ version: 2, entries: [{ id: 'x' }] }), 'utf8');

  const store = new AuditLogStore(filePath);
  assert.deepEqual(await store.list(50), []);
  await store.record({ actor: 'user-a', action: 'bot.start', guildId: null, detail: '' });
  assert.equal((await store.list(50)).length, 1);

  const entries = await readdir(dataRoot);
  assert.ok(entries.some((entry) => entry.includes('.corrupt-')));
  await rm(dataRoot, { recursive: true, force: true });
});

test('audit log applies retention and redacts credential-like detail at write time', async () => {
  const dataRoot = path.resolve('.tmp-audit-log-retention-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'audit-log.json');
  const now = Date.now();
  await writeFile(filePath, JSON.stringify({ version: 1, entries: [
    { id: 'old', timestamp: new Date(now - 3 * 86_400_000).toISOString(), actor: 'system', action: 'test.old', guildId: null, detail: 'expired' },
    { id: 'fresh', timestamp: new Date(now - 86_400_000 + 1_000).toISOString(), actor: 'system', action: 'test.fresh', guildId: null, detail: 'kept' }
  ] }), 'utf8');

  const store = new AuditLogStore(filePath, 1);
  assert.deepEqual((await store.list(50)).map((entry) => entry.id), ['fresh']);
  const written = await store.record({ actor: 'native', action: 'config.update', guildId: null, detail: `token=abc123 password:secret ${'x'.repeat(600)}` });
  assert.match(written.detail, /token=\[redacted\]/);
  assert.match(written.detail, /password=\[redacted\]/);
  assert.ok(written.detail.length <= 512);
  assert.equal(redactAuditText('authorization: Bearer abc'), 'authorization=[redacted]');
  assert.deepEqual(store.getSettings(), { retentionDays: 1, maxEntries: 2_000 });
  await rm(dataRoot, { recursive: true, force: true });
});

test('audit retention policy is editable, persisted, and prunes without arbitrary deletion', async () => {
  const dataRoot = path.resolve('.tmp-audit-log-settings-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'audit-log.json');
  const now = Date.now();
  await writeFile(filePath, JSON.stringify({ version: 1, entries: [
    { id: 'old', timestamp: new Date(now - 10 * 86_400_000).toISOString(), actor: 'system', action: 'old', guildId: null, detail: '' },
    { id: 'fresh', timestamp: new Date(now - 86_400_000 + 1_000).toISOString(), actor: 'system', action: 'fresh', guildId: null, detail: '' }
  ] }), 'utf8');

  const store = new AuditLogStore(filePath);
  assert.equal(store.getSettings().retentionDays, null);
  await assert.rejects(() => store.updateSettings(0), /Retention/);
  const updated = await store.updateSettings(7);
  assert.deepEqual(updated, { retentionDays: 7, maxEntries: 2_000 });
  assert.deepEqual((await store.list(50)).map((entry) => entry.id), ['fresh']);
  assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')).settings, { retentionDays: 7 });

  const reloaded = new AuditLogStore(filePath, null);
  await reloaded.loadPersisted();
  assert.equal(reloaded.getSettings().retentionDays, 7);
  await reloaded.updateSettings(null);
  assert.equal(reloaded.getSettings().retentionDays, null);
  await rm(dataRoot, { recursive: true, force: true });
});

test('audit retention update keeps the previous state when the atomic write fails', async () => {
  const dataRoot = path.resolve('.tmp-audit-log-settings-failure-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'audit-log.json');
  const store = new AuditLogStore(filePath);
  await store.record({ actor: 'native', action: 'before', guildId: null, detail: 'kept' });
  const before = await readFile(filePath, 'utf8');
  const writable = store as unknown as { save: (data: unknown) => Promise<void> };
  writable.save = async () => { throw new Error('injected atomic write failure'); };

  await assert.rejects(() => store.updateSettings(30), /injected atomic write failure/);
  assert.deepEqual(store.getSettings(), { retentionDays: null, maxEntries: 2_000 });
  assert.equal(await readFile(filePath, 'utf8'), before);
  await rm(dataRoot, { recursive: true, force: true });
});
