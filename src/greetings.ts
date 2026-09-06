import path from 'node:path';
import { EmbedBuilder, type GuildTextBasedChannel } from 'discord.js';
import { config } from './config.js';
import { loadJsonStore, saveJsonStoreAtomic } from './persistence.js';

export type GreetingKind = 'welcome' | 'goodbye';

export type GreetingTemplate = {
  enabled: boolean;
  channelId: string | null;
  message: string;
  imageUrl: string | null;
};

export type GreetingSettings = {
  welcome: GreetingTemplate;
  goodbye: GreetingTemplate;
};

export type GreetingRenderContext = {
  user: string;
  userId?: string;
  username: string;
  guild: string;
  memberCount: number;
};

type GreetingFile = { version: 1; guilds: Record<string, GreetingSettings> };

const MAX_MESSAGE_LENGTH = 1_000;
const MAX_IMAGE_URL_LENGTH = 2_048;
const MAX_CHANNEL_ID_LENGTH = 64;

function createTemplate(message: string): GreetingTemplate {
  return { enabled: false, channelId: null, message, imageUrl: null };
}

function defaultSettings(): GreetingSettings {
  return {
    welcome: createTemplate('Chào mừng {user} đến với {guild}!'),
    goodbye: createTemplate('Tạm biệt {username}. Chúc bạn một ngày tốt lành!')
  };
}

function isGreetingFile(parsed: unknown): parsed is GreetingFile {
  return Boolean(parsed) && typeof parsed === 'object' && (parsed as GreetingFile).version === 1 && typeof (parsed as GreetingFile).guilds === 'object' && (parsed as GreetingFile).guilds !== null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function normalizeGreetingKind(value: unknown): GreetingKind {
  if (value === 'welcome' || value === 'goodbye') return value;
  throw new Error('kind phải là welcome hoặc goodbye.');
}

function normalizeChannelId(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > MAX_CHANNEL_ID_LENGTH) throw new Error('channelId không hợp lệ.');
  return value.trim();
}

function normalizeImageUrl(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > MAX_IMAGE_URL_LENGTH) throw new Error('imageUrl không hợp lệ.');
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('imageUrl phải là URL HTTPS hợp lệ.');
  }
  if (parsed.protocol !== 'https:') throw new Error('imageUrl phải dùng HTTPS.');
  return parsed.toString();
}

function normalizeMessage(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_MESSAGE_LENGTH) throw new Error(`message phải dài 1..${MAX_MESSAGE_LENGTH} ký tự.`);
  return value.trim();
}

export function normalizeGreetingTemplate(value: unknown, fallback: GreetingTemplate): GreetingTemplate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('template phải là object.');
  const input = value as Record<string, unknown>;
  const enabled = input.enabled === undefined ? fallback.enabled : input.enabled;
  if (typeof enabled !== 'boolean') throw new Error('enabled phải là boolean.');
  return {
    enabled,
    channelId: normalizeChannelId(input.channelId, fallback.channelId),
    message: normalizeMessage(input.message, fallback.message),
    imageUrl: normalizeImageUrl(input.imageUrl, fallback.imageUrl)
  };
}

function normalizeSettings(value: unknown): GreetingSettings {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const defaults = defaultSettings();
  return {
    welcome: normalizeGreetingTemplate(input.welcome ?? {}, defaults.welcome),
    goodbye: normalizeGreetingTemplate(input.goodbye ?? {}, defaults.goodbye)
  };
}

export function renderGreeting(template: GreetingTemplate, context: GreetingRenderContext): string {
  const values: Record<string, string> = {
    user: context.user,
    username: context.username,
    guild: context.guild,
    memberCount: String(Math.max(0, context.memberCount))
  };
  return template.message.replace(/\{(user|username|guild|memberCount)\}/g, (_, token: string) => values[token] ?? `{${token}}`);
}

export function previewGreeting(template: GreetingTemplate, guildName: string, memberCount: number, username = 'Thành viên xem trước'): { text: string; imageUrl: string | null } {
  return {
    text: renderGreeting(template, { user: `@${username}`, username, guild: guildName, memberCount }),
    imageUrl: template.imageUrl
  };
}

export function buildGreetingPayload(template: GreetingTemplate, context: GreetingRenderContext): { content: string; embeds: EmbedBuilder[]; allowedMentions: { users: string[] } | { parse: [] } } {
  return {
    content: renderGreeting(template, context),
    embeds: template.imageUrl ? [new EmbedBuilder().setImage(template.imageUrl)] : [],
    allowedMentions: context.userId ? { users: [context.userId] } : { parse: [] }
  };
}

export async function sendGreetingToChannel(channel: GuildTextBasedChannel, template: GreetingTemplate, context: GreetingRenderContext): Promise<void> {
  await channel.send(buildGreetingPayload(template, context));
}

export class GreetingStore {
  private readonly filePath: string;
  private dataPromise: Promise<GreetingFile> | undefined;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(filePath = config.greetingsFile) {
    this.filePath = path.resolve(filePath);
  }

  async load(): Promise<void> {
    await this.readData();
  }

  private async loadData(): Promise<GreetingFile> {
    if (!this.dataPromise) {
      this.dataPromise = loadJsonStore<GreetingFile>(this.filePath, isGreetingFile, () => ({ version: 1 as const, guilds: {} }), 'Không thể đọc dữ liệu Welcome/Goodbye local.')
        .then((result) => result.data);
    }
    return this.dataPromise!;
  }

  private async readData(): Promise<GreetingFile> {
    await this.mutationTail;
    return this.loadData();
  }

  private async mutate<T>(operation: (data: GreetingFile) => T | Promise<T>): Promise<T> {
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

  async get(guildId: string): Promise<GreetingSettings> {
    const data = await this.readData();
    return clone(normalizeSettings(data.guilds[guildId]));
  }

  async update(guildId: string, kind: GreetingKind, value: unknown): Promise<GreetingSettings> {
    return this.mutate((data) => {
      const current = normalizeSettings(data.guilds[guildId]);
      current[kind] = normalizeGreetingTemplate(value, current[kind]);
      data.guilds[guildId] = current;
      return clone(current);
    });
  }
}

export const greetingStore = new GreetingStore();
