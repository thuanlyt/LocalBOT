import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { ChannelType, Collection, PermissionFlagsBits } from 'discord.js';
import { EqualizerStore, equalizerStore } from './equalizer.js';
import { config } from './config.js';
import { startControlServer } from './control-server.js';
import { ProviderSettingsStore } from './provider-settings.js';
import { CommunityStore } from './community.js';
import { GreetingStore } from './greetings.js';
import { AutoModStore } from './automod.js';
import { OllamaStore } from './ollama.js';
import { AuditLogStore } from './audit-log.js';
import { AutoModReviewStore } from './automod-review.js';

test('control server rejects a non-canonical binding before opening a listener', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  try {
    config.controlEnabled = true;
    config.controlHost = '0.0.0.0';
    config.controlPort = 0;
    const fakeClient = { isReady: () => true, user: null, guilds: { cache: new Map() } };
    await assert.rejects(() => startControlServer(fakeClient as never), /LOCALBOT_CONTROL_HOST/);
  } finally {
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
  }
});

test('control server exposes a secret-free health endpoint when enabled', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const previousRuntimeOwnerId = config.runtimeOwnerId;
  config.controlEnabled = true;
  config.controlHost = '127.0.0.1';
  config.controlPort = 0;
  config.runtimeOwnerId = 'native-test-owner';
  await equalizerStore.load();

  const fakeClient = {
    isReady: () => true,
    user: null,
    guilds: { cache: new Map() }
  };
  const server = await startControlServer(fakeClient as never);
  assert.ok(server);
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ready',
    service: 'localbot-control',
    version: 'v1',
    runtimeOwnerId: 'native-test-owner',
    user: null
  });
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

  config.controlEnabled = previousEnabled;
  config.controlPort = previousPort;
  config.controlHost = previousHost;
  config.runtimeOwnerId = previousRuntimeOwnerId;
});

test('control server exposes bounded runtime diagnostics without secrets', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const previousRuntimeOwnerId = config.runtimeOwnerId;
  config.controlEnabled = true;
  config.controlHost = '127.0.0.1';
  config.controlPort = 0;
  config.runtimeOwnerId = 'diagnostics-test-owner';
  const fakeClient = {
    isReady: () => true,
    user: { tag: 'LocalBot#0001' },
    guilds: { cache: new Map([['guild-1', {}], ['guild-2', {}]]) }
  };
  let server: import('node:http').Server | null = null;
  try {
    server = await startControlServer(fakeClient as never);
    assert.ok(server);
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/diagnostics`);
    assert.equal(response.status, 200);
    const payload = await response.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), ['capabilities', 'checks', 'control', 'discord', 'generatedAt', 'profile', 'providers', 'status'].sort());
    assert.equal(payload.profile, config.runtimeProfile);
    assert.equal((payload.discord as { guildCount: number }).guildCount, 2);
    assert.equal((payload.control as { ownerPresent: boolean }).ownerPresent, true);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'runtimeOwnerId'), false);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    config.runtimeOwnerId = previousRuntimeOwnerId;
  }
});

test('control server exposes provider readiness without credentials', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  config.controlEnabled = true;
  config.controlHost = '127.0.0.1';
  config.controlPort = 0;
  const fakeClient = {
    isReady: () => true,
    user: null,
    guilds: { cache: new Map() }
  };
  const server = await startControlServer(fakeClient as never);
  assert.ok(server);
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/providers`);
  assert.equal(response.status, 200);
  const payload = await response.json() as { providers: Array<{ id: string; configured: boolean }> };
  assert.deepEqual(payload.providers.map((provider) => provider.id), ['youtube', 'soundcloud']);
  assert.equal(typeof payload.providers[0]?.configured, 'boolean');
  assert.equal(typeof payload.providers[1]?.configured, 'boolean');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  config.controlEnabled = previousEnabled;
  config.controlPort = previousPort;
  config.controlHost = previousHost;
});

