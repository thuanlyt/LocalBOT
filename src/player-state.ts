import path from 'node:path';
import { config } from './config.js';
import { loadJsonStore, saveJsonStoreAtomic } from './persistence.js';
import type { MediaTrack } from './media-types.js';
import type { QueueSnapshot, RepeatMode } from './queue.js';

const MAX_PENDING = 500;
const MAX_HISTORY = 100;

export type PersistedPlayerState = {
  queue: QueueSnapshot;
  volumePercent: number;
};

type PlayerStateFile = {
  version: 1;
  guilds: Record<string, PersistedPlayerState>;
};

function createEmptyPlayerStateFile(): PlayerStateFile {
  return { version: 1, guilds: {} };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMediaTrack(value: unknown): value is MediaTrack {
  if (!isObject(value)) return false;
  return (value.provider === 'youtube' || value.provider === 'soundcloud')
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.url === 'string'
    && (value.duration === null || (typeof value.duration === 'number' && Number.isFinite(value.duration) && value.duration >= 0))
    && typeof value.durationText === 'string'
    && typeof value.channel === 'string'
    && (value.channelId === null || typeof value.channelId === 'string')
    && (value.thumbnail === null || typeof value.thumbnail === 'string');
}

function isRepeatMode(value: unknown): value is RepeatMode {
  return value === 'off' || value === 'all' || value === 'one';
}

function isQueueSnapshot(value: unknown): value is QueueSnapshot {
  if (!isObject(value)) return false;
  return (value.current === null || isMediaTrack(value.current))
    && Array.isArray(value.queue)
    && value.queue.length <= MAX_PENDING
    && value.queue.every(isMediaTrack)
    && Array.isArray(value.history)
    && value.history.length <= MAX_HISTORY
    && value.history.every(isMediaTrack)
    && typeof value.shuffle === 'boolean'
    && isRepeatMode(value.repeatMode);
}

function isPersistedPlayerState(value: unknown): value is PersistedPlayerState {
  if (!isObject(value)) return false;
  return isQueueSnapshot(value.queue)
    && typeof value.volumePercent === 'number'
    && Number.isInteger(value.volumePercent)
    && value.volumePercent >= 0
    && value.volumePercent <= 100;
}

function isPlayerStateFile(value: unknown): value is PlayerStateFile {
  if (!isObject(value) || value.version !== 1 || !isObject(value.guilds)) return false;
  return Object.values(value.guilds).every(isPersistedPlayerState);
}

function clampVolume(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export class PlayerStateStore {
  private readonly filePath: string;
  private data: PlayerStateFile | null = null;
  private dataPromise: Promise<PlayerStateFile> | undefined;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(filePath = config.playerStateFile) {
    this.filePath = path.resolve(filePath);
  }

  async load(): Promise<PlayerStateFile> {
    if (!this.dataPromise) {
      this.dataPromise = loadJsonStore(this.filePath, isPlayerStateFile, createEmptyPlayerStateFile, 'Không thể đọc trạng thái player local.')
        .then((result) => {
          this.data = result.data;
          return result.data;
        });
    }
    return this.dataPromise;
  }

  get(guildId: string): PersistedPlayerState | null {
    const state = this.data?.guilds[guildId];
    return state ? structuredClone(state) : null;
  }

  async save(guildId: string, snapshot: QueueSnapshot, volumePercent: number): Promise<void> {
    const task = this.mutationTail.then(async () => {
      const data = await this.load();
      data.guilds[guildId] = {
        queue: {
          current: null,
          queue: snapshot.queue.slice(0, MAX_PENDING),
          history: snapshot.history.slice(-MAX_HISTORY),
          shuffle: snapshot.shuffle,
          repeatMode: snapshot.repeatMode
        },
        volumePercent: clampVolume(volumePercent)
      };
      await saveJsonStoreAtomic(this.filePath, data);
    });
    this.mutationTail = task.then(() => undefined, () => undefined);
    await task;
  }
}

export const playerStateStore = new PlayerStateStore();

export type { PlayerStateFile };
