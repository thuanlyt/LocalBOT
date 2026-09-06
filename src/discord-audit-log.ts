import { PermissionsBitField, type Guild } from 'discord.js';

export type DiscordAuditEntry = {
  id: string;
  createdAt: string;
  actionType: string;
  targetType: string;
  targetId: string | null;
  actorId: string | null;
  actorTag: string | null;
};

export class DiscordAuditLogError extends Error {
  constructor(
    public readonly code: 'DISCORD_AUDIT_PERMISSION_DENIED' | 'DISCORD_AUDIT_FETCH_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'DiscordAuditLogError';
  }
}

type ExecutorLike = { tag?: string | null; username?: string | null };

function safeActorTag(executor: ExecutorLike | null): string | null {
  if (!executor) return null;
  const value = executor.tag ?? executor.username;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : null;
}

/**
 * Read the official Discord audit log without persisting or returning raw
 * entries. The caller must already have a guild selected; this function only
 * performs a permission check and a bounded read.
 */
export async function fetchDiscordAuditLog(guild: Guild, limit: number): Promise<DiscordAuditEntry[]> {
  const member = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!member?.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
    throw new DiscordAuditLogError(
      'DISCORD_AUDIT_PERMISSION_DENIED',
      'Bot thiếu quyền View Audit Log trong guild này.'
    );
  }

  let logs;
  try {
    logs = await guild.fetchAuditLogs({ limit });
  } catch {
    throw new DiscordAuditLogError(
      'DISCORD_AUDIT_FETCH_FAILED',
      'Không thể đọc audit log Discord lúc này; hãy kiểm tra kết nối và thử lại.'
    );
  }

  return logs.entries.map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt.toISOString(),
    actionType: entry.actionType,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    actorId: entry.executorId ?? null,
    actorTag: safeActorTag(entry.executor)
  })).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}
