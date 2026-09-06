import { readFile } from 'node:fs/promises';
import { config } from './config.js';
import { createEmptyAutoModReviewFile, isAutoModReviewFile } from './automod-review.js';

export type BackupStoreName = 'playlists' | 'musicPermissions' | 'equalizer' | 'community' | 'audit' | 'playerState' | 'greetings' | 'automod' | 'automodReview' | 'ollama';
export type BackupStoreData = Record<string, unknown>;

export type LocalBotBackup = {
  format: 'localbot-backup';
  version: 1;
  exportedAt: string;
  stores: Record<BackupStoreName, BackupStoreData>;
};

export type BackupPaths = Record<BackupStoreName, string>;

export function getDefaultBackupPaths(): BackupPaths {
  return {
    playlists: config.playlistsFile,
    musicPermissions: config.musicPermissionsFile,
    equalizer: config.equalizerFile,
    community: config.communityFile,
    audit: config.auditFile,
    playerState: config.playerStateFile,
    greetings: config.greetingsFile,
    automod: config.automodFile,
    automodReview: config.automodReviewFile,
    ollama: config.ollamaFile,
  };
}

export const defaultBackupPaths: BackupPaths = getDefaultBackupPaths();

const emptyStores: Record<BackupStoreName, BackupStoreData> = {
  playlists: { version: 1, playlists: [] },
  musicPermissions: { version: 1, guilds: {} },
  equalizer: { version: 1, guilds: {} },
  community: { version: 1, guilds: {} },
  audit: { version: 1, entries: [] },
  playerState: { version: 1, guilds: {} },
  greetings: { version: 1, guilds: {} },
  automod: { version: 1, guilds: {} },
  automodReview: createEmptyAutoModReviewFile(),
  ollama: { version: 1, settings: { enabled: false, baseUrl: config.ollamaBaseUrl, model: config.ollamaModel, timeoutMs: 5000 } },
};

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT');
}

function isObject(value: unknown): value is BackupStoreData {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isVersionedStore(value: unknown): value is BackupStoreData {
  return isObject(value) && value.version === 1;
}

function isStoreData(name: BackupStoreName, value: unknown): value is BackupStoreData {
  if (!isVersionedStore(value)) return false;
  if (name === 'playlists') return Array.isArray(value.playlists);
  if (name === 'audit') return Array.isArray(value.entries);
  if (name === 'automodReview') return isAutoModReviewFile(value);
  if (name === 'ollama') {
    const settings = value.settings;
    return isObject(settings)
      && typeof settings.enabled === 'boolean'
      && typeof settings.baseUrl === 'string'
      && typeof settings.model === 'string'
      && typeof settings.timeoutMs === 'number'
      && Number.isInteger(settings.timeoutMs)
      && settings.timeoutMs >= 1_000
      && settings.timeoutMs <= 30_000;
  }
  return isObject(value.guilds);
}

async function readStore(path: string, name: BackupStoreName, fallback: BackupStoreData): Promise<BackupStoreData> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return structuredClone(fallback);
    throw new Error('Không thể đọc dữ liệu local để tạo backup.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Một file dữ liệu local không hợp lệ; backup đã bị dừng để tránh sao lưu dữ liệu hỏng.');
  }
  if (!isVersionedStore(parsed)) {
    throw new Error('Một file dữ liệu local không đúng phiên bản; backup đã bị dừng để tránh sao lưu dữ liệu không tương thích.');
  }
  if (!isStoreData(name, parsed)) {
    throw new Error('Một file dữ liệu local không hợp lệ; backup đã bị dừng để tránh sao lưu dữ liệu hỏng.');
  }
  return parsed;
}

export async function createLocalBotBackup(paths: BackupPaths = getDefaultBackupPaths(), now = new Date()): Promise<LocalBotBackup> {
  const storeNames = Object.keys(emptyStores) as BackupStoreName[];
  const entries = await Promise.all(storeNames.map(async (name) => [name, await readStore(paths[name], name, emptyStores[name])] as const));
  return {
    format: 'localbot-backup',
    version: 1,
    exportedAt: now.toISOString(),
    stores: Object.fromEntries(entries) as Record<BackupStoreName, BackupStoreData>,
  };
}

export function isLocalBotBackup(value: unknown): value is LocalBotBackup {
  if (!isObject(value) || value.format !== 'localbot-backup' || value.version !== 1 || typeof value.exportedAt !== 'string') return false;
  const storesValue = value.stores;
  if (!isObject(storesValue)) return false;
  const stores = storesValue;
  const storeNames = Object.keys(emptyStores) as BackupStoreName[];
  return storeNames.every((name) => isStoreData(name, stores[name]));
}
