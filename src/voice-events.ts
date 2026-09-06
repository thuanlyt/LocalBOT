type VoiceEventListener = () => void;

const listenersByGuild = new Map<string, Set<VoiceEventListener>>();

export function subscribeGuildVoice(guildId: string, listener: VoiceEventListener): () => void {
  const listeners = listenersByGuild.get(guildId) ?? new Set<VoiceEventListener>();
  listeners.add(listener);
  listenersByGuild.set(guildId, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByGuild.delete(guildId);
  };
}

export function publishGuildVoice(guildId: string): void {
  const listeners = listenersByGuild.get(guildId);
  if (!listeners) return;

  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error(`[voice-events:${guildId}]`, error instanceof Error ? error.message : error);
    }
  }
}