test('control server audits Equalizer mutations before returning success', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-equalizer-audit-control-'));
  let server: import('node:http').Server | null = null;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    const equalizer = new EqualizerStore(path.join(root, 'equalizer.json'));
    const audit = new AuditLogStore(path.join(root, 'audit.json'));
    await equalizer.load();
    await audit.loadPersisted();
    const guild = {
      id: 'guild-equalizer-audit',
      name: 'Equalizer Audit QA',
      memberCount: 0,
      iconURL: () => null,
      channels: { cache: new Collection() },
      members: { me: null, cache: new Collection() },
      voiceStates: { cache: new Collection() }
    };
    const fakeClient = { isReady: () => true, user: null, guilds: { cache: new Collection([[guild.id, guild]]) } };
    server = await startControlServer(fakeClient as never, { equalizer, audit });
    assert.ok(server);
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}/api/v1/guilds/${guild.id}/equalizer`;

    const presetResponse = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preset: 'focus' })
    });
    assert.equal(presetResponse.status, 200);
    assert.deepEqual((await presetResponse.json()).settings, { bass: -2, mid: 3, treble: 2 });

    const bandsResponse = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bass: 4, mid: 0, treble: -2 })
    });
    assert.equal(bandsResponse.status, 200);
    const entries = await audit.list(10, guild.id, { action: 'equalizer' });
    assert.deepEqual(entries.map((entry) => ({ action: entry.action, detail: entry.detail })), [
      { action: 'equalizer.bands', detail: 'bands=updated' },
      { action: 'equalizer.preset', detail: 'preset=focus' }
    ]);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    await rm(root, { recursive: true, force: true });
  }
});

test('control server waits for the injected mutation audit attempt before responding', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-audit-order-control-'));
  let server: import('node:http').Server | null = null;
  let releaseAudit!: () => void;
  let auditStarted!: () => void;
  const auditGate = new Promise<void>((resolve) => { releaseAudit = resolve; });
  const auditStartSignal = new Promise<void>((resolve) => { auditStarted = resolve; });
  const records: Array<{ action?: string; guildId?: string | null; detail?: string }> = [];
  const audit = {
    record: async (entry: { action: string; guildId: string | null; detail: string }) => {
      records.push(entry);
      auditStarted();
      await auditGate;
      return { ...entry, id: 'audit-order-test', timestamp: new Date().toISOString() };
    }
  } as unknown as AuditLogStore;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    const equalizer = new EqualizerStore(path.join(root, 'equalizer.json'));
    await equalizer.load();
    const guild = {
      id: 'guild-audit-order',
      name: 'Audit Order QA',
      memberCount: 0,
      iconURL: () => null,
      channels: { cache: new Collection() },
      members: { me: null, cache: new Collection() },
      voiceStates: { cache: new Collection() }
    };
    const fakeClient = { isReady: () => true, user: null, guilds: { cache: new Collection([[guild.id, guild]]) } };
    server = await startControlServer(fakeClient as never, { equalizer, audit });
    assert.ok(server);
    const address = server.address() as AddressInfo;
    const responsePromise = fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/${guild.id}/equalizer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preset: 'warm' })
    });
    await auditStartSignal;
    let responseSettled = false;
    void responsePromise.then(() => { responseSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(responseSettled, false);
    assert.deepEqual(records, [{ actor: 'native', action: 'equalizer.preset', guildId: guild.id, detail: 'preset=warm' }]);
    releaseAudit();
    const response = await responsePromise;
    assert.equal(response.status, 200);
  } finally {
    releaseAudit();
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    await rm(root, { recursive: true, force: true });
  }
});

test('control server exposes and updates Ollama settings without exposing provider payloads', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-ollama-control-'));
  let server: import('node:http').Server | null = null;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    const ollama = new OllamaStore(path.join(root, 'ollama.json'));
    await ollama.load();
    const fakeClient = { isReady: () => true, user: null, guilds: { cache: new Collection() } };
    server = await startControlServer(fakeClient as never, { ollama });
    assert.ok(server);
    const address = server.address() as AddressInfo;
    const initial = await fetch(`http://127.0.0.1:${address.port}/api/v1/ollama`);
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).health.status, 'disabled');
    const update = await fetch(`http://127.0.0.1:${address.port}/api/v1/ollama/settings`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true, model: 'qwen2.5:7b' })
    });
    assert.equal(update.status, 200);
    const payload = await update.json() as { settings: { enabled: boolean; model: string }; health: { status: string } };
    assert.deepEqual(payload.settings, { enabled: true, baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5:7b', timeoutMs: 5000 });
    assert.equal(payload.health.status, 'offline');
    assert.equal(JSON.stringify(payload).includes('apiKey'), false);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    await rm(root, { recursive: true, force: true });
  }
});

test('control server exposes only bounded Ollama suggestions', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-ollama-suggestion-control-'));
  const providerServer = createServer((request, response) => {
    if (request.url !== '/api/generate') {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ response: 'Dùng nút Hàng đợi trong native app.', rawProviderSecret: 'must-not-cross' }));
  });
  let server: import('node:http').Server | null = null;
  try {
    await new Promise<void>((resolve) => providerServer.listen(0, '127.0.0.1', () => resolve()));
    const providerAddress = providerServer.address() as AddressInfo;
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    const ollama = new OllamaStore(path.join(root, 'ollama.json'));
    await ollama.load();
    await ollama.update({ enabled: true, baseUrl: `http://127.0.0.1:${providerAddress.port}`, model: 'test-model' });
    const fakeClient = { isReady: () => true, user: null, guilds: new Collection() };
    server = await startControlServer(fakeClient as never, { ollama });
    assert.ok(server);
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/ollama/suggest`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'Hướng dẫn hàng đợi', surface: 'music' })
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { suggestion: string; surface: string; generatedAt: string; rawProviderSecret?: string };
    assert.deepEqual(payload, { suggestion: 'Dùng nút Hàng đợi trong native app.', surface: 'music', generatedAt: payload.generatedAt });
    assert.equal('rawProviderSecret' in payload, false);
    const invalid = await fetch(`http://127.0.0.1:${address.port}/api/v1/ollama/suggest`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'x'.repeat(513), surface: 'help' })
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json() as { error: { code: string } }).error.code, 'OLLAMA_INVALID_INPUT');
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    await new Promise<void>((resolve) => providerServer.close(() => resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    await rm(root, { recursive: true, force: true });
  }
});

