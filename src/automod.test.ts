import assert from 'node:assert/strict';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AutoModEngine, AutoModStore, extractHttpHosts, isBlockedHost, normalizeAutoModContent, normalizeAutoModSettings, normalizeDomain } from './automod.js';

test('automod normalizes content and respects hostname boundaries', () => {
  assert.equal(normalizeAutoModContent('  FREE Discord Nitro!!! '), 'free discord nitro');
  assert.equal(normalizeDomain('*.Bad.Example.'), 'bad.example');
  assert.deepEqual(extractHttpHosts('open https://www.bad.example/path and http://safe.example'), ['bad.example', 'safe.example']);
  assert.equal(isBlockedHost('cdn.bad.example', ['bad.example']), true);
  assert.equal(isBlockedHost('bad.example.evil.test', ['bad.example']), false);
});

test('automod detects spam and flood with cooldowns in dry-run mode', () => {
  const settings = normalizeAutoModSettings({
    enabled: true,
    rules: {
      spam: { enabled: true, proposedAction: 'delete', threshold: 3, windowSeconds: 30, cooldownSeconds: 10 },
      flood: { enabled: true, proposedAction: 'timeout', threshold: 4, windowSeconds: 10, cooldownSeconds: 0 }
    }
  });
  const engine = new AutoModEngine();
  const message = (content: string, timestamp: number) => ({ guildId: 'guild-1', channelId: 'channel-1', userId: 'user-1', roleIds: [], content, timestamp });
  assert.deepEqual(engine.evaluate(settings, message('same', 1_000)), []);
  assert.deepEqual(engine.evaluate(settings, message('same', 2_000)), []);
  const spamAndFlood = engine.evaluate(settings, message('same', 3_000));
  assert.deepEqual(spamAndFlood.map((match) => match.rule), ['spam']);
  assert.equal(spamAndFlood[0]?.enforced, false);
  assert.deepEqual(engine.evaluate(settings, message('other', 4_000)).map((match) => match.rule), ['flood']);
  assert.deepEqual(engine.evaluate(settings, message('same', 4_500)).map((match) => match.rule), ['flood']);
  assert.deepEqual(engine.evaluate(settings, message('same', 14_000)).map((match) => match.rule), ['spam']);
});

test('automod accepts explicit enforce mode while keeping disabled defaults safe', () => {
  const settings = normalizeAutoModSettings({ enabled: true, mode: 'enforce', rules: { link: { enabled: true, proposedAction: 'delete', blockedDomains: ['bad.example'] } } });
  assert.equal(settings.mode, 'enforce');
  assert.deepEqual(new AutoModEngine().evaluate(settings, { guildId: 'guild-1', channelId: 'channel-1', userId: 'user-1', roleIds: [], content: 'https://bad.example/path', timestamp: 1_000 }).map((entry) => entry.proposedAction), ['delete']);
  assert.equal(normalizeAutoModSettings({}).mode, 'dry-run');
  assert.throws(() => normalizeAutoModSettings({ mode: 'lockdown' }), /mode AutoMod không hợp lệ/);
});

test('automod detects configured blocked links and scam patterns, while exemptions win', () => {
  const settings = normalizeAutoModSettings({
    enabled: true,
    exemptUserIds: ['trusted-user'],
    rules: {
      link: { enabled: true, proposedAction: 'delete', blockedDomains: ['bad.example'], cooldownSeconds: 0 },
      scam: { enabled: true, proposedAction: 'quarantine', cooldownSeconds: 0 }
    }
  });
  const engine = new AutoModEngine();
  const base = { guildId: 'guild-1', channelId: 'channel-1', roleIds: [], timestamp: 1_000 };
  const matches = engine.evaluate(settings, { ...base, userId: 'user-1', content: 'claim your free reward https://bad.example/claim' });
  assert.deepEqual(matches.map((match) => [match.rule, match.reason, match.enforced]), [
    ['link', 'blocked-domain', false],
    ['scam', 'scam-pattern', false]
  ]);
  assert.deepEqual(engine.evaluate(settings, { ...base, userId: 'trusted-user', content: 'claim your free reward https://bad.example/claim', timestamp: 2_000 }), []);
});

