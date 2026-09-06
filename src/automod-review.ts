import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { AUTO_MOD_ACTIONS, AUTO_MOD_RULES, type AutoModMatch, type AutoModProposedAction, type AutoModRuleKind } from './automod.js';
import { loadJsonStore, saveJsonStoreAtomic } from './persistence.js';

export const AUTO_MOD_REVIEW_STATUSES = ['open', 'confirmed', 'dismissed'] as const;
export type AutoModReviewStatus = (typeof AUTO_MOD_REVIEW_STATUSES)[number];

export const AUTO_MOD_REVIEW_OUTCOMES = ['alerted', 'deleted', 'timed_out', 'unsupported', 'permission_denied', 'rate_limited', 'failed', 'coalesced'] as const;
export type AutoModReviewOutcome = (typeof AUTO_MOD_REVIEW_OUTCOMES)[number];

export const AUTO_MOD_REVIEW_REASONS = ['same-message-threshold', 'message-rate-threshold', 'blocked-domain', 'scam-pattern', 'join-rate-threshold', 'destructive-change-rate'] as const;
type AutoModReviewReason = (typeof AUTO_MOD_REVIEW_REASONS)[number];

export type AutoModReviewEntry = {
  id: string;
  guildId: string;
  channelId: string | null;
  userId: string | null;
  rule: AutoModRuleKind;
  reason: AutoModReviewReason;
  proposedAction: AutoModProposedAction;
  outcome: AutoModReviewOutcome;
  enforced: boolean;
  createdAt: string;
  status: AutoModReviewStatus;
  reviewedAt: string | null;
  note: string;
};

type AutoModReviewFile = { version: 1; entries: AutoModReviewEntry[] };
export type AutoModReviewMatch = Pick<AutoModMatch, 'guildId' | 'channelId' | 'userId' | 'rule' | 'reason' | 'proposedAction'>;

export const MAX_AUTOMOD_REVIEW_ENTRIES = 1_000;
export const MAX_AUTOMOD_REVIEW_NOTE_LENGTH = 240;

export class AutoModReviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AutoModReviewValidationError';
  }
}

export class AutoModReviewNotFoundError extends Error {
  constructor() {
    super('Không tìm thấy bản ghi AutoMod review.');
    this.name = 'AutoModReviewNotFoundError';
  }
}

export class AutoModReviewConflictError extends Error {
  constructor() {
    super('Bản ghi AutoMod review đã được quyết định theo hướng khác.');
    this.name = 'AutoModReviewConflictError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function boundedId(value: unknown, field: string, nullable = false): string | null {
  if (nullable && (value === null || value === undefined || (typeof value === 'string' && value.trim() === ''))) return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 64) {
    throw new AutoModReviewValidationError(`${field} không hợp lệ.`);
  }
  return value.trim();
}

function isoDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new AutoModReviewValidationError(`${field} không hợp lệ.`);
  return value;
}

function isAutoModReviewEntry(value: unknown): value is AutoModReviewEntry {
  if (!isObject(value)) return false;
  try {
    boundedId(value.id, 'id');
    boundedId(value.guildId, 'guildId');
    boundedId(value.channelId, 'channelId', true);
    boundedId(value.userId, 'userId', true);
    if (typeof value.rule !== 'string' || !AUTO_MOD_RULES.includes(value.rule as AutoModRuleKind)) throw new Error();
    if (typeof value.reason !== 'string' || !AUTO_MOD_REVIEW_REASONS.includes(value.reason as AutoModReviewReason)) throw new Error();
    if (typeof value.proposedAction !== 'string' || !AUTO_MOD_ACTIONS.includes(value.proposedAction as AutoModProposedAction)) throw new Error();
    if (typeof value.outcome !== 'string' || !AUTO_MOD_REVIEW_OUTCOMES.includes(value.outcome as AutoModReviewOutcome)) throw new Error();
    if (typeof value.enforced !== 'boolean') throw new Error();
    isoDate(value.createdAt, 'createdAt');
    if (typeof value.status !== 'string' || !AUTO_MOD_REVIEW_STATUSES.includes(value.status as AutoModReviewStatus)) throw new Error();
    if (value.reviewedAt !== null) isoDate(value.reviewedAt, 'reviewedAt');
    if (typeof value.note !== 'string' || value.note.length > MAX_AUTOMOD_REVIEW_NOTE_LENGTH) throw new Error();
    return true;
  } catch {
    return false;
  }
}

export function isAutoModReviewFile(value: unknown): value is AutoModReviewFile {
  return isObject(value)
    && value.version === 1
    && Array.isArray(value.entries)
    && value.entries.length <= MAX_AUTOMOD_REVIEW_ENTRIES
    && value.entries.every(isAutoModReviewEntry);
}

export function createEmptyAutoModReviewFile(): AutoModReviewFile {
  return { version: 1, entries: [] };
}