test('control server can disable SoundCloud and rejects enabling it without credentials', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const previousClientId = config.soundcloudClientId;
  const previousClientSecret = config.soundcloudClientSecret;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-provider-control-'));
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    config.soundcloudClientId = '';
    config.soundcloudClientSecret = '';
    const providerSettings = new ProviderSettingsStore(path.join(root, 'provider-settings.json'));
    await providerSettings.load();
    const fakeClient = { isReady: () => true, user: null, guilds: { cache: new Map() } };
    const server = await startControlServer(fakeClient as never, { providerSettings });
    assert.ok(server);
    const address = server.address() as AddressInfo;

    const disableResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/providers/soundcloud`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false })
    });
    assert.equal(disableResponse.status, 200);
    assert.deepEqual(await disableResponse.json(), { provider: 'soundcloud', enabled: false, configured: false });

    const readinessResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/providers`);
    const readiness = await readinessResponse.json() as { providers: Array<{ id: string; enabled: boolean }> };
    assert.equal(readiness.providers.find((provider) => provider.id === 'soundcloud')?.enabled, false);

    const enableResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/providers/soundcloud`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: true })
    });
    assert.equal(enableResponse.status, 503);
    assert.equal((await enableResponse.json()).error.code, 'SOUNDCLOUD_NOT_CONFIGURED');
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  } finally {
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    config.soundcloudClientId = previousClientId;
    config.soundcloudClientSecret = previousClientSecret;
    await rm(root, { recursive: true, force: true });
  }
});

test('control server exposes guild Community settings and paginated leaderboard contracts', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-community-control-'));
  let server: import('node:http').Server | null = null;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    const guild = {
      id: 'guild-community',
      name: 'Community QA',
      memberCount: 3,
      iconURL: () => null,
      channels: { cache: new Collection() },
      members: { me: null, cache: new Collection() },
      voiceStates: { cache: new Collection() }
    };
    const community = new CommunityStore(path.join(root, 'community.json'), 0);
    await community.recordMessage(guild.id, 'user-a', 'Alpha', 1);
    await community.recordMessage(guild.id, 'user-b', 'Beta', 2);
    await community.recordMessage(guild.id, 'user-b', 'Beta', 3);
    const fakeClient = { isReady: () => true, user: null, guilds: { cache: new Collection([[guild.id, guild]]) } };
    const started = await startControlServer(fakeClient as never, { community });
    assert.ok(started);
    server = started;
    const address = server.address() as AddressInfo;

    const settingsResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/${guild.id}/community/settings`);
    assert.equal(settingsResponse.status, 200);
    assert.deepEqual((await settingsResponse.json()).settings, { ignoredChannelIds: [], ignoredRoleIds: [], cooldownSeconds: null, xpMultiplier: 1, roleMultipliers: {}, roleRewards: [] });

    const invalidResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/${guild.id}/community/settings`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cooldownSeconds: 86_401 })
    });
    assert.equal(invalidResponse.status, 400);
    assert.equal((await invalidResponse.json()).error.code, 'INVALID_COMMUNITY_SETTINGS');

    const pageResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/${guild.id}/community/leaderboard?limit=1&offset=1`);
    assert.equal(pageResponse.status, 200);
    assert.deepEqual(await pageResponse.json(), { leaderboard: [{ userId: 'user-a', username: 'Alpha', xp: 15, level: 1, messages: 1, lastAwardedAt: 1, rank: 2, progress: 15, nextLevelXp: 100 }], hasMore: false });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    await rm(root, { recursive: true, force: true });
  }
});

test('control server requires explicit confirmation for a guild Community reset', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-community-reset-control-'));
  let server: import('node:http').Server | null = null;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    const guild = {
      id: 'guild-community-reset',
      name: 'Community Reset QA',
      memberCount: 1,
      iconURL: () => null,
      channels: { cache: new Collection() },
      members: { me: null, cache: new Collection() },
      voiceStates: { cache: new Collection() }
    };
    const community = new CommunityStore(path.join(root, 'community.json'), 0);
    await community.addIgnoredChannel(guild.id, 'channel-mod-log');
    await community.setCooldownSeconds(guild.id, 20);
    await community.recordMessage(guild.id, 'user-a', 'Alpha', 20_000);
    const started = await startControlServer({ isReady: () => true, user: null, guilds: { cache: new Collection([[guild.id, guild]]) } } as never, { community });
    assert.ok(started);
    server = started;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}/api/v1/guilds/${guild.id}`;

    const rejected = await fetch(`${base}/community/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: false }) });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error.code, 'RESET_NOT_CONFIRMED');
    assert.equal((await community.member(guild.id, 'user-a'))?.xp, 15);

    const accepted = await fetch(`${base}/community/reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { removedMembers: 1, settings: { ignoredChannelIds: ['channel-mod-log'], ignoredRoleIds: [], cooldownSeconds: 20, xpMultiplier: 1, roleMultipliers: {}, roleRewards: [] } });
    assert.equal(await community.member(guild.id, 'user-a'), null);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    await rm(root, { recursive: true, force: true });
  }
});

test('control server updates Community multipliers and role rewards without partial mutation', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-community-reward-control-'));
  let server: import('node:http').Server | null = null;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    const guild = {
      id: 'guild-community-reward',
      name: 'Community Reward QA',
      memberCount: 2,
      iconURL: () => null,
      channels: { cache: new Collection() },
      members: { me: null, cache: new Collection() },
      voiceStates: { cache: new Collection() }
    };
    const community = new CommunityStore(path.join(root, 'community.json'), 0);
    const started = await startControlServer({ isReady: () => true, user: null, guilds: { cache: new Collection([[guild.id, guild]]) } } as never, { community });
    assert.ok(started);
    server = started;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}/api/v1/guilds/${guild.id}/community/settings`;

    const update = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ignoredChannelIds: ['channel-muted'], ignoredRoleIds: ['role-muted'], xpMultiplier: 2, roleMultipliers: { 'role-helper': 3 }, roleRewards: [{ roleId: 'role-helper', level: 3 }] }) });
    assert.equal(update.status, 200);
    assert.deepEqual((await update.json()).settings, { ignoredChannelIds: ['channel-muted'], ignoredRoleIds: ['role-muted'], cooldownSeconds: null, xpMultiplier: 2, roleMultipliers: { 'role-helper': 3 }, roleRewards: [{ roleId: 'role-helper', level: 3 }] });

    const invalid = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ignoredRoleIds: 'not-an-array', xpMultiplier: 99, roleRewards: [{ roleId: 'role-helper', level: 3 }] }) });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_COMMUNITY_SETTINGS');
    assert.equal((await community.getSettings(guild.id)).xpMultiplier, 2);
    assert.deepEqual((await community.getSettings(guild.id)).roleRewards, [{ roleId: 'role-helper', level: 3 }]);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    await rm(root, { recursive: true, force: true });
  }
});