test('automod detects anti-raid and anti-nuke bursts as bounded dry-run signals', () => {
  const settings = normalizeAutoModSettings({
    enabled: true,
    rules: {
      antiRaid: { enabled: true, proposedAction: 'alert', threshold: 3, windowSeconds: 30, cooldownSeconds: 10 },
      antiNuke: { enabled: true, proposedAction: 'quarantine', threshold: 2, windowSeconds: 30, cooldownSeconds: 10 }
    }
  });
  const engine = new AutoModEngine();
  assert.deepEqual(engine.evaluateSecurityEvent(settings, { guildId: 'guild-1', kind: 'member-join', actorId: 'user-1', timestamp: 1_000 }), []);
  assert.deepEqual(engine.evaluateSecurityEvent(settings, { guildId: 'guild-1', kind: 'member-join', actorId: 'user-2', timestamp: 2_000 }), []);
  const raid = engine.evaluateSecurityEvent(settings, { guildId: 'guild-1', kind: 'member-join', actorId: 'user-3', timestamp: 3_000 });
  assert.deepEqual(raid.map((match) => [match.rule, match.reason, match.proposedAction, match.enforced]), [['antiRaid', 'join-rate-threshold', 'alert', false]]);
  assert.deepEqual(engine.evaluateSecurityEvent(settings, { guildId: 'guild-1', kind: 'member-join', actorId: 'user-4', timestamp: 4_000 }), []);
  assert.deepEqual(engine.evaluateSecurityEvent(settings, { guildId: 'guild-1', kind: 'destructive-change', timestamp: 5_000 }), []);
  const nuke = engine.evaluateSecurityEvent(settings, { guildId: 'guild-1', kind: 'destructive-change', timestamp: 6_000 });
  assert.deepEqual(nuke.map((match) => [match.rule, match.reason, match.userId, match.enforced]), [['antiNuke', 'destructive-change-rate', 'system:discord-event', false]]);
});

test('automod anti-raid and anti-nuke settings retain safe defaults for legacy data', () => {
  const settings = normalizeAutoModSettings({ enabled: false, rules: { spam: { enabled: false } } });
  assert.deepEqual(settings.rules.antiRaid, { enabled: false, proposedAction: 'alert', threshold: 5, windowSeconds: 60, cooldownSeconds: 60 });
  assert.deepEqual(settings.rules.antiNuke, { enabled: false, proposedAction: 'quarantine', threshold: 3, windowSeconds: 30, cooldownSeconds: 60 });
});

test('automod clears only one guild volatile history across a disabled interval', () => {
  const settings = normalizeAutoModSettings({
    enabled: true,
    rules: {
      spam: { enabled: true, threshold: 2, windowSeconds: 30, cooldownSeconds: 30 },
      antiRaid: { enabled: true, threshold: 2, windowSeconds: 30, cooldownSeconds: 0 }
    }
  });
  const disabled = normalizeAutoModSettings({ enabled: false });
  const engine = new AutoModEngine();
  const message = (guildId: string, timestamp: number) => ({ guildId, channelId: 'channel-1', userId: 'user-1', roleIds: [], content: 'same', timestamp });

  assert.deepEqual(engine.evaluate(settings, message('guild-a', 1_000)), []);
  assert.equal(engine.evaluate(settings, message('guild-a', 1_001)).length, 1);
  assert.deepEqual(engine.evaluate(settings, message('guild-b', 1_002)), []);
  assert.deepEqual(engine.evaluateSecurityEvent(settings, { guildId: 'guild-b', kind: 'member-join', timestamp: 1_003 }), []);
  assert.deepEqual(engine.evaluate(settings, message('guild-a', 1_004)), []);
  assert.deepEqual(engine.evaluateSecurityEvent(disabled, { guildId: 'guild-b', kind: 'member-join', timestamp: 1_005 }), []);
  assert.deepEqual(engine.evaluate(disabled, message('guild-a', 1_006)), []);

  assert.deepEqual(engine.evaluate(settings, message('guild-a', 1_007)), []);
  assert.equal(engine.evaluate(settings, message('guild-a', 1_008)).length, 1);
  assert.deepEqual(engine.evaluateSecurityEvent(settings, { guildId: 'guild-b', kind: 'member-join', timestamp: 1_009 }), []);
  assert.equal(engine.evaluateSecurityEvent(settings, { guildId: 'guild-b', kind: 'member-join', timestamp: 1_010 }).length, 1);
});

test('automod settings are bounded, persistent, and corruption-safe', async () => {
  const root = await os.tmpdir();
  const dataRoot = path.join(root, `localbot-automod-${process.pid}-${Date.now()}`);
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'automod.json');
  try {
    const store = new AutoModStore(filePath);
    assert.equal((await store.get('guild-1')).enabled, false);
    await store.update('guild-1', { enabled: true, rules: { link: { enabled: true, blockedDomains: ['bad.example'] } } });
    const restored = new AutoModStore(filePath);
    assert.deepEqual((await restored.get('guild-1')).rules.link.blockedDomains, ['bad.example']);
    await assert.rejects(() => restored.update('guild-1', { enabled: true, rules: { link: { blockedDomains: ['https://bad.example'] } } }), /hostname không hợp lệ/);
    assert.equal((await restored.get('guild-1')).rules.link.enabled, true);

    await writeFile(filePath, '{ broken', 'utf8');
    const recovered = new AutoModStore(filePath);
    assert.equal((await recovered.get('guild-1')).enabled, false);
    assert.ok((await readdir(dataRoot)).some((entry) => entry.includes('.corrupt-')));
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});
