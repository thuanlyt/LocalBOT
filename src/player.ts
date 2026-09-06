import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { Readable } from 'node:stream';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  entersState,
  type AudioPlayer,
  type AudioResource
} from '@discordjs/voice';
import { ChannelType, type Channel, type VoiceBasedChannel } from 'discord.js';
import ffmpegPath from 'ffmpeg-static';
import { buildEqualizerFilter, equalizerStore } from './equalizer.js';
import { downloadMediaAudio, type MediaTrack } from './media.js';
import { MusicQueue, type QueueSnapshot, type RepeatMode } from './queue.js';
import { playerStateStore } from './player-state.js';

export type PlayerStatus = 'idle' | 'buffering' | 'playing' | 'paused';

export type PlayerSnapshot = QueueSnapshot & {
  guildId: string;
  voiceChannelId: string;
  status: PlayerStatus;
  volumePercent: number;
  positionSeconds: number;
  durationSeconds: number | null;
  stateVersion: number;
};

type AdvanceReason = 'finished' | 'skip' | 'error';

type GuildPlayerState = {
  guildId: string;
  voiceChannelId: string;
  connection: VoiceConnection;
  player: AudioPlayer;
  queue: MusicQueue;
  resource: AudioResource | null;
  volumePercent: number;
  ffmpeg: ChildProcessWithoutNullStreams | null;
  mediaInput: Readable | null;
  status: PlayerStatus;
  stateVersion: number;
  progressTimer: ReturnType<typeof setInterval> | null;
  operationId: number;
  skipRequested: boolean;
  stopRequested: boolean;
  ignoreNextIdle: boolean;
  advancing: boolean;
};

const guildPlayers = new Map<string, GuildPlayerState>();
type PlayerListener = (snapshot: PlayerSnapshot | null) => void;
const playerListeners = new Map<string, Set<PlayerListener>>();

function requireFfmpeg(): string {
  if (!ffmpegPath) throw new Error('Không tìm thấy FFmpeg đi kèm LocalBot.');
  return ffmpegPath;
}

function persistPlayerState(state: GuildPlayerState): void {
  void playerStateStore.save(state.guildId, state.queue.snapshot(), state.volumePercent).catch((error) => {
    console.error(`[player-state:${state.guildId}]`, error instanceof Error ? error.message : error);
  });
}

function touch(state: GuildPlayerState, persist = false): void {
  state.stateVersion += 1;
  if (persist) persistPlayerState(state);
  const listeners = playerListeners.get(state.guildId);
  if (!listeners) return;
  const snapshot = getPlayerSnapshot(state.guildId);
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error(`[player-events:${state.guildId}]`, error instanceof Error ? error.message : error);
    }
  }
}

function stopProgressTicker(state: GuildPlayerState): void {
  if (!state.progressTimer) return;
  clearInterval(state.progressTimer);
  state.progressTimer = null;
}

function startProgressTicker(state: GuildPlayerState): void {
  if (state.progressTimer) return;
  state.progressTimer = setInterval(() => {
    if (state.status === 'playing') touch(state);
  }, 1_000);
}

export function subscribePlayer(guildId: string, listener: PlayerListener): () => void {
  const listeners = playerListeners.get(guildId) ?? new Set<PlayerListener>();
  listeners.add(listener);
  playerListeners.set(guildId, listeners);
  listener(getPlayerSnapshot(guildId));
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) playerListeners.delete(guildId);
  };
}

