import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  Innertube,
  Platform,
  UniversalCache,
  type Types
} from 'youtubei.js';
import { config } from './config.js';
import { MediaProviderError, type MediaTrack } from './media-types.js';

export type YoutubeTrack = MediaTrack;

type SearchVideo = {
  type?: string;
  id?: string;
  video_id?: string;
  title?: string | { toString(): string };
  author?: { id?: string; name?: string } | string;
  duration?: string | { text?: string; seconds?: number; toString(): string };
  length_text?: string | { text?: string; toString(): string };
  duration_seconds?: number;
  thumbnails?: Array<{ url?: string }>;
};

let youtubePromise: Promise<Innertube> | undefined;
let platformConfigured = false;

function configurePlatform(): void {
  if (platformConfigured) return;

  // YouTube.js needs a JavaScript interpreter to decipher stream URLs. The
  // library's guide documents this shim; it evaluates only the player code
  // fetched by YouTube.js, not user input.
  Platform.shim.eval = async (data: Types.BuildScriptResult) => new Function(data.output)();

  platformConfigured = true;
}

async function getYoutube(): Promise<Innertube> {
  configurePlatform();
  if (!youtubePromise) {
    await mkdir(path.resolve(config.youtubeCacheDir), { recursive: true });
    youtubePromise = Innertube.create({
      lang: config.youtubeLanguage,
      location: config.youtubeLocation,
      cache: new UniversalCache(true, path.resolve(config.youtubeCacheDir)),
      enable_safety_mode: true
    });
  }
  return youtubePromise;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text;
  }
  if (value == null) return '';
  const stringified = String(value);
  return stringified === '[object Object]' ? '' : stringified;
}

function parseDuration(value: unknown): number | null {
  const text = asText(value);
  if (!text) return null;
  const parts = text.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function toTrack(video: SearchVideo): YoutubeTrack | null {
  const id = asText(video.video_id ?? video.id);
  if (!id) return null;

  // Search results expose the display duration as `length_text`; `duration`
  // may be a structured object and must not be stringified to `[object Object]`.
  const durationText = asText(video.length_text) || asText(video.duration) || 'live';
  const duration = typeof video.duration_seconds === 'number'
    ? video.duration_seconds
    : typeof video.duration === 'object' && typeof video.duration.seconds === 'number'
      ? video.duration.seconds
    : durationText === 'live'
      ? null
      : parseDuration(durationText);
  const channel = typeof video.author === 'string'
    ? video.author
    : asText(video.author?.name);
  const title = asText(video.title);
  if (!title || !channel) return null;

  return {
    provider: 'youtube',
    id,
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    duration,
    durationText,
    channel,
    channelId: typeof video.author === 'object' ? video.author.id ?? null : null,
    thumbnail: video.thumbnails?.at(-1)?.url ?? null
  };
}

function isSearchVideo(value: unknown): value is SearchVideo {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as SearchVideo;
  // YouTube.js can include Channel/Playlist items even when a video search is
  // requested. Only a result with an actual video id can become a playable
  // MediaTrack.
  return candidate.type === 'Video' || typeof candidate.video_id === 'string';
}

export function extractVideoId(input: string): string | null {
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;

  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
      const queryId = url.searchParams.get('v');
      if (queryId && /^[\w-]{11}$/.test(queryId)) return queryId;
      const pathParts = url.pathname.split('/').filter(Boolean);
      const candidate = pathParts[1] ?? pathParts[0];
      return candidate && /^[\w-]{11}$/.test(candidate) ? candidate : null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function searchYoutube(query: string, limit = 5): Promise<YoutubeTrack[]> {
  const youtube = await getYoutube();
  const result = await youtube.search(query, { type: 'video' });
  const tracks: YoutubeTrack[] = [];

  for (const item of result.results ?? []) {
    if (!isSearchVideo(item)) continue;
    const track = toTrack(item);
    if (track) tracks.push(track);
    if (tracks.length >= limit) break;
  }

  return tracks;
}

export async function getYoutubeVideo(input: string): Promise<YoutubeTrack> {
  const id = extractVideoId(input);
  if (!id) throw new MediaProviderError('Hãy nhập một URL YouTube hợp lệ hoặc mã video 11 ký tự.', 'YOUTUBE_INVALID_URL');

  const youtube = await getYoutube();
  const info = await youtube.getBasicInfo(id);
  const basic = info.basic_info;
  const duration = typeof basic.duration === 'number' ? basic.duration : null;
  const title = asText(basic.title);
  const channel = asText(basic.author);
  if (!title || !channel) {
    throw new MediaProviderError('YouTube trả về metadata không đầy đủ cho video này.', 'YOUTUBE_INVALID_METADATA', true, 502);
  }

  return {
    provider: 'youtube',
    id,
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    duration,
    durationText: duration == null ? 'live' : formatDuration(duration),
    channel,
    channelId: basic.channel_id ?? null,
    thumbnail: basic.thumbnail?.at(-1)?.url ?? null
  };
}

export async function downloadAudio(videoId: string): Promise<ReadableStream<Uint8Array>> {
  const youtube = await getYoutube();
  return youtube.download(videoId, {
    // YouTube currently exposes direct progressive URLs more consistently
    // through the Android client. FFmpeg extracts the audio from this stream.
    client: 'ANDROID',
    type: 'video+audio',
    quality: 'best',
    format: 'mp4'
  });
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return 'live';
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remaining = safeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${minutes}:${String(remaining).padStart(2, '0')}`;
}