test('control server exposes validated Welcome/Goodbye settings, preview, and test-send', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const previousIntent = config.guildMembersIntentEnabled;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-greetings-control-'));
  let server: import('node:http').Server | null = null;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    config.guildMembersIntentEnabled = false;
    const sent: Array<Record<string, unknown>> = [];
    const channel = { id: 'channel-welcome', name: 'welcome', type: ChannelType.GuildText, rawPosition: 1, parent: null, permissionsFor: () => ({ has: () => true }), isTextBased: () => true, send: async (payload: Record<string, unknown>) => { sent.push(payload); } };
    const guild = {
      id: 'guild-greetings',
      name: 'Greetings QA',
      memberCount: 7,
      iconURL: () => null,
      channels: { cache: new Collection([[channel.id, channel]]) },
      members: { me: { id: 'bot' }, cache: new Collection() },
      voiceStates: { cache: new Collection() }
    };
    const greetings = new GreetingStore(path.join(root, 'greetings.json'));
    const fakeClient = { isReady: () => true, user: { id: 'bot' }, guilds: { cache: new Collection([[guild.id, guild]]) } };
    const started = await startControlServer(fakeClient as never, { greetings });
    assert.ok(started);
    server = started;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}/api/v1/guilds/${guild.id}/greetings`;

    const initial = await fetch(base);
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).intentEnabled, false);

    const channels = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/${guild.id}/text-channels`);
    assert.equal(channels.status, 200);
    assert.deepEqual(await channels.json(), { channels: [{ id: channel.id, name: channel.name, category: null, position: 1, canSend: true, canEmbed: true }] });

    const invalidKind = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'unknown', template: {} }) });
    assert.equal(invalidKind.status, 400);
    assert.equal((await invalidKind.json()).error.code, 'INVALID_GREETING_KIND');

    const update = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'welcome', template: { enabled: true, channelId: channel.id, message: 'Chào {user} tại {guild}', imageUrl: null } }) });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).settings.welcome.enabled, true);

    const preview = await fetch(`${base}/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'welcome', username: 'Alpha' }) });
    assert.equal(preview.status, 200);
    assert.deepEqual((await preview.json()).preview, { text: 'Chào @Alpha tại Greetings QA', imageUrl: null });

    const testSend = await fetch(`${base}/test-send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'welcome' }) });
    assert.equal(testSend.status, 200);
    assert.deepEqual(await testSend.json(), { kind: 'welcome', sent: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.content, 'Chào @LocalBot test tại Greetings QA');
    assert.deepEqual(sent[0]?.allowedMentions, { parse: [] });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    config.guildMembersIntentEnabled = previousIntent;
    await rm(root, { recursive: true, force: true });
  }
});

test('control server exposes validated guild-scoped AutoMod settings', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const previousMessageContentIntent = config.messageContentIntentEnabled;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-automod-control-'));
  let server: import('node:http').Server | null = null;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    const guild = { id: 'guild-automod', name: 'AutoMod QA' };
    const automod = new AutoModStore(path.join(root, 'automod.json'));
    const audit = new AuditLogStore(path.join(root, 'audit.json'));
    const fakeClient = { isReady: () => true, user: null, guilds: { cache: new Collection([[guild.id, guild]]) } };
    let resetGuild: string | null = null;
    const started = await startControlServer(fakeClient as never, { automod, audit, onAutoModRecovery: (guildId) => { resetGuild = guildId; } });
    assert.ok(started);
    server = started;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}/api/v1/guilds/${guild.id}/automod`;

    const initial = await fetch(base);
    assert.equal(initial.status, 200);
    const initialPayload = await initial.json();
    assert.equal(initialPayload.settings.enabled, false);
    assert.equal(initialPayload.capabilities.messageContentIntentEnabled, previousMessageContentIntent);

    const enforce = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings: { enabled: true, mode: 'enforce', rules: { link: { enabled: true, blockedDomains: ['bad.example'] } }, exemptUserIds: ['user-1'] } }) });
    assert.equal(enforce.status, 200);
    assert.equal((await enforce.json()).settings.mode, 'enforce');

    const missingRecoveryConfirmation = await fetch(`${base}/recover`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: false }) });
    assert.equal(missingRecoveryConfirmation.status, 400);
    assert.equal((await missingRecoveryConfirmation.json()).error.code, 'AUTOMOD_RECOVERY_CONFIRMATION_REQUIRED');

    const recovered = await fetch(`${base}/recover`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
    assert.equal(recovered.status, 200);
    const recoveredPayload = await recovered.json();
    assert.equal(recoveredPayload.recovered, true);
    assert.equal(recoveredPayload.settings.enabled, false);
    assert.equal(recoveredPayload.settings.mode, 'dry-run');
    assert.deepEqual(recoveredPayload.settings.rules.link.blockedDomains, ['bad.example']);
    assert.deepEqual(recoveredPayload.settings.exemptUserIds, ['user-1']);
    assert.equal(resetGuild, guild.id);
    const recoveryAudit = await audit.list(10, guild.id, { action: 'automod.safe_recovery' });
    assert.equal(recoveryAudit.length, 1);
    assert.equal(recoveryAudit[0]?.detail, 'enabled=false;mode=dry-run;volatileStateCleared=true');

    const invalid = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings: { mode: 'lockdown' } }) });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_AUTOMOD_SETTINGS');

    const update = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ settings: { enabled: true, mode: 'dry-run', rules: { link: { enabled: true, blockedDomains: ['bad.example'] } } } }) });
    assert.equal(update.status, 200);
    const payload = await update.json();
    assert.equal(payload.settings.mode, 'dry-run');
    assert.deepEqual(payload.settings.rules.link.blockedDomains, ['bad.example']);
    assert.equal(payload.capabilities.messageContentIntentEnabled, previousMessageContentIntent);
    assert.equal(Object.hasOwn(payload, 'content'), false);
    assert.equal(JSON.stringify(payload.settings).includes('content'), false);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    config.messageContentIntentEnabled = previousMessageContentIntent;
    await rm(root, { recursive: true, force: true });
  }
});

test('control server bounds searchable audit filters', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  config.controlEnabled = true;
  config.controlHost = '127.0.0.1';
  config.controlPort = 0;
  const fakeClient = {
    isReady: () => true,
    user: null,
    guilds: { cache: new Map() }
  };
  const server = await startControlServer(fakeClient as never);
  assert.ok(server);
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/audit-log?search=${'x'.repeat(101)}`);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_QUERY');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  config.controlEnabled = previousEnabled;
  config.controlPort = previousPort;
  config.controlHost = previousHost;
});

