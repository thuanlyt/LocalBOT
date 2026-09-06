import assert from 'node:assert/strict';
import test from 'node:test';
import { AutoModActionLimiter } from './automod-enforcement.js';
import { executeAutoModMessageAction, type AutoModMessageTarget } from './automod-runtime.js';

function target(overrides: Partial<AutoModMessageTarget> = {}): AutoModMessageTarget {
  return {
    deletable: true,
    delete: async () => undefined,
    member: { moderatable: true, timeout: async () => undefined },
    ...overrides
  };
}

test('automod runtime deletes only a deletable triggering message', async () => {
  let deleted = 0;
  const result = await executeAutoModMessageAction('delete', target({ delete: async () => { deleted += 1; } }), new AutoModActionLimiter(1), 'guild-1', 1_000);
  assert.deepEqual(result, { outcome: 'deleted', enforced: true });
  assert.equal(deleted, 1);
  assert.deepEqual(await executeAutoModMessageAction('delete', target({ deletable: false }), new AutoModActionLimiter(1), 'guild-1', 1_000), { outcome: 'permission_denied', enforced: false });
});

test('automod runtime uses a fixed bounded timeout and isolates limiter state by guild', async () => {
  let timeoutMs = 0;
  let reason = '';
  const limiter = new AutoModActionLimiter(1);
  const first = await executeAutoModMessageAction('timeout', target({ member: { moderatable: true, timeout: async (value, valueReason) => { timeoutMs = value; reason = valueReason ?? ''; } } }), limiter, 'guild-1', 1_000);
  assert.deepEqual(first, { outcome: 'timed_out', enforced: true });
  assert.equal(timeoutMs, 60_000);
  assert.equal(reason, 'LocalBot AutoMod');
  assert.deepEqual(await executeAutoModMessageAction('timeout', target(), limiter, 'guild-1', 1_100), { outcome: 'rate_limited', enforced: false });
  assert.deepEqual(await executeAutoModMessageAction('timeout', target(), limiter, 'guild-2', 1_100), { outcome: 'timed_out', enforced: true });
});

test('automod runtime reports Discord failures without claiming enforcement', async () => {
  const failed = await executeAutoModMessageAction('delete', target({ delete: async () => { throw new Error('synthetic failure'); } }), new AutoModActionLimiter(1), 'guild-1', 1_000);
  assert.deepEqual(failed, { outcome: 'failed', enforced: false });
  assert.deepEqual(await executeAutoModMessageAction('timeout', target({ member: { moderatable: false, timeout: async () => undefined } }), new AutoModActionLimiter(1), 'guild-1', 1_000), { outcome: 'permission_denied', enforced: false });
});
