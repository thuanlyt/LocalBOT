import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config } from './config.js';
import { loadJsonStore, saveJsonStoreAtomic } from './persistence.js';
import type { MediaTrack } from './media-types.js';

export type Playlist = {
  id: string;
  guildId: string;
  name: string;
  description: string;
  tracks: MediaTrack[];
  createdAt: string;
  updatedAt: string;
};

type PlaylistFile = {
  version: 1;
  playlists: Playlist[];
};

export type PlaylistUpdate = {
  name?: string;
  description?: string;
};

export type PlaylistStoreOptions = {
  filePath?: string;
};

function createEmptyPlaylistFile(): PlaylistFile {
  return { version: 1, playlists: [] };
}

function isPlaylistFile(parsed: unknown): parsed is PlaylistFile {
  return Boolean(parsed) && typeof parsed === 'object' && (parsed as PlaylistFile).version === 1 && Array.isArray((parsed as PlaylistFile).playlists);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase('vi-VN');
}

function validateName(name: string): string {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Tên playlist không được để trống.');
  if (cleanName.length > 80) throw new Error('Tên playlist tối đa 80 ký tự.');
  return cleanName;
}

function validateDescription(description: string | undefined): string {
  const cleanDescription = description?.trim() ?? '';
  if (cleanDescription.length > 500) throw new Error('Mô tả playlist tối đa 500 ký tự.');
  return cleanDescription;
}

export class PlaylistStore {
  private readonly filePath: string;
  private dataPromise: Promise<PlaylistFile> | undefined;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(options: PlaylistStoreOptions = {}) {
    this.filePath = path.resolve(options.filePath ?? config.playlistsFile);
  }

  private async load(): Promise<PlaylistFile> {
    if (!this.dataPromise) {
      this.dataPromise = loadJsonStore(this.filePath, isPlaylistFile, createEmptyPlaylistFile, 'Không thể đọc dữ liệu playlist local.').then((result) => result.data);
    }
    return this.dataPromise!;
  }

  private async save(data: PlaylistFile): Promise<void> {
    await saveJsonStoreAtomic(this.filePath, data);
  }

  private async mutate<T>(operation: (data: PlaylistFile) => T | Promise<T>): Promise<T> {
    let result!: T;
    const task = this.mutationTail.then(async () => {
      const data = await this.load();
      result = await operation(data);
      await this.save(data);
    });
    this.mutationTail = task.then(() => undefined, () => undefined);
    await task;
    return result;
  }

  private async readData(): Promise<PlaylistFile> {
    await this.mutationTail;
    return this.load();
  }

  async list(guildId: string): Promise<Playlist[]> {
    const data = await this.readData();
    return clone(data.playlists.filter((playlist) => playlist.guildId === guildId));
  }

  async find(guildId: string, name: string): Promise<Playlist | null> {
    const target = normalizeName(name);
    const data = await this.readData();
    const playlist = data.playlists.find((item) => item.guildId === guildId && normalizeName(item.name) === target);
    return playlist ? clone(playlist) : null;
  }

  async create(guildId: string, name: string, description?: string): Promise<Playlist> {
    const cleanName = validateName(name);
    const cleanDescription = validateDescription(description);
    return this.mutate((data) => {
      if (data.playlists.some((playlist) => playlist.guildId === guildId && normalizeName(playlist.name) === normalizeName(cleanName))) {
        throw new Error('Playlist cùng tên đã tồn tại trong server này.');
      }
      const now = new Date().toISOString();
      const playlist: Playlist = {
        id: randomUUID(),
        guildId,
        name: cleanName,
        description: cleanDescription,
        tracks: [],
        createdAt: now,
        updatedAt: now
      };
      data.playlists.push(playlist);
      return clone(playlist);
    });
  }

  async update(guildId: string, currentName: string, update: PlaylistUpdate): Promise<Playlist | null> {
    const cleanName = update.name == null ? undefined : validateName(update.name);
    const cleanDescription = update.description == null ? undefined : validateDescription(update.description);
    return this.mutate((data) => {
      const playlist = data.playlists.find((item) => item.guildId === guildId && normalizeName(item.name) === normalizeName(currentName));
      if (!playlist) return null;
      if (cleanName && data.playlists.some((item) => item !== playlist && item.guildId === guildId && normalizeName(item.name) === normalizeName(cleanName))) {
        throw new Error('Playlist cùng tên đã tồn tại trong server này.');
      }
      if (cleanName) playlist.name = cleanName;
      if (cleanDescription !== undefined) playlist.description = cleanDescription;
      playlist.updatedAt = new Date().toISOString();
      return clone(playlist);
    });
  }

  async remove(guildId: string, name: string): Promise<Playlist | null> {
    return this.mutate((data) => {
      const index = data.playlists.findIndex((item) => item.guildId === guildId && normalizeName(item.name) === normalizeName(name));
      if (index < 0) return null;
      const [removed] = data.playlists.splice(index, 1);
      return removed ? clone(removed) : null;
    });
  }

  async addTrack(guildId: string, name: string, track: MediaTrack): Promise<Playlist | null> {
    return this.mutate((data) => {
      const playlist = data.playlists.find((item) => item.guildId === guildId && normalizeName(item.name) === normalizeName(name));
      if (!playlist) return null;
      if (!playlist.tracks.some((item) => item.provider === track.provider && item.id === track.id)) playlist.tracks.push(track);
      playlist.updatedAt = new Date().toISOString();
      return clone(playlist);
    });
  }

  async removeTrack(guildId: string, name: string, position: number): Promise<MediaTrack | null> {
    return this.mutate((data) => {
      const playlist = data.playlists.find((item) => item.guildId === guildId && normalizeName(item.name) === normalizeName(name));
      if (!playlist || !Number.isInteger(position) || position < 1 || position > playlist.tracks.length) return null;
      const [removed] = playlist.tracks.splice(position - 1, 1);
      playlist.updatedAt = new Date().toISOString();
      return removed ? clone(removed) : null;
    });
  }

  async moveTrack(guildId: string, name: string, from: number, to: number): Promise<Playlist | null> {
    return this.mutate((data) => {
      const playlist = data.playlists.find((item) => item.guildId === guildId && normalizeName(item.name) === normalizeName(name));
      if (!playlist || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1 || from > playlist.tracks.length || to > playlist.tracks.length) return null;
      if (from !== to) {
        const [track] = playlist.tracks.splice(from - 1, 1);
        if (track) playlist.tracks.splice(to - 1, 0, track);
        playlist.updatedAt = new Date().toISOString();
      }
      return clone(playlist);
    });
  }
}

export const playlistStore = new PlaylistStore();
