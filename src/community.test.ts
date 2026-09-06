import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CommunityStore, levelForXp } from './community.js';

test('community awards XP with a cooldown and persists member progress', async () => {
  const dataRoot = path.resolve('.tmp-community-cooldown-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const store = new CommunityStore(path.join(dataRoot, 'community.json'), 60_000);

  const first = await store.recordMessage('guild-a', 'user-a', 'Alpha', 100_000);
  assert.equal(first?.xp, 15);
  assert.equal(first?.messages, 1);
  assert.equal(await store.recordMessage('guild-a', 'user-a', 'Alpha', 100_001), null);
  const second = await store.recordMessage('guild-a', 'user-a', 'Alpha', 160_000);
  assert.equal(second?.xp, 30);
  assert.equal(second?.messages, 3);

  const restored = new CommunityStore(path.join(dataRoot, 'community.json'), 60_000);
  assert.equal((await restored.member('guild-a', 'user-a'))?.xp, 30);
  assert.equal(levelForXp(100), 2);
  await rm(dataRoot, { recursive: true, force: true });
});

test('community leaderboard sorts by XP and returns level progress', async () => {
  const dataRoot = path.resolve('.tmp-community-leaderboard-test');
  await rm(dataRoot, { recursive: true, force: true });
  const store = new CommunityStore(path.join(dataRoot, 'community.json'), 0);
  await store.recordMessage('guild-a', 'user-a', 'Alpha', 1);
  await store.recordMessage('guild-a', 'user-b', 'Beta', 2);
  await store.recordMessage('guild-a', 'user-b', 'Beta', 3);
  const leaderboard = await store.leaderboard('guild-a', 10);
  assert.deepEqual(leaderboard.map((member) => member.userId), ['user-b', 'user-a']);
  assert.equal(leaderboard[0]?.rank, 1);
  assert.equal(leaderboard[0]?.progress, 30);
  await rm(dataRoot, { recursive: true, force: true });
});

test('community store skips XP for ignored channels and roles, and persists settings', async () => {
  const dataRoot = path.resolve('.tmp-community-ignore-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'community.json');
  const store = new CommunityStore(filePath, 0);

  await store.addIgnoredChannel('guild-a', 'channel-mod-log');
  await store.addIgnoredRole('guild-a', 'role-bot-friendly');

  assert.equal(await store.recordMessage('guild-a', 'user-a', 'Alpha', 1, { channelId: 'channel-mod-log' }), null);
  assert.equal(await store.member('guild-a', 'user-a'), null);

  assert.equal(await store.recordMessage('guild-a', 'user-b', 'Beta', 2, { channelId: 'channel-general', roleIds: ['role-bot-friendly'] }), null);
  assert.equal(await store.member('guild-a', 'user-b'), null);

  const awarded = await store.recordMessage('guild-a', 'user-c', 'Gamma', 3, { channelId: 'channel-general', roleIds: ['role-member'] });
  assert.equal(awarded?.xp, 15);

  const settingsBeforeRemoval = await store.getSettings('guild-a');
  assert.deepEqual(settingsBeforeRemoval, { ignoredChannelIds: ['channel-mod-log'], ignoredRoleIds: ['role-bot-friendly'], cooldownSeconds: null, xpMultiplier: 1, roleMultipliers: {}, roleRewards: [] });

  await store.removeIgnoredChannel('guild-a', 'channel-mod-log');
  const restored = new CommunityStore(filePath, 0);
  assert.deepEqual(await restored.getSettings('guild-a'), { ignoredChannelIds: [], ignoredRoleIds: ['role-bot-friendly'], cooldownSeconds: null, xpMultiplier: 1, roleMultipliers: {}, roleRewards: [] });
  const nowAllowed = await restored.recordMessage('guild-a', 'user-a', 'Alpha', 4, { channelId: 'channel-mod-log' });
  assert.equal(nowAllowed?.xp, 15);

  await rm(dataRoot, { recursive: true, force: true });
});

test('community cooldown overrides are guild-scoped, resettable, and persisted', async () => {
  const dataRoot = path.resolve('.tmp-community-settings-test');
  await rm(dataRoot, { recursive: true, force: true });
  const filePath = path.join(dataRoot, 'community.json');
  const store = new CommunityStore(filePath, 60_000);

  await store.setCooldownSeconds('guild-a', 10);
  assert.equal((await store.getSettings('guild-a')).cooldownSeconds, 10);
  assert.equal((await store.getSettings('guild-b')).cooldownSeconds, null);
  assert.equal((await store.recordMessage('guild-a', 'user-a', 'Alpha', 100_000))?.xp, 15);
  assert.equal(await store.recordMessage('guild-a', 'user-a', 'Alpha', 100_001), null);
  assert.equal((await store.recordMessage('guild-b', 'user-a', 'Alpha', 100_001))?.xp, 15);

  await store.setCooldownSeconds('guild-a', 0);
  assert.equal((await store.recordMessage('guild-a', 'user-a', 'Alpha', 100_002))?.xp, 30);
  const restored = new CommunityStore(filePath, 60_000);
  assert.equal((await restored.getSettings('guild-a')).cooldownSeconds, 0);
  await restored.setCooldownSeconds('guild-a', null);
  assert.equal((await restored.getSettings('guild-a')).cooldownSeconds, null);
  await rm(dataRoot, { recursive: true, force: true });
});

test('community leaderboard pagination preserves absolute ranks', async () => {
  const dataRoot = path.resolve('.tmp-community-pagination-test');
  await rm(dataRoot, { recursive: true, force: true });
  const store = new CommunityStore(path.join(dataRoot, 'community.json'), 0);
  await store.recordMessage('guild-a', 'user-a', 'Alpha', 1);
  await store.recordMessage('guild-a', 'user-b', 'Beta', 2);
  await store.recordMessage('guild-a', 'user-c', 'Gamma', 3);
  const page = await store.leaderboard('guild-a', 2, 1);
  assert.deepEqual(page.map((member) => member.userId), ['user-b', 'user-c']);
  assert.deepEqual(page.map((member) => member.rank), [2, 3]);
  assert.deepEqual(await store.leaderboard('guild-a', 10, 100), []);
  await rm(dataRoot, { recursive: true, force: true });
});

test('community member reads do not create data and reset preserves guild settings', async () => {
  const dataRoot = path.resolve('.tmp-community-reset-test');
  await rm(dataRoot, { recursive: true, force: true });
  const filePath = path.join(dataRoot, 'community.json');
  const store = new CommunityStore(filePath, 60_000);
  assert.equal(await store.member('guild-empty', 'user-a'), null);
  assert.deepEqual(await store.getSettings('guild-empty'), { ignoredChannelIds: [], ignoredRoleIds: [], cooldownSeconds: null, xpMultiplier: 1, roleMultipliers: {}, roleRewards: [] });

  await store.addIgnoredChannel('guild-a', 'channel-mod-log');
  await store.addIgnoredRole('guild-a', 'role-bot');
  await store.setCooldownSeconds('guild-a', 30);
  await store.recordMessage('guild-a', 'user-a', 'Alpha', 100_000);
  await store.recordMessage('guild-a', 'user-b', 'Beta', 100_001);

  assert.equal((await store.member('guild-a', 'user-a'))?.xp, 15);
  const reset = await store.resetProgress('guild-a');
  assert.equal(reset.removedMembers, 2);
  assert.deepEqual(reset.settings, { ignoredChannelIds: ['channel-mod-log'], ignoredRoleIds: ['role-bot'], cooldownSeconds: 30, xpMultiplier: 1, roleMultipliers: {}, roleRewards: [] });
  assert.equal(await store.member('guild-a', 'user-a'), null);
  assert.deepEqual(await store.getSettings('guild-a'), reset.settings);
  await rm(dataRoot, { recursive: true, force: true });
});

test('community XP multiplier and role multiplier use deterministic bounded max stacking', async () => {
  const dataRoot = path.resolve('.tmp-community-multiplier-test');
  await rm(dataRoot, { recursive: true, force: true });
  const filePath = path.join(dataRoot, 'community.json');
  const store = new CommunityStore(filePath, 0);

  await store.updateSettings('guild-a', { xpMultiplier: 2, roleMultipliers: { 'role-helper': 3, 'role-other': 2 } });
  assert.equal((await store.recordMessage('guild-a', 'user-a', 'Alpha', 1, { roleIds: ['role-helper', 'role-other'] }))?.xp, 90);
  assert.equal((await store.recordMessage('guild-a', 'user-b', 'Beta', 2, { roleIds: ['role-other'] }))?.xp, 60);
  assert.equal((await store.getSettings('guild-b')).xpMultiplier, 1);

  await assert.rejects(() => store.setXpMultiplier('guild-a', 0), /XP multiplier/);
  await assert.rejects(() => store.updateSettings('guild-a', { roleRewards: [{ roleId: 'role-a', level: 1 }] }), /level/);
  await rm(dataRoot, { recursive: true, force: true });
});

test('community ignored channel and role lists are bounded, deduplicated, and persisted', async () => {
  const dataRoot = path.resolve('.tmp-community-ignored-settings-test');
  await rm(dataRoot, { recursive: true, force: true });
  const store = new CommunityStore(path.join(dataRoot, 'community.json'), 0);

  await store.updateSettings('guild-a', { ignoredChannelIds: [' channel-a ', 'channel-a', 'channel-b'], ignoredRoleIds: ['role-a', ' role-a '] });
  assert.deepEqual((await store.getSettings('guild-a')).ignoredChannelIds, ['channel-a', 'channel-b']);
  assert.deepEqual((await store.getSettings('guild-a')).ignoredRoleIds, ['role-a']);
  assert.equal(await store.recordMessage('guild-a', 'user-a', 'Ignored channel', 1, { channelId: 'channel-a' }), null);
  assert.equal(await store.recordMessage('guild-a', 'user-b', 'Ignored role', 2, { roleIds: ['role-a'] }), null);
  assert.ok(await store.recordMessage('guild-a', 'user-c', 'Allowed', 3, { channelId: 'channel-ok', roleIds: ['role-ok'] }));

  await assert.rejects(() => store.updateSettings('guild-a', { ignoredChannelIds: 'not-an-array' }), /danh sách/i);
  assert.deepEqual((await store.getSettings('guild-a')).ignoredChannelIds, ['channel-a', 'channel-b']);
  await rm(dataRoot, { recursive: true, force: true });
});

test('community role rewards update idempotently and unlock by level without mutating reads', async () => {
  const dataRoot = path.resolve('.tmp-community-rewards-test');
  await rm(dataRoot, { recursive: true, force: true });
  const filePath = path.join(dataRoot, 'community.json');
  const store = new CommunityStore(filePath, 0);

  await store.setRoleReward('guild-a', 'role-helper', 2);
  await store.setRoleReward('guild-a', 'role-veteran', 5);
  await store.setRoleReward('guild-a', 'role-helper', 3);
  assert.deepEqual(await store.roleRewardsForLevel('guild-a', 2), []);
  assert.deepEqual(await store.roleRewardsForLevel('guild-a', 3), [{ roleId: 'role-helper', level: 3 }]);
  assert.deepEqual(await store.roleRewardsForLevel('guild-a', 5), [{ roleId: 'role-helper', level: 3 }, { roleId: 'role-veteran', level: 5 }]);
  assert.deepEqual(await store.getSettings('guild-b'), { ignoredChannelIds: [], ignoredRoleIds: [], cooldownSeconds: null, xpMultiplier: 1, roleMultipliers: {}, roleRewards: [] });
  await store.removeRoleReward('guild-a', 'role-helper');
  assert.deepEqual((await store.getSettings('guild-a')).roleRewards, [{ roleId: 'role-veteran', level: 5 }]);
  await rm(dataRoot, { recursive: true, force: true });
});

test('community store quarantines invalid JSON and recovers with an empty store', async () => {
  const dataRoot = path.resolve('.tmp-community-corrupt-test');
  await rm(dataRoot, { recursive: true, force: true });
  await mkdir(dataRoot, { recursive: true });
  const filePath = path.join(dataRoot, 'community.json');
  await writeFile(filePath, 'not json at all', 'utf8');

  const store = new CommunityStore(filePath, 0);
  assert.equal(await store.member('guild-a', 'user-a'), null);
  const awarded = await store.recordMessage('guild-a', 'user-a', 'Alpha', 1);
  assert.equal(awarded?.xp, 15);

  const entries = await readdir(dataRoot);
  assert.ok(entries.some((entry) => entry.includes('.corrupt-')));
  await rm(dataRoot, { recursive: true, force: true });
});
