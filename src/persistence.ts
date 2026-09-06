import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type JsonStoreLoadResult<T> = {
  data: T;
  recoveredFromCorruption: boolean;
  migrated: boolean;
};

export type JsonStoreMigration = {
  from: number;
  to: number;
  migrate: (parsed: unknown) => unknown;
};

export type JsonStoreLoadOptions<T> = {
  currentVersion?: number;
  migrations?: readonly JsonStoreMigration[];
  migrationWriteError?: string;
  onMigration?: (from: number, to: number) => void;
};

function isEnoent(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT');
}

async function quarantineCorruptFile(filePath: string): Promise<void> {
  const quarantinePath = `${filePath}.corrupt-${Date.now()}.json`;
  try {
    await rename(filePath, quarantinePath);
    console.error(`[persistence] ${path.basename(filePath)} was unreadable and has been quarantined as ${path.basename(quarantinePath)}; continuing with an empty store.`);
  } catch {
    // Best effort only: if the damaged file cannot be moved aside, still
    // continue with the in-memory default rather than blocking startup.
  }
}

/**
 * Loads a versioned local JSON store. A missing file returns `createDefault()`.
 * A file that fails to parse or fails `isValid` is quarantined next to the
 * original path instead of throwing, so one damaged local store cannot crash
 * the bot; any other read error (for example a permissions failure) still
 * throws `readErrorMessage`.
 */
export async function loadJsonStore<T>(
  filePath: string,
  isValid: (parsed: unknown) => parsed is T,
  createDefault: () => T,
  readErrorMessage: string,
  options: JsonStoreLoadOptions<T> = {}
): Promise<JsonStoreLoadResult<T>> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isEnoent(error)) return { data: createDefault(), recoveredFromCorruption: false, migrated: false };
    throw new Error(readErrorMessage);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await quarantineCorruptFile(filePath);
    return { data: createDefault(), recoveredFromCorruption: true, migrated: false };
  }

  if (isValid(parsed)) {
    return { data: parsed, recoveredFromCorruption: false, migrated: false };
  }

  const parsedVersion = isVersionedObject(parsed) ? parsed.version : null;
  const currentVersion = options.currentVersion;
  if (currentVersion !== undefined && parsedVersion !== null && parsedVersion < currentVersion && options.migrations?.length) {
    let candidate = structuredClone(parsed) as unknown;
    let version = parsedVersion;
    const visited = new Set<number>();
    let applied = false;
    while (version < currentVersion) {
      if (visited.has(version)) break;
      visited.add(version);
      const step = options.migrations.find((migration) => migration.from === version && migration.to === version + 1);
      if (!step) break;
      try {
        candidate = step.migrate(structuredClone(candidate));
      } catch {
        break;
      }
      if (!isVersionedObject(candidate) || candidate.version !== version + 1) break;
      version = candidate.version;
      applied = true;
    }

    if (applied && version === currentVersion && isValid(candidate)) {
      try {
        await saveJsonStoreAtomic(filePath, candidate);
      } catch {
        throw new Error(options.migrationWriteError ?? readErrorMessage);
      }
      options.onMigration?.(parsedVersion, currentVersion);
      return { data: candidate, recoveredFromCorruption: false, migrated: true };
    }
  }

  await quarantineCorruptFile(filePath);
  return { data: createDefault(), recoveredFromCorruption: true, migrated: false };
}

function isVersionedObject(value: unknown): value is { version: number } {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as { version?: unknown }).version === 'number'
    && Number.isInteger((value as { version: number }).version)
    && (value as { version: number }).version >= 0;
}

export async function saveJsonStoreAtomic<T>(filePath: string, data: T): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}
