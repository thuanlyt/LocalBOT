import path from 'node:path';
import { config } from './config.js';
import { loadJsonStore, saveJsonStoreAtomic } from './persistence.js';

export const AUTO_MOD_RULES = ['spam', 'flood', 'link', 'scam', 'antiRaid', 'antiNuke'] as const;
export type AutoModRuleKind = (typeof AUTO_MOD_RULES)[number];
export const AUTO_MOD_ACTIONS = ['alert', 'delete', 'timeout', 'quarantine'] as const;
export type AutoModProposedAction = (typeof AUTO_MOD_ACTIONS)[number];
export const AUTO_MOD_MODES = ['dry-run', 'enforce'] as const;
export type AutoModMode = (typeof AUTO_MOD_MODES)[number];

export type AutoModThresholdRule = {
  enabled: boolean;
  proposedAction: AutoModProposedAction;
  threshold: number;
  windowSeconds: number;
  cooldownSeconds: number;
};

export type AutoModLinkRule = {
  enabled: boolean;
  proposedAction: AutoModProposedAction;
  blockedDomains: string[];
  cooldownSeconds: number;
};

export type AutoModScamRule = {
  enabled: boolean;
  proposedAction: AutoModProposedAction;
  cooldownSeconds: number;
};

export type AutoModSettings = {
  enabled: boolean;
  mode: AutoModMode;
  rules: {
    spam: AutoModThresholdRule;
    flood: AutoModThresholdRule;
    link: AutoModLinkRule;
    scam: AutoModScamRule;
    antiRaid: AutoModThresholdRule;
    antiNuke: AutoModThresholdRule;
  };
  exemptUserIds: string[];
  exemptRoleIds: string[];
};

export type AutoModMessage = {
  guildId: string;
  channelId: string;
  userId: string;
  roleIds: string[];
  content: string;
  timestamp?: number;
};

export type AutoModSecurityEvent = {
  guildId: string;
  kind: 'member-join' | 'destructive-change';
  actorId?: string;
  timestamp?: number;
};

export type AutoModMatch = {
  guildId: string;
  channelId: string;
  userId: string;
  rule: AutoModRuleKind;
  reason: 'same-message-threshold' | 'message-rate-threshold' | 'blocked-domain' | 'scam-pattern' | 'join-rate-threshold' | 'destructive-change-rate';
  proposedAction: AutoModProposedAction;
  enforced: false;
};

type AutoModFile = { version: 1; guilds: Record<string, AutoModSettings> };
type HistoryEntry = { channelId: string; userId: string; normalized: string; timestamp: number };
type SecurityHistoryEntry = { kind: AutoModSecurityEvent['kind']; timestamp: number };

const MAX_LIST_ITEMS = 100;
const MAX_HISTORY_PER_GUILD = 1_000;
const MAX_DOMAIN_LENGTH = 253;
const MAX_RULE_THRESHOLD = 100;
const MAX_RULE_WINDOW_SECONDS = 86_400;
const MAX_RULE_COOLDOWN_SECONDS = 86_400;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createDefaultSettings(): AutoModSettings {
  return {
    enabled: false,
    mode: 'dry-run',
    rules: {
      spam: { enabled: false, proposedAction: 'delete', threshold: 3, windowSeconds: 30, cooldownSeconds: 10 },
      flood: { enabled: false, proposedAction: 'timeout', threshold: 6, windowSeconds: 10, cooldownSeconds: 10 },
      link: { enabled: false, proposedAction: 'delete', blockedDomains: [], cooldownSeconds: 60 },
      scam: { enabled: false, proposedAction: 'quarantine', cooldownSeconds: 60 },
      antiRaid: { enabled: false, proposedAction: 'alert', threshold: 5, windowSeconds: 60, cooldownSeconds: 60 },
      antiNuke: { enabled: false, proposedAction: 'quarantine', threshold: 3, windowSeconds: 30, cooldownSeconds: 60 }
    },
    exemptUserIds: [],
    exemptRoleIds: []
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBoolean(value: unknown, fallback: boolean, field: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${field} phải là boolean.`);
  return value;
}

function normalizeAction(value: unknown, fallback: AutoModProposedAction, field: string): AutoModProposedAction {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !AUTO_MOD_ACTIONS.includes(value as AutoModProposedAction)) {
    throw new Error(`${field} không hợp lệ.`);
  }
  return value as AutoModProposedAction;
}

function normalizeBoundedInteger(value: unknown, fallback: number, min: number, max: number, field: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} phải là số nguyên từ ${min} đến ${max}.`);
  }
  return value;
}

