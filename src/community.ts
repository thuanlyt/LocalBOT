import path from 'node:path';
import { config } from './config.js';
import { loadJsonStore, saveJsonStoreAtomic } from './persistence.js';

export type CommunityMember = {
  userId: string;
  username: string;
  xp: number;
  level: number;
  messages: number;
  lastAwardedAt: number;
};

export type CommunityRank = CommunityMember & {
  rank: number;
  progress: number;
  nextLevelXp: number;
};

export type CommunityLeaderboardPage = {
  leaderboard: CommunityRank[];
  hasMore: boolean;
};

export type CommunityResetResult = {
  removedMembers: number;
  settings: CommunityGuildSettings;
};

export type CommunityGuildSettings = {
  ignoredChannelIds: string[];
  ignoredRoleIds: string[];
  cooldownSeconds: number | null;
  xpMultiplier: number;
  roleMultipliers: Record<string, number>;
  roleRewards: CommunityRoleReward[];
};

export type CommunityRoleReward = {
  roleId: string;
  level: number;
};

export type CommunitySettingsUpdate = {
  ignoredChannelIds?: unknown;
  ignoredRoleIds?: unknown;
  cooldownSeconds?: number | null;
  xpMultiplier?: number;
  roleMultipliers?: unknown;
  roleRewards?: unknown;
};

export type RecordMessageContext = {
  channelId?: string;
  roleIds?: string[];
};

type CommunityGuild = {
  members: Record<string, CommunityMember>;
  settings?: CommunityGuildSettings;
};

type CommunityFile = {
  version: 1;
  guilds: Record<string, CommunityGuild>;
};

export const MAX_COMMUNITY_COOLDOWN_SECONDS = 86_400;
export const MAX_LEADERBOARD_OFFSET = 10_000;
export const MAX_COMMUNITY_XP_MULTIPLIER = 5;
export const MAX_COMMUNITY_ROLE_RULES = 25;
export const MAX_COMMUNITY_IGNORED_IDS = 50;
export const MIN_COMMUNITY_REWARD_LEVEL = 2;
export const MAX_COMMUNITY_REWARD_LEVEL = 100;
export const COMMUNITY_BASE_XP = 15;

function createEmptyCommunityFile(): CommunityFile {
  return { version: 1, guilds: {} };
}

function isCommunityFile(parsed: unknown): parsed is CommunityFile {
  return Boolean(parsed) && typeof parsed === 'object' && (parsed as CommunityFile).version === 1 && typeof (parsed as CommunityFile).guilds === 'object' && (parsed as CommunityFile).guilds !== null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

export function levelStartXp(level: number): number {
  return Math.max(0, (Math.max(1, level) - 1) ** 2 * 100);
}

export function nextLevelXp(level: number): number {
  return Math.max(100, level ** 2 * 100);
}

function ensureGuild(data: CommunityFile, guildId: string): CommunityGuild {
  return data.guilds[guildId] ?? (data.guilds[guildId] = { members: {} });
}

function normalizeCommunityRoleId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Role ID phải là chuỗi hợp lệ.');
  const roleId = value.trim();
  if (!roleId || roleId.length > 64) throw new Error('Role ID không được để trống và tối đa 64 ký tự.');
  return roleId;
}

function normalizeCommunityIgnoredIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} phải là một danh sách.`);
  if (value.length > MAX_COMMUNITY_IGNORED_IDS) throw new Error(`${label} chỉ được có tối đa ${MAX_COMMUNITY_IGNORED_IDS} mục.`);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') throw new Error(`${label} chứa ID không hợp lệ.`);
    const id = entry.trim();
    if (!id || id.length > 64) throw new Error(`${label} chứa ID rỗng hoặc quá dài.`);
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function safeCommunityIgnoredIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, MAX_COMMUNITY_IGNORED_IDS)) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (!id || id.length > 64 || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function normalizeCommunityXpMultiplier(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_COMMUNITY_XP_MULTIPLIER) {
    throw new Error(`XP multiplier phải là số nguyên từ 1 đến ${MAX_COMMUNITY_XP_MULTIPLIER}.`);
  }
  return value as number;
}

export function normalizeCommunityRoleMultipliers(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Role multipliers phải là object roleId → multiplier.');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_COMMUNITY_ROLE_RULES) throw new Error(`Chỉ được cấu hình tối đa ${MAX_COMMUNITY_ROLE_RULES} role multiplier.`);
  const result: Record<string, number> = {};
  for (const [rawRoleId, rawMultiplier] of entries) {
    const roleId = normalizeCommunityRoleId(rawRoleId);
    result[roleId] = normalizeCommunityXpMultiplier(rawMultiplier);
  }
  return result;
}

export function normalizeCommunityRoleRewards(value: unknown): CommunityRoleReward[] {
  if (!Array.isArray(value)) throw new Error('Role rewards phải là một danh sách.');
  if (value.length > MAX_COMMUNITY_ROLE_RULES) throw new Error(`Chỉ được cấu hình tối đa ${MAX_COMMUNITY_ROLE_RULES} role reward.`);
  const seen = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Role reward không hợp lệ.');
    const roleId = normalizeCommunityRoleId((entry as { roleId?: unknown }).roleId);
    const level = (entry as { level?: unknown }).level;
    if (!Number.isInteger(level) || (level as number) < MIN_COMMUNITY_REWARD_LEVEL || (level as number) > MAX_COMMUNITY_REWARD_LEVEL) {
      throw new Error(`Role reward level phải từ ${MIN_COMMUNITY_REWARD_LEVEL} đến ${MAX_COMMUNITY_REWARD_LEVEL}.`);
    }
    if (seen.has(roleId)) throw new Error('Mỗi role chỉ được có một mốc reward.');
    seen.add(roleId);
    return { roleId, level: level as number };
  });
}

function safeRoleMultipliers(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [roleId, multiplier] of Object.entries(value as Record<string, unknown>).slice(0, MAX_COMMUNITY_ROLE_RULES)) {
    if (roleId.length > 64 || !Number.isInteger(multiplier) || (multiplier as number) < 1 || (multiplier as number) > MAX_COMMUNITY_XP_MULTIPLIER) continue;
    result[roleId] = multiplier as number;
  }
  return result;
}

function safeRoleRewards(value: unknown): CommunityRoleReward[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const rewards: CommunityRoleReward[] = [];
  for (const entry of value.slice(0, MAX_COMMUNITY_ROLE_RULES)) {
    if (!entry || typeof entry !== 'object') continue;
    const roleId = typeof (entry as { roleId?: unknown }).roleId === 'string' ? (entry as { roleId: string }).roleId.trim() : '';
    const level = (entry as { level?: unknown }).level;
    if (!roleId || roleId.length > 64 || seen.has(roleId) || !Number.isInteger(level) || (level as number) < MIN_COMMUNITY_REWARD_LEVEL || (level as number) > MAX_COMMUNITY_REWARD_LEVEL) continue;
    seen.add(roleId);
    rewards.push({ roleId, level: level as number });
  }
  return rewards;
}

function readSettings(guild: CommunityGuild | undefined): CommunityGuildSettings {
  const cooldown = guild?.settings?.cooldownSeconds;
  return {
    ignoredChannelIds: safeCommunityIgnoredIds(guild?.settings?.ignoredChannelIds),
    ignoredRoleIds: safeCommunityIgnoredIds(guild?.settings?.ignoredRoleIds),
    cooldownSeconds: typeof cooldown === 'number'
      && Number.isInteger(cooldown)
      && cooldown >= 0
      && cooldown <= MAX_COMMUNITY_COOLDOWN_SECONDS
      ? cooldown
      : null,
    xpMultiplier: Number.isInteger(guild?.settings?.xpMultiplier)
      && (guild?.settings?.xpMultiplier ?? 0) >= 1
      && (guild?.settings?.xpMultiplier ?? 0) <= MAX_COMMUNITY_XP_MULTIPLIER
      ? guild!.settings!.xpMultiplier
      : 1,
    roleMultipliers: safeRoleMultipliers(guild?.settings?.roleMultipliers),
    roleRewards: safeRoleRewards(guild?.settings?.roleRewards)
  };
}

export function normalizeCommunityCooldownSeconds(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > MAX_COMMUNITY_COOLDOWN_SECONDS) {
    throw new Error(`Cooldown phải là số nguyên từ 0 đến ${MAX_COMMUNITY_COOLDOWN_SECONDS} giây hoặc null.`);
  }
  return value;
}

export class CommunityStore {
  private readonly filePath: string;
  private readonly cooldownMs: number;
  private dataPromise: Promise<CommunityFile> | undefined;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(filePath = config.communityFile, cooldownMs = config.communityXpCooldownMs) {
    this.filePath = path.resolve(filePath);
    this.cooldownMs = Math.max(0, cooldownMs);
  }

  async load(): Promise<void> {
    await this.readData();
  }

  private async loadData(): Promise<CommunityFile> {
    if (!this.dataPromise) {
      this.dataPromise = loadJsonStore(this.filePath, isCommunityFile, createEmptyCommunityFile, 'Không thể đọc dữ liệu Community local.').then((result) => result.data);
    }
    return this.dataPromise;
  }

  private async save(data: CommunityFile): Promise<void> {
    await saveJsonStoreAtomic(this.filePath, data);
  }

  private async mutate<T>(operation: (data: CommunityFile) => T | Promise<T>): Promise<T> {
    let result!: T;
    const task = this.mutationTail.then(async () => {
      const data = await this.loadData();
      result = await operation(data);
      await this.save(data);
    });
    this.mutationTail = task.then(() => undefined, () => undefined);
    await task;
    return result;
  }

  private async readData(): Promise<CommunityFile> {
    await this.mutationTail;
    return this.loadData();
  }

  async recordMessage(
    guildId: string,
    userId: string,
    username: string,
    now = Date.now(),
    context: RecordMessageContext = {}
  ): Promise<CommunityMember | null> {
    if (!guildId || !userId) return null;
    return this.mutate((data) => {
      const guild = ensureGuild(data, guildId);
      const settings = readSettings(guild);
      if (context.channelId && settings.ignoredChannelIds.includes(context.channelId)) return null;
      if (context.roleIds?.some((roleId) => settings.ignoredRoleIds.includes(roleId))) return null;
      const existing = guild.members[userId] ?? {
        userId,
        username: username.trim() || userId,
        xp: 0,
        level: 1,
        messages: 0,
        lastAwardedAt: 0
      } satisfies CommunityMember;
      existing.username = username.trim() || existing.username;
      existing.messages += 1;
      const cooldownMs = settings.cooldownSeconds === null ? this.cooldownMs : settings.cooldownSeconds * 1000;
      if (now - existing.lastAwardedAt < cooldownMs) {
        guild.members[userId] = existing;
        return null;
      }
      const roleMultiplier = Math.max(1, ...(context.roleIds ?? []).map((roleId) => settings.roleMultipliers[roleId] ?? 1));
      existing.xp += Math.max(1, Math.round(COMMUNITY_BASE_XP * settings.xpMultiplier * roleMultiplier));
      existing.level = levelForXp(existing.xp);
      existing.lastAwardedAt = now;
      guild.members[userId] = existing;
      return clone(existing);
    });
  }

  async leaderboardPage(guildId: string, limit = 10, offset = 0): Promise<CommunityLeaderboardPage> {
    const safeOffset = Math.min(Math.max(0, Math.floor(offset)), MAX_LEADERBOARD_OFFSET);
    const data = await this.readData();
    const members = Object.values(data.guilds[guildId]?.members ?? {})
      .sort((left, right) => right.xp - left.xp || right.messages - left.messages || left.username.localeCompare(right.username, 'vi'))
      .slice(safeOffset, safeOffset + Math.min(Math.max(1, Math.floor(limit)), 100) + 1);
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
    return {
      leaderboard: members.slice(0, safeLimit).map((member, index) => this.toRank(member, safeOffset + index + 1)),
      hasMore: members.length > safeLimit
    };
  }

  async leaderboard(guildId: string, limit = 10, offset = 0): Promise<CommunityRank[]> {
    return (await this.leaderboardPage(guildId, limit, offset)).leaderboard;
  }

  async member(guildId: string, userId: string): Promise<CommunityRank | null> {
    const data = await this.readData();
    const members = Object.values(data.guilds[guildId]?.members ?? {})
      .sort((left, right) => right.xp - left.xp || right.messages - left.messages || left.username.localeCompare(right.username, 'vi'));
    const index = members.findIndex((member) => member.userId === userId);
    const found = members[index];
    return found ? this.toRank(found, index + 1) : null;
  }

  async getSettings(guildId: string): Promise<CommunityGuildSettings> {
    const data = await this.readData();
    return clone(readSettings(data.guilds[guildId]));
  }

  async setCooldownSeconds(guildId: string, value: number | null): Promise<CommunityGuildSettings> {
    return this.updateSettings(guildId, { cooldownSeconds: value });
  }

  async updateSettings(guildId: string, patch: CommunitySettingsUpdate): Promise<CommunityGuildSettings> {
    const hasKnownField = Object.keys(patch).some((key) => ['ignoredChannelIds', 'ignoredRoleIds', 'cooldownSeconds', 'xpMultiplier', 'roleMultipliers', 'roleRewards'].includes(key));
    if (!hasKnownField) throw new Error('Không có cấu hình Community hợp lệ để cập nhật.');
    const ignoredChannelIds = Object.prototype.hasOwnProperty.call(patch, 'ignoredChannelIds')
      ? normalizeCommunityIgnoredIds(patch.ignoredChannelIds, 'Danh sách kênh bỏ qua')
      : undefined;
    const ignoredRoleIds = Object.prototype.hasOwnProperty.call(patch, 'ignoredRoleIds')
      ? normalizeCommunityIgnoredIds(patch.ignoredRoleIds, 'Danh sách role bỏ qua')
      : undefined;
    const cooldownSeconds = Object.prototype.hasOwnProperty.call(patch, 'cooldownSeconds')
      ? normalizeCommunityCooldownSeconds(patch.cooldownSeconds ?? null)
      : undefined;
    const xpMultiplier = Object.prototype.hasOwnProperty.call(patch, 'xpMultiplier')
      ? normalizeCommunityXpMultiplier(patch.xpMultiplier)
      : undefined;
    const roleMultipliers = Object.prototype.hasOwnProperty.call(patch, 'roleMultipliers')
      ? normalizeCommunityRoleMultipliers(patch.roleMultipliers)
      : undefined;
    const roleRewards = Object.prototype.hasOwnProperty.call(patch, 'roleRewards')
      ? normalizeCommunityRoleRewards(patch.roleRewards)
      : undefined;
    return this.mutate((data) => {
      const guild = ensureGuild(data, guildId);
      const settings = readSettings(guild);
      if (ignoredChannelIds !== undefined) settings.ignoredChannelIds = ignoredChannelIds;
      if (ignoredRoleIds !== undefined) settings.ignoredRoleIds = ignoredRoleIds;
      if (cooldownSeconds !== undefined) settings.cooldownSeconds = cooldownSeconds;
      if (xpMultiplier !== undefined) settings.xpMultiplier = xpMultiplier;
      if (roleMultipliers !== undefined) settings.roleMultipliers = roleMultipliers;
      if (roleRewards !== undefined) settings.roleRewards = roleRewards;
      guild.settings = settings;
      return clone(settings);
    });
  }

  async setXpMultiplier(guildId: string, value: number): Promise<CommunityGuildSettings> {
    return this.updateSettings(guildId, { xpMultiplier: value });
  }

  async setRoleMultiplier(guildId: string, roleId: string, multiplier: number): Promise<CommunityGuildSettings> {
    const cleanRoleId = normalizeCommunityRoleId(roleId);
    const cleanMultiplier = normalizeCommunityXpMultiplier(multiplier);
    return this.mutate((data) => {
      const guild = ensureGuild(data, guildId);
      const settings = readSettings(guild);
      if (!Object.prototype.hasOwnProperty.call(settings.roleMultipliers, cleanRoleId) && Object.keys(settings.roleMultipliers).length >= MAX_COMMUNITY_ROLE_RULES) {
        throw new Error(`Chỉ được cấu hình tối đa ${MAX_COMMUNITY_ROLE_RULES} role multiplier.`);
      }
      settings.roleMultipliers[cleanRoleId] = cleanMultiplier;
      guild.settings = settings;
      return clone(settings);
    });
  }

  async removeRoleMultiplier(guildId: string, roleId: string): Promise<CommunityGuildSettings> {
    const cleanRoleId = normalizeCommunityRoleId(roleId);
    return this.mutate((data) => {
      const guild = ensureGuild(data, guildId);
      const settings = readSettings(guild);
      delete settings.roleMultipliers[cleanRoleId];
      guild.settings = settings;
      return clone(settings);
    });
  }

  async setRoleReward(guildId: string, roleId: string, level: number): Promise<CommunityGuildSettings> {
    const cleanRoleId = normalizeCommunityRoleId(roleId);
    const cleanLevel = normalizeCommunityRoleRewards([{ roleId: cleanRoleId, level }])[0]!.level;
    return this.mutate((data) => {
      const guild = ensureGuild(data, guildId);
      const settings = readSettings(guild);
      const existing = settings.roleRewards.find((reward) => reward.roleId === cleanRoleId);
      if (existing) existing.level = cleanLevel;
      else {
        if (settings.roleRewards.length >= MAX_COMMUNITY_ROLE_RULES) throw new Error(`Chỉ được cấu hình tối đa ${MAX_COMMUNITY_ROLE_RULES} role reward.`);
        settings.roleRewards.push({ roleId: cleanRoleId, level: cleanLevel });
      }
      guild.settings = settings;
      return clone(settings);
    });
  }

  async removeRoleReward(guildId: string, roleId: string): Promise<CommunityGuildSettings> {
    const cleanRoleId = normalizeCommunityRoleId(roleId);
    return this.mutate((data) => {
      const guild = ensureGuild(data, guildId);
      const settings = readSettings(guild);
      settings.roleRewards = settings.roleRewards.filter((reward) => reward.roleId !== cleanRoleId);
      guild.settings = settings;
      return clone(settings);
    });
  }

  async roleRewardsForLevel(guildId: string, level: number): Promise<CommunityRoleReward[]> {
    const data = await this.readData();
    return clone(readSettings(data.guilds[guildId]).roleRewards.filter((reward) => reward.level <= level));
  }

  async resetProgress(guildId: string): Promise<CommunityResetResult> {
    return this.mutate((data) => {
      const guild = data.guilds[guildId];
      if (!guild) return { removedMembers: 0, settings: readSettings(undefined) };
      const removedMembers = Object.keys(guild.members).length;
      guild.members = {};
      const settings = readSettings(guild);
      guild.settings = settings;
      return { removedMembers, settings: clone(settings) };
    });
  }

  async addIgnoredChannel(guildId: string, channelId: string): Promise<CommunityGuildSettings> {
    return this.mutate((data) => {
      const guild = ensureGuild(data, guildId);
      const settings = readSettings(guild);
      const cleanChannelId = normalizeCommunityIgnoredIds([channelId], 'Danh sách kênh bỏ qua')[0]!;
      if (!settings.ignoredChannelIds.includes(cleanChannelId)) {
        if (settings.ignoredChannelIds.length >= MAX_COMMUNITY_IGNORED_IDS) throw new Error(`Danh sách kênh bỏ qua chỉ được có tối đa ${MAX_COMMUNITY_IGNORED_IDS} mục.`);
        settings.ignoredChannelIds.push(cleanChannelId);
      }
      guild.settings = settings;
      return clone(settings);
    });
  }

  async removeIgnoredChannel(guildId: string, channelId: string): Promise<CommunityGuildSettings> {
    return this.mutate((data) => {
      const guild = ensureGuild(data, guildId);
      const settings = readSettings(guild);
      const cleanChannelId = normalizeCommunityIgnoredIds([channelId], 'Danh sách kênh bỏ qua')[0]!;
      settings.ignoredChannelIds = settings.ignoredChannelIds.filter((id) => id !== cleanChannelId);
      guild.settings = settings;
      return clone(settings);
    });
  }

  async addIgnoredRole(guildId: string, roleId: string): Promise<CommunityGuildSettings> {
    return this.mutate((data) => {
      const guild = ensureGuild(data, guildId);
      const settings = readSettings(guild);
      const cleanRoleId = normalizeCommunityIgnoredIds([roleId], 'Danh sách role bỏ qua')[0]!;
      if (!settings.ignoredRoleIds.includes(cleanRoleId)) {
        if (settings.ignoredRoleIds.length >= MAX_COMMUNITY_IGNORED_IDS) throw new Error(`Danh sách role bỏ qua chỉ được có tối đa ${MAX_COMMUNITY_IGNORED_IDS} mục.`);
        settings.ignoredRoleIds.push(cleanRoleId);
      }
      guild.settings = settings;
      return clone(settings);
    });
  }

  async removeIgnoredRole(guildId: string, roleId: string): Promise<CommunityGuildSettings> {
    return this.mutate((data) => {
      const guild = ensureGuild(data, guildId);
      const settings = readSettings(guild);
      const cleanRoleId = normalizeCommunityIgnoredIds([roleId], 'Danh sách role bỏ qua')[0]!;
      settings.ignoredRoleIds = settings.ignoredRoleIds.filter((id) => id !== cleanRoleId);
      guild.settings = settings;
      return clone(settings);
    });
  }

  private toRank(member: CommunityMember, rank: number): CommunityRank {
    const start = levelStartXp(member.level);
    const next = nextLevelXp(member.level);
    return {
      ...clone(member),
      rank,
      progress: Math.min(100, Math.round(((member.xp - start) / Math.max(1, next - start)) * 100)),
      nextLevelXp: next
    };
  }
}

export const communityStore = new CommunityStore();
