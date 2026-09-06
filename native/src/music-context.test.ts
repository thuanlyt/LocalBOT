import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canApplyMusicReadiness,
  readinessMatchesSelectedChannel,
  reconcileSelectedVoiceChannel,
  resetMusicContextForGuildChange
} from './music-context.js';

test('native Music context resets channel and readiness when the guild changes', () => {
  assert.deepEqual(resetMusicContextForGuildChange('guild-next'), {
    selectedGuildId: 'guild-next',
    selectedVoiceChannelId: '',
    readiness: null,
    readinessError: null
  });
});

test('native Music context keeps a valid channel, otherwise follows the connected channel', () => {
  const channels = [{ id: 'voice-a' }, { id: 'voice-b', botJoined: true }];
  assert.equal(reconcileSelectedVoiceChannel('voice-a', channels), 'voice-a');
  assert.equal(reconcileSelectedVoiceChannel('voice-gone', channels), 'voice-b');
  assert.equal(reconcileSelectedVoiceChannel('', [{ id: 'voice-c' }]), '');
});

test('native Music context distinguishes unknown readiness from a denied state', () => {
  const unknown = { channel: { id: 'voice-a' }, readiness: 'unknown' as const };
  const denied = { channel: { id: 'voice-a' }, readiness: 'missing_permission' as const };
  assert.equal(readinessMatchesSelectedChannel(unknown, 'voice-a'), true);
  assert.notEqual(unknown.readiness, 'missing_permission');
  assert.equal(denied.readiness, 'missing_permission');
});

test('native Music context ignores stale guild/channel readiness responses', () => {
  const ready = { channel: { id: 'voice-new' }, readiness: 'ready' as const };
  assert.equal(canApplyMusicReadiness({ guildId: 'guild-old', channelId: 'voice-old' }, { guildId: 'guild-new', channelId: 'voice-new' }, ready), false);
  assert.equal(canApplyMusicReadiness({ guildId: 'guild-new', channelId: 'voice-old' }, { guildId: 'guild-new', channelId: 'voice-new' }, ready), false);
  assert.equal(canApplyMusicReadiness({ guildId: 'guild-new', channelId: 'voice-new' }, { guildId: 'guild-new', channelId: 'voice-new' }, ready), true);
});
