import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandAuditRecord } from './command-audit.js';

test('slash command audit records identify actor, guild, command and outcome without arguments', () => {
  assert.deepEqual(buildCommandAuditRecord({
    commandName: ' Play ',
    subcommand: null,
    actorId: 'user-123',
    guildId: 'guild-123',
    outcome: 'success'
  }), {
    actor: 'user:user-123',
    action: 'discord.command.play',
    guildId: 'guild-123',
    detail: 'outcome=success;subcommand=none'
  });
});

test('slash command audit records denied and failed outcomes without persisting command arguments', () => {
  const denied = buildCommandAuditRecord({
    commandName: 'music-access',
    subcommand: 'list',
    actorId: null,
    guildId: 'guild-123',
    outcome: 'denied'
  });
  const failed = buildCommandAuditRecord({
    commandName: 'search',
    subcommand: 'show',
    actorId: 'user-123',
    guildId: null,
    outcome: 'error'
  });

  assert.equal(denied.detail, 'outcome=denied;subcommand=list');
  assert.equal(failed.detail, 'outcome=error;subcommand=show');
  assert.equal('query' in denied, false);
  assert.equal(JSON.stringify(failed).includes('secret'), false);
});
