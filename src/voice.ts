import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type Role,
  type NewsChannel,
  type TextChannel,
  type VoiceBasedChannel
} from 'discord.js';
import { isVoiceChannel } from './player.js';

export type VoiceChannelSummary = {
  id: string;
  name: string;
  type: 'voice' | 'stage';
  category: string | null;
  position: number;
  canConnect: boolean | null;
  canSpeak: boolean | null;
  botJoined: boolean;
};

export type GuildVoiceSummary = {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  botVoiceChannel: VoiceChannelSummary | null;
};

export type TextChannelSummary = {
  id: string;
  name: string;
  category: string | null;
  position: number;
  canSend: boolean | null;
  canEmbed: boolean | null;
};

export type GuildRoleSummary = {
  id: string;
  name: string;
  color: string;
  position: number;
  managed: boolean;
  mentionable: boolean;
};

export type GuildMemberSummary = {
  id: string;
  username: string;
  displayName: string;
  bot: boolean;
};

export type GuildMemberDirectory = {
  members: GuildMemberSummary[];
  intentEnabled: boolean;
  complete: boolean;
  source: 'discord' | 'cache';
};

export type GuildPermissionSummary = {
  botMemberPresent: boolean;
  botUserId: string | null;
  highestRole: { id: string; name: string; position: number; managed: boolean } | null;
  permissions: {
    viewChannel: boolean | null;
    sendMessages: boolean | null;
    embedLinks: boolean | null;
    connect: boolean | null;
    speak: boolean | null;
    moveMembers: boolean | null;
    manageMessages: boolean | null;
    moderateMembers: boolean | null;
    manageRoles: boolean | null;
    manageGuild: boolean | null;
    viewAuditLog: boolean | null;
    useApplicationCommands: boolean | null;
  };
};

export type MusicReadinessPermission = 'ViewChannel' | 'Connect' | 'Speak';
export type MusicReadinessStatus = 'ready' | 'missing_permission' | 'unknown' | 'unsupported';
export type MusicReadinessReason =
  | 'READY'
  | 'BOT_MEMBER_UNKNOWN'
  | 'MISSING_VIEW_CHANNEL'
  | 'MISSING_CONNECT'
  | 'MISSING_SPEAK'
  | 'STAGE_CHANNEL_UNSUPPORTED';

export type MusicChannelReadiness = {
  channel: {
    id: string;
    name: string;
    type: 'voice' | 'stage';
    category: string | null;
    position: number;
  };
  channelExists: true;
  botMemberKnown: boolean;
  effectivePermissions: {
    viewChannel: boolean | null;
    connect: boolean | null;
    speak: boolean | null;
  };
  readiness: MusicReadinessStatus;
  missing: MusicReadinessPermission[];
  reasons: MusicReadinessReason[];
};

function getBotMember(guild: Guild, client: Client): GuildMember | null {
  if (!client.user) return null;
  return guild.members.me ?? guild.members.cache.get(client.user.id) ?? null;
}

export function getBotVoiceChannel(guild: Guild, client: Client): VoiceBasedChannel | null {
  const channelId = getBotMember(guild, client)?.voice.channelId
    ?? (client.user ? guild.voiceStates.cache.get(client.user.id)?.channelId : null);
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  return isVoiceChannel(channel) ? channel : null;
}

export function summarizeVoiceChannel(
  channel: VoiceBasedChannel,
  guild: Guild,
  client: Client
): VoiceChannelSummary {
  const botChannel = getBotVoiceChannel(guild, client);
  const permissions = getBotMember(guild, client)
    ? channel.permissionsFor(getBotMember(guild, client)!)
    : null;

  return {
    id: channel.id,
    name: channel.name,
    type: channel.type === ChannelType.GuildStageVoice ? 'stage' : 'voice',
    category: channel.parent?.name ?? null,
    position: channel.rawPosition,
    canConnect: permissions ? permissions.has(PermissionFlagsBits.Connect) : null,
    canSpeak: permissions ? permissions.has(PermissionFlagsBits.Speak) : null,
    botJoined: botChannel?.id === channel.id
  };
}

