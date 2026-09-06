import path from 'node:path';
import { config } from './config.js';
import { loadJsonStore, saveJsonStoreAtomic } from './persistence.js';

export type MusicPermissionMode = 'allowlist' | 'all';

export type GuildMusicPermissions = {
  mode: MusicPermissionMode;
  userIds: string[];
};

type PermissionFile = {
  version: 1;
  guilds: Record<string, GuildMusicPermissions>;
};

function createEmptyPermissionFile(): PermissionFile {
  return { version: 1, guilds: {} };
}

function isPermissionFile(parsed: unknown): parsed is PermissionFile {
  return Boolean(parsed) && typeof parsed === 'object' && (parsed as PermissionFile).version === 1 && typeof (parsed as PermissionFile).guilds === 'object' && (parsed as PermissionFile).guilds !== null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MusicPermissionStore {
  private readonly filePath: string;
  private dataPromise: Promise<PermissionFile> | undefined;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(filePath = config.musicPermissionsFile) {
    this.filePath = path.resolve(filePath);
  }

  private async load(): Promise<PermissionFile> {
    if (!this.dataPromise) {
      this.dataPromise = loadJsonStore(this.filePath, isPermissionFile, createEmptyPermissionFile, 'Không thể đọc cấu hình quyền Music local.').then((result) => result.data);
    }
    return this.dataPromise!;
  }

  private async save(data: PermissionFile): Promise<void> {
    await saveJsonStoreAtomic(this.filePath, data);
  }

  private async mutate<T>(operation: (data: PermissionFile) => T | Promise<T>): Promise<T> {
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

  private async readData(): Promise<PermissionFile> {
    await this.mutationTail;
    return this.load();
  }

  async get(guildId: string): Promise<GuildMusicPermissions> {
    const data = await this.readData();
    return clone(data.guilds[guildId] ?? { mode: 'allowlist', userIds: [] });
  }

  async canUse(guildId: string, userId: string, isGuildManager: boolean): Promise<boolean> {
    if (isGuildManager) return true;
    const permissions = await this.get(guildId);
    return permissions.mode === 'all' || permissions.userIds.includes(userId);
  }

  async setMode(guildId: string, mode: MusicPermissionMode): Promise<GuildMusicPermissions> {
    return this.mutate((data) => {
      const current = data.guilds[guildId] ?? { mode: 'allowlist' as const, userIds: [] };
      data.guilds[guildId] = { ...current, mode };
      return clone(data.guilds[guildId]);
    });
  }

  async addUser(guildId: string, userId: string): Promise<GuildMusicPermissions> {
    return this.mutate((data) => {
      const current = data.guilds[guildId] ?? { mode: 'allowlist' as const, userIds: [] };
      if (!current.userIds.includes(userId)) current.userIds.push(userId);
      data.guilds[guildId] = current;
      return clone(current);
    });
  }

  async removeUser(guildId: string, userId: string): Promise<boolean> {
    return this.mutate((data) => {
      const current = data.guilds[guildId] ?? { mode: 'allowlist' as const, userIds: [] };
      const index = current.userIds.indexOf(userId);
      if (index < 0) return false;
      current.userIds.splice(index, 1);
      data.guilds[guildId] = current;
      return true;
    });
  }
}

export const musicPermissionStore = new MusicPermissionStore();