test('control server exposes only a bounded, permission-checked Discord audit DTO', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  let server: import('node:http').Server | null = null;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    const discordGuild = {
      id: 'guild-discord-audit',
      members: {
        me: { permissions: { has: () => true } },
        fetchMe: async () => null
      },
      fetchAuditLogs: async (options: { limit: number }) => ({
        entries: new Collection([
          ['audit-1', {
            id: 'audit-1',
            createdAt: new Date('2026-09-03T10:00:00.000Z'),
            actionType: 'Update',
            targetType: 'Channel',
            targetId: 'channel-1',
            executorId: 'user-1',
            executor: { tag: 'Admin#0001' },
            reason: 'must not be returned',
            changes: [{ key: 'name' }]
          }]
        ]),
        requestedLimit: options.limit
      })
    };
    const fakeClient = { isReady: () => true, user: null, guilds: { cache: new Collection([['guild-discord-audit', discordGuild]]) } };
    server = await startControlServer(fakeClient as never);
    assert.ok(server);
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/guild-discord-audit/audit-log/discord?limit=7`);
    assert.equal(response.status, 200);
    const payload = await response.json() as { guildId: string; source: string; entries: Array<Record<string, unknown>> };
    assert.equal(payload.guildId, 'guild-discord-audit');
    assert.equal(payload.source, 'discord');
    assert.deepEqual(payload.entries[0], {
      id: 'audit-1',
      createdAt: '2026-09-03T10:00:00.000Z',
      actionType: 'Update',
      targetType: 'Channel',
      targetId: 'channel-1',
      actorId: 'user-1',
      actorTag: 'Admin#0001'
    });
    assert.equal(JSON.stringify(payload).includes('must not be returned'), false);
    assert.equal(JSON.stringify(payload).includes('changes'), false);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
  }
});

test('control server exposes secret-free audit retention metadata', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  config.controlEnabled = true;
  config.controlHost = '127.0.0.1';
  config.controlPort = 0;
  const fakeClient = { isReady: () => true, user: null, guilds: { cache: new Map() } };
  const server = await startControlServer(fakeClient as never);
  assert.ok(server);
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/audit-log/settings`);
  assert.equal(response.status, 200);
  const payload = await response.json() as { retentionDays: number | null; maxEntries: number };
  assert.equal(payload.maxEntries, 2_000);
  assert.ok(payload.retentionDays === null || Number.isInteger(payload.retentionDays));
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  config.controlEnabled = previousEnabled;
  config.controlPort = previousPort;
  config.controlHost = previousHost;
});

test('control server updates audit retention without arbitrary deletion', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-audit-settings-control-'));
  let server: import('node:http').Server | null = null;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    const audit = new AuditLogStore(path.join(root, 'audit-log.json'));
    await audit.loadPersisted();
    const fakeClient = { isReady: () => true, user: null, guilds: new Collection() };
    server = await startControlServer(fakeClient as never, { audit });
    assert.ok(server);
    const address = server.address() as AddressInfo;
    const update = await fetch(`http://127.0.0.1:${address.port}/api/v1/audit-log/settings`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ retentionDays: 30 })
    });
    assert.equal(update.status, 200);
    assert.deepEqual(await update.json(), { retentionDays: 30, maxEntries: 2_000 });
    const invalid = await fetch(`http://127.0.0.1:${address.port}/api/v1/audit-log/settings`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ retentionDays: 0 })
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json() as { error: { code: string } }).error.code, 'INVALID_AUDIT_SETTINGS');
    assert.equal((await audit.getSettings()).retentionDays, 30);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    await rm(root, { recursive: true, force: true });
  }
});

test('control server exports only scoped, redacted audit entries as JSON or CSV', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-audit-export-control-'));
  let server: import('node:http').Server | null = null;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    const audit = new AuditLogStore(path.join(root, 'audit-log.json'));
    await audit.loadPersisted();
    await audit.record({ actor: 'native', action: 'provider.test', guildId: 'guild-export', detail: 'token=do-not-export; ok' });
    await audit.record({ actor: 'native', action: 'player.play', guildId: 'other-guild', detail: 'other scope' });
    const fakeClient = { isReady: () => true, user: null, guilds: new Collection() };
    server = await startControlServer(fakeClient as never, { audit });
    assert.ok(server);
    const address = server.address() as AddressInfo;

    const missingScope = await fetch(`http://127.0.0.1:${address.port}/api/v1/audit-log/export`);
    assert.equal(missingScope.status, 400);
    assert.equal((await missingScope.json() as { error: { code: string } }).error.code, 'GUILD_SCOPE_REQUIRED');

    const jsonResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/audit-log/export?guildId=guild-export&limit=100`);
    assert.equal(jsonResponse.status, 200);
    assert.match(jsonResponse.headers.get('content-disposition') ?? '', /localbot-audit-.*\.json/);
    const jsonPayload = await jsonResponse.json() as { format: string; version: number; guildId: string; entries: Array<{ guildId: string; detail: string }> };
    assert.deepEqual({ format: jsonPayload.format, version: jsonPayload.version, guildId: jsonPayload.guildId }, { format: 'localbot-audit', version: 1, guildId: 'guild-export' });
    assert.equal(jsonPayload.entries.length, 1);
    assert.equal(jsonPayload.entries[0]?.guildId, 'guild-export');
    assert.equal(jsonPayload.entries[0]?.detail.includes('do-not-export'), false);
    assert.equal(JSON.stringify(jsonPayload).includes('other scope'), false);

    const csvResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/audit-log/export?guildId=guild-export&format=csv`);
    assert.equal(csvResponse.status, 200);
    assert.match(csvResponse.headers.get('content-type') ?? '', /text\/csv/);
    const csv = await csvResponse.text();
    assert.match(csv, /"id","timestamp","actor","action","guildId","detail"/);
    assert.match(csv, /provider\.test/);
    assert.equal(csv.includes('do-not-export'), false);
    assert.equal(csv.includes('other scope'), false);

    const invalidFormat = await fetch(`http://127.0.0.1:${address.port}/api/v1/audit-log/export?guildId=guild-export&format=xml`);
    assert.equal(invalidFormat.status, 400);
    assert.equal((await invalidFormat.json() as { error: { code: string } }).error.code, 'INVALID_QUERY');
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    await rm(root, { recursive: true, force: true });
  }
});