/**
 * Evaluate only the effective permissions required by the current Music
 * voice flow. This deliberately uses the selected channel's permission
 * overwrites instead of the broader guild-level permission summary.
 */
export function summarizeMusicReadiness(
  channel: VoiceBasedChannel,
  guild: Guild,
  client: Client
): MusicChannelReadiness {
  const botMember = getBotMember(guild, client);
  const permissionSet = botMember ? channel.permissionsFor(botMember) : null;
  const has = (permission: bigint): boolean | null => permissionSet ? permissionSet.has(permission) : null;
  const effectivePermissions = {
    viewChannel: has(PermissionFlagsBits.ViewChannel),
    connect: has(PermissionFlagsBits.Connect),
    speak: has(PermissionFlagsBits.Speak)
  };
  const missing: MusicReadinessPermission[] = [];
  if (effectivePermissions.viewChannel === false) missing.push('ViewChannel');
  if (effectivePermissions.connect === false) missing.push('Connect');
  if (effectivePermissions.speak === false) missing.push('Speak');

  const type = channel.type === ChannelType.GuildStageVoice ? 'stage' : 'voice';
  const reasons: MusicReadinessReason[] = [];
  let readiness: MusicReadinessStatus;
  if (type === 'stage') {
    readiness = 'unsupported';
    reasons.push('STAGE_CHANNEL_UNSUPPORTED');
  } else if (!botMember) {
    readiness = 'unknown';
    reasons.push('BOT_MEMBER_UNKNOWN');
  } else if (missing.length > 0) {
    readiness = 'missing_permission';
    for (const permission of missing) reasons.push(`MISSING_${permission.replace('ViewChannel', 'VIEW_CHANNEL').toUpperCase()}` as MusicReadinessReason);
  } else if (Object.values(effectivePermissions).some((value) => value === null)) {
    readiness = 'unknown';
    reasons.push('BOT_MEMBER_UNKNOWN');
  } else {
    readiness = 'ready';
    reasons.push('READY');
  }

  return {
    channel: {
      id: channel.id,
      name: channel.name,
      type,
      category: channel.parent?.name ?? null,
      position: channel.rawPosition
    },
    channelExists: true,
    botMemberKnown: Boolean(botMember),
    effectivePermissions,
    readiness,
    missing,
    reasons
  };
}

export function listVoiceChannels(guild: Guild, client: Client): VoiceChannelSummary[] {
  return guild.channels.cache
    .filter((channel): channel is VoiceBasedChannel => isVoiceChannel(channel))
    .map((channel) => summarizeVoiceChannel(channel, guild, client))
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, 'vi'));
}

export function listTextChannels(guild: Guild, client: Client): TextChannelSummary[] {
  const botMember = getBotMember(guild, client);
  return guild.channels.cache
    .filter((channel): channel is TextChannel | NewsChannel => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
    .map((channel) => {
      const permissions = botMember ? channel.permissionsFor(botMember) : null;
      return {
        id: channel.id,
        name: channel.name,
        category: channel.parent?.name ?? null,
        position: channel.rawPosition,
        canSend: permissions ? permissions.has(PermissionFlagsBits.SendMessages) : null,
        canEmbed: permissions ? permissions.has(PermissionFlagsBits.EmbedLinks) : null
      };
    })
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, 'vi'));
}

/**
 * Return the bot's effective guild-level permissions without making any
 * Discord mutation. A missing cached bot member is represented by null
 * permission values so the native UI cannot mistake an unavailable cache for
 * a denied permission.
 */
