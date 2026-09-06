import { formatDuration } from './youtube.js';
import { config } from './config.js';
import { MediaProviderError, type MediaAudioSource, type MediaTrack } from './media-types.js';
import { providerSettingsStore } from './provider-settings.js';

const API_BASE_URL = 'https://api.soundcloud.com';
const AUTH_URL = 'https://secure.soundcloud.com/oauth/token';
const REQUEST_TIMEOUT_MS = 15_000;

type SoundCloudUser = {
  id?: number | string;
  urn?: string;
  username?: string;
};

type SoundCloudTrack = {
  id?: number | string;
  urn?: string;
  title?: string;
  metadata_artist?: string;
  permalink_url?: string;
  duration?: number;
  artwork_url?: string | null;
  access?: string;
  user?: SoundCloudUser;
};

type SoundCloudToken = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

type TokenCache = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

let tokenCache: TokenCache | undefined;
let tokenRequest: Promise<string> | undefined;

/**
 * Bound connection/header wait without aborting a response body later.
 * A stream can legitimately last much longer than REQUEST_TIMEOUT_MS.
 */
async function fetchSoundCloud(input: string, init: RequestInit, message: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    throw new MediaProviderError(message, 'SOUNDCLOUD_NETWORK', true);
  } finally {
    clearTimeout(timeout);
  }
}

export function isSoundCloudConfigured(): boolean {
  return Boolean(config.soundcloudClientId && config.soundcloudClientSecret);
}

export function isSoundCloudEnabled(settings = providerSettingsStore): boolean {
  return settings.isSoundCloudEnabled();
}

export function isSoundCloudAvailable(settings = providerSettingsStore): boolean {
  return isSoundCloudConfigured() && isSoundCloudEnabled(settings);
}

function requireCredentials(): { clientId: string; clientSecret: string } {
  if (!isSoundCloudEnabled()) {
    throw new MediaProviderError(
      'SoundCloud đang được tắt trong Cài đặt. Hãy bật lại provider để tìm hoặc phát nhạc.',
      'SOUNDCLOUD_DISABLED'
    );
  }
  if (!isSoundCloudConfigured()) {
    throw new MediaProviderError(
      'SoundCloud chưa được cấu hình. Thêm SOUNDCLOUD_CLIENT_ID và SOUNDCLOUD_CLIENT_SECRET trong phần Cài đặt/env.',
      'SOUNDCLOUD_NOT_CONFIGURED'
    );
  }
  return {
    clientId: config.soundcloudClientId,
    clientSecret: config.soundcloudClientSecret
  };
}

function getErrorForStatus(status: number): MediaProviderError {
  if (status === 401) return new MediaProviderError('SoundCloud xác thực thất bại hoặc credential đã hết hạn.', 'SOUNDCLOUD_AUTH_FAILED', false, status);
  if (status === 403) return new MediaProviderError('SoundCloud từ chối quyền truy cập nội dung này.', 'SOUNDCLOUD_FORBIDDEN', false, status);
  if (status === 404) return new MediaProviderError('Không tìm thấy nội dung SoundCloud.', 'SOUNDCLOUD_NOT_FOUND', false, status);
  if (status === 429) return new MediaProviderError('SoundCloud đang giới hạn request. Hãy thử lại sau.', 'SOUNDCLOUD_RATE_LIMIT', true, status);
  return new MediaProviderError('SoundCloud không phản hồi thành công.', 'SOUNDCLOUD_REQUEST_FAILED', status >= 500, status);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function requestToken(grantType: 'client_credentials' | 'refresh_token', refreshToken?: string): Promise<string> {
  const { clientId, clientSecret } = requireCredentials();
  const body = new URLSearchParams({ grant_type: grantType });
  const headers: Record<string, string> = {
    accept: 'application/json; charset=utf-8',
    'content-type': 'application/x-www-form-urlencoded'
  };

  if (grantType === 'client_credentials') {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
    body.set('refresh_token', refreshToken ?? '');
  }

  const response = await fetchSoundCloud(AUTH_URL, {
    method: 'POST',
    headers,
    body
  }, 'Không thể kết nối SoundCloud.');

  if (!response.ok) throw getErrorForStatus(response.status);
  const payload = await readJson(response) as unknown as SoundCloudToken;
  if (!payload.access_token) {
    throw new MediaProviderError('SoundCloud trả về token không hợp lệ.', 'SOUNDCLOUD_AUTH_FAILED');
  }

  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 3600;
  tokenCache = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000
  };
  return payload.access_token;
}

