import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { loadJsonStore, saveJsonStoreAtomic } from './persistence.js';

export type AuditEntry = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  guildId: string | null;
  detail: string;
};

export type AuditLogFilters = {
  action?: string;
  search?: string;
};

export type AuditLogSettings = { retentionDays: number | null; maxEntries: number };
type AuditFile = { version: 1; entries: AuditEntry[]; settings?: { retentionDays: number | null } };

export const AUDIT_MAX_ENTRIES = 2_000;
export const AUDIT_MIN_RETENTION_DAYS = 1;
export const AUDIT_MAX_RETENTION_DAYS = 3_650;
const AUDIT_MAX_DETAIL_LENGTH = 512;

function createEmptyAuditFile(): AuditFile {
  return { version: 1, entries: [] };
}

function isAuditFile(parsed: unknown): parsed is AuditFile {
  if (!Boolean(parsed) || typeof parsed !== 'object' || (parsed as AuditFile).version !== 1 || !Array.isArray((parsed as AuditFile).entries)) return false;
  const settings = (parsed as AuditFile).settings;
  if (settings === undefined) return true;
  return Boolean(settings) && typeof settings === 'object' && (settings.retentionDays === null || (Number.isInteger(settings.retentionDays) && settings.retentionDays >= AUDIT_MIN_RETENTION_DAYS && settings.retentionDays <= AUDIT_MAX_RETENTION_DAYS));
}

export function normalizeAuditRetentionDays(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < AUDIT_MIN_RETENTION_DAYS || (value as number) > AUDIT_MAX_RETENTION_DAYS) {
    throw new Error(`Retention phải là null hoặc số nguyên từ ${AUDIT_MIN_RETENTION_DAYS} đến ${AUDIT_MAX_RETENTION_DAYS} ngày.`);
  }
  return value as number;
}

export function redactAuditText(value: string, maxLength = AUDIT_MAX_DETAIL_LENGTH): string {
  return value
    .replace(/\b(authorization|bearer|token|secret|password|cookie|client[_-]?secret)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi, '$1=[redacted]')
    .replace(/([?&](?:authorization|token|secret|password|cookie|client[_-]?secret)=)[^&#\s]+/gi, '$1[redacted]')
    .slice(0, maxLength);
}

function pruneEntries(entries: AuditEntry[], retentionDays: number | null, now = Date.now()): AuditEntry[] {
  const bounded = entries.slice(-AUDIT_MAX_ENTRIES);
  if (retentionDays === null) return bounded;
  const cutoff = now - retentionDays * 86_400_000;
  return bounded.filter((entry) => {
    const timestamp = Date.parse(entry.timestamp);
    return !Number.isFinite(timestamp) || timestamp >= cutoff;
  });
}

export class AuditLogStore {
  private readonly filePath: string;
  private retentionDays: number | null;
  private dataPromise: Promise<AuditFile> | undefined;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(filePath = config.auditFile, retentionDays = config.auditRetentionDays) {
    this.filePath = path.resolve(filePath);
    this.retentionDays = retentionDays;
  }

  private async load(): Promise<AuditFile> {
    if (!this.dataPromise) {
      this.dataPromise = loadJsonStore(this.filePath, isAuditFile, createEmptyAuditFile, 'Không thể đọc audit log local.')
        .then((result) => {
          if (result.data.settings !== undefined) this.retentionDays = normalizeAuditRetentionDays(result.data.settings.retentionDays);
          return { version: 1 as const, entries: pruneEntries(result.data.entries, this.retentionDays), settings: { retentionDays: this.retentionDays } };
        });
    }
    return this.dataPromise;
  }

  async loadPersisted(): Promise<void> {
    await this.load();
  }

  private async save(data: AuditFile): Promise<void> {
    await saveJsonStoreAtomic(this.filePath, data);
  }

  async record(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<AuditEntry> {
    let result!: AuditEntry;
    const task = this.mutationTail.then(async () => {
      const data = await this.load();
      result = {
        actor: redactAuditText(entry.actor, 128),
        action: redactAuditText(entry.action, 128),
        guildId: entry.guildId,
        detail: redactAuditText(entry.detail),
        id: randomUUID(),
        timestamp: new Date().toISOString()
      };
      data.entries.push(result);
      data.settings = { retentionDays: this.retentionDays };
      data.entries = pruneEntries(data.entries, this.retentionDays);
      await this.save(data);
    });
    this.mutationTail = task.then(() => undefined, () => undefined);
    await task;
    return result;
  }

  async list(limit = 50, guildId?: string, filters: AuditLogFilters = {}): Promise<AuditEntry[]> {
    await this.mutationTail;
    const data = await this.load();
    const action = filters.action?.trim().toLowerCase();
    const search = filters.search?.trim().toLowerCase();
    const filtered = data.entries.filter((entry) => {
      if (guildId && entry.guildId !== guildId) return false;
      if (action && entry.action.toLowerCase() !== action && !entry.action.toLowerCase().startsWith(`${action}.`)) return false;
      if (search) {
        const haystack = `${entry.actor} ${entry.action} ${entry.detail}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    return structuredClone(filtered.slice(-Math.min(Math.max(limit, 1), 200)).reverse());
  }

  getSettings(): { retentionDays: number | null; maxEntries: number } {
    return { retentionDays: this.retentionDays, maxEntries: AUDIT_MAX_ENTRIES };
  }

  async updateSettings(retentionDays: unknown): Promise<AuditLogSettings> {
    const nextRetentionDays = normalizeAuditRetentionDays(retentionDays);
    let result!: AuditLogSettings;
    const task = this.mutationTail.then(async () => {
      const data = await this.load();
      const nextEntries = pruneEntries(data.entries, nextRetentionDays);
      const nextData: AuditFile = { version: 1, entries: nextEntries, settings: { retentionDays: nextRetentionDays } };
      await this.save(nextData);
      data.entries = nextEntries;
      data.settings = nextData.settings;
      this.retentionDays = nextRetentionDays;
      result = { retentionDays: nextRetentionDays, maxEntries: AUDIT_MAX_ENTRIES };
    });
    this.mutationTail = task.then(() => undefined, () => undefined);
    await task;
    return result;
  }
}

export const auditLogStore = new AuditLogStore();
