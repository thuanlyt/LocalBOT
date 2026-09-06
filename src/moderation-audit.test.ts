import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModerationAuditRecord } from './moderation-audit.js';

test('moderation audit records contain only bounded event metadata', () => {
  assert.deepEqual(buildModerationAuditRecord({ kind: 'message-delete', guildId: '123', channelId: '456' }), {
    actor: 'discord:event',
    action: 'moderation.message_delete',
    guildId: '123',
    detail: 'channel=456;count=1;contentStored=false'
  });
  assert.deepEqual(buildModerationAuditRecord({ kind: 'message-delete', guildId: '123', channelId: '456', count: 4 }), {
    actor: 'discord:event',
    action: 'moderation.message_bulk_delete',
    guildId: '123',
    detail: 'channel=456;count=4;contentStored=false'
  });
  assert.deepEqual(buildModerationAuditRecord({ kind: 'role-delete', guildId: '123', targetId: '789' }), {
    actor: 'discord:event',
    action: 'moderation.role_delete',
    guildId: '123',
    detail: 'target=789;rawAuditPayloadStored=false'
  });
});

test('moderation audit formatter rejects malformed identifiers and bounds counts', () => {
  const record = buildModerationAuditRecord({ kind: 'message-delete', guildId: 'guild;secret', channelId: 'not-an-id', count: 999_999 });
  assert.equal(record.guildId, 'unknown');
  assert.equal(record.detail, 'channel=unknown;count=1;contentStored=false');
});
