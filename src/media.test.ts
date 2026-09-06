import test from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateMediaTracks, normalizeMediaText } from './media-types.js';
import { providerFromUrl, resolveMedia } from './media.js';
import type { MediaTrack } from './media-types.js';

const makeTrack = (provider: MediaTrack['provider'], id: string, title: string, channel: string): MediaTrack => ({
  provider,
  id,
  title,
  url: provider === 'youtube' ? `https://youtube.com/watch?v=${id}` : `https://soundcloud.com/${id}`,
  duration: 180,
  durationText: '3:00',
  channel,
  channelId: null,
  thumbnail: null
});

test('detects supported media URLs without accepting unrelated hosts', () => {
  assert.equal(providerFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube');
  assert.equal(providerFromUrl('https://soundcloud.com/artist/track'), 'soundcloud');
  assert.equal(providerFromUrl('https://notyoutube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(providerFromUrl('https://example.com/track'), null);
  assert.equal(providerFromUrl('lofi chill'), null);
});

test('rejects unsupported provider links instead of searching them as plain text', async () => {
  await assert.rejects(
    resolveMedia('https://example.com/track/123'),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'UNSUPPORTED_SOURCE_URL'
  );
});

test('deduplicates equivalent cross-provider discovery results conservatively', () => {
  assert.equal(normalizeMediaText('Đom Đóm (Official Video)'),'dom dom');
  const tracks = [
    makeTrack('youtube', 'youtube-id', 'Đom Đóm (Official Video)', 'Sơn Tùng M-TP'),
    makeTrack('soundcloud', 'soundcloud-id', 'Dom Dom', 'Son Tung M-TP'),
    makeTrack('youtube', 'another-id', 'Một bài khác', 'Sơn Tùng M-TP')
  ];
  assert.deepEqual(deduplicateMediaTracks(tracks).map((track) => track.id), ['youtube-id', 'another-id']);
});

test('deduplicates cross-provider versions with small duration drift', () => {
  const youtube = makeTrack('youtube', 'youtube-id', 'Nơi Này Có Anh (Official Music Video)', 'Sơn Tùng M-TP Official');
  const soundcloud = { ...makeTrack('soundcloud', 'soundcloud-id', 'Nơi Này Có Anh', 'another-upload-label'), duration: 184, durationText: '3:04' };
  assert.deepEqual(deduplicateMediaTracks([youtube, soundcloud]).map((track) => track.id), ['youtube-id']);
});
