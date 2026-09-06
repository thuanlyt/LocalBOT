import { GatewayIntentBits } from 'discord.js';

export type DiscordIntentOptions = {
  guildMembers: boolean;
  messageContent: boolean;
};

/**
 * Build the smallest gateway intent set for the configured LocalBot features.
 * Privileged intents are never requested unless the operator opts in explicitly.
 */
export function buildDiscordIntents(options: DiscordIntentOptions): GatewayIntentBits[] {
  const intents: GatewayIntentBits[] = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ];
  if (options.guildMembers) intents.push(GatewayIntentBits.GuildMembers);
  if (options.messageContent) intents.push(GatewayIntentBits.MessageContent);
  return intents;
}

/** Missing message content must not be treated as a successful AutoMod check. */
export function canInspectMessageContent(enabled: boolean, content: string | null | undefined): boolean {
  return enabled && typeof content === 'string' && content.trim().length > 0;
}
