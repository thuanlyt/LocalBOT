import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  AutoModReviewConflictError,
  AutoModReviewNotFoundError,
  AutoModReviewStore,
  AutoModReviewValidationError,
  MAX_AUTOMOD_REVIEW_ENTRIES,
  isAutoModReviewFile
} from './automod-review.js';

const match = {
  guildId: 'guild-1',
  channelId: 'channel-1',
  userId: 'user-1',
  rule: 'scam' as const,
  reason: 'scam-pattern' as const,
  proposedAction: 'quarantine' as const
};

test('AutoMod review store records redacted matches, scopes guilds, and lists newest first', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-automod-review-'));
  try {
    const store = new AutoModReviewStore(path.join(root, 'review.json'));
    const first = await store.recordMatch(match, 'alerted', false, Date.parse('2026-09-03T00:00:00.000Z'));
    await store.recordMatch({ ...match, guildId: 'guild-2', channelId: '', userId: '' }, 'unsupported', false, Date.parse('2026-09-03T00:01:00.000Z'));
    const second = await store.recordMatch({ ...match, reason: 'blocked-domain', rule: 'link', proposedAction: 'delete' }, 'deleted', true, Date.parse('2026-09-03T00:02:00.000Z'));
    assert.equal(first.status, 'open');
    assert.deepEqual(await store.list('guild-1'), [second, first]);
    assert.deepEqual(await store.list('guild-2'), [{ ...first, id: (await store.list('guild-2'))[0]?.id, guildId: 'guild-2', channelId: null, userId: null, rule: 'scam', reason: 'scam-pattern', proposedAction: 'quarantine', outcome: 'unsupported', enforced: false, createdAt: '2026-09-03T00:01:00.000Z' }]);
    assert.equal((await store.list('guild-1', 'confirmed')).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('AutoMod review decisions persist, are idempotent, and reject opposite decisions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-automod-review-decision-'));
  try {
    const filePath = path.join(root, 'review.json');
    const store = new AutoModReviewStore(filePath);
    const entry = await store.recordMatch(match, 'alerted', false, Date.parse('2026-09-03T00:00:00.000Z'));
    const confirmed = await store.decide('guild-1', entry.id, 'confirm', 'Đã kiểm tra heuristic.');
    assert.equal(confirmed.status, 'confirmed');
    assert.equal(confirmed.note, 'Đã kiểm tra heuristic.');
    assert.deepEqual(await store.decide('guild-1', entry.id, 'confirm', 'Ghi chú khác'), confirmed);
    await assert.rejects(() => store.decide('guild-1', entry.id, 'dismiss'), AutoModReviewConflictError);
    await assert.rejects(() => store.decide('guild-2', entry.id, 'confirm'), AutoModReviewNotFoundError);
    await assert.rejects(() => store.decide('guild-1', entry.id, 'confirm', 'x'.repeat(241)), AutoModReviewValidationError);
    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as { entries: Array<{ status: string; note: string }> };
    assert.deepEqual(persisted.entries[0], { ...persisted.entries[0], status: 'confirmed', note: 'Đã kiểm tra heuristic.' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('AutoMod review store quarantines invalid data and enforces the bounded file shape', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'localbot-automod-review-corrupt-'));
  try {
    const filePath = path.join(root, 'review.json');
    await writeFile(filePath, JSON.stringify({ version: 99, entries: [] }), 'utf8');
    const store = new AutoModReviewStore(filePath);
    await store.loadPersisted();
    assert.deepEqual(await store.list('guild-1'), []);
    const files = await import('node:fs/promises').then(({ readdir }) => readdir(root));
    assert.equal(files.some((file) => file.startsWith('review.json.corrupt-')), true);
    assert.equal(isAutoModReviewFile({ version: 1, entries: new Array(MAX_AUTOMOD_REVIEW_ENTRIES + 1).fill({}) }), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
