import path from 'node:path';
import { config } from './config.js';
import { loadJsonStore, saveJsonStoreAtomic } from './persistence.js';

export type SoundCloudProviderSettings = {
  enabled: boolean;
};

type ProviderSettingsFile = {
  version: 1;
  soundcloud: SoundCloudProviderSettings;
};

function createDefaultSettings(): ProviderSettingsFile {
  return { version: 1, soundcloud: { enabled: true } };
}

function isProviderSettingsFile(value: unknown): value is ProviderSettingsFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ProviderSettingsFile>;
  return candidate.version === 1
    && Boolean(candidate.soundcloud)
    && typeof candidate.soundcloud === 'object'
    && typeof candidate.soundcloud.enabled === 'boolean';
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class ProviderSettingsStore {
  private readonly filePath: string;
  private dataPromise: Promise<ProviderSettingsFile> | undefined;
  private mutationTail: Promise<void> = Promise.resolve();
  private soundCloudEnabled = true;

  constructor(filePath = config.providerSettingsFile) {
    this.filePath = path.resolve(filePath);
  }

  async load(): Promise<void> {
    await this.readData();
  }

  private async loadData(): Promise<ProviderSettingsFile> {
    if (!this.dataPromise) {
      this.dataPromise = loadJsonStore(
        this.filePath,
        isProviderSettingsFile,
        createDefaultSettings,
        'Không thể đọc cấu hình nguồn nhạc local.'
      ).then((result) => {
        this.soundCloudEnabled = result.data.soundcloud.enabled;
        return result.data;
      });
    }
    return this.dataPromise;
  }

  private async readData(): Promise<ProviderSettingsFile> {
    await this.mutationTail;
    return this.loadData();
  }

  private async mutate<T>(operation: (data: ProviderSettingsFile) => T | Promise<T>): Promise<T> {
    let result!: T;
    const task = this.mutationTail.then(async () => {
      const data = await this.loadData();
      result = await operation(data);
      await saveJsonStoreAtomic(this.filePath, data);
    });
    this.mutationTail = task.then(() => undefined, () => undefined);
    await task;
    return result;
  }

  async getSoundCloud(): Promise<SoundCloudProviderSettings> {
    const data = await this.readData();
    return clone(data.soundcloud);
  }

  isSoundCloudEnabled(): boolean {
    return this.soundCloudEnabled;
  }

  async setSoundCloudEnabled(enabled: boolean): Promise<SoundCloudProviderSettings> {
    return this.mutate((data) => {
      data.soundcloud.enabled = enabled;
      this.soundCloudEnabled = enabled;
      return clone(data.soundcloud);
    });
  }
}

export const providerSettingsStore = new ProviderSettingsStore();