function normalizeIdList(value: unknown, fallback: string[], field: string): string[] {
  if (value === undefined) return clone(fallback);
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) throw new Error(`${field} tối đa ${MAX_LIST_ITEMS} phần tử.`);
  const normalized = value.map((item) => {
    if (typeof item !== 'string' || !item.trim() || item.trim().length > 64) throw new Error(`${field} chứa ID không hợp lệ.`);
    return item.trim();
  });
  return [...new Set(normalized)];
}

export function normalizeDomain(value: string): string {
  const domain = value.trim().toLocaleLowerCase('en-US').replace(/^\*\./, '').replace(/^\.+|\.+$/g, '');
  if (!domain || domain.length > MAX_DOMAIN_LENGTH || domain.includes('/') || domain.includes(':') || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) || domain.includes('..')) {
    throw new Error('blockedDomains chứa hostname không hợp lệ.');
  }
  return domain;
}

function normalizeDomains(value: unknown, fallback: string[]): string[] {
  if (value === undefined) return clone(fallback);
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) throw new Error(`blockedDomains tối đa ${MAX_LIST_ITEMS} phần tử.`);
  return [...new Set(value.map((item) => {
    if (typeof item !== 'string') throw new Error('blockedDomains phải là chuỗi hostname.');
    return normalizeDomain(item);
  }))];
}

function normalizeThresholdRule(value: unknown, fallback: AutoModThresholdRule, field: string): AutoModThresholdRule {
  if (!record(value)) throw new Error(`${field} phải là object.`);
  return {
    enabled: normalizeBoolean(value.enabled, fallback.enabled, `${field}.enabled`),
    proposedAction: normalizeAction(value.proposedAction, fallback.proposedAction, `${field}.proposedAction`),
    threshold: normalizeBoundedInteger(value.threshold, fallback.threshold, 2, MAX_RULE_THRESHOLD, `${field}.threshold`),
    windowSeconds: normalizeBoundedInteger(value.windowSeconds, fallback.windowSeconds, 1, MAX_RULE_WINDOW_SECONDS, `${field}.windowSeconds`),
    cooldownSeconds: normalizeBoundedInteger(value.cooldownSeconds, fallback.cooldownSeconds, 0, MAX_RULE_COOLDOWN_SECONDS, `${field}.cooldownSeconds`)
  };
}

function normalizeLinkRule(value: unknown, fallback: AutoModLinkRule): AutoModLinkRule {
  if (!record(value)) throw new Error('rules.link phải là object.');
  return {
    enabled: normalizeBoolean(value.enabled, fallback.enabled, 'rules.link.enabled'),
    proposedAction: normalizeAction(value.proposedAction, fallback.proposedAction, 'rules.link.proposedAction'),
    blockedDomains: normalizeDomains(value.blockedDomains, fallback.blockedDomains),
    cooldownSeconds: normalizeBoundedInteger(value.cooldownSeconds, fallback.cooldownSeconds, 0, MAX_RULE_COOLDOWN_SECONDS, 'rules.link.cooldownSeconds')
  };
}

