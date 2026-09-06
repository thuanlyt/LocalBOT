import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaRequestLimiter } from './media-rate-limit.js';

test('media request limiter bounds each provider independently and expires by window', () => {
  let now = 1_000;
  const limiter = new MediaRequestLimiter(2, 1_000, () => now);

  assert.deepEqual(limiter.consume('youtube'), { allowed: true, retryAfterMs: 0 });
  assert.deepEqual(limiter.consume('youtube'), { allowed: true, retryAfterMs: 0 });
  const blocked = limiter.consume('youtube');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 1_000);

  assert.deepEqual(limiter.consume('soundcloud'), { allowed: true, retryAfterMs: 0 });
  now += 1_001;
  assert.deepEqual(limiter.consume('youtube'), { allowed: true, retryAfterMs: 0 });
});

test('media request limiter reset clears provider budgets', () => {
  const limiter = new MediaRequestLimiter(1, 1_000, () => 1_000);
  assert.equal(limiter.consume('youtube').allowed, true);
  assert.equal(limiter.consume('youtube').allowed, false);
  limiter.reset();
  assert.equal(limiter.consume('youtube').allowed, true);
});