function normalizeNote(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > MAX_AUTOMOD_REVIEW_NOTE_LENGTH) {
    throw new AutoModReviewValidationError(`note tối đa ${MAX_AUTOMOD_REVIEW_NOTE_LENGTH} ký tự.`);
  }
  return value.trim();
}

function normalizeDecision(value: unknown): 'confirm' | 'dismiss' {
  if (value !== 'confirm' && value !== 'dismiss') throw new AutoModReviewValidationError('decision phải là confirm hoặc dismiss.');
  return value;
}

function validateGuildId(guildId: string): string {
  return boundedId(guildId, 'guildId')!;
}

export class AutoModReviewStore {
  private readonly filePath: string;
  private dataPromise: Promise<AutoModReviewFile> | undefined;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(filePath = config.automodReviewFile) {
    this.filePath = path.resolve(filePath);
  }

  private async load(): Promise<AutoModReviewFile> {
    if (!this.dataPromise) {
      this.dataPromise = loadJsonStore(this.filePath, isAutoModReviewFile, createEmptyAutoModReviewFile, 'Không thể đọc AutoMod review local.')
        .then((result) => result.data);
    }
    return this.dataPromise;
  }

  async loadPersisted(): Promise<void> {
    await this.load();
  }

  private async save(data: AutoModReviewFile): Promise<void> {
    await saveJsonStoreAtomic(this.filePath, data);
  }

  async recordMatch(match: AutoModReviewMatch, outcome: AutoModReviewOutcome, enforced: boolean, now = Date.now()): Promise<AutoModReviewEntry> {
    let result!: AutoModReviewEntry;
    const task = this.mutationTail.then(async () => {
      const data = await this.load();
      if (!AUTO_MOD_REVIEW_OUTCOMES.includes(outcome)) throw new AutoModReviewValidationError('outcome AutoMod review không hợp lệ.');
      const nextEntry: AutoModReviewEntry = {
        id: randomUUID(),
        guildId: validateGuildId(match.guildId),
        channelId: boundedId(match.channelId, 'channelId', true),
        userId: boundedId(match.userId, 'userId', true),
        rule: match.rule,
        reason: match.reason,
        proposedAction: match.proposedAction,
        outcome,
        enforced,
        createdAt: new Date(now).toISOString(),
        status: 'open',
        reviewedAt: null,
        note: ''
      };
      const nextData: AutoModReviewFile = { version: 1, entries: [...data.entries.slice(-(MAX_AUTOMOD_REVIEW_ENTRIES - 1)), nextEntry] };
      await this.save(nextData);
      this.dataPromise = Promise.resolve(nextData);
      result = nextEntry;
    });
    this.mutationTail = task.then(() => undefined, () => undefined);
    await task;
    return clone(result);
  }

  async list(guildId: string, status?: AutoModReviewStatus, limit = 50): Promise<AutoModReviewEntry[]> {
    const normalizedGuildId = validateGuildId(guildId);
    if (status !== undefined && !AUTO_MOD_REVIEW_STATUSES.includes(status)) throw new AutoModReviewValidationError('status AutoMod review không hợp lệ.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AutoModReviewValidationError('limit phải là số nguyên từ 1 đến 100.');
    await this.mutationTail;
    const data = await this.load();
    return clone(data.entries
      .filter((entry) => entry.guildId === normalizedGuildId && (status === undefined || entry.status === status))
      .slice(-limit)
      .reverse());
  }

  async decide(guildId: string, reviewId: string, decision: 'confirm' | 'dismiss', note?: string): Promise<AutoModReviewEntry> {
    const normalizedGuildId = validateGuildId(guildId);
    const normalizedReviewId = boundedId(reviewId, 'reviewId')!;
    const normalizedDecision = normalizeDecision(decision);
    const normalizedNote = normalizeNote(note);
    let result!: AutoModReviewEntry;
    const task = this.mutationTail.then(async () => {
      const data = await this.load();
      const current = data.entries.find((entry) => entry.guildId === normalizedGuildId && entry.id === normalizedReviewId);
      if (!current) throw new AutoModReviewNotFoundError();
      const targetStatus: AutoModReviewStatus = normalizedDecision === 'confirm' ? 'confirmed' : 'dismissed';
      if (current.status === targetStatus) {
        result = current;
        return;
      }
      if (current.status !== 'open') throw new AutoModReviewConflictError();
      const nextEntry: AutoModReviewEntry = { ...current, status: targetStatus, reviewedAt: new Date().toISOString(), note: normalizedNote };
      const nextData: AutoModReviewFile = { version: 1, entries: data.entries.map((entry) => entry.id === current.id ? nextEntry : entry) };
      await this.save(nextData);
      this.dataPromise = Promise.resolve(nextData);
      result = nextEntry;
    });
    this.mutationTail = task.then(() => undefined, () => undefined);
    await task;
    return clone(result);
  }
}

export const automodReviewStore = new AutoModReviewStore();