export function shouldFallbackToClientCredentials(error: unknown): boolean {
  return error instanceof MediaProviderError
    && (error.code === 'SOUNDCLOUD_AUTH_FAILED' || error.status === 400 || error.status === 401);
}

async function getAccessToken(): Promise<string> {
  // Provider disable/config changes must take effect immediately, even when
  // an access token is still warm in memory. Do this before the cache fast
  // path so a disabled provider can never reuse a previously issued token.
  requireCredentials();
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.accessToken;
  if (!tokenRequest) {
    tokenRequest = (async () => {
      const refreshToken = tokenCache?.refreshToken;
      if (refreshToken) {
        try {
          return await requestToken('refresh_token', refreshToken);
        } catch (error) {
          // SoundCloud refresh tokens are single-use. A revoked/expired token
          // must not poison every future request; recover with a fresh app
          // token, while preserving transient network failures for retry.
          if (!shouldFallbackToClientCredentials(error)) throw error;
          tokenCache = undefined;
        }
      }
      return requestToken('client_credentials');
    })()
      .finally(() => {
        tokenRequest = undefined;
      });
  }
  return tokenRequest;
}

function apiUrl(pathname: string, params?: URLSearchParams): string {
  return `${API_BASE_URL}${pathname}${params && params.size > 0 ? `?${params.toString()}` : ''}`;
}