export function summarizeGuildPermissions(guild: Guild, client: Client): GuildPermissionSummary {
  const botMember = getBotMember(guild, client);
  const permissions = botMember?.permissions ?? null;
  const has = (permission: bigint): boolean | null => permissions ? permissions.has(permission) : null;
  const highestRole = botMember?.roles.highest && botMember.roles.highest.id !== guild.id
    ? {
      id: botMember.roles.highest.id,
      name: botMember.roles.highest.name,
      position: botMember.roles.highest.position,
      managed: botMember.roles.highest.managed
    }
    : null;

  return {
    botMemberPresent: Boolean(botMember),
    botUserId: client.user?.id ?? null,
    highestRole,
    permissions: {
      viewChannel: has(PermissionFlagsBits.ViewChannel),
      sendMessages: has(PermissionFlagsBits.SendMessages),
      embedLinks: has(PermissionFlagsBits.EmbedLinks),
      connect: has(PermissionFlagsBits.Connect),
      speak: has(PermissionFlagsBits.Speak),
      moveMembers: has(PermissionFlagsBits.MoveMembers),
      manageMessages: has(PermissionFlagsBits.ManageMessages),
      moderateMembers: has(PermissionFlagsBits.ModerateMembers),
      manageRoles: has(PermissionFlagsBits.ManageRoles),
      manageGuild: has(PermissionFlagsBits.ManageGuild),
      viewAuditLog: has(PermissionFlagsBits.ViewAuditLog),
      useApplicationCommands: has(PermissionFlagsBits.UseApplicationCommands)
    }
  };
}

/**
 * Return only roles that can be selected by LocalBot's local configuration.
 * The @everyone role and integration-managed roles are intentionally omitted:
 * neither is a valid target for Community rewards/multipliers and exposing them
 * would make the native picker look actionable when Discord would reject it.
 */
export function listGuildRoles(guild: Guild): GuildRoleSummary[] {
  return guild.roles.cache
    .filter((role: Role) => role.id !== guild.id && !role.managed)
    .map((role: Role) => ({
      id: role.id,
      name: role.name,
      color: role.hexColor,
      position: role.position,
      managed: role.managed,
      mentionable: role.mentionable
    }))
    .sort((left, right) => right.position - left.position || left.name.localeCompare(right.name, 'vi'));
}

/**
 * Search a bounded member directory for native permission pickers. Discord's
 * member intent is opt-in, so a disabled intent must remain an honest cache-only
 * result rather than pretending that the cache is the complete guild directory.
 */
export async function searchGuildMembers(
  guild: Guild,
  query: string,
  limit: number,
  intentEnabled: boolean
): Promise<GuildMemberDirectory> {
  const normalizedQuery = query.trim().toLocaleLowerCase('vi');
  let members = guild.members.cache;
  let source: GuildMemberDirectory['source'] = 'cache';
  let complete = false;

  if (intentEnabled && normalizedQuery) {
    try {
      members = await guild.members.fetch({ query: normalizedQuery, limit });
      source = 'discord';
      complete = true;
    } catch {
      // Fall back to the bounded cache without exposing Discord/provider error text.
    }
  }

  const summaries = members
    .filter((member: GuildMember) => !member.user.bot)
    .filter((member: GuildMember) => {
      if (!normalizedQuery) return true;
      const haystack = `${member.user.username} ${member.displayName} ${member.id}`.toLocaleLowerCase('vi');
      return haystack.includes(normalizedQuery);
    })
    .map((member: GuildMember) => ({
      id: member.id,
      username: member.user.username,
      displayName: member.displayName,
      bot: member.user.bot
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'vi') || left.id.localeCompare(right.id))
    .slice(0, limit);

  return { members: summaries, intentEnabled, complete, source };
}

export function summarizeGuild(guild: Guild, client: Client): GuildVoiceSummary {
  const botChannel = getBotVoiceChannel(guild, client);
  return {
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL(),
    memberCount: guild.memberCount,
    botVoiceChannel: botChannel ? summarizeVoiceChannel(botChannel, guild, client) : null
  };
}