function normalizeScamRule(value: unknown, fallback: AutoModScamRule): AutoModScamRule {
  if (!record(value)) throw new Error('rules.scam phải là object.');
  return {
    enabled: normalizeBoolean(value.enabled, fallback.enabled, 'rules.scam.enabled'),
    proposedAction: normalizeAction(value.proposedAction, fallback.proposedAction, 'rules.scam.proposedAction'),
    cooldownSeconds: normalizeBoundedInteger(value.cooldownSeconds, fallback.cooldownSeconds, 0, MAX_RULE_COOLDOWN_SECONDS, 'rules.scam.cooldownSeconds')
  };
}

export function normalizeAutoModSettings(value: unknown, fallback = createDefaultSettings()): AutoModSettings {
  if (!record(value)) throw new Error('settings phải là object.');
  const mode = value.mode === undefined ? fallback.mode : value.mode;
  if (typeof mode !== 'string' || !AUTO_MOD_MODES.includes(mode as AutoModMode)) throw new Error('mode AutoMod không hợp lệ.');
  const rules = record(value.rules) ? value.rules : value.rules === undefined ? fallback.rules : null;
  if (!rules) throw new Error('rules phải là object.');
  return {
    enabled: normalizeBoolean(value.enabled, fallback.enabled, 'enabled'),
    mode: mode as AutoModMode,
    rules: {
      spam: normalizeThresholdRule(rules.spam ?? fallback.rules.spam, fallback.rules.spam, 'rules.spam'),
      flood: normalizeThresholdRule(rules.flood ?? fallback.rules.flood, fallback.rules.flood, 'rules.flood'),
      link: normalizeLinkRule(rules.link ?? fallback.rules.link, fallback.rules.link),
      scam: normalizeScamRule(rules.scam ?? fallback.rules.scam, fallback.rules.scam),
      antiRaid: normalizeThresholdRule(rules.antiRaid ?? fallback.rules.antiRaid, fallback.rules.antiRaid, 'rules.antiRaid'),
      antiNuke: normalizeThresholdRule(rules.antiNuke ?? fallback.rules.antiNuke, fallback.rules.antiNuke, 'rules.antiNuke')
    },
    exemptUserIds: normalizeIdList(value.exemptUserIds, fallback.exemptUserIds, 'exemptUserIds'),
    exemptRoleIds: normalizeIdList(value.exemptRoleIds, fallback.exemptRoleIds, 'exemptRoleIds')
  };
}

function isAutoModFile(value: unknown): value is AutoModFile {
  if (!record(value) || value.version !== 1 || !record(value.guilds)) return false;
  try {
    return Object.values(value.guilds).every((settings) => {
      normalizeAutoModSettings(settings);
      return true;
    });
  } catch {
    return false;
  }
}

export function normalizeAutoModContent(content: string): string {
  return content
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9:/._?&=%-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 2_048);
}

export function extractHttpHosts(content: string): string[] {
  const hosts: string[] = [];
  const candidatePattern = /https?:\/\/[^\s<>]+/gi;
  for (const candidate of content.match(candidatePattern) ?? []) {
    try {
      const url = new URL(candidate.replace(/[),.!?]+$/, ''));
      if (url.protocol === 'http:' || url.protocol === 'https:') hosts.push(url.hostname.toLocaleLowerCase('en-US').replace(/^www\./, '').replace(/\.$/, ''));
    } catch {
      // An invalid URL is not a link match. The scam rule remains separate.
    }
  }
  return [...new Set(hosts)];
}

export function isBlockedHost(host: string, blockedDomains: string[]): boolean {
  const normalizedHost = host.toLocaleLowerCase('en-US').replace(/^www\./, '').replace(/\.$/, '');
  return blockedDomains.some((domain) => normalizedHost === domain || normalizedHost.endsWith(`.${domain}`));
}

const SCAM_PATTERNS = [
  /\bfree\s+(?:discord\s+)?nitro\b/,
  /\bclaim\s+(?:your\s+)?(?:free\s+)?(?:reward|prize|gift)\b/,
  /\bverify\s+your\s+(?:discord\s+)?account\b/,
  /\bcrypto\s+(?:giveaway|airdrop)\b/
];

