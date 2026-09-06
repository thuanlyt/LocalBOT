import assert from 'node:assert/strict';
import test from 'node:test';
import { GatewayIntentBits } from 'discord.js';
import { buildDiscordIntents, canInspectMessageContent } from './discord-intents.js';

test('discord intents keep privileged capabilities independently opt-in', () => {
  const base = buildDiscordIntents({ guildMembers: false, messageContent: false });
  assert.deepEqual(base, [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages]);
  assert.equal(base.includes(GatewayIntentBits.GuildMembers), false);
  assert.equal(base.includes(GatewayIntentBits.MessageContent), false);

  const membersOnly = buildDiscordIntents({ guildMembers: true, messageContent: false });
  assert.equal(membersOnly.includes(GatewayIntentBits.GuildMembers), true);
  assert.equal(membersOnly.includes(GatewayIntentBits.MessageContent), false);

  const contentOnly = buildDiscordIntents({ guildMembers: false, messageContent: true });
  assert.equal(contentOnly.includes(GatewayIntentBits.GuildMembers), false);
  assert.equal(contentOnly.includes(GatewayIntentBits.MessageContent), true);
});

test('content-based automod requires enabled intent and non-empty content', () => {
  assert.equal(canInspectMessageContent(false, 'free nitro'), false);
  assert.equal(canInspectMessageContent(true, ''), false);
  assert.equal(canInspectMessageContent(true, '   '), false);
  assert.equal(canInspectMessageContent(true, null), false);
  assert.equal(canInspectMessageContent(true, 'free nitro'), true);
});
