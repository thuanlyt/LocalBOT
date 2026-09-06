import assert from 'node:assert/strict';
import test from 'node:test';
import { AutoModActionLimiter, chooseAutoModEnforcement } from './automod-enforcement.js';
import type { AutoModMatch } from './automod.js';

function match(rule: AutoModMatch['rule'], proposedAction: AutoModMatch['proposedAction']): AutoModMatch {
  return { guildId: 'guild-1', channelId: 'channel-1', userId: 'user-1', rule, reason: 'scam-pattern', proposedAction, enforced: false };
}

test('automod enforcement chooses one deterministic message action', () => {
  assert.deepEqual(chooseAutoModEnforcement([match('link', 'delete'), match('scam', 'timeout')]), { action: 'timeout', matchIndex: 1, reason: 'none' });
  assert.deepEqual(chooseAutoModEnforcement([match('spam', 'delete'), match('flood', 'alert')]), { action: 'delete', matchIndex: 0, reason: 'none' });
  assert.deepEqual(chooseAutoModEnforcement([match('scam', 'quarantine')]), { action: null, matchIndex: null, reason: 'unsupported' });
  assert.deepEqual(chooseAutoModEnforcement([match('antiRaid', 'alert')]), { action: null, matchIndex: null, reason: 'unsupported' });
  assert.deepEqual(chooseAutoModEnforcement([match('link', 'alert')]), { action: null, matchIndex: null, reason: 'alert-only' });
  assert.deepEqual(chooseAutoModEnforcement([]), { action: null, matchIndex: null, reason: 'none' });
});

test('automod enforcement limiter is guild-scoped and rolling-window bounded', () => {
  const limiter = new AutoModActionLimiter(2, 1_000);
  assert.equal(limiter.tryAcquire('guild-1', 1_000), true);
  assert.equal(limiter.tryAcquire('guild-1', 1_100), true);
  assert.equal(limiter.tryAcquire('guild-1', 1_200), false);
  assert.equal(limiter.tryAcquire('guild-2', 1_200), true);
  assert.equal(limiter.tryAcquire('guild-1', 2_001), true);
  limiter.reset();
  assert.equal(limiter.tryAcquire('guild-1', 2_001), true);
});