function hasScamPattern(normalized: string): boolean {
  return SCAM_PATTERNS.some((pattern) => pattern.test(normalized));
}

function maxHistoryWindow(settings: AutoModSettings): number {
  return Math.max(settings.rules.spam.enabled ? settings.rules.spam.windowSeconds : 0, settings.rules.flood.enabled ? settings.rules.flood.windowSeconds : 0);
}

export class AutoModEngine {
  private readonly history = new Map<string, HistoryEntry[]>();
  private readonly securityHistory = new Map<string, SecurityHistoryEntry[]>();
  private readonly lastMatches = new Map<string, number>();

  evaluate(settings: AutoModSettings, message: AutoModMessage): AutoModMatch[] {
    if (!settings.enabled) {
      this.resetGuild(message.guildId);
      return [];
    }
    if (settings.exemptUserIds.includes(message.userId) || message.roleIds.some((roleId) => settings.exemptRoleIds.includes(roleId))) return [];

    const now = Number.isFinite(message.timestamp) ? message.timestamp! : Date.now();
    const normalized = normalizeAutoModContent(message.content);
    const matches: AutoModMatch[] = [];
    const historyWindow = maxHistoryWindow(settings);
    const previous = historyWindow > 0 ? (this.history.get(message.guildId) ?? []).filter((entry) => now - entry.timestamp <= historyWindow * 1_000) : [];
    const current = { channelId: message.channelId, userId: message.userId, normalized, timestamp: now };
    const historyWithCurrent = [...previous, current];

    if (settings.rules.spam.enabled && normalized) {
      const occurrences = historyWithCurrent.filter((entry) => entry.channelId === message.channelId && entry.userId === message.userId && entry.normalized === normalized && now - entry.timestamp <= settings.rules.spam.windowSeconds * 1_000).length;
      if (occurrences >= settings.rules.spam.threshold && this.allowMatch(`spam:${message.guildId}:${message.userId}:${message.channelId}`, now, settings.rules.spam.cooldownSeconds)) {
        matches.push({ guildId: message.guildId, channelId: message.channelId, userId: message.userId, rule: 'spam', reason: 'same-message-threshold', proposedAction: settings.rules.spam.proposedAction, enforced: false });
      }
    }

    if (settings.rules.flood.enabled) {
      const messages = historyWithCurrent.filter((entry) => entry.userId === message.userId && now - entry.timestamp <= settings.rules.flood.windowSeconds * 1_000).length;
      if (messages >= settings.rules.flood.threshold && this.allowMatch(`flood:${message.guildId}:${message.userId}`, now, settings.rules.flood.cooldownSeconds)) {
        matches.push({ guildId: message.guildId, channelId: message.channelId, userId: message.userId, rule: 'flood', reason: 'message-rate-threshold', proposedAction: settings.rules.flood.proposedAction, enforced: false });
      }
    }

    if (settings.rules.link.enabled && extractHttpHosts(message.content).some((host) => isBlockedHost(host, settings.rules.link.blockedDomains)) && this.allowMatch(`link:${message.guildId}:${message.userId}:${message.channelId}`, now, settings.rules.link.cooldownSeconds)) {
      matches.push({ guildId: message.guildId, channelId: message.channelId, userId: message.userId, rule: 'link', reason: 'blocked-domain', proposedAction: settings.rules.link.proposedAction, enforced: false });
    }

    if (settings.rules.scam.enabled && hasScamPattern(normalized) && this.allowMatch(`scam:${message.guildId}:${message.userId}:${message.channelId}`, now, settings.rules.scam.cooldownSeconds)) {
      matches.push({ guildId: message.guildId, channelId: message.channelId, userId: message.userId, rule: 'scam', reason: 'scam-pattern', proposedAction: settings.rules.scam.proposedAction, enforced: false });
    }

    if (historyWindow > 0) {
      const nextHistory = historyWithCurrent.slice(-MAX_HISTORY_PER_GUILD);
      this.history.set(message.guildId, nextHistory);
    }
    return matches;
  }

