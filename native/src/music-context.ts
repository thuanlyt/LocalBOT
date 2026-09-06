export type MusicContextReadiness = {
  channel: { id: string };
  readiness: 'ready' | 'missing_permission' | 'unknown' | 'unsupported';
};

export type MusicContextState = {
  selectedGuildId: string;
  selectedVoiceChannelId: string;
  readiness: MusicContextReadiness | null;
  readinessError: string | null;
};

export type MusicVoiceChannelIdentity = { id: string; botJoined?: boolean };

export function resetMusicContextForGuildChange(guildId: string): MusicContextState {
  return {
    selectedGuildId: guildId,
    selectedVoiceChannelId: '',
    readiness: null,
    readinessError: null
  };
}

export function reconcileSelectedVoiceChannel(
  selectedVoiceChannelId: string,
  channels: MusicVoiceChannelIdentity[]
): string {
  if (selectedVoiceChannelId && channels.some((channel) => channel.id === selectedVoiceChannelId)) {
    return selectedVoiceChannelId;
  }
  return channels.find((channel) => channel.botJoined)?.id ?? '';
}

export function readinessMatchesSelectedChannel(
  readiness: MusicContextReadiness | null,
  selectedVoiceChannelId: string
): boolean {
  return Boolean(readiness && selectedVoiceChannelId && readiness.channel.id === selectedVoiceChannelId);
}

export function canApplyMusicReadiness(
  request: { guildId: string; channelId: string },
  selected: { guildId: string; channelId: string },
  readiness: MusicContextReadiness
): boolean {
  return request.guildId === selected.guildId
    && request.channelId === selected.channelId
    && readinessMatchesSelectedChannel(readiness, selected.channelId);
}
