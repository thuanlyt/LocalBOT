import assert from 'node:assert/strict';
import test from 'node:test';
import { Collection, PermissionsBitField } from 'discord.js';
import { DiscordAuditLogError, fetchDiscordAuditLog } from './discord-audit-log.js';

function fakeGuild(overrides: Record<string, unknown> = {}) {
  return {
    members: {
      me: {
        permissions: { has: (permission: unknown) => permission === PermissionsBitField.Flags.ViewAuditLog }
      },
      fetchMe: async () => null
    },
    fetchAuditLogs: async () => ({
      entries: new Collection([
        ['new', {
          id: 'new',
          createdAt: new Date('2026-09-03T10:00:00.000Z'),
          actionType: 'Update',
          targetType: 'Channel',
          targetId: '123',
          executorId: '456',
          executor: { tag: 'Admin#0001' },
          reason: 'raw reason must not cross the boundary',
          changes: [{ key: 'name' }]
        }],
        ['old', {
          id: 'old',
          createdAt: new Date('2026-09-03T09:00:00.000Z'),
          actionType: 'Delete',
          targetType: 'Role',
          targetId: null,
          executorId: null,
          executor: null,
          reason: null,
          changes: []
        }]
      ])
    }),
    ...overrides
  } as never;
}

test('discord audit reader returns a bounded minimal DTO without reason or changes', async () => {
  const entries = await fetchDiscordAuditLog(fakeGuild(), 2);
  assert.deepEqual(entries, [
    {
      id: 'new',
      createdAt: '2026-09-03T10:00:00.000Z',
      actionType: 'Update',
      targetType: 'Channel',
      targetId: '123',
      actorId: '456',
      actorTag: 'Admin#0001'
    },
    {
      id: 'old',
      createdAt: '2026-09-03T09:00:00.000Z',
      actionType: 'Delete',
      targetType: 'Role',
      targetId: null,
      actorId: null,
      actorTag: null
    }
  ]);
  assert.equal('reason' in entries[0]!, false);
  assert.equal('changes' in entries[0]!, false);
});

test('discord audit reader fails closed when View Audit Log is unavailable', async () => {
  const guild = fakeGuild({ members: { me: { permissions: { has: () => false } }, fetchMe: async () => null } });
  await assert.rejects(() => fetchDiscordAuditLog(guild, 10), (error: unknown) => {
    assert.ok(error instanceof DiscordAuditLogError);
    assert.equal(error.code, 'DISCORD_AUDIT_PERMISSION_DENIED');
    return true;
  });
});

test('discord audit reader normalizes Discord fetch failures', async () => {
  const guild = fakeGuild({ fetchAuditLogs: async () => { throw new Error('provider details stay server-side'); } });
  await assert.rejects(() => fetchDiscordAuditLog(guild, 10), (error: unknown) => {
    assert.ok(error instanceof DiscordAuditLogError);
    assert.equal(error.code, 'DISCORD_AUDIT_FETCH_FAILED');
    assert.equal(error.message.includes('provider details'), false);
    return true;
  });
});
