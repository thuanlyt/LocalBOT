import type { AuditEntry } from './audit-log.js';

export type CommandAuditOutcome = 'success' | 'denied' | 'error';

export type CommandAuditInput = {
  commandName: string;
  subcommand: string | null;
  actorId: string | null;
  guildId: string | null;
  outcome: CommandAuditOutcome;
};

/**
 * Build a metadata-only audit record for a Discord slash command.
 *
 * Command arguments are intentionally excluded: search text, URLs, playlist
 * names, and provider payloads are not needed to establish accountability and
 * may contain user-private or credential-like material.
 */
export function buildCommandAuditRecord(input: CommandAuditInput): Omit<AuditEntry, 'id' | 'timestamp'> {
  const commandName = input.commandName.trim().toLowerCase().slice(0, 32) || 'unknown';
  const subcommand = input.subcommand?.trim().toLowerCase().slice(0, 32) || 'none';
  const actor = input.actorId?.trim() ? `user:${input.actorId.trim()}` : 'discord:unknown';
  return {
    actor,
    action: `discord.command.${commandName}`,
    guildId: input.guildId,
    detail: `outcome=${input.outcome};subcommand=${subcommand}`
  };
}
