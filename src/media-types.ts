export type MediaProvider = 'youtube' | 'soundcloud';
export type MediaSearchSource = MediaProvider | 'all';

export type MediaTrack = {
  provider: MediaProvider;
  id: string;
  title: string;
  url: string;
  duration: number | null;
  durationText: string;
  channel: string;
  channelId: string | null;
  thumbnail: string | null;
};

export type MediaAudioSource =
  | { kind: 'stream'; stream: ReadableStream<Uint8Array> }
  | { kind: 'url'; url: string };

export type MediaProviderAdapter = {
  provider: MediaProvider;
  search(query: string, limit?: number): Promise<MediaTrack[]>;
  resolve(input: string): Promise<MediaTrack>;
  download(track: MediaTrack): Promise<MediaAudioSource>;
};

export class MediaProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable = false,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'MediaProviderError';
  }
}

export function normalizeMediaText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('vi-VN')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\b(official|video|audio|lyrics?|mv|hd|4k)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * A conservative cross-provider identity for discover/search deduplication.
 * Provider IDs remain the canonical identity for playback and queue storage.
 */
export function mediaDeduplicationKey(track: Pick<MediaTrack, 'title' | 'channel' | 'duration'>): string {
  const title = normalizeMediaText(track.title);
  const channel = normalizeMediaText(track.channel);
  const duration = track.duration == null ? '' : String(Math.round(track.duration));
  return `${title}|${channel}|${duration}`;
}

export function deduplicateMediaTracks(tracks: MediaTrack[]): MediaTrack[] {
  const kept: MediaTrack[] = [];
  for (const track of tracks) {
    const key = mediaDeduplicationKey(track);
    const duplicate = kept.some((existing) => {
      if (mediaDeduplicationKey(existing) === key) return true;

      // Search results from different providers often use a different
      // channel/artist label and can differ by a few seconds. When the title
      // is normalized identically and both durations are known and close,
      // treat it as the same discover item while keeping the first provider's
      // canonical result (YouTube is queried first by the adapter).
      if (existing.provider === track.provider) return false;
      const existingTitle = normalizeMediaText(existing.title);
      const trackTitle = normalizeMediaText(track.title);
      if (!existingTitle || existingTitle !== trackTitle) return false;
      if (existing.duration == null || track.duration == null) return false;
      return Math.abs(existing.duration - track.duration) <= 8;
    });
    if (!duplicate) kept.push(track);
  }
  return kept;
}

export function sourceLabel(provider: MediaProvider): string {
  return provider === 'youtube' ? 'YouTube' : 'SoundCloud';
}
