import path from 'node:path';
import { config } from './config.js';
import { loadJsonStore, saveJsonStoreAtomic } from './persistence.js';

export type EqualizerSettings = {
  bass: number;
  mid: number;
  treble: number;
};

export type EqualizerPreset = 'flat' | 'focus' | 'warm';

type EqualizerFile = {
  version: 1;
  guilds: Record<string, EqualizerSettings>;
};

const DEFAULT_SETTINGS: EqualizerSettings = { bass: 0, mid: 0, treble: 0 };
const PRESETS: Record<EqualizerPreset, EqualizerSettings> = {
  flat: { bass: 0, mid: 0, treble: 0 },
  focus: { bass: -2, mid: 3, treble: 2 },
  warm: { bass: 4, mid: 1, treble: -2 }
};

function createEmptyEqualizerFile(): EqualizerFile {
  return { version: 1, guilds: {} };
}

function isEqualizerFile(parsed: unknown): parsed is EqualizerFile {
  return Boolean(parsed) && typeof parsed === 'object' && (parsed as EqualizerFile).version === 1 && typeof (parsed as EqualizerFile).guilds === 'object' && (parsed as EqualizerFile).guilds !== null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function clampGain(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(12, Math.max(-12, Math.round(value * 10) / 10));
}

export function normalizeEqualizer(settings: Partial<EqualizerSettings>): EqualizerSettings {
  return {
    bass: clampGain(settings.bass ?? 0),
    mid: clampGain(settings.mid ?? 0),
    treble: clampGain(settings.treble ?? 0)
  };
}

export function getPresetSettings(preset: EqualizerPreset): EqualizerSettings {
  return clone(PRESETS[preset]);
}

/** Returns an FFmpeg audio filter chain, or undefined for a flat signal. */
export function buildEqualizerFilter(settings: EqualizerSettings): string | undefined {
  const normalized = normalizeEqualizer(settings);
  if (normalized.bass === 0 && normalized.mid === 0 && normalized.treble === 0) return undefined;
  return [
    `equalizer=f=100:t=q:w=1:g=${normalized.bass}`,
    `equalizer=f=1000:t=q:w=1:g=${normalized.mid}`,
    `equalizer=f=10000:t=q:w=1:g=${normalized.treble}`
  ].join(',');
}

export class EqualizerStore {
  private readonly filePath: string;
  private dataPromise: Promise<EqualizerFile> | undefined;
  private loadedData: EqualizerFile | undefined;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(filePath = config.equalizerFile) {
    this.filePath = path.resolve(filePath);
  }

  private async loadData(): Promise<EqualizerFile> {
    if (!this.dataPromise) {
      this.dataPromise = loadJsonStore(this.filePath, isEqualizerFile, createEmptyEqualizerFile, 'Không thể đọc cấu hình Equalizer local.')
        .then((result) => {
          this.loadedData = result.data;
          return result.data;
        });
    }
    return this.dataPromise!;
  }

  private async save(data: EqualizerFile): Promise<void> {
    await saveJsonStoreAtomic(this.filePath, data);
  }

  async load(): Promise<void> {
    await this.loadData();
  }

  get(guildId: string): EqualizerSettings {
    // The store is loaded during startup. Until then, flat is the safe fallback.
    return normalizeEqualizer(this.loadedData?.guilds[guildId] ?? DEFAULT_SETTINGS);
  }

  async getAsync(guildId: string): Promise<EqualizerSettings> {
    await this.mutationTail;
    const data = await this.loadData();
    return normalizeEqualizer(data.guilds[guildId] ?? DEFAULT_SETTINGS);
  }

  async set(guildId: string, settings: Partial<EqualizerSettings>): Promise<EqualizerSettings> {
    const normalized = normalizeEqualizer(settings);
    let result = normalized;
    const task = this.mutationTail.then(async () => {
      const data = await this.loadData();
      data.guilds[guildId] = normalized;
      await this.save(data);
      result = clone(normalized);
    });
    this.mutationTail = task.then(() => undefined, () => undefined);
    await task;
    return result;
  }

  async setPreset(guildId: string, preset: EqualizerPreset): Promise<EqualizerSettings> {
    return this.set(guildId, getPresetSettings(preset));
  }
}

export const equalizerStore = new EqualizerStore();