test('control server exports a credential-free local backup envelope', async () => {
  const previous = {
    enabled: config.controlEnabled,
    port: config.controlPort,
    host: config.controlHost,
    playlists: config.playlistsFile,
    permissions: config.musicPermissionsFile,
    equalizer: config.equalizerFile,
    community: config.communityFile,
    audit: config.auditFile,
    playerState: config.playerStateFile,
    greetings: config.greetingsFile,
    automod: config.automodFile,
    automodReview: config.automodReviewFile,
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-control-backup-'));
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    config.playlistsFile = path.join(root, 'playlists.json');
    config.musicPermissionsFile = path.join(root, 'music-permissions.json');
    config.equalizerFile = path.join(root, 'equalizer.json');
    config.communityFile = path.join(root, 'community.json');
    config.auditFile = path.join(root, 'audit-log.json');
    config.playerStateFile = path.join(root, 'player-state.json');
    config.greetingsFile = path.join(root, 'greetings.json');
    config.automodFile = path.join(root, 'automod.json');
    config.automodReviewFile = path.join(root, 'automod-review.json');
    await writeFile(config.playlistsFile, JSON.stringify({ version: 1, playlists: [] }), 'utf8');
    const fakeClient = { isReady: () => true, user: null, guilds: { cache: new Map() } };
    const server = await startControlServer(fakeClient as never);
    assert.ok(server);
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/data/export`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition') ?? '', /attachment/);
    const payload = await response.json() as { format: string; version: number; stores: Record<string, unknown> };
    assert.equal(payload.format, 'localbot-backup');
    assert.equal(payload.version, 1);
    assert.deepEqual(Object.keys(payload.stores).sort(), ['audit', 'automod', 'automodReview', 'community', 'equalizer', 'greetings', 'musicPermissions', 'ollama', 'playerState', 'playlists']);
    assert.equal(JSON.stringify(payload).includes('DISCORD_TOKEN'), false);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  } finally {
    config.controlEnabled = previous.enabled;
    config.controlPort = previous.port;
    config.controlHost = previous.host;
    config.playlistsFile = previous.playlists;
    config.musicPermissionsFile = previous.permissions;
    config.equalizerFile = previous.equalizer;
    config.communityFile = previous.community;
    config.auditFile = previous.audit;
    config.playerStateFile = previous.playerState;
    config.greetingsFile = previous.greetings;
    config.automodFile = previous.automod;
    config.automodReviewFile = previous.automodReview;
    await new Promise((resolve) => setTimeout(resolve, 25));
    await rm(root, { recursive: true, force: true });
  }
});

test('control server requires explicit confirmation before restoring a local backup', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  config.controlEnabled = true;
  config.controlHost = '127.0.0.1';
  config.controlPort = 0;
  const fakeClient = { isReady: () => true, user: null, guilds: { cache: new Map() } };
  const server = await startControlServer(fakeClient as never);
  assert.ok(server);
  const address = server.address() as AddressInfo;

  const confirmation = await fetch(`http://127.0.0.1:${address.port}/api/v1/data/restore`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: false, backup: {} }),
  });
  assert.equal(confirmation.status, 400);
  assert.equal((await confirmation.json()).error.code, 'RESTORE_CONFIRMATION_REQUIRED');

  const invalid = await fetch(`http://127.0.0.1:${address.port}/api/v1/data/restore`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: true, backup: {} }),
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INVALID_BACKUP');

  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  config.controlEnabled = previousEnabled;
  config.controlPort = previousPort;
  config.controlHost = previousHost;
});