async function requestApiJson(pathname: string, params?: URLSearchParams, retry = true): Promise<Record<string, unknown>> {
  const token = await getAccessToken();
  const response = await fetchSoundCloud(apiUrl(pathname, params), {
    headers: {
      accept: 'application/json; charset=utf-8',
      authorization: `OAuth ${token}`
    }
  }, 'Không thể kết nối SoundCloud.');

  if (response.status === 401 && retry) {
    tokenCache = undefined;
    return requestApiJson(pathname, params, false);
  }
  if (!response.ok) throw getErrorForStatus(response.status);
  return readJson(response);
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function soundCloudArtistLabel(metadataArtist: unknown, uploaderName: unknown): string {
  return asText(metadataArtist, asText(uploaderName));
}

export function soundCloudTrackIdentity(urn: unknown, _legacyId?: unknown): string {
  // SoundCloud's numeric track id is deprecated. Do not surface an id-only
  // result that would later produce an invalid /streams request.
  return asText(urn);
}

export function soundCloudStreamsPath(trackUrn: string): string {
  return `/tracks/${encodeURIComponent(trackUrn)}/streams`;
}

function asHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function selectSoundCloudStreamUrl(payload: Record<string, unknown>): string | null {
  // The current official Streams response exposes signed HLS AAC URLs. Keep
  // the order explicit so a lower-quality fallback is used only when needed.
  return [payload.hls_aac_160_url, payload.hls_aac_96_url]
    .map(asHttpsUrl)
    .find((value): value is string => value !== null) ?? null;
}

function toTrack(raw: SoundCloudTrack, fallbackUrl?: string): MediaTrack {
  const id = soundCloudTrackIdentity(raw.urn, raw.id);
  if (!id) throw new MediaProviderError('SoundCloud trả về track thiếu định danh.', 'SOUNDCLOUD_INVALID_TRACK');
  if (raw.access === 'blocked') {
    throw new MediaProviderError('Track SoundCloud này bị giới hạn phát.', 'SOUNDCLOUD_TRACK_BLOCKED');
  }

  const duration = typeof raw.duration === 'number' && raw.duration >= 0
    ? Math.floor(raw.duration / 1000)
    : null;
  const title = asText(raw.title);
  // SoundCloud may expose the creator-facing artist credit separately from
  // the uploader profile. Prefer that value when present, while retaining the
  // profile name as a safe fallback for older/public responses.
  const channel = soundCloudArtistLabel(raw.metadata_artist, raw.user?.username);
  const url = asText(raw.permalink_url, fallbackUrl ?? '');
  if (!title || !channel || !url) {
    throw new MediaProviderError('SoundCloud trả về metadata không đầy đủ cho track này.', 'SOUNDCLOUD_INVALID_METADATA');
  }
  return {
    provider: 'soundcloud',
    id,
    title,
    url,
    duration,
    durationText: formatDuration(duration),
    channel,
    channelId: raw.user?.urn ?? null,
    thumbnail: raw.artwork_url ?? null
  };
}

function isSoundCloudUrl(input: string): boolean {
  try {
    const hostname = new URL(input.trim()).hostname.toLowerCase();
    return hostname === 'soundcloud.com' || hostname.endsWith('.soundcloud.com');
  } catch {
    return false;
  }
}

export async function searchSoundCloud(query: string, limit = 5): Promise<MediaTrack[]> {
  const params = new URLSearchParams({
    q: query.trim(),
    access: 'playable',
    linked_partitioning: 'true',
    limit: String(Math.min(Math.max(limit, 1), 50))
  });
  const payload = await requestApiJson('/tracks', params);
  const collection = Array.isArray(payload.collection) ? payload.collection : [];
  return collection
    .filter((item): item is SoundCloudTrack => Boolean(item && typeof item === 'object'))
    .flatMap((item) => {
      try {
        return [toTrack(item)];
      } catch {
        return [];
      }
    })
    .slice(0, limit);
}

export async function getSoundCloudTrack(input: string): Promise<MediaTrack> {
  if (!isSoundCloudUrl(input)) {
    throw new MediaProviderError('Hãy nhập một URL SoundCloud hợp lệ.', 'SOUNDCLOUD_INVALID_URL');
  }
  const params = new URLSearchParams({ url: input.trim() });
  const payload = await requestApiJson('/resolve', params);
  const type = asText(payload.kind ?? payload.type);
  if (type && type !== 'track') {
    throw new MediaProviderError('Hiện tại LocalBot chỉ resolve từng track SoundCloud, chưa mở rộng playlist.', 'SOUNDCLOUD_COLLECTION_UNSUPPORTED');
  }
  return toTrack(payload as SoundCloudTrack, input.trim());
}

export async function downloadSoundCloudAudio(track: MediaTrack): Promise<MediaAudioSource> {
  return downloadSoundCloudAudioInternal(track, true);
}

/**
 * Performs an authenticated, minimal official API request without returning
 * provider data. The control plane uses this for a redacted connection test.
 */
export async function testSoundCloudConnection(): Promise<void> {
  await requestApiJson('/tracks', new URLSearchParams({ q: 'localbot-connection-test', limit: '1' }));
}

async function downloadSoundCloudAudioInternal(track: MediaTrack, retry: boolean): Promise<MediaAudioSource> {
  const payload = await requestApiJson(soundCloudStreamsPath(track.id), undefined, retry);
  const streamUrl = selectSoundCloudStreamUrl(payload);
  if (!streamUrl) {
    throw new MediaProviderError(
      'Track SoundCloud không có HLS AAC stream khả dụng.',
      'SOUNDCLOUD_NO_STREAM'
    );
  }

  // Keep the signed manifest URL private to the Node runtime. FFmpeg consumes
  // it directly so HLS segment resolution retains its base URL.
  return { kind: 'url', url: streamUrl };
}
