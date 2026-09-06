import {
  deduplicateMediaTracks,
  MediaProviderError,
  type MediaProvider,
  type MediaAudioSource,
  type MediaSearchSource,
  type MediaTrack
} from './media-types.js';
import {
  downloadAudio as downloadYoutubeAudio,
  extractVideoId,
  getYoutubeVideo,
  searchYoutube
} from './youtube.js';
import {
  downloadSoundCloudAudio,
  getSoundCloudTrack,
  searchSoundCloud
} from './soundcloud.js';
import { mediaRequestLimiter } from './media-rate-limit.js';

function isUrl(input: string): boolean {
  try {
    new URL(input.trim());
    return true;
  } catch {
    return false;
  }
}

function consumeProviderRequest(provider: MediaProvider): void {
  const decision = mediaRequestLimiter.consume(provider);
  if (!decision.allowed) {
    throw new MediaProviderError(
      'Nguồn nhạc đang tạm giới hạn request cục bộ. Hãy thử lại sau.',
      'MEDIA_RATE_LIMITED',
      true,
      429
    );
  }
}

export function providerFromUrl(input: string): MediaProvider | null {
  if (!isUrl(input)) return null;

  try {
    const hostname = new URL(input.trim()).hostname.toLowerCase();
    if (hostname === 'youtu.be' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) return 'youtube';
    if (hostname === 'soundcloud.com' || hostname.endsWith('.soundcloud.com')) return 'soundcloud';
  } catch {
    return null;
  }

  return null;
}

export async function searchMedia(
  query: string,
  source: MediaSearchSource = 'youtube',
  limit = 5
): Promise<MediaTrack[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new MediaProviderError('Hãy nhập từ khóa tìm kiếm.', 'EMPTY_QUERY');

  const providers: MediaProvider[] = source === 'all' ? ['youtube', 'soundcloud'] : [source];
  const results = await Promise.allSettled(providers.map((provider) => Promise.resolve().then(() => {
    consumeProviderRequest(provider);
    return provider === 'youtube' ? searchYoutube(cleanQuery, limit) : searchSoundCloud(cleanQuery, limit);
  })));

  const tracks = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (tracks.length > 0) return deduplicateMediaTracks(tracks).slice(0, limit);

  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failure) throw failure.reason;
  return [];
}

export async function resolveMedia(input: string, preferredSource: MediaProvider = 'youtube'): Promise<MediaTrack> {
  const provider = providerFromUrl(input);
  if (provider === 'youtube') {
    consumeProviderRequest('youtube');
    return getYoutubeVideo(input);
  }
  if (provider === 'soundcloud') {
    consumeProviderRequest('soundcloud');
    return getSoundCloudTrack(input);
  }
  if (isUrl(input)) {
    throw new MediaProviderError(
      'Link này chưa thuộc nguồn được hỗ trợ. Hiện LocalBot hỗ trợ YouTube và SoundCloud.',
      'UNSUPPORTED_SOURCE_URL'
    );
  }
  // Keep the familiar `/play <video-id>` and `/info <video-id>` behavior
  // without treating an 11-character YouTube id as a text search query.
  if (extractVideoId(input)) {
    consumeProviderRequest('youtube');
    return getYoutubeVideo(input);
  }

  const [track] = await searchMedia(input, preferredSource, 1);
  if (!track) throw new MediaProviderError('Không tìm thấy bài hát phù hợp.', 'TRACK_NOT_FOUND');
  return track;
}

export async function downloadMediaAudio(track: MediaTrack): Promise<MediaAudioSource> {
  if (track.provider === 'youtube') return { kind: 'stream', stream: await downloadYoutubeAudio(track.id) };
  return downloadSoundCloudAudio(track);
}

export { sourceLabel } from './media-types.js';
export type { MediaProvider, MediaSearchSource, MediaTrack } from './media-types.js';
