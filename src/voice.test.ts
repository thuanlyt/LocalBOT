import assert from 'node:assert/strict';
import test from 'node:test';
import { ChannelType, Collection, PermissionFlagsBits } from 'discord.js';
import { listTextChannels, searchGuildMembers, summarizeGuildPermissions, summarizeMusicReadiness } from './voice.js';

test('text channel discovery returns ordered channels with send/embed permissions', () => {
  const allowed = new Set([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
  const channel = {
    id: 'text-1',
    name: 'welcome',
    type: ChannelType.GuildText,
    rawPosition: 2,
    parent: { name: 'Community' },
    permissionsFor: () => ({ has: (permission: bigint) => allowed.has(permission) })
  };
  const blocked = {
    id: 'text-2',
    name: 'announcements',
    type: ChannelType.GuildAnnouncement,
    rawPosition: 1,
    parent: null,
    permissionsFor: () => ({ has: () => false })
  };
  const channels = new Collection<string, never>([
    [channel.id, channel as never],
    [blocked.id, blocked as never]
  ]);
  const guild = {
    channels: { cache: channels },
    members: { me: { id: 'bot' } }
  };
  const client = { user: { id: 'bot' } };
  assert.deepEqual(listTextChannels(guild as never, client as never), [
    { id: 'text-2', name: 'announcements', category: null, position: 1, canSend: false, canEmbed: false },
    { id: 'text-1', name: 'welcome', category: 'Community', position: 2, canSend: true, canEmbed: true }
  ]);
});

test('member discovery is bounded and honest about the Members Intent boundary', async () => {
  const alice = { id: 'user-1', displayName: 'Alice Nguyen', user: { username: 'alice', bot: false } };
  const bot = { id: 'bot-1', displayName: 'LocalBot', user: { username: 'localbot', bot: true } };
  const cache = new Collection<string, never>([['user-1', alice as never], ['bot-1', bot as never]]);
  const guild = { members: { cache, fetch: async () => cache } };

  const cacheResult = await searchGuildMembers(guild as never, 'alice', 1, false);
  assert.deepEqual(cacheResult, {
    members: [{ id: 'user-1', username: 'alice', displayName: 'Alice Nguyen', bot: false }],
    intentEnabled: false,
    complete: false,
    source: 'cache'
  });

  const remoteResult = await searchGuildMembers(guild as never, 'alice', 1, true);
  assert.equal(remoteResult.source, 'discord');
  assert.equal(remoteResult.complete, true);
  assert.deepEqual(remoteResult.members[0]?.id, 'user-1');
});

test('guild permission discovery reports effective bot permissions without mutation', () => {
  const granted = new Set([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.UseApplicationCommands
  ]);
  const botMember = {
    id: 'bot-1',
    permissions: { has: (permission: bigint) => granted.has(permission) },
    roles: { highest: { id: 'role-bot', name: 'LocalBot', position: 7, managed: false } }
  };
  const guild = { id: 'guild-1', members: { me: botMember } };
  const client = { user: { id: 'bot-1' } };
  assert.deepEqual(summarizeGuildPermissions(guild as never, client as never), {
    botMemberPresent: true,
    botUserId: 'bot-1',
    highestRole: { id: 'role-bot', name: 'LocalBot', position: 7, managed: false },
    permissions: {
      viewChannel: true,
      sendMessages: true,
      embedLinks: true,
      connect: true,
      speak: true,
      moveMembers: false,
      manageMessages: false,
      moderateMembers: false,
      manageRoles: true,
      manageGuild: false,
      viewAuditLog: false,
      useApplicationCommands: true
    }
  });

  assert.deepEqual(summarizeGuildPermissions({ id: 'guild-2', members: { me: null, cache: new Collection() } } as never, client as never).permissions, {
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
  });
});

function makeMusicVoiceChannel(id: string, type: ChannelType, granted: Set<bigint>) {
  return {
    id,
    name: id,
    type,
    rawPosition: 3,
    parent: null,
    permissionsFor: () => ({ has: (permission: bigint) => granted.has(permission) })
  };
}

test('music readiness is ready only when effective channel permissions are complete', () => {
  const channel = makeMusicVoiceChannel('voice-ready', ChannelType.GuildVoice, new Set([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak
  ]));
  const guild = { id: 'guild-1', members: { me: { id: 'bot-1' }, cache: new Collection() } };
  const client = { user: { id: 'bot-1' } };
  assert.deepEqual(summarizeMusicReadiness(channel as never, guild as never, client as never), {
    channel: { id: 'voice-ready', name: 'voice-ready', type: 'voice', category: null, position: 3 },
    channelExists: true,
    botMemberKnown: true,
    effectivePermissions: { viewChannel: true, connect: true, speak: true },
    readiness: 'ready',
    missing: [],
    reasons: ['READY']
  });
});

test('music readiness reports channel overwrite losses instead of trusting guild permissions', () => {
  const channel = makeMusicVoiceChannel('voice-overwrite', ChannelType.GuildVoice, new Set([PermissionFlagsBits.ViewChannel]));
  const guild = { id: 'guild-1', members: { me: { id: 'bot-1', permissions: { has: () => true } }, cache: new Collection() } };
  const client = { user: { id: 'bot-1' } };
  const readiness = summarizeMusicReadiness(channel as never, guild as never, client as never);
  assert.equal(readiness.readiness, 'missing_permission');
  assert.deepEqual(readiness.missing, ['Connect', 'Speak']);
  assert.deepEqual(readiness.reasons, ['MISSING_CONNECT', 'MISSING_SPEAK']);
  assert.deepEqual(readiness.effectivePermissions, { viewChannel: true, connect: false, speak: false });
});

test('music readiness exposes each required permission independently', () => {
  const guild = { id: 'guild-1', members: { me: { id: 'bot-1' }, cache: new Collection() } };
  const client = { user: { id: 'bot-1' } };
  const cases = [
    { granted: new Set([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]), missing: ['ViewChannel'] },
    { granted: new Set([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Speak]), missing: ['Connect'] },
    { granted: new Set([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]), missing: ['Speak'] }
  ] as const;
  for (const [index, current] of cases.entries()) {
    const readiness = summarizeMusicReadiness(makeMusicVoiceChannel(`voice-missing-${index}`, ChannelType.GuildVoice, current.granted) as never, guild as never, client as never);
    assert.equal(readiness.readiness, 'missing_permission');
    assert.deepEqual(readiness.missing, current.missing);
  }
});

test('music readiness keeps unknown cache state distinct from denied permission', () => {
  const channel = makeMusicVoiceChannel('voice-unknown', ChannelType.GuildVoice, new Set());
  const guild = { id: 'guild-1', members: { me: null, cache: new Collection() } };
  const client = { user: { id: 'bot-1' } };
  const readiness = summarizeMusicReadiness(channel as never, guild as never, client as never);
  assert.equal(readiness.readiness, 'unknown');
  assert.equal(readiness.botMemberKnown, false);
  assert.deepEqual(readiness.effectivePermissions, { viewChannel: null, connect: null, speak: null });
  assert.deepEqual(readiness.missing, []);
  assert.deepEqual(readiness.reasons, ['BOT_MEMBER_UNKNOWN']);
});

test('music readiness reports Stage channels as unsupported instead of pretending they are normal voice', () => {
  const channel = makeMusicVoiceChannel('stage-1', ChannelType.GuildStageVoice, new Set([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak
  ]));
  const guild = { id: 'guild-1', members: { me: { id: 'bot-1' }, cache: new Collection() } };
  const client = { user: { id: 'bot-1' } };
  const readiness = summarizeMusicReadiness(channel as never, guild as never, client as never);
  assert.equal(readiness.readiness, 'unsupported');
  assert.deepEqual(readiness.reasons, ['STAGE_CHANNEL_UNSUPPORTED']);
});
