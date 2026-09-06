import { REST, Routes } from 'discord.js';
import { commandDefinitions } from './commands.js';
import { config } from './config.js';

export type CommandRegistrationResult = {
  count: number;
  scope: 'guild' | 'global';
  guildId: string | null;
};

export class CommandRegistrationError extends Error {
  readonly retryable: boolean;
  readonly httpStatus: number;

  constructor(upstreamStatus: number | null) {
    const retryable = upstreamStatus === null || upstreamStatus === 408 || upstreamStatus === 429 || upstreamStatus >= 500;
    super(retryable
      ? 'Discord chưa phản hồi đăng ký slash commands ổn định; hãy thử lại sau.'
      : 'Discord từ chối đăng ký slash commands; hãy kiểm tra cấu hình ứng dụng và quyền bot.');
    this.name = 'CommandRegistrationError';
    this.retryable = retryable;
    this.httpStatus = retryable ? 503 : 502;
  }
}

function upstreamStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
}

/** Register the current command contract without exposing the bot token. */
export async function registerSlashCommands(guildId?: string): Promise<CommandRegistrationResult> {
  const targetGuildId = guildId?.trim() || config.discordGuildId || null;
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const route = targetGuildId
    ? Routes.applicationGuildCommands(config.discordClientId, targetGuildId)
    : Routes.applicationCommands(config.discordClientId);
  let registered: unknown;
  try {
    registered = await rest.put(route, { body: commandDefinitions });
  } catch (error) {
    throw new CommandRegistrationError(upstreamStatus(error));
  }

  return {
    count: Array.isArray(registered) ? registered.length : commandDefinitions.length,
    scope: targetGuildId ? 'guild' : 'global',
    guildId: targetGuildId
  };
}