function createState(channel: VoiceBasedChannel): GuildPlayerState {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: true
  });
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play }
  });
  const state: GuildPlayerState = {
    guildId: channel.guild.id,
    voiceChannelId: channel.id,
    connection,
    player,
    queue: new MusicQueue(),
    resource: null,
    volumePercent: 100,
    ffmpeg: null,
    mediaInput: null,
    status: 'idle',
    stateVersion: 0,
    progressTimer: null,
    operationId: 0,
    skipRequested: false,
    stopRequested: false,
    ignoreNextIdle: false,
    advancing: false
  };

  const restored = playerStateStore.get(channel.guild.id);
  if (restored) {
    state.queue.restore(restored.queue);
    state.volumePercent = restored.volumePercent;
  }

  connection.subscribe(player);
  player.on(AudioPlayerStatus.Playing, () => {
    state.status = 'playing';
    startProgressTicker(state);
    touch(state);
  });
  player.on(AudioPlayerStatus.Paused, () => {
    state.status = 'paused';
    stopProgressTicker(state);
    touch(state);
  });
  player.on(AudioPlayerStatus.Buffering, () => {
    state.status = 'buffering';
    stopProgressTicker(state);
    touch(state);
  });
  player.on(AudioPlayerStatus.Idle, () => {
    stopProgressTicker(state);
    if (state.ignoreNextIdle) {
      state.ignoreNextIdle = false;
      return;
    }
    if (state.stopRequested) {
      state.stopRequested = false;
      state.status = 'idle';
      touch(state);
      return;
    }
    advance(state, state.skipRequested ? 'skip' : 'finished');
    state.skipRequested = false;
  });
  player.on('error', (error) => {
    console.error(`[player:${channel.guild.id}]`, error.message);
    if (state.stopRequested || state.advancing) return;
    state.ignoreNextIdle = true;
    advance(state, 'error');
  });
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
      ]);
    } catch {
      destroyGuildPlayer(channel.guild.id);
    }
  });

  guildPlayers.set(channel.guild.id, state);
  return state;
}

function getState(guildId: string): GuildPlayerState | undefined {
  return guildPlayers.get(guildId);
}

function webStreamToNodeStream(stream: ReadableStream<Uint8Array>): Readable {
  return Readable.from((async function* () {
    const reader = stream.getReader();
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        if (result.value) yield result.value;
      }
    } finally {
      reader.releaseLock();
    }
  })());
}

async function startTrack(state: GuildPlayerState, track: MediaTrack): Promise<void> {
  const operationId = ++state.operationId;
  state.status = 'buffering';
  touch(state);

  try {
    const source = await downloadMediaAudio(track);
    const input = source.kind === 'stream' ? webStreamToNodeStream(source.stream) : null;
    const equalizerFilter = buildEqualizerFilter(equalizerStore.get(state.guildId));
    const ffmpeg = spawn(requireFfmpeg(), [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', source.kind === 'stream' ? 'pipe:0' : source.url,
      ...(equalizerFilter ? ['-af', equalizerFilter] : []),
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    // On Windows, child-process stdio is backed by Socket handles. Killing
    // FFmpeg while a WebStream is still piping into stdin can otherwise emit
    // an unhandled `write EOF` and terminate the whole bot process.
    const reportStreamError = (streamName: string) => (error: Error) => {
      if (state.operationId === operationId && !state.stopRequested) {
        console.error(`[${streamName}:${state.guildId}]`, error.message);
      }
    };
    input?.on('error', reportStreamError('media-input'));
    ffmpeg.stdin.on('error', reportStreamError('ffmpeg-stdin'));
    ffmpeg.stdout.on('error', reportStreamError('ffmpeg-stdout'));
    ffmpeg.stderr.on('error', reportStreamError('ffmpeg-stderr'));

    if (state.operationId !== operationId || state.queue.current !== track) {
      ffmpeg.kill();
      input?.destroy();
      return;
    }

    state.ffmpeg = ffmpeg;
    state.mediaInput = input;
    if (input) input.pipe(ffmpeg.stdin);
    else ffmpeg.stdin.end();
    ffmpeg.stderr.on('data', (data: Buffer) => {
      console.error(`[ffmpeg:${state.guildId}] ${data.toString().trim()}`);
    });
    ffmpeg.once('close', () => {
      if (state.ffmpeg === ffmpeg) {
        state.ffmpeg = null;
        if (state.mediaInput === input) state.mediaInput = null;
      }
    });

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw,
      metadata: track,
      inlineVolume: true
    });
    resource.volume?.setVolume(state.volumePercent / 100);
    state.resource = resource;
    state.player.play(resource);
  } catch (error) {
    if (state.operationId !== operationId || state.stopRequested) return;
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(`[media:${state.guildId}:${track.provider}]`, message);
    // A resolve/spawn failure can happen before AudioPlayer ever entered a
    // playing state. Do not leave a stale "ignore one Idle" flag behind, or
    // the next healthy track could finish without advancing the queue.
    if (state.resource) state.ignoreNextIdle = true;
    advance(state, 'error');
  }
}

