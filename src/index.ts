import { Client, Events, PermissionsBitField, type GuildMember, type Message, type PartialGuildMember } from 'discord.js';
import { handleCommand } from './commands.js';
import { config, validateDiscordConfig } from './config.js';
import { registerSlashCommands } from './command-registration.js';
import { equalizerStore } from './equalizer.js';
import { communityStore } from './community.js';
import { auditLogStore } from './audit-log.js';
import { playerStateStore } from './player-state.js';
import { providerSettingsStore } from './provider-settings.js';
import { publishGuildVoice } from './voice-events.js';
import { buildGreetingPayload, greetingStore, type GreetingKind } from './greetings.js';
import { automodStore, runtimeAutoModEngine, type AutoModSecurityEvent } from './automod.js';
import { automodReviewStore, type AutoModReviewMatch, type AutoModReviewOutcome } from './automod-review.js';
import { ollamaStore } from './ollama.js';
import { buildModerationAuditRecord, type ModerationAuditEvent } from './moderation-audit.js';
import { AutoModActionLimiter, chooseAutoModEnforcement } from './automod-enforcement.js';
import { executeAutoModMessageAction } from './automod-runtime.js';
import { buildDiscordIntents, canInspectMessageContent } from './discord-intents.js';
import { destroyAllPlayers } from './player.js';
import type { Server } from 'node:http';

validateDiscordConfig();
await equalizerStore.load();
await communityStore.load();
await auditLogStore.loadPersisted();
await playerStateStore.load();
await providerSettingsStore.load();
await greetingStore.load();
await automodStore.load();
await automodReviewStore.loadPersisted();
await ollamaStore.load();

const intents = buildDiscordIntents({
  guildMembers: config.guildMembersIntentEnabled,
  messageContent: config.messageContentIntentEnabled
});
const client = new Client({
  intents
});

async function deliverGreeting(member: GuildMember | PartialGuildMember, kind: GreetingKind): Promise<void> {
  const template = (await greetingStore.get(member.guild.id))[kind];
  if (!template.enabled || !template.channelId) return;
  const channel = member.guild.channels.cache.get(template.channelId);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    console.error(`[greetings] ${kind} channel unavailable for guild ${member.guild.id}`);
    return;
  }
  try {
    await channel.send(buildGreetingPayload(template, {
      user: `<@${member.id}>`,
      userId: member.id,
      username: member.user.username,
      guild: member.guild.name,
      memberCount: member.guild.memberCount
    }));
  } catch (error) {
    console.error(`[greetings] ${kind} delivery failed for guild ${member.guild.id}:`, error instanceof Error ? error.message : 'unknown error');
  }
}

const autoModActionLimiter = new AutoModActionLimiter();

type AutoModEnforcementOutcome = AutoModReviewOutcome;

function autoModAuditAction(mode: 'dry-run' | 'enforce'): string {
  return mode === 'enforce' ? 'automod.enforcement' : 'automod.dry_run_match';
}

async function recordAutoModMatches(matches: readonly AutoModReviewMatch[], mode: 'dry-run' | 'enforce', outcomeForMatch: (index: number) => AutoModEnforcementOutcome, enforcedForMatch: (index: number) => boolean): Promise<void> {
  const outcomes = matches.map((_, index) => ({ outcome: outcomeForMatch(index), enforced: enforcedForMatch(index) }));
  await Promise.all(matches.map((match, index) => auditLogStore.record({
    actor: `user:${match.userId}`,
    action: autoModAuditAction(mode),
    guildId: match.guildId,
    detail: `rule=${match.rule};reason=${match.reason};proposed=${match.proposedAction};mode=${mode};outcome=${outcomes[index]?.outcome};enforced=${outcomes[index]?.enforced}`
  })));
  await Promise.all(matches.map((match, index) => automodReviewStore.recordMatch(match, outcomes[index]?.outcome ?? 'failed', outcomes[index]?.enforced ?? false).catch((error) => {
    console.error('[automod-review] record failed:', error instanceof Error ? error.message : 'unknown error');
  })));
}

async function inspectAutoMod(message: Message): Promise<void> {
  if (!message.guildId || !canInspectMessageContent(config.messageContentIntentEnabled, message.content)) return;
  const settings = await automodStore.get(message.guildId);
  const matches = runtimeAutoModEngine.evaluate(settings, {
    guildId: message.guildId,
    channelId: message.channelId,
    userId: message.author.id,
    roleIds: message.member?.roles.cache.map((role) => role.id) ?? [],
    content: message.content,
    timestamp: message.createdTimestamp
  });
  if (matches.length === 0) return;
  if (settings.mode === 'dry-run') {
    await recordAutoModMatches(matches, settings.mode, () => 'alerted', () => false);
    return;
  }

  const decision = chooseAutoModEnforcement(matches);
  let outcome: AutoModEnforcementOutcome = decision.reason === 'unsupported' ? 'unsupported' : 'alerted';
  let enforced = false;
  if (decision.action) {
    const execution = await executeAutoModMessageAction(decision.action, message, autoModActionLimiter, message.guildId);
    outcome = execution.outcome;
    enforced = execution.enforced;
  }

  await recordAutoModMatches(
    matches,
    settings.mode,
    (index) => index === decision.matchIndex ? outcome : 'coalesced',
    (index) => index === decision.matchIndex && enforced
  );
}

async function inspectAutoModSecurity(event: AutoModSecurityEvent): Promise<void> {
  const settings = await automodStore.get(event.guildId);
  const matches = runtimeAutoModEngine.evaluateSecurityEvent(settings, event);
  if (matches.length === 0) return;
  await recordAutoModMatches(
    matches,
    settings.mode,
    () => matches[0]?.proposedAction === 'alert' ? 'alerted' : 'unsupported',
    () => false
  );
}

