import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectSoundCloudStreamUrl,
  shouldFallbackToClientCredentials,
  soundCloudArtistLabel,
  soundCloudStreamsPath,
  soundCloudTrackIdentity,
  testSoundCloudConnection
} from './soundcloud.js';
import { MediaProviderError } from './media-types.js';
import { config } from './config.js';
import { providerSettingsStore } from './provider-settings.js';

test('SoundCloud prefers creator-facing metadata_artist over uploader profile', () => {
  assert.equal(soundCloudArtistLabel('  Sơn Tùng M-TP  ', 'uploader-profile'), 'Sơn Tùng M-TP');
});

test('SoundCloud falls back to uploader profile when metadata_artist is absent', () => {
  assert.equal(soundCloudArtistLabel(undefined, 'uploader-profile'), 'uploader-profile');
  assert.equal(soundCloudArtistLabel('   ', 'uploader-profile'), 'uploader-profile');
});

test('SoundCloud uses the official URN as canonical identity before numeric id', () => {
  assert.equal(soundCloudTrackIdentity('soundcloud:tracks:123', 123), 'soundcloud:tracks:123');
  assert.equal(soundCloudTrackIdentity(undefined, 123), '');
});

test('SoundCloud builds the current URN-based streams endpoint', () => {
  assert.equal(soundCloudStreamsPath('soundcloud:tracks:123'), '/tracks/soundcloud%3Atracks%3A123/streams');
});

test('SoundCloud prefers HLS AAC 160 and falls back to HLS AAC 96', () => {
  assert.equal(
    selectSoundCloudStreamUrl({
      hls_aac_160_url: 'https://cdn.example.test/high.m3u8',
      hls_aac_96_url: 'https://cdn.example.test/fallback.m3u8'
    }),
    'https://cdn.example.test/high.m3u8'
  );
  assert.equal(
    selectSoundCloudStreamUrl({ hls_aac_160_url: '', hls_aac_96_url: 'https://cdn.example.test/fallback.m3u8' }),
    'https://cdn.example.test/fallback.m3u8'
  );
});

test('SoundCloud rejects unsafe and progressive-only stream payloads', () => {
  assert.equal(selectSoundCloudStreamUrl({ hls_aac_160_url: 'http://cdn.example.test/stream.m3u8' }), null);
  assert.equal(selectSoundCloudStreamUrl({ transcodings: [{ format: { protocol: 'progressive' }, url: 'https://cdn.example.test/audio.mp3' }] }), null);
});

test('SoundCloud refresh recovery falls back only for invalid auth state', () => {
  assert.equal(shouldFallbackToClientCredentials(new MediaProviderError('expired', 'SOUNDCLOUD_AUTH_FAILED', false, 401)), true);
  assert.equal(shouldFallbackToClientCredentials(new MediaProviderError('bad grant', 'SOUNDCLOUD_REQUEST_FAILED', false, 400)), true);
  assert.equal(shouldFallbackToClientCredentials(new MediaProviderError('offline', 'SOUNDCLOUD_NETWORK', true)), false);
  assert.equal(shouldFallbackToClientCredentials(new Error('unexpected')), false);
});

test('SoundCloud connection recovery exchanges a rejected refresh token for a fresh app token', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const originalClientId = config.soundcloudClientId;
  const originalClientSecret = config.soundcloudClientSecret;
  const calls: Array<{ url: string; method: string; authorization: string; body: string }> = [];
  let authCall = 0;
  let now = 1_000_000;

  config.soundcloudClientId = 'test-client-id';
  config.soundcloudClientSecret = 'test-client-secret';
  Date.now = () => now;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = String(init?.body ?? '');
    calls.push({ url, method: init?.method ?? 'GET', authorization: headers.get('authorization') ?? '', body });

    if (url === 'https://secure.soundcloud.com/oauth/token') {
      authCall += 1;
      if (authCall === 1) {
        return new Response(JSON.stringify({ access_token: 'access-one', refresh_token: 'refresh-one', expires_in: 3600 }), { status: 200 });
      }
      if (authCall === 2) return new Response('{}', { status: 400 });
      return new Response(JSON.stringify({ access_token: 'access-two', expires_in: 3600 }), { status: 200 });
    }

    return new Response(JSON.stringify({ collection: [] }), { status: 200 });
  };

  try {
    await testSoundCloudConnection();
    now = 5_000_000;
    await testSoundCloudConnection();

    const authCalls = calls.filter((call) => call.url === 'https://secure.soundcloud.com/oauth/token');
    assert.equal(authCalls.length, 3);
    assert.equal(authCalls[0]?.authorization.startsWith('Basic '), true);
    assert.equal(authCalls[1]?.authorization, '');
    assert.match(authCalls[1]?.body ?? '', /grant_type=refresh_token/);
    assert.equal(authCalls[2]?.authorization.startsWith('Basic '), true);
    assert.equal(calls.filter((call) => call.url.startsWith('https://api.soundcloud.com/tracks')).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    config.soundcloudClientId = originalClientId;
    config.soundcloudClientSecret = originalClientSecret;
  }
});

test('SoundCloud disable blocks a warm cached token before any provider request', async () => {
  const originalEnabledCheck = providerSettingsStore.isSoundCloudEnabled;
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  providerSettingsStore.isSoundCloudEnabled = () => false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response('{}', { status: 200 });
  };

  try {
    await assert.rejects(
      () => testSoundCloudConnection(),
      (error: unknown) => error instanceof MediaProviderError && error.code === 'SOUNDCLOUD_DISABLED'
    );
    assert.equal(fetchCalled, false);
  } finally {
    providerSettingsStore.isSoundCloudEnabled = originalEnabledCheck;
    globalThis.fetch = originalFetch;
  }
});