test('control server keeps Windows-only discovery and audio independent from guild voice context', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  config.controlEnabled = true;
  config.controlHost = '127.0.0.1';
  config.controlPort = 0;

  const fakeClient = {
    isReady: () => true,
    user: null,
    guilds: { cache: new Map() }
  };
  const server = await startControlServer(fakeClient as never);
  assert.ok(server);
  const address = server.address() as AddressInfo;

  const searchResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/media/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(searchResponse.status, 400);
  assert.equal((await searchResponse.json()).error.code, 'INVALID_INPUT');

  const audioResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/local-audio`);
  assert.equal(audioResponse.status, 400);
  assert.equal((await audioResponse.json()).error.code, 'INVALID_INPUT');

  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  config.controlEnabled = previousEnabled;
  config.controlPort = previousPort;
  config.controlHost = previousHost;
});

test('control server exposes guild and voice channel summaries', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const previousMembersIntent = config.guildMembersIntentEnabled;
  config.controlEnabled = true;
  config.controlHost = '127.0.0.1';
  config.controlPort = 0;
  config.guildMembersIntentEnabled = false;

  const channels = new Collection<string, any>();
  const roles = new Collection<string, any>();
  const guild = {
    id: 'guild-1',
    name: 'Local Community',
    memberCount: 42,
    iconURL: () => null,
    channels: { cache: channels },
    roles: { cache: roles },
    members: {
      me: null,
      cache: new Collection([['user-1', { id: 'user-1', displayName: 'Alice Nguyen', user: { username: 'alice', bot: false } }]]),
      fetch: async () => new Collection()
    },
    voiceStates: { cache: new Collection() }
  };
  channels.set('voice-1', {
    id: 'voice-1',
    type: ChannelType.GuildVoice,
    name: 'Phòng nghe',
    rawPosition: 1,
    parent: null,
    guild,
    permissionsFor: () => null
  });
  roles.set('role-2', { id: 'role-2', name: 'DJ', hexColor: '#ffffff', position: 2, managed: false, mentionable: true });
  roles.set('role-1', { id: 'role-1', name: 'Member', hexColor: '#000000', position: 1, managed: false, mentionable: false });
  roles.set('guild-1', { id: 'guild-1', name: '@everyone', hexColor: '#000000', position: 0, managed: false, mentionable: false });

  const fakeClient = {
    isReady: () => true,
    user: null,
    guilds: { cache: new Collection([['guild-1', guild]]) }
  };
  const server = await startControlServer(fakeClient as never);
  assert.ok(server);
  const address = server.address() as AddressInfo;
  const guildsResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds`);
  assert.equal(guildsResponse.status, 200);
  assert.deepEqual((await guildsResponse.json()).guilds, [{
    id: 'guild-1',
    name: 'Local Community',
    icon: null,
    memberCount: 42,
    botVoiceChannel: null
  }]);

  const channelsResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/guild-1/channels`);
  assert.equal(channelsResponse.status, 200);
  const payload = await channelsResponse.json();
  assert.equal(payload.channels[0].id, 'voice-1');
  assert.equal(payload.channels[0].name, 'Phòng nghe');
  assert.equal(payload.channels[0].type, 'voice');
  assert.equal(payload.channels[0].canConnect, null);
  assert.equal(payload.channels[0].botJoined, false);

  const rolesResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/guild-1/roles`);
  assert.equal(rolesResponse.status, 200);
  assert.deepEqual((await rolesResponse.json()).roles, [
    { id: 'role-2', name: 'DJ', color: '#ffffff', position: 2, managed: false, mentionable: true },
    { id: 'role-1', name: 'Member', color: '#000000', position: 1, managed: false, mentionable: false }
  ]);

  const permissionsResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/guild-1/permissions`);
  assert.equal(permissionsResponse.status, 200);
  assert.deepEqual(await permissionsResponse.json(), {
    guildId: 'guild-1',
    permissions: {
      botMemberPresent: false,
      botUserId: null,
      highestRole: null,
      permissions: {
        viewChannel: null,
        sendMessages: null,
        embedLinks: null,
        connect: null,
        speak: null,
        moveMembers: null,
        manageMessages: null,
        moderateMembers: null,
        manageRoles: null,
        manageGuild: null,
        viewAuditLog: null,
        useApplicationCommands: null
      }
    }
  });

  const membersResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/guild-1/members?query=alice&limit=10`);
  assert.equal(membersResponse.status, 200);
  assert.deepEqual(await membersResponse.json(), {
    members: [{ id: 'user-1', username: 'alice', displayName: 'Alice Nguyen', bot: false }],
    intentEnabled: false,
    complete: false,
    source: 'cache'
  });

  const guildSearchResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/guild-1/media/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(guildSearchResponse.status, 400);
  assert.equal((await guildSearchResponse.json()).error.code, 'INVALID_INPUT');

  const streamResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/guild-1/player/events`);
  assert.equal(streamResponse.status, 200);
  assert.match(streamResponse.headers.get('content-type') ?? '', /text\/event-stream/);
  const reader = streamResponse.body?.getReader();
  assert.ok(reader);
  const firstFrame = await reader.read();
  assert.match(new TextDecoder().decode(firstFrame.value), /localbot player stream/);
  await reader.cancel();

  const voiceStreamResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/guild-1/events`);
  assert.equal(voiceStreamResponse.status, 200);
  assert.match(voiceStreamResponse.headers.get('content-type') ?? '', /text\/event-stream/);
  const voiceReader = voiceStreamResponse.body?.getReader();
  assert.ok(voiceReader);
  const voiceFirstFrame = await voiceReader.read();
  const voiceText = new TextDecoder().decode(voiceFirstFrame.value);
  assert.match(voiceText, /localbot guild voice stream/);
  assert.match(voiceText, /"guild"/);
  await voiceReader.cancel();

  const inactiveActionResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/guilds/guild-1/player/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'pause' })
  });
  assert.equal(inactiveActionResponse.status, 409);
  assert.equal((await inactiveActionResponse.json()).error.code, 'PLAYER_NOT_ACTIVE');

  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  config.controlEnabled = previousEnabled;
  config.controlPort = previousPort;
  config.controlHost = previousHost;
  config.guildMembersIntentEnabled = previousMembersIntent;
});