async function recordModerationEvent(event: ModerationAuditEvent): Promise<void> {
  const record = buildModerationAuditRecord(event);
  await auditLogStore.record(record);
}

async function applyCommunityRoleRewards(member: GuildMember, level: number): Promise<void> {
  const rewardRoles = await communityStore.roleRewardsForLevel(member.guild.id, level);
  if (rewardRoles.length === 0) return;
  const botMember = member.guild.members.me;
  if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    console.error(`[community] role rewards skipped for guild ${member.guild.id}: bot lacks ManageRoles`);
    return;
  }
  for (const reward of rewardRoles) {
    const role = member.guild.roles.cache.get(reward.roleId);
    if (!role || role.managed || role.position >= botMember.roles.highest.position || member.roles.cache.has(role.id)) continue;
    try {
      await member.roles.add(role, `LocalBot Community level ${reward.level} reward`);
      await auditLogStore.record({ actor: 'system:community', action: 'community.role_reward', guildId: member.guild.id, detail: `role=${role.id};level=${reward.level}` });
    } catch (error) {
      console.error(`[community] role reward failed for guild ${member.guild.id}:`, error instanceof Error ? error.message : 'unknown error');
    }
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`LocalBot is online as ${readyClient.user.tag}`);
  if (!config.autoRegisterCommands) return;
  void registerSlashCommands()
    .then((result) => console.log(`Registered ${result.count} ${result.scope} slash commands${result.guildId ? ` for ${result.guildId}` : ''}.`))
    .catch((error) => console.error('[commands] registration failed', error));
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await handleCommand(interaction);
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const botId = client.user?.id;
  if (!botId || (oldState.id !== botId && newState.id !== botId)) return;
  publishGuildVoice(newState.guild.id);
});

client.on(Events.MessageCreate, (message) => {
  if (!message.guildId || message.author.bot) return;
  void communityStore.recordMessage(message.guildId, message.author.id, message.author.username, Date.now(), {
    channelId: message.channelId,
    roleIds: message.member?.roles.cache.map((role) => role.id) ?? []
  }).then((awarded) => {
    if (awarded && message.member) void applyCommunityRoleRewards(message.member, awarded.level);
  }).catch((error) => {
    console.error('[community] XP evaluation failed:', error instanceof Error ? error.message : 'unknown error');
  });
  void inspectAutoMod(message).catch((error) => {
    console.error('[automod] evaluation/enforcement failed:', error instanceof Error ? error.message : 'unknown error');
  });
});

client.on(Events.MessageDelete, (message) => {
  if (!message.guildId) return;
  void recordModerationEvent({ kind: 'message-delete', guildId: message.guildId, channelId: message.channelId }).catch((error) => {
    console.error('[audit] message delete event failed:', error instanceof Error ? error.message : 'unknown error');
  });
});

client.on(Events.MessageBulkDelete, (messages, channel) => {
  void recordModerationEvent({ kind: 'message-delete', guildId: channel.guildId, channelId: channel.id, count: messages.size }).catch((error) => {
    console.error('[audit] bulk message delete event failed:', error instanceof Error ? error.message : 'unknown error');
  });
});

client.on('error', (error) => console.error('[discord]', error));

if (config.guildMembersIntentEnabled) {
  client.on(Events.GuildMemberAdd, (member) => {
    void deliverGreeting(member, 'welcome');
    void inspectAutoModSecurity({ guildId: member.guild.id, kind: 'member-join', actorId: member.id }).catch((error) => {
      console.error('[automod] anti-raid evaluation failed:', error instanceof Error ? error.message : 'unknown error');
    });
  });
  client.on(Events.GuildMemberRemove, (member) => { void deliverGreeting(member, 'goodbye'); });
}

client.on(Events.ChannelDelete, (channel) => {
  if (!('guild' in channel)) return;
  void recordModerationEvent({ kind: 'channel-delete', guildId: channel.guild.id, targetId: channel.id }).catch((error) => {
    console.error('[audit] channel delete event failed:', error instanceof Error ? error.message : 'unknown error');
  });
  void inspectAutoModSecurity({ guildId: channel.guild.id, kind: 'destructive-change' }).catch((error) => {
    console.error('[automod] anti-nuke evaluation failed:', error instanceof Error ? error.message : 'unknown error');
  });
});

client.on(Events.GuildRoleDelete, (role) => {
  void recordModerationEvent({ kind: 'role-delete', guildId: role.guild.id, targetId: role.id }).catch((error) => {
    console.error('[audit] role delete event failed:', error instanceof Error ? error.message : 'unknown error');
  });
  void inspectAutoModSecurity({ guildId: role.guild.id, kind: 'destructive-change' }).catch((error) => {
    console.error('[automod] anti-nuke evaluation failed:', error instanceof Error ? error.message : 'unknown error');
  });
});

process.on('unhandledRejection', (error) => console.error('[unhandled-rejection]', error));

let controlServer: Server | null = null;
if (config.controlEnabled) {
  const { startControlServer } = await import('./control-server.js');
  controlServer = await startControlServer(client, {
    onAutoModRecovery: (guildId) => runtimeAutoModEngine.resetGuild(guildId),
    automodReview: automodReviewStore
  });
}

let shutdownPromise: Promise<void> | null = null;
async function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    console.log(`[lifecycle] ${signal}: stopping LocalBot runtime`);
    destroyAllPlayers();
    if (controlServer) {
      // SSE clients are active connections, so close them explicitly before
      // waiting for the listener to release its port.
      controlServer.closeAllConnections?.();
      await new Promise<void>((resolve) => {
        controlServer?.close(() => resolve());
      });
      controlServer = null;
    }
    client.destroy();
  })();
  return shutdownPromise;
}

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

await client.login(config.discordToken);