  evaluateSecurityEvent(settings: AutoModSettings, event: AutoModSecurityEvent): AutoModMatch[] {
    if (!settings.enabled) {
      this.resetGuild(event.guildId);
      return [];
    }
    const ruleKind: AutoModRuleKind = event.kind === 'member-join' ? 'antiRaid' : 'antiNuke';
    const rule = settings.rules[ruleKind];
    if (!rule.enabled) return [];
    const now = Number.isFinite(event.timestamp) ? event.timestamp! : Date.now();
    const previous = (this.securityHistory.get(event.guildId) ?? []).filter((entry) => now - entry.timestamp <= rule.windowSeconds * 1_000);
    const historyWithCurrent = [...previous, { kind: event.kind, timestamp: now }];
    const occurrences = historyWithCurrent.filter((entry) => entry.kind === event.kind && now - entry.timestamp <= rule.windowSeconds * 1_000).length;
    const matches: AutoModMatch[] = [];
    if (occurrences >= rule.threshold && this.allowMatch(`${ruleKind}:${event.guildId}`, now, rule.cooldownSeconds)) {
      matches.push({
        guildId: event.guildId,
        channelId: '',
        userId: event.actorId ?? 'system:discord-event',
        rule: ruleKind,
        reason: event.kind === 'member-join' ? 'join-rate-threshold' : 'destructive-change-rate',
        proposedAction: rule.proposedAction,
        enforced: false
      });
    }
    this.securityHistory.set(event.guildId, historyWithCurrent.slice(-MAX_HISTORY_PER_GUILD));
    return matches;
  }

  reset(): void {
    this.history.clear();
    this.securityHistory.clear();
    this.lastMatches.clear();
  }

  resetGuild(guildId: string): void {
    this.history.delete(guildId);
    this.securityHistory.delete(guildId);
    for (const key of this.lastMatches.keys()) {
      if (key.endsWith(`:${guildId}`) || key.includes(`:${guildId}:`)) this.lastMatches.delete(key);
    }
  }

  private allowMatch(key: string, now: number, cooldownSeconds: number): boolean {
    const previous = this.lastMatches.get(key);
    if (previous !== undefined && now - previous < cooldownSeconds * 1_000) return false;
    this.lastMatches.set(key, now);
    return true;
  }
}

export class AutoModStore {
  private readonly filePath: string;
  private dataPromise: Promise<AutoModFile> | undefined;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(filePath = config.automodFile) {
    this.filePath = path.resolve(filePath);
  }

  async load(): Promise<void> {
    await this.readData();
  }

  private async loadData(): Promise<AutoModFile> {
    if (!this.dataPromise) {
      this.dataPromise = loadJsonStore<AutoModFile>(this.filePath, isAutoModFile, () => ({ version: 1 as const, guilds: {} }), 'Không thể đọc cấu hình AutoMod local.')
        .then((result) => result.data);
    }
    return this.dataPromise;
  }

  private async readData(): Promise<AutoModFile> {
    await this.mutationTail;
    return this.loadData();
  }

  private async mutate<T>(operation: (data: AutoModFile) => T | Promise<T>): Promise<T> {
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

  async get(guildId: string): Promise<AutoModSettings> {
    const data = await this.readData();
    return clone(normalizeAutoModSettings(data.guilds[guildId] ?? createDefaultSettings()));
  }

  async update(guildId: string, value: unknown): Promise<AutoModSettings> {
    return this.mutate((data) => {
      const current = normalizeAutoModSettings(data.guilds[guildId] ?? createDefaultSettings());
      const settings = normalizeAutoModSettings(value, current);
      data.guilds[guildId] = settings;
      return clone(settings);
    });
  }
}

export const automodStore = new AutoModStore();