test('control server exposes a guild-scoped AutoMod review queue and safe local decisions', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-automod-review-control-'));
  let server: import('node:http').Server | null = null;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;
    const review = new AutoModReviewStore(path.join(root, 'review.json'));
    const audit = new AuditLogStore(path.join(root, 'audit.json'));
    await review.loadPersisted();
    await audit.loadPersisted();
    const created = await review.recordMatch({ guildId: 'guild-1', channelId: 'channel-1', userId: 'user-1', rule: 'scam', reason: 'scam-pattern', proposedAction: 'quarantine' }, 'alerted', false, Date.parse('2026-09-03T00:00:00.000Z'));
    const guild = { id: 'guild-1' };
    const fakeClient = { isReady: () => true, user: null, guilds: { cache: new Collection([['guild-1', guild]]) } };
    server = await startControlServer(fakeClient as never, { automodReview: review, audit });
    assert.ok(server);
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}/api/v1/guilds/guild-1/automod/review`;
    const initial = await fetch(`${base}?status=open&limit=10`);
    assert.equal(initial.status, 200);
    assert.deepEqual((await initial.json()).entries, [created]);

    const invalidQuery = await fetch(`${base}?status=invalid`);
    assert.equal(invalidQuery.status, 400);
    assert.equal((await invalidQuery.json()).error.code, 'INVALID_AUTOMOD_REVIEW_STATUS');

    const invalidDecision = await fetch(`${base}/${created.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'reverse' }) });
    assert.equal(invalidDecision.status, 400);
    assert.equal((await invalidDecision.json()).error.code, 'INVALID_AUTOMOD_REVIEW_DECISION');

    const confirmed = await fetch(`${base}/${created.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'confirm', note: 'Đã kiểm tra.' }) });
    assert.equal(confirmed.status, 200);
    assert.equal((await confirmed.json()).entry.status, 'confirmed');
    const repeated = await fetch(`${base}/${created.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'confirm', note: 'Ghi chú khác' }) });
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).entry.note, 'Đã kiểm tra.');
    const opposite = await fetch(`${base}/${created.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'dismiss' }) });
    assert.equal(opposite.status, 409);
    assert.equal((await opposite.json()).error.code, 'REVIEW_ALREADY_DECIDED');
    const confirmedList = await fetch(`${base}?status=confirmed`);
    assert.equal((await confirmedList.json()).entries.length, 1);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
    await rm(root, { recursive: true, force: true });
  }
});

test('music readiness route returns structured effective channel permissions and blocks stale play attempts', async () => {
  const previousEnabled = config.controlEnabled;
  const previousPort = config.controlPort;
  const previousHost = config.controlHost;
  let server: import('node:http').Server | null = null;
  try {
    config.controlEnabled = true;
    config.controlHost = '127.0.0.1';
    config.controlPort = 0;

    let botMember: { id: string } | null = { id: 'bot-1' };
    const members: { me: { id: string } | null; cache: Collection<string, never> } = { me: botMember, cache: new Collection() };
    const guild = {
      id: 'guild-readiness',
      name: 'Readiness QA',
      memberCount: 3,
      channels: { cache: new Collection() },
      members,
      voiceStates: { cache: new Collection() }
    };
    const otherGuild = { id: 'guild-other' };
    const allVoicePermissions = new Set([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak
    ]);
    const makeChannel = (id: string, type: ChannelType, guildRef: typeof guild | typeof otherGuild, granted: Set<bigint>) => ({
      id,
      name: id,
      type,
      rawPosition: 1,
      parent: null,
      guild: guildRef,
      permissionsFor: () => ({ has: (permission: bigint) => granted.has(permission) })
    });
    const ready = makeChannel('voice-ready', ChannelType.GuildVoice, guild, allVoicePermissions);
    const overwritten = makeChannel('voice-overwritten', ChannelType.GuildVoice, guild, new Set([PermissionFlagsBits.ViewChannel]));
    const stage = makeChannel('stage-unsupported', ChannelType.GuildStageVoice, guild, allVoicePermissions);
    const foreign = makeChannel('voice-foreign', ChannelType.GuildVoice, otherGuild, allVoicePermissions);
    const text = { id: 'text-1', type: ChannelType.GuildText, guild };
    const channels = new Map<string, unknown>([
      [ready.id, ready], [overwritten.id, overwritten], [stage.id, stage], [foreign.id, foreign], [text.id, text]
    ]);
    const fakeClient = {
      isReady: () => true,
      user: { id: 'bot-1' },
      guilds: { cache: new Collection([[guild.id, guild]]) },
      channels: { fetch: async (id: string) => channels.get(id) ?? null }
    };
    server = await startControlServer(fakeClient as never);
    assert.ok(server);
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}/api/v1/guilds/${guild.id}`;

    const readyResponse = await fetch(`${base}/channels/${ready.id}/music-readiness`);
    assert.equal(readyResponse.status, 200);
    const readyPayload = await readyResponse.json() as { guildId: string; readiness: Record<string, unknown> };
    assert.equal(readyPayload.guildId, guild.id);
    assert.deepEqual(readyPayload.readiness, {
      channel: { id: ready.id, name: ready.id, type: 'voice', category: null, position: 1 },
      channelExists: true,
      botMemberKnown: true,
      effectivePermissions: { viewChannel: true, connect: true, speak: true },
      readiness: 'ready',
      missing: [],
      reasons: ['READY']
    });

    const overwrittenResponse = await fetch(`${base}/channels/${overwritten.id}/music-readiness`);
    assert.equal(overwrittenResponse.status, 200);
    const overwrittenPayload = await overwrittenResponse.json() as { readiness: { readiness: string; missing: string[] } };
    assert.equal(overwrittenPayload.readiness.readiness, 'missing_permission');
    assert.deepEqual(overwrittenPayload.readiness.missing, ['Connect', 'Speak']);

    const stalePlayResponse = await fetch(`${base}/player/play`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voiceChannelId: overwritten.id, query: 'must not resolve before readiness' })
    });
    assert.equal(stalePlayResponse.status, 403);
    const stalePlayPayload = await stalePlayResponse.json() as { error: { code: string; details?: { readiness?: { missing?: string[] } } } };
    assert.equal(stalePlayPayload.error.code, 'VOICE_MUSIC_PERMISSION_MISSING');
    assert.deepEqual(stalePlayPayload.error.details?.readiness?.missing, ['Connect', 'Speak']);

    guild.members.me = null;
    const unknownResponse = await fetch(`${base}/channels/${ready.id}/music-readiness`);
    assert.equal(unknownResponse.status, 200);
    const unknownPayload = await unknownResponse.json() as { readiness: { readiness: string; effectivePermissions: Record<string, boolean | null> } };
    assert.equal(unknownPayload.readiness.readiness, 'unknown');
    assert.deepEqual(unknownPayload.readiness.effectivePermissions, { viewChannel: null, connect: null, speak: null });

    guild.members.me = botMember;
    const stageResponse = await fetch(`${base}/channels/${stage.id}/music-readiness`);
    assert.equal(stageResponse.status, 200);
    assert.equal((await stageResponse.json() as { readiness: { readiness: string; reasons: string[] } }).readiness.readiness, 'unsupported');

    const foreignResponse = await fetch(`${base}/channels/${foreign.id}/music-readiness`);
    assert.equal(foreignResponse.status, 400);
    assert.equal((await foreignResponse.json()).error.code, 'CHANNEL_NOT_IN_GUILD');

    const invalidResponse = await fetch(`${base}/channels/${text.id}/music-readiness`);
    assert.equal(invalidResponse.status, 400);
    assert.equal((await invalidResponse.json()).error.code, 'INVALID_VOICE_CHANNEL');

    const missingResponse = await fetch(`${base}/channels/missing/music-readiness`);
    assert.equal(missingResponse.status, 404);
    assert.equal((await missingResponse.json()).error.code, 'VOICE_CHANNEL_NOT_FOUND');
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    config.controlEnabled = previousEnabled;
    config.controlPort = previousPort;
    config.controlHost = previousHost;
  }
});