function advance(state: GuildPlayerState, reason: AdvanceReason): void {
  if (state.advancing) return;
  state.advancing = true;
  state.operationId += 1;
  stopMediaPipeline(state);
  state.resource = null;

  const next = reason === 'finished'
    ? state.queue.completeCurrent()
    : reason === 'skip'
      ? state.queue.skipCurrent()
      : state.queue.failCurrent();

  state.status = next ? 'buffering' : 'idle';
  stopProgressTicker(state);
  touch(state, true);
  state.advancing = false;
  if (next) void startTrack(state, next);
}

function stopMediaPipeline(state: GuildPlayerState): void {
  const input = state.mediaInput;
  state.mediaInput = null;
  input?.destroy();

  const ffmpeg = state.ffmpeg;
  state.ffmpeg = null;
  if (!ffmpeg) return;
  ffmpeg.stdin.destroy();
  ffmpeg.stdout.destroy();
  ffmpeg.stderr.destroy();
  if (!ffmpeg.killed) ffmpeg.kill();
}

function startCurrent(state: GuildPlayerState): void {
  const track = state.queue.current ?? state.queue.takeNext();
  if (track) {
    persistPlayerState(state);
    void startTrack(state, track);
  }
}

export function getOrCreatePlayer(channel: VoiceBasedChannel): GuildPlayerState {
  const existing = getState(channel.guild.id);
  if (existing) {
    if (existing.voiceChannelId !== channel.id) {
      throw new Error('LocalBot đang ở voice channel khác. Hãy dùng `/leave` trước khi đổi channel.');
    }
    return existing;
  }
  return createState(channel);
}

/**
 * Join (or move to) a guild voice channel while preserving the queue and
 * current player. This is used by the native control surface and `/join`.
 */
export function joinOrMovePlayer(channel: VoiceBasedChannel): GuildPlayerState {
  const existing = getState(channel.guild.id);
  if (!existing) return createState(channel);
  if (existing.voiceChannelId === channel.id) return existing;

  if (!existing.connection.rejoin({ channelId: channel.id, selfDeaf: true, selfMute: false })) {
    throw new Error('LocalBot không thể chuyển sang voice channel đã chọn.');
  }
  existing.voiceChannelId = channel.id;
  touch(existing);
  return existing;
}

export function getQueue(guildId: string): QueueSnapshot {
  return getState(guildId)?.queue.snapshot() ?? {
    current: null,
    queue: [],
    history: [],
    shuffle: false,
    repeatMode: 'off'
  };
}

export function getPlayerSnapshot(guildId: string): PlayerSnapshot | null {
  const state = getState(guildId);
  if (!state) return null;
  return {
    ...state.queue.snapshot(),
    guildId: state.guildId,
    voiceChannelId: state.voiceChannelId,
    status: state.status,
    volumePercent: state.volumePercent,
    positionSeconds: state.resource ? Math.max(0, state.resource.playbackDuration / 1_000) : 0,
    durationSeconds: state.queue.current?.duration ?? null,
    stateVersion: state.stateVersion
  };
}

export function normalizeVolumePercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function setVolume(guildId: string, percent: number): number | null {
  const state = getState(guildId);
  if (!state) return null;
  state.volumePercent = normalizeVolumePercent(percent);
  state.resource?.volume?.setVolume(state.volumePercent / 100);
  touch(state, true);
  return state.volumePercent;
}

export function enqueue(guildId: string, track: MediaTrack): number {
  const state = getState(guildId);
  if (!state) throw new Error('Bot chưa tham gia voice channel.');
  const position = state.queue.add(track);
  touch(state, true);
  if (!state.queue.current) startCurrent(state);
  return position;
}

