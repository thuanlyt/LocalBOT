import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildGreetingPayload, GreetingStore, previewGreeting, renderGreeting } from './greetings.js';

test('greeting store starts with safe disabled defaults and persists a guild template', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-greetings-'));
  const file = path.join(root, 'greetings.json');
  try {
    const store = new GreetingStore(file);
    assert.deepEqual(await store.get('guild-1'), {
      welcome: { enabled: false, channelId: null, message: 'Chào mừng {user} đến với {guild}!', imageUrl: null },
      goodbye: { enabled: false, channelId: null, message: 'Tạm biệt {username}. Chúc bạn một ngày tốt lành!', imageUrl: null }
    });
    const updated = await store.update('guild-1', 'welcome', {
      enabled: true,
      channelId: 'channel-1',
      message: 'Xin chào {username} tại {guild} · {memberCount} thành viên',
      imageUrl: 'https://cdn.example.test/welcome.png'
    });
    assert.equal(updated.welcome.enabled, true);
    assert.equal(updated.welcome.imageUrl, 'https://cdn.example.test/welcome.png');

    const reloaded = new GreetingStore(file);
    assert.deepEqual(await reloaded.get('guild-1'), updated);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('greeting validation rejects unsafe template changes without mutating stored state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-greetings-invalid-'));
  const file = path.join(root, 'greetings.json');
  try {
    const store = new GreetingStore(file);
    const before = await store.get('guild-1');
    await assert.rejects(() => store.update('guild-1', 'welcome', {
      enabled: true,
      channelId: 'channel-1',
      message: 'x',
      imageUrl: 'http://insecure.example.test/image.png'
    }), /HTTPS/);
    assert.deepEqual(await store.get('guild-1'), before);
    await assert.rejects(() => store.update('guild-1', 'welcome', {
      enabled: true,
      channelId: 'channel-1',
      message: ' '.repeat(1_001),
      imageUrl: null
    }), /1\.\.1000/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('greeting store quarantines malformed JSON and keeps the runtime usable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-greetings-corrupt-'));
  const file = path.join(root, 'greetings.json');
  try {
    await writeFile(file, '{broken', 'utf8');
    const store = new GreetingStore(file);
    const settings = await store.get('guild-1');
    assert.equal(settings.welcome.enabled, false);
    assert.equal((await readdir(root)).some((name) => name.startsWith('greetings.json.corrupt-')), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('greeting rendering supports only the documented tokens and controls mentions', () => {
  const template = { enabled: true, channelId: 'channel-1', message: 'Chào {user} · {username} · {guild} · {memberCount} · {unknown}', imageUrl: null };
  assert.equal(renderGreeting(template, { user: '<@user-1>', userId: 'user-1', username: 'Alpha', guild: 'QA', memberCount: 12 }), 'Chào <@user-1> · Alpha · QA · 12 · {unknown}');
  assert.deepEqual(previewGreeting(template, 'QA', 12, 'Alpha'), { text: 'Chào @Alpha · Alpha · QA · 12 · {unknown}', imageUrl: null });
  assert.deepEqual(buildGreetingPayload(template, { user: '<@user-1>', userId: 'user-1', username: 'Alpha', guild: 'QA', memberCount: 12 }).allowedMentions, { users: ['user-1'] });
  assert.deepEqual(buildGreetingPayload(template, { user: '@Alpha', username: 'Alpha', guild: 'QA', memberCount: 12 }).allowedMentions, { parse: [] });
});
