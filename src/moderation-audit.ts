export type ModerationAuditEvent =
  | { kind: 'message-delete'; guildId: string; channelId: string; count?: number }
  | { kind: 'channel-delete'; guildId: string; targetId?: string }
  | { kind: 'role-delete'; guildId: string; targetId?: string };

export type ModerationAuditRecord = { actor: string; action: string; guildId: string; detail: string };

function safeId(value: string | undefined): string {
  return value && /^\d{1,64}$/.test(value) ? value : 'unknown';
}

export function buildModerationAuditRecord(event: ModerationAuditEvent): ModerationAuditRecord {
  if (event.kind === 'message-delete') {
    const count = Number.isInteger(event.count) && event.count! > 0 && event.count! <= 100_000 ? event.count! : 1;
    return {
      actor: 'discord:event',
      action: count === 1 ? 'moderation.message_delete' : 'moderation.message_bulk_delete',
      guildId: safeId(event.guildId),
      detail: `channel=${safeId(event.channelId)};count=${count};contentStored=false`
    };
  }
  return {
    actor: 'discord:event',
    action: event.kind === 'channel-delete' ? 'moderation.channel_delete' : 'moderation.role_delete',
    guildId: safeId(event.guildId),
    detail: `target=${safeId(event.targetId)};rawAuditPayloadStored=false`
  };
}