export function removeFromQueue(guildId: string, position: number): MediaTrack | null {
  const state = getState(guildId);
  const removed = state?.queue.removeAt(position - 1) ?? null;
  if (removed && state) touch(state, true);
  return removed;
}

export function moveInQueue(guildId: string, from: number, to: number): boolean {
  const state = getState(guildId);
  const moved = state?.queue.move(from - 1, to - 1) ?? false;
  if (moved && state) touch(state, true);
  return moved;
}

export function clearQueue(guildId: string): boolean {
  const state = getState(guildId);
  if (!state) return false;
  state.queue.clearPending();
  touch(state, true);
  return true;
}

export function toggleShuffle(guildId: string): boolean | null {
  const state = getState(guildId);
  if (!state) return null;
  const enabled = state.queue.toggleShuffle();
  touch(state, true);
  return enabled;
}

export function setRepeatMode(guildId: string, mode: RepeatMode): RepeatMode | null {
  const state = getState(guildId);
  if (!state) return null;
  const repeatMode = state.queue.setRepeatMode(mode);
  touch(state, true);
  return repeatMode;
}

export function cycleRepeat(guildId: string): RepeatMode | null {
  const state = getState(guildId);
  if (!state) return null;
  const repeatMode = state.queue.cycleRepeat();
  touch(state, true);
  return repeatMode;
}

export function skip(guildId: string): MediaTrack | null {
  const state = getState(guildId);
  const skipped = state?.queue.current ?? null;
  if (!state || !skipped) return null;
  const playerWasIdle = state.player.state.status === AudioPlayerStatus.Idle;
  state.skipRequested = true;
  state.player.stop(true);
  stopMediaPipeline(state);
  state.resource = null;
  touch(state, true);
  if (playerWasIdle) {
    state.skipRequested = false;
    advance(state, 'skip');
  }
  return skipped;
}

export function previous(guildId: string): MediaTrack | null {
  const state = getState(guildId);
  if (!state || !state.queue.current) return null;
  const playerWasIdle = state.player.state.status === AudioPlayerStatus.Idle;
  state.operationId += 1;
  state.ignoreNextIdle = !playerWasIdle;
  state.player.stop(true);
  stopMediaPipeline(state);
  state.resource = null;
  const previousTrack = state.queue.previous();
  state.status = previousTrack ? 'buffering' : 'idle';
  touch(state, true);
  if (previousTrack) void startTrack(state, previousTrack);
  return previousTrack;
}

export function pause(guildId: string): boolean {
  const state = getState(guildId);
  return state ? state.player.pause(true) : false;
}

export function resume(guildId: string): boolean {
  const state = getState(guildId);
  if (!state) return false;
  if (state.player.state.status === AudioPlayerStatus.Idle && state.queue.current) {
    void startTrack(state, state.queue.current);
    return true;
  }
  return state.player.unpause();
}

export function stop(guildId: string): void {
  const state = getState(guildId);
  if (!state) return;
  const playerWasIdle = state.player.state.status === AudioPlayerStatus.Idle;
  state.stopRequested = true;
  state.operationId += 1;
  state.queue.clear();
  state.player.stop(true);
  stopMediaPipeline(state);
  state.resource = null;
  state.status = 'idle';
  stopProgressTicker(state);
  touch(state, true);
  if (playerWasIdle) state.stopRequested = false;
}

export function destroyGuildPlayer(guildId: string): void {
  const state = guildPlayers.get(guildId);
  if (!state) return;
  stop(guildId);
  state.connection.destroy();
  guildPlayers.delete(guildId);
  const listeners = playerListeners.get(guildId);
  if (listeners) {
    for (const listener of listeners) {
      try {
        listener(null);
      } catch (error) {
        console.error(`[player-events:${guildId}]`, error instanceof Error ? error.message : error);
      }
    }
  }
}

export function destroyAllPlayers(): void {
  for (const guildId of [...guildPlayers.keys()]) destroyGuildPlayer(guildId);
}

export function isVoiceChannel(channel: Channel | null | undefined): channel is VoiceBasedChannel {
  return Boolean(channel && [
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice
  ].includes(channel.type));
}

export type { RepeatMode } from './queue.js';
