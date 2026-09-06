import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLocalBotBackup, getDefaultBackupPaths, isLocalBotBackup, type BackupPaths, type BackupStoreName, type LocalBotBackup } from './backup.js';
import { saveJsonStoreAtomic } from './persistence.js';

const storeNames: BackupStoreName[] = ['playlists', 'musicPermissions', 'equalizer', 'community', 'audit', 'playerState', 'greetings', 'automod', 'automodReview', 'ollama'];
const sensitiveKeyPattern = /^(?:token|secret|password|cookie|authorization|apikey|api_key|api-key|clientsecret|client_secret|client-secret|accesstoken|access_token|access-token|refreshtoken|refresh_token|refresh-token)$/;

export class RestoreValidationError extends Error {
  constructor(message = 'Backup local không hợp lệ hoặc chứa trường nhạy cảm.') {
    super(message);
    this.name = 'RestoreValidationError';
  }
}

export class RestoreTransactionError extends Error {
  constructor() {
    super('Không thể khôi phục backup local; dữ liệu cũ đã được giữ lại nếu transaction bị lỗi.');
    this.name = 'RestoreTransactionError';
  }
}

export type RestoreResult = {
  restoredAt: string;
  stores: BackupStoreName[];
  restartRequired: true;
  recoveryFile: string;
};

export type RestoreOptions = {
  paths?: BackupPaths;
  now?: Date;
  renameFile?: (oldPath: string, newPath: string) => Promise<void>;
};

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT');
}

function normalizedKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]/g, '_');
}

function assertNoSensitiveKeys(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) throw new RestoreValidationError();
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertNoSensitiveKeys(item, seen);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKeyPattern.test(normalizedKey(key))) throw new RestoreValidationError();
    assertNoSensitiveKeys(child, seen);
  }
}

function validateBackup(value: unknown): asserts value is LocalBotBackup {
  if (!isLocalBotBackup(value)) throw new RestoreValidationError();
  assertNoSensitiveKeys(value);
}

function transactionId(now: Date): string {
  return `${now.toISOString().replace(/[^0-9]/g, '')}-${randomUUID()}`;
}

async function bestEffortRemove(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true });
  } catch {
    // Transaction scratch files are safe to leave behind if the OS temporarily
    // holds them. The retained recovery file is the durable operator fallback.
  }
}

async function writeStage(filePath: string, data: Record<string, unknown>): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  const staged = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  if (!staged || typeof staged !== 'object' || Array.isArray(staged) || (staged as { version?: unknown }).version !== 1) {
    throw new RestoreTransactionError();
  }
}

export async function restoreLocalBotBackup(value: unknown, options: RestoreOptions = {}): Promise<RestoreResult> {
  validateBackup(value);
  const now = options.now ?? new Date();
  const paths = options.paths ?? getDefaultBackupPaths();
  const targetPaths = storeNames.map((name) => paths[name]);
  if (new Set(targetPaths).size !== targetPaths.length) throw new RestoreTransactionError();

  let current: LocalBotBackup;
  try {
    current = await createLocalBotBackup(paths, now);
  } catch {
    throw new RestoreTransactionError();
  }

  const id = transactionId(now);
  const recoveryDirectory = path.join(path.dirname(paths.playlists), 'recovery');
  const recoveryPath = path.join(recoveryDirectory, `localbot-pre-restore-${now.toISOString().replace(/[:.]/g, '-')}-${id.slice(-8)}.json`);
  try {
    await saveJsonStoreAtomic(recoveryPath, current);
  } catch {
    throw new RestoreTransactionError();
  }

  const stages = storeNames.map((name) => `${paths[name]}.restore-${id}.tmp`);
  const movedBackups: Array<{ target: string; previous: string }> = [];
  const installedTargets: string[] = [];
  try {
    for (let index = 0; index < storeNames.length; index += 1) {
      const name = storeNames[index];
      const stage = stages[index];
      if (!name || !stage) throw new RestoreTransactionError();
      await writeStage(stage, value.stores[name]);
    }

    const renameFile = options.renameFile ?? rename;
    for (const name of storeNames) {
      const target = paths[name];
      const stage = `${target}.restore-${id}.tmp`;
      const previous = `${target}.restore-${id}.bak`;
      try {
        await renameFile(target, previous);
        movedBackups.push({ target, previous });
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
      await renameFile(stage, target);
      installedTargets.push(target);
    }

    await Promise.all(movedBackups.map(({ previous }) => bestEffortRemove(previous)));
    await Promise.all(stages.map(bestEffortRemove));
    return { restoredAt: now.toISOString(), stores: [...storeNames], restartRequired: true, recoveryFile: path.basename(recoveryPath) };
  } catch {
    for (const target of [...installedTargets].reverse()) await bestEffortRemove(target);
    for (const { target, previous } of [...movedBackups].reverse()) {
      try {
        await rename(previous, target);
      } catch {
        // Keep the transaction backup if rollback is blocked by the OS.
      }
    }
    await Promise.all(stages.map(bestEffortRemove));
    throw new RestoreTransactionError();
  }
}
