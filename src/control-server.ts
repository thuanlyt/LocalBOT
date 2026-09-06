import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { type Client, type Guild, type GuildTextBasedChannel, type VoiceBasedChannel } from 'discord.js';
import ffmpegPath from 'ffmpeg-static';
import { MediaProviderError, type MediaProvider, type MediaSearchSource } from './media-types.js';
import { downloadMediaAudio, resolveMedia, searchMedia } from './media.js';
import {
  clearQueue,
  cycleRepeat,
  enqueue,
  destroyGuildPlayer,
  getPlayerSnapshot,
  getQueue,
  getOrCreatePlayer,
  joinOrMovePlayer,
  isVoiceChannel,
  moveInQueue,
  pause,
  previous,
  removeFromQueue,
  resume,
  setVolume,
  setRepeatMode,
  skip,
  stop,
  subscribePlayer,
  toggleShuffle
} from './player.js';
import { config, validateControlBinding } from './config.js';
import { listGuildRoles, listTextChannels, listVoiceChannels, searchGuildMembers, summarizeGuild, summarizeGuildPermissions, summarizeMusicReadiness, summarizeVoiceChannel, type MusicChannelReadiness } from './voice.js';
import { CommandRegistrationError, registerSlashCommands } from './command-registration.js';
import { buildEqualizerFilter, equalizerStore, type EqualizerPreset, type EqualizerStore } from './equalizer.js';
import { playlistStore } from './playlists.js';
import { musicPermissionStore, type MusicPermissionMode } from './music-permissions.js';
import { communityStore, MAX_COMMUNITY_COOLDOWN_SECONDS, MAX_LEADERBOARD_OFFSET, type CommunitySettingsUpdate, type CommunityStore } from './community.js';
import { auditLogStore, type AuditLogStore } from './audit-log.js';
import { createLocalBotBackup } from './backup.js';
import { restoreLocalBotBackup, RestoreTransactionError, RestoreValidationError } from './restore.js';
import { isSoundCloudAvailable, isSoundCloudConfigured, isSoundCloudEnabled, testSoundCloudConnection } from './soundcloud.js';
import { providerSettingsStore, type ProviderSettingsStore } from './provider-settings.js';
import { buildRuntimeDiagnostics } from './runtime-diagnostics.js';
import { publishGuildVoice, subscribeGuildVoice } from './voice-events.js';
import { greetingStore, normalizeGreetingKind, previewGreeting, sendGreetingToChannel, type GreetingKind, type GreetingStore } from './greetings.js';
import { automodStore, type AutoModStore } from './automod.js';
import { AUTO_MOD_REVIEW_STATUSES, AutoModReviewConflictError, AutoModReviewNotFoundError, AutoModReviewValidationError, automodReviewStore, type AutoModReviewStatus, type AutoModReviewStore } from './automod-review.js';
import { OllamaRequestError, ollamaStore, type OllamaSettingsPatch, type OllamaStore, type OllamaSuggestionSurface } from './ollama.js';
import { DiscordAuditLogError, fetchDiscordAuditLog } from './discord-audit-log.js';

const MAX_BODY_BYTES = 8 * 1024 * 1024;

class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: JsonRecord) {
    super(message);
    this.name = 'HttpError';
  }
}

type JsonRecord = Record<string, unknown>;
type ControlServerOptions = { providerSettings?: ProviderSettingsStore; community?: CommunityStore; greetings?: GreetingStore; automod?: AutoModStore; automodReview?: AutoModReviewStore; ollama?: OllamaStore; audit?: AuditLogStore; equalizer?: EqualizerStore; onAutoModRecovery?: (guildId: string) => void | Promise<void> };

function sendJson(response: ServerResponse, status: number, body: JsonRecord): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendJson(response, error.status, { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } });
    return;
  }
  if (error instanceof MediaProviderError) {
    const status = error.status
      ?? (error.code === 'TRACK_NOT_FOUND' || error.code.endsWith('_NOT_FOUND') ? 404
        : error.code.includes('INVALID') || error.code.includes('EMPTY') || error.code.includes('UNSUPPORTED') || error.code.includes('COLLECTION') ? 400
          : error.code.includes('NOT_CONFIGURED') ? 503
            : error.code.includes('FORBIDDEN') || error.code.includes('BLOCKED') ? 403
              : error.code.includes('RATE_LIMIT') ? 429
                : 502);
    sendJson(response, status, {
      error: { code: error.code, message: error.message, retryable: error.retryable }
    });
    return;
  }
  if (error instanceof DiscordAuditLogError) {
    sendJson(response, error.code === 'DISCORD_AUDIT_PERMISSION_DENIED' ? 403 : 502, {
      error: { code: error.code, message: error.message, retryable: error.code === 'DISCORD_AUDIT_FETCH_FAILED' }
    });
    return;
  }
  if (error instanceof CommandRegistrationError) {
    sendJson(response, error.httpStatus, {
      error: { code: 'COMMAND_REGISTRATION_FAILED', message: error.message, retryable: error.retryable }
    });
    return;
  }
  sendJson(response, 500, { error: { code: 'INTERNAL_ERROR', message: 'LocalBot không thể hoàn thành thao tác này.' } });
}

function setCors(response: ServerResponse, request: IncomingMessage): void {
  const origin = request.headers.origin;
  if (origin && /^(?:https?:\/\/(?:localhost|127\.0\.0\.1|tauri\.localhost)(?::\d+)?|tauri:\/\/localhost)$/.test(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'Origin');
  }
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
}

async function readJson(request: IncomingMessage): Promise<JsonRecord> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'BODY_TOO_LARGE', 'Payload vượt quá giới hạn cho phép.');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Payload JSON không hợp lệ.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'INVALID_BODY', 'Payload phải là một object JSON.');
  }
  return parsed as JsonRecord;
}

function stringField(body: JsonRecord, field: string, required = true): string | undefined {
  const value = body[field];
  if (value == null && !required) return undefined;
  if (typeof value !== 'string' || (required && !value.trim())) throw new HttpError(400, 'INVALID_INPUT', `${field} phải là chuỗi không rỗng.`);
  return value.trim();
}

function integerField(body: JsonRecord, field: string): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new HttpError(400, 'INVALID_INPUT', `${field} phải là số nguyên dương.`);
  }
  return value;
}

function integerFieldAllowZero(body: JsonRecord, field: string, min: number, max: number): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, 'INVALID_INPUT', `${field} phải là số nguyên từ ${min} đến ${max}.`);
  }
  return value;
}

function booleanField(body: JsonRecord, field: string): boolean {
  const value = body[field];
  if (typeof value !== 'boolean') throw new HttpError(400, 'INVALID_INPUT', `${field} phải là boolean.`);
  return value;
}

function greetingKindField(value: unknown): GreetingKind {
  try {
    return normalizeGreetingKind(value);
  } catch {
    throw new HttpError(400, 'INVALID_GREETING_KIND', 'kind phải là welcome hoặc goodbye.');
  }
}

function queryLimit(requestUrl: URL): number {
  const raw = requestUrl.searchParams.get('limit');
  if (raw == null || raw === '') return 10;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new HttpError(400, 'INVALID_LIMIT', 'limit phải là số nguyên từ 1 đến 100.');
  }
  return limit;
}

function queryOffset(requestUrl: URL): number {
  const raw = requestUrl.searchParams.get('offset');
  if (raw == null || raw === '') return 0;
  const offset = Number(raw);
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_LEADERBOARD_OFFSET) {
    throw new HttpError(400, 'INVALID_OFFSET', `offset phải là số nguyên từ 0 đến ${MAX_LEADERBOARD_OFFSET}.`);
  }
  return offset;
}

function queryText(requestUrl: URL, name: string, maxLength = 100): string | undefined {
  const raw = requestUrl.searchParams.get(name);
  if (raw == null || raw.trim() === '') return undefined;
  const value = raw.trim();
  if (value.length > maxLength) throw new HttpError(400, 'INVALID_QUERY', `${name} vượt quá giới hạn cho phép.`);
  return value;
}

function auditExportFormat(requestUrl: URL): 'json' | 'csv' {
  const raw = requestUrl.searchParams.get('format');
  if (raw == null || raw.trim() === '' || raw === 'json') return 'json';
  if (raw === 'csv') return 'csv';
  throw new HttpError(400, 'INVALID_QUERY', 'format phải là json hoặc csv.');
}

function csvCell(value: string | null): string {
  const normalized = value ?? '';
  // Prevent spreadsheet formula injection when a local audit export is opened in a spreadsheet app.
  const safe = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${safe.replaceAll('"', '""')}"`;
}

function auditCsv(entries: Awaited<ReturnType<AuditLogStore['list']>>): string {
  const lines = [
    ['id', 'timestamp', 'actor', 'action', 'guildId', 'detail'].map((value) => csvCell(value)).join(','),
    ...entries.map((entry) => [entry.id, entry.timestamp, entry.actor, entry.action, entry.guildId, entry.detail].map(csvCell).join(','))
  ];
  return `${lines.join('\r\n')}\r\n`;
}

async function recordAudit(action: string, guildId: string | null, detail: string, store: AuditLogStore = auditLogStore): Promise<void> {
  try {
    await store.record({ actor: 'native', action, guildId, detail });
  } catch (error) {
    console.error('[audit]', error instanceof Error ? error.message : error);
  }
}

function sourceField(body: JsonRecord, allowAll: boolean): MediaProvider | MediaSearchSource {
  const value = body.source ?? 'youtube';
  if (value === 'youtube' || value === 'soundcloud' || (allowAll && value === 'all')) return value;
  throw new HttpError(400, 'INVALID_SOURCE', 'Nguồn phải là youtube, soundcloud hoặc all.');
}

function requireGuild(client: Client, guildId: string) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new HttpError(404, 'GUILD_NOT_FOUND', 'Không tìm thấy server hoặc bot chưa tham gia server.');
  return guild;
}

function ensureMusicReadiness(readiness: MusicChannelReadiness): void {
  if (readiness.readiness === 'ready') return;
  if (readiness.readiness === 'unsupported') {
    throw new HttpError(400, 'VOICE_CHANNEL_UNSUPPORTED', 'Music hiện chưa hỗ trợ Stage channel này.', { readiness });
  }
  if (readiness.readiness === 'unknown') {
    throw new HttpError(409, 'VOICE_READINESS_UNKNOWN', 'Chưa xác định được quyền hiệu lực của bot trong voice channel này. Hãy làm mới rồi thử lại.', { readiness });
  }
  const missing = readiness.missing.join(', ');
  const message = readiness.missing.includes('ViewChannel')
    ? `LocalBot không thể nhìn voice channel này vì thiếu quyền: ${missing}.`
    : readiness.missing.includes('Connect')
      ? `LocalBot không thể tham gia voice channel này vì thiếu quyền: ${missing}.`
      : `LocalBot có thể tham gia nhưng chưa thể phát âm thanh vì thiếu quyền: ${missing}.`;
  throw new HttpError(403, 'VOICE_MUSIC_PERMISSION_MISSING', message, { readiness });
}

async function requireGuildVoiceChannel(client: Client, guild: Guild, channelId: string): Promise<VoiceBasedChannel> {
  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch {
    throw new HttpError(404, 'VOICE_CHANNEL_NOT_FOUND', 'Không tìm thấy voice channel này trong Discord.');
  }
  if (!channel) throw new HttpError(404, 'VOICE_CHANNEL_NOT_FOUND', 'Không tìm thấy voice channel này trong Discord.');
  if (!isVoiceChannel(channel)) throw new HttpError(400, 'INVALID_VOICE_CHANNEL', 'Channel đã chọn không phải voice channel.');
  if (channel.guild.id !== guild.id) throw new HttpError(400, 'CHANNEL_NOT_IN_GUILD', 'Voice channel không thuộc guild đang chọn.');
  return channel;
}

async function resolveForBody(body: JsonRecord): Promise<Awaited<ReturnType<typeof resolveMedia>>> {
  const query = stringField(body, 'query')!;
  const source = sourceField(body, false) as MediaProvider;
  return resolveMedia(query, source);
}

async function streamLocalAudio(guildId: string | undefined, input: string, request: IncomingMessage, response: ServerResponse, equalizer: EqualizerStore): Promise<void> {
  if (!ffmpegPath) throw new HttpError(500, 'FFMPEG_UNAVAILABLE', 'Không tìm thấy FFmpeg đi kèm LocalBot.');
  const track = await resolveMedia(input);
  const mediaSource = await downloadMediaAudio(track);
  const equalizerFilter = guildId ? buildEqualizerFilter(equalizer.get(guildId)) : undefined;
  const ffmpeg = spawn(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', mediaSource.kind === 'stream' ? 'pipe:0' : mediaSource.url,
    ...(equalizerFilter ? ['-af', equalizerFilter] : []),
    '-vn',
    '-codec:a', 'libmp3lame',
    '-b:a', '192k',
    '-f', 'mp3',
    'pipe:1'
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  const reader = mediaSource.kind === 'stream' ? mediaSource.stream.getReader() : null;
  response.writeHead(200, {
    'content-type': 'audio/mpeg',
    'cache-control': 'no-store',
    'x-localbot-track': encodeURIComponent(`${track.provider}:${track.id}`)
  });
  let closed = false;
  const stop = () => {
    if (closed) return;
    closed = true;
    if (reader) void reader.cancel().catch(() => undefined);
    if (!ffmpeg.stdin.destroyed) ffmpeg.stdin.destroy();
    if (!ffmpeg.stdout.destroyed) ffmpeg.stdout.destroy();
    if (!ffmpeg.stderr.destroyed) ffmpeg.stderr.destroy();
    if (!ffmpeg.killed) ffmpeg.kill();
  };
  request.once('close', stop);
  response.once('close', stop);
  const reportPipeError = (pipeName: string) => (error: Error) => {
    if (!closed) console.error(`[local-audio:${guildId ?? 'global'}:${pipeName}] ${error.message}`);
  };
  ffmpeg.stdin.on('error', reportPipeError('stdin'));
  ffmpeg.stdout.on('error', reportPipeError('stdout'));
  ffmpeg.stderr.on('error', reportPipeError('stderr'));
  ffmpeg.stderr.on('data', (data: Buffer) => console.error(`[local-audio:${guildId}] ${data.toString().trim()}`));
  ffmpeg.once('error', stop);
  ffmpeg.once('close', () => {
    if (!closed && !response.writableEnded) response.end();
    stop();
  });
  ffmpeg.stdout.on('data', (chunk: Buffer) => {
    if (!closed && !response.write(chunk)) ffmpeg.stdout.pause();
  });
  response.on('drain', () => ffmpeg.stdout.resume());
  ffmpeg.stdout.once('end', () => {
    if (!closed && !response.writableEnded) response.end();
    stop();
  });

  try {
    if (reader) {
      while (!closed) {
        const result = await reader.read();
        if (result.done) break;
        if (result.value && !ffmpeg.stdin.write(result.value)) {
          await new Promise<void>((resolve) => {
            const finish = () => {
              ffmpeg.stdin.off('drain', finish);
              ffmpeg.stdin.off('close', finish);
              ffmpeg.stdin.off('error', finish);
              resolve();
            };
            ffmpeg.stdin.once('drain', finish);
            ffmpeg.stdin.once('close', finish);
            ffmpeg.stdin.once('error', finish);
          });
        }
      }
    } else if (!ffmpeg.stdin.destroyed) {
      ffmpeg.stdin.end();
    }
  } finally {
    reader?.releaseLock();
    if (reader && !closed && !ffmpeg.stdin.destroyed) ffmpeg.stdin.end();
  }
}

async function handleRequest(client: Client, request: IncomingMessage, response: ServerResponse, options: ControlServerOptions = {}): Promise<void> {
  const providerSettings = options.providerSettings ?? providerSettingsStore;
  const community = options.community ?? communityStore;
  const greetings = options.greetings ?? greetingStore;
  const automod = options.automod ?? automodStore;
  const automodReview = options.automodReview ?? automodReviewStore;
  const ollama = options.ollama ?? ollamaStore;
  const equalizer = options.equalizer ?? equalizerStore;
  const audit = options.audit ?? auditLogStore;
  const onAutoModRecovery = options.onAutoModRecovery;
  setCors(response, request);
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const requestUrl = new URL(request.url ?? '/', `http://${config.controlHost}:${config.controlPort}`);
  const parts = requestUrl.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'v1') throw new HttpError(404, 'NOT_FOUND', 'Route không tồn tại.');

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/health') {
    sendJson(response, 200, {
      status: client.isReady() ? 'ready' : 'starting',
      service: 'localbot-control',
      version: 'v1',
      runtimeOwnerId: config.runtimeOwnerId,
      user: client.user ? { id: client.user.id, tag: client.user.tag } : null
    });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/diagnostics') {
    const soundCloudConfigured = isSoundCloudConfigured();
    sendJson(response, 200, buildRuntimeDiagnostics({
      profile: config.runtimeProfile,
      control: {
        enabled: config.controlEnabled,
        host: config.controlHost,
        port: config.controlPort,
        loopbackOnly: config.controlHost === '127.0.0.1',
        ownerPresent: Boolean(config.runtimeOwnerId)
      },
      discord: {
        ready: client.isReady(),
        botTag: client.user?.tag ?? null,
        guildCount: client.guilds.cache.size
      },
      capabilities: {
        guildMembersIntent: config.guildMembersIntentEnabled,
        messageContentIntent: config.messageContentIntentEnabled
      },
      providers: [
        { id: 'youtube', label: 'YouTube', enabled: true, configured: true },
        { id: 'soundcloud', label: 'SoundCloud', enabled: isSoundCloudAvailable(providerSettings), configured: soundCloudConfigured }
      ]
    }));
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/guilds') {
    sendJson(response, 200, {
      guilds: client.guilds.cache.map((currentGuild) => summarizeGuild(currentGuild, client))
    });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/providers') {
    const soundCloudConfigured = isSoundCloudConfigured();
    sendJson(response, 200, {
      providers: [
        { id: 'youtube', label: 'YouTube', enabled: true, configured: true, auth: 'youtubei.js' },
        { id: 'soundcloud', label: 'SoundCloud', enabled: isSoundCloudAvailable(providerSettings), configured: soundCloudConfigured, auth: 'official OAuth client credentials' }
      ]
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/providers/soundcloud') {
    const body = await readJson(request);
    const enabled = booleanField(body, 'enabled');
    if (enabled && !isSoundCloudConfigured()) {
      throw new HttpError(503, 'SOUNDCLOUD_NOT_CONFIGURED', 'SoundCloud chưa có credential official trong Node runtime. Hãy cấu hình env rồi thử lại.');
    }
    const settings = await providerSettings.setSoundCloudEnabled(enabled);
    await recordAudit('provider.soundcloud.toggle', null, enabled ? 'enabled' : 'disabled', audit);
    sendJson(response, 200, {
      provider: 'soundcloud',
      enabled: settings.enabled && isSoundCloudConfigured(),
      configured: isSoundCloudConfigured()
    });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/providers/soundcloud/test') {
    if (!isSoundCloudEnabled(providerSettings)) throw new HttpError(409, 'SOUNDCLOUD_DISABLED', 'SoundCloud đang được tắt trong Cài đặt.');
    await testSoundCloudConnection();
    await recordAudit('provider.soundcloud.test', null, 'official connection test succeeded', audit);
    sendJson(response, 200, { provider: 'soundcloud', enabled: true, configured: true, connected: true });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/ollama') {
    const settings = await ollama.get();
    sendJson(response, 200, { settings, health: await ollama.health() });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/ollama/settings') {
    const body = await readJson(request);
    const patch: OllamaSettingsPatch = {};
    if (Object.prototype.hasOwnProperty.call(body, 'enabled')) patch.enabled = booleanField(body, 'enabled');
    if (Object.prototype.hasOwnProperty.call(body, 'baseUrl')) patch.baseUrl = stringField(body, 'baseUrl')!;
    if (Object.prototype.hasOwnProperty.call(body, 'model')) patch.model = stringField(body, 'model', false) ?? '';
    if (Object.prototype.hasOwnProperty.call(body, 'timeoutMs')) patch.timeoutMs = integerFieldAllowZero(body, 'timeoutMs', 1_000, 30_000);
    if (Object.keys(patch).length === 0) throw new HttpError(400, 'INVALID_INPUT', 'Cần gửi ít nhất một trường cấu hình Ollama.');
    let settings;
    try {
      settings = await ollama.update(patch);
    } catch (error) {
      throw new HttpError(400, 'INVALID_OLLAMA_SETTINGS', error instanceof Error ? error.message : 'Cấu hình Ollama không hợp lệ.');
    }
    await recordAudit('ollama.settings.update', null, `enabled=${settings.enabled};modelConfigured=${Boolean(settings.model)}`, audit);
    sendJson(response, 200, { settings, health: await ollama.health() });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/ollama/health') {
    const health = await ollama.health();
    await recordAudit('ollama.health', null, `status=${health.status};reachable=${health.reachable}`, audit);
    sendJson(response, 200, { health });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/ollama/suggest') {
    const body = await readJson(request);
    const surface = body.surface ?? 'help';
    if (surface !== 'help' && surface !== 'music' && surface !== 'community') {
      throw new HttpError(400, 'INVALID_OLLAMA_INPUT', 'surface phải là help, music hoặc community.');
    }
    try {
      const suggestion = await ollama.suggest(body.query, surface as OllamaSuggestionSurface);
      await recordAudit('ollama.suggestion', null, `surface=${suggestion.surface};outcome=success`, audit);
      sendJson(response, 200, suggestion);
    } catch (error) {
      if (error instanceof OllamaRequestError) {
        const status = error.code === 'OLLAMA_INVALID_INPUT' ? 400 : error.code === 'OLLAMA_DISABLED' || error.code === 'OLLAMA_NOT_CONFIGURED' ? 409 : 502;
        throw new HttpError(status, error.code, error.message);
      }
      throw error;
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/audit-log') {
    sendJson(response, 200, {
      entries: await audit.list(queryLimit(requestUrl), queryText(requestUrl, 'guildId', 64), {
        action: queryText(requestUrl, 'action'),
        search: queryText(requestUrl, 'search')
      })
    });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/audit-log/export') {
    const guildId = queryText(requestUrl, 'guildId', 64);
    if (!guildId) throw new HttpError(400, 'GUILD_SCOPE_REQUIRED', 'Export audit log cần guildId để giới hạn phạm vi.');
    const format = auditExportFormat(requestUrl);
    const entries = await audit.list(queryLimit(requestUrl), guildId, {
      action: queryText(requestUrl, 'action'),
      search: queryText(requestUrl, 'search')
    });
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = format === 'csv' ? 'csv' : 'json';
    const body = format === 'csv'
      ? auditCsv(entries)
      : `${JSON.stringify({ format: 'localbot-audit', version: 1, exportedAt: new Date().toISOString(), guildId, entries }, null, 2)}\n`;
    await recordAudit('audit.export', guildId, `format=${format};entries=${entries.length}`, audit);
    response.writeHead(200, {
      'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="localbot-audit-${date}.${extension}"`,
      'cache-control': 'no-store'
    });
    response.end(body);
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/audit-log/settings') {
    sendJson(response, 200, audit.getSettings());
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/audit-log/settings') {
    const body = await readJson(request);
    if (!Object.prototype.hasOwnProperty.call(body, 'retentionDays')) {
      throw new HttpError(400, 'INVALID_AUDIT_SETTINGS', 'Cần gửi retentionDays là null hoặc số nguyên từ 1 đến 3650.');
    }
    let settings;
    try {
      settings = await audit.updateSettings(body.retentionDays);
    } catch (error) {
      throw new HttpError(400, 'INVALID_AUDIT_SETTINGS', error instanceof Error ? error.message : 'Retention audit không hợp lệ.');
    }
    await recordAudit('audit.settings.update', null, `retentionDays=${settings.retentionDays ?? 'none'}`, audit);
    sendJson(response, 200, settings);
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/data/export') {
    let backup;
    try {
      backup = await createLocalBotBackup();
    } catch {
      throw new HttpError(409, 'BACKUP_FAILED', 'Không thể tạo backup từ dữ liệu local hiện tại; hãy kiểm tra file dữ liệu rồi thử lại.');
    }
    const filename = `localbot-backup-${backup.exportedAt.replace(/[:.]/g, '-')}.json`;
    const body = `${JSON.stringify(backup, null, 2)}\n`;
    await recordAudit('data.export', null, 'credential-free local backup exported', audit);
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store'
    });
    response.end(body);
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/data/restore') {
    const body = await readJson(request);
    if (body.confirm !== true) throw new HttpError(400, 'RESTORE_CONFIRMATION_REQUIRED', 'Cần xác nhận rõ ràng trước khi thay thế dữ liệu local.');
    if (!body.backup || typeof body.backup !== 'object' || Array.isArray(body.backup)) {
      throw new HttpError(400, 'INVALID_BACKUP', 'Backup local phải là một envelope JSON hợp lệ.');
    }
    try {
      const result = await restoreLocalBotBackup(body.backup);
      await recordAudit('data.restore', null, `credential-free local backup restored · ${result.stores.length} stores`, audit);
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof RestoreValidationError) throw new HttpError(400, 'INVALID_BACKUP', 'Backup local không hợp lệ hoặc chứa trường nhạy cảm.');
      if (error instanceof RestoreTransactionError) throw new HttpError(409, 'RESTORE_FAILED', 'Không thể khôi phục backup local; dữ liệu cũ được giữ lại nếu transaction bị lỗi.');
      throw error;
    }
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/commands/register') {
    const body = await readJson(request);
    const guildId = stringField(body, 'guildId', false);
    if (guildId && !client.guilds.cache.has(guildId)) {
      throw new HttpError(404, 'GUILD_NOT_FOUND', 'Không tìm thấy guild được chọn trong danh sách của LocalBot.');
    }
    const result = await registerSlashCommands(guildId);
    await recordAudit('commands.register', guildId ?? null, `${result.count} slash commands · ${result.scope}`, audit);
    sendJson(response, 200, { ...result, message: result.scope === 'guild'
      ? `Đã đăng ký ${result.count} slash command cho guild.`
      : `Đã đăng ký ${result.count} slash command toàn cục. Lệnh global có thể cần thời gian đồng bộ.` });
    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/media/resolve') {
    const body = await readJson(request);
    const track = await resolveForBody(body);
    sendJson(response, 200, { track });
    return;
  }

  // Search is intentionally available without a guild context so Windows-only
  // playback can discover and listen without joining a Discord voice channel.
  if (request.method === 'POST' && requestUrl.pathname === '/api/v1/media/search') {
    const body = await readJson(request);
    const query = stringField(body, 'query')!;
    const source = sourceField(body, true) as MediaSearchSource;
    const tracks = await searchMedia(query, source, 10);
    sendJson(response, 200, { tracks });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/v1/local-audio') {
    const input = requestUrl.searchParams.get('url');
    if (!input?.trim()) throw new HttpError(400, 'INVALID_INPUT', 'url phải là một URL hoặc từ khóa hợp lệ.');
    const guildId = requestUrl.searchParams.get('guildId')?.trim() || undefined;
    if (guildId) requireGuild(client, decodeURIComponent(guildId));
    await streamLocalAudio(guildId ? decodeURIComponent(guildId) : undefined, input, request, response, equalizer);
    return;
  }

  const guildMatch = requestUrl.pathname.match(/^\/api\/v1\/guilds\/([^/]+)(?:\/(.*))?$/);
  if (!guildMatch) throw new HttpError(404, 'NOT_FOUND', 'Route không tồn tại.');
  const guildId = decodeURIComponent(guildMatch[1]!);
  const suffix = guildMatch[2] ?? '';
  const guild = requireGuild(client, guildId);

  if (request.method === 'GET' && suffix === 'channels') {
    sendJson(response, 200, {
      guild: summarizeGuild(guild, client),
      channels: listVoiceChannels(guild, client)
    });
    return;
  }

  const musicReadinessMatch = suffix.match(/^channels\/([^/]+)\/music-readiness$/);
  if (request.method === 'GET' && musicReadinessMatch) {
    const channelId = decodeURIComponent(musicReadinessMatch[1]!);
    const channel = await requireGuildVoiceChannel(client, guild, channelId);
    sendJson(response, 200, { guildId, readiness: summarizeMusicReadiness(channel, guild, client) });
    return;
  }

  if (request.method === 'GET' && suffix === 'events') {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-store',
      connection: 'keep-alive'
    });
    response.write(': localbot guild voice stream\n\n');
    let closed = false;
    const writeSnapshot = () => {
      if (closed || response.writableEnded) return;
      const currentGuild = client.guilds.cache.get(guildId);
      if (!currentGuild) return;
      response.write(`data: ${JSON.stringify({ guild: summarizeGuild(currentGuild, client), channels: listVoiceChannels(currentGuild, client) })}\n\n`);
    };
    writeSnapshot();
    const unsubscribe = subscribeGuildVoice(guildId, writeSnapshot);
    const heartbeat = setInterval(() => {
      if (!closed && !response.writableEnded) response.write(': heartbeat\n\n');
    }, 15_000);
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };
    request.once('close', cleanup);
    response.once('close', cleanup);
    return;
  }

  if (request.method === 'GET' && suffix === 'text-channels') {
    sendJson(response, 200, { channels: listTextChannels(guild, client) });
    return;
  }

  if (request.method === 'GET' && suffix === 'roles') {
    sendJson(response, 200, { roles: listGuildRoles(guild) });
    return;
  }

  if (request.method === 'GET' && suffix === 'permissions') {
    sendJson(response, 200, { guildId, permissions: summarizeGuildPermissions(guild, client) });
    return;
  }

  if (request.method === 'GET' && suffix === 'members') {
    const directory = await searchGuildMembers(
      guild,
      queryText(requestUrl, 'query', 64) ?? '',
      Math.min(queryLimit(requestUrl), 25),
      config.guildMembersIntentEnabled
    );
    sendJson(response, 200, directory);
    return;
  }

  if (request.method === 'GET' && suffix === 'audit-log/discord') {
    if (!client.isReady()) throw new HttpError(409, 'BOT_NOT_READY', 'Discord runtime chưa sẵn sàng để đọc audit log.');
    const entries = await fetchDiscordAuditLog(guild, queryLimit(requestUrl));
    sendJson(response, 200, {
      guildId,
      source: 'discord',
      fetchedAt: new Date().toISOString(),
      entries
    });
    return;
  }

  if (request.method === 'GET' && suffix === 'automod') {
    sendJson(response, 200, {
      settings: await automod.get(guildId),
      capabilities: { messageContentIntentEnabled: config.messageContentIntentEnabled }
    });
    return;
  }

  if (request.method === 'GET' && suffix === 'automod/review') {
    const rawStatus = queryText(requestUrl, 'status', 16);
    const status = rawStatus as AutoModReviewStatus | undefined;
    if (status !== undefined && !AUTO_MOD_REVIEW_STATUSES.includes(status)) throw new HttpError(400, 'INVALID_AUTOMOD_REVIEW_STATUS', 'status phải là open, confirmed hoặc dismissed.');
    try {
      sendJson(response, 200, { guildId, entries: await automodReview.list(guildId, status, queryLimit(requestUrl)) });
    } catch (error) {
      if (error instanceof AutoModReviewValidationError) throw new HttpError(400, 'INVALID_AUTOMOD_REVIEW_QUERY', error.message);
      throw error;
    }
    return;
  }

  const reviewDecisionMatch = suffix.match(/^automod\/review\/([^/]+)$/);
  if (request.method === 'POST' && reviewDecisionMatch) {
    const body = await readJson(request);
    const decision = stringField(body, 'decision')!;
    const note = stringField(body, 'note', false);
    try {
      const entry = await automodReview.decide(guildId, reviewDecisionMatch[1]!, decision as 'confirm' | 'dismiss', note);
      await recordAudit('automod.review.decision', guildId, `reviewId=${reviewDecisionMatch[1]};decision=${decision}`, audit);
      sendJson(response, 200, { entry });
    } catch (error) {
      if (error instanceof AutoModReviewConflictError) throw new HttpError(409, 'REVIEW_ALREADY_DECIDED', error.message);
      if (error instanceof AutoModReviewNotFoundError) throw new HttpError(404, 'AUTOMOD_REVIEW_NOT_FOUND', error.message);
      if (error instanceof AutoModReviewValidationError) throw new HttpError(400, 'INVALID_AUTOMOD_REVIEW_DECISION', error.message);
      throw error;
    }
    return;
  }

  if (request.method === 'POST' && suffix === 'automod/recover') {
    const body = await readJson(request);
    if (body.confirm !== true) throw new HttpError(400, 'AUTOMOD_RECOVERY_CONFIRMATION_REQUIRED', 'Cần xác nhận recovery AutoMod bằng confirm: true.');
    let settings;
    try {
      settings = await automod.update(guildId, { enabled: false, mode: 'dry-run' });
    } catch (error) {
      throw new HttpError(500, 'AUTOMOD_RECOVERY_FAILED', error instanceof Error ? error.message : 'Không thể khôi phục AutoMod về trạng thái an toàn.');
    }
    if (onAutoModRecovery) await onAutoModRecovery(guildId);
    await recordAudit('automod.safe_recovery', guildId, 'enabled=false;mode=dry-run;volatileStateCleared=true', audit);
    sendJson(response, 200, { recovered: true, settings });
    return;
  }

  if (request.method === 'POST' && suffix === 'automod') {
    const body = await readJson(request);
    let settings;
    try {
      settings = await automod.update(guildId, body.settings ?? body);
    } catch (error) {
      throw new HttpError(400, 'INVALID_AUTOMOD_SETTINGS', error instanceof Error ? error.message : 'Cấu hình AutoMod không hợp lệ.');
    }
    await recordAudit('automod.settings.update', guildId, `enabled=${settings.enabled};mode=${settings.mode}`, audit);
    sendJson(response, 200, {
      settings,
      capabilities: { messageContentIntentEnabled: config.messageContentIntentEnabled }
    });
    return;
  }

  // Keep the guild-scoped route as a compatibility alias for callers that
  // want provider discovery tied to the selected Discord guild. The actual
  // search providers remain global; the guild is only context for the UI.
  if (request.method === 'POST' && suffix === 'media/search') {
    const body = await readJson(request);
    const query = stringField(body, 'query')!;
    const source = sourceField(body, true) as MediaSearchSource;
    const tracks = await searchMedia(query, source, 10);
    sendJson(response, 200, { tracks });
    return;
  }

  if (request.method === 'GET' && suffix === 'greetings') {
    sendJson(response, 200, { settings: await greetings.get(guildId), intentEnabled: config.guildMembersIntentEnabled });
    return;
  }

  if (request.method === 'POST' && suffix === 'greetings') {
    const body = await readJson(request);
    const kind = greetingKindField(body.kind);
    let settings;
    try {
      settings = await greetings.update(guildId, kind, body.template);
    } catch (error) {
      throw new HttpError(400, 'INVALID_GREETING_TEMPLATE', error instanceof Error ? error.message : 'Template Welcome/Goodbye không hợp lệ.');
    }
    await recordAudit(`greeting.${kind}.update`, guildId, settings[kind].enabled ? 'enabled' : 'disabled', audit);
    sendJson(response, 200, { settings, intentEnabled: config.guildMembersIntentEnabled });
    return;
  }

  if (request.method === 'POST' && suffix === 'greetings/preview') {
    const body = await readJson(request);
    const kind = greetingKindField(body.kind);
    const settings = await greetings.get(guildId);
    const username = typeof body.username === 'string' && body.username.trim() ? body.username.trim().slice(0, 80) : 'Thành viên xem trước';
    sendJson(response, 200, { kind, preview: previewGreeting(settings[kind], guild.name, guild.memberCount, username), intentEnabled: config.guildMembersIntentEnabled });
    return;
  }

  if (request.method === 'POST' && suffix === 'greetings/test-send') {
    const body = await readJson(request);
    const kind = greetingKindField(body.kind);
    const template = (await greetings.get(guildId))[kind];
    if (!template.enabled) throw new HttpError(409, 'GREETING_DISABLED', 'Template đang được tắt; hãy bật trước khi test-send.');
    if (!template.channelId) throw new HttpError(400, 'GREETING_CHANNEL_REQUIRED', 'Hãy chọn channel đích trước khi test-send.');
    const channel = guild.channels.cache.get(template.channelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) throw new HttpError(400, 'GREETING_CHANNEL_UNAVAILABLE', 'Channel đích không tồn tại hoặc bot không thể gửi tin.');
    try {
      await sendGreetingToChannel(channel as GuildTextBasedChannel, template, {
        user: '@LocalBot test',
        username: 'LocalBot test',
        guild: guild.name,
        memberCount: guild.memberCount
      });
    } catch {
      throw new HttpError(502, 'GREETING_SEND_FAILED', 'Không thể gửi test message; hãy kiểm tra quyền Send Messages/Embed Links.');
    }
    await recordAudit(`greeting.${kind}.test-send`, guildId, 'test message sent', audit);
    sendJson(response, 200, { kind, sent: true });
    return;
  }

  if (request.method === 'GET' && suffix === 'community/settings') {
    sendJson(response, 200, { settings: await community.getSettings(guildId) });
    return;
  }

  if (request.method === 'POST' && suffix === 'community/settings') {
    const body = await readJson(request);
    const patch: CommunitySettingsUpdate = {};
    if (Object.prototype.hasOwnProperty.call(body, 'ignoredChannelIds')) patch.ignoredChannelIds = body.ignoredChannelIds;
    if (Object.prototype.hasOwnProperty.call(body, 'ignoredRoleIds')) patch.ignoredRoleIds = body.ignoredRoleIds;
    if (Object.prototype.hasOwnProperty.call(body, 'cooldownSeconds')) patch.cooldownSeconds = body.cooldownSeconds as number | null;
    if (Object.prototype.hasOwnProperty.call(body, 'xpMultiplier')) patch.xpMultiplier = body.xpMultiplier as number;
    if (Object.prototype.hasOwnProperty.call(body, 'roleMultipliers')) patch.roleMultipliers = body.roleMultipliers;
    if (Object.prototype.hasOwnProperty.call(body, 'roleRewards')) patch.roleRewards = body.roleRewards;
    let settings;
    try {
      settings = await community.updateSettings(guildId, patch);
    } catch (error) {
      throw new HttpError(400, 'INVALID_COMMUNITY_SETTINGS', error instanceof Error ? error.message : `Cấu hình Community phải hợp lệ; cooldown tối đa ${MAX_COMMUNITY_COOLDOWN_SECONDS} giây.`);
    }
    await recordAudit('community.settings.update', guildId, 'community settings updated', audit);
    sendJson(response, 200, { settings });
    return;
  }

  if (request.method === 'GET' && suffix === 'community/leaderboard') {
    const page = await community.leaderboardPage(guildId, queryLimit(requestUrl), queryOffset(requestUrl));
    sendJson(response, 200, { leaderboard: page.leaderboard, hasMore: page.hasMore });
    return;
  }

  if (request.method === 'POST' && suffix === 'community/reset') {
    const body = await readJson(request);
    if (body.confirm !== true) throw new HttpError(400, 'RESET_NOT_CONFIRMED', 'Phải xác nhận rõ ràng trước khi reset tiến trình Community.');
    const result = await community.resetProgress(guildId);
    await recordAudit('community.reset', guildId, `${result.removedMembers} members removed`, audit);
    sendJson(response, 200, result);
    return;
  }

  const communityMemberMatch = suffix.match(/^community\/member\/([^/]+)$/);
  if (request.method === 'GET' && communityMemberMatch) {
    sendJson(response, 200, { member: await community.member(guildId, decodeURIComponent(communityMemberMatch[1]!)) });
    return;
  }

  if (request.method === 'GET' && suffix === 'local-audio') {
    const input = requestUrl.searchParams.get('url');
    if (!input?.trim()) throw new HttpError(400, 'INVALID_INPUT', 'url phải là một URL hoặc từ khóa hợp lệ.');
    await streamLocalAudio(guildId, input, request, response, equalizer);
    return;
  }

  if (request.method === 'GET' && suffix === 'playlists') {
    sendJson(response, 200, { playlists: await playlistStore.list(guildId) });
    return;
  }

  if (request.method === 'POST' && suffix === 'playlists/create') {
    const body = await readJson(request);
    const playlist = await playlistStore.create(guildId, stringField(body, 'name')!, stringField(body, 'description', false));
    await recordAudit('playlist.create', guildId, playlist.name, audit);
    sendJson(response, 201, { playlist });
    return;
  }

  if (request.method === 'POST' && suffix === 'playlists/update') {
    const body = await readJson(request);
    const playlist = await playlistStore.update(guildId, stringField(body, 'currentName')!, {
      name: stringField(body, 'name', false),
      description: stringField(body, 'description', false)
    });
    if (!playlist) throw new HttpError(404, 'PLAYLIST_NOT_FOUND', 'Không tìm thấy playlist.');
    await recordAudit('playlist.update', guildId, playlist.name, audit);
    sendJson(response, 200, { playlist });
    return;
  }

  if (request.method === 'POST' && suffix === 'playlists/delete') {
    const body = await readJson(request);
    const playlist = await playlistStore.remove(guildId, stringField(body, 'name')!);
    if (!playlist) throw new HttpError(404, 'PLAYLIST_NOT_FOUND', 'Không tìm thấy playlist.');
    await recordAudit('playlist.delete', guildId, playlist.name, audit);
    sendJson(response, 200, { playlist });
    return;
  }

  if (request.method === 'POST' && suffix === 'playlists/add') {
    const body = await readJson(request);
    const track = await resolveForBody(body);
    const playlist = await playlistStore.addTrack(guildId, stringField(body, 'name')!, track);
    if (!playlist) throw new HttpError(404, 'PLAYLIST_NOT_FOUND', 'Không tìm thấy playlist.');
    await recordAudit('playlist.add', guildId, `${playlist.name} · ${track.title}`, audit);
    sendJson(response, 200, { playlist });
    return;
  }

  if (request.method === 'POST' && suffix === 'playlists/remove') {
    const body = await readJson(request);
    const removed = await playlistStore.removeTrack(guildId, stringField(body, 'name')!, integerField(body, 'position'));
    if (!removed) throw new HttpError(404, 'PLAYLIST_TRACK_NOT_FOUND', 'Không tìm thấy playlist hoặc track cần xóa.');
    await recordAudit('playlist.remove', guildId, `position ${body.position}`, audit);
    sendJson(response, 200, { removed, playlists: await playlistStore.list(guildId) });
    return;
  }

  if (request.method === 'POST' && suffix === 'playlists/move') {
    const body = await readJson(request);
    const playlist = await playlistStore.moveTrack(guildId, stringField(body, 'name')!, integerField(body, 'from'), integerField(body, 'to'));
    if (!playlist) throw new HttpError(400, 'INVALID_PLAYLIST_MOVE', 'Không thể sắp xếp: hãy kiểm tra playlist và vị trí track.');
    await recordAudit('playlist.move', guildId, `${playlist.name} · ${body.from} → ${body.to}`, audit);
    sendJson(response, 200, { playlist });
    return;
  }

  if (request.method === 'POST' && suffix === 'playlists/play') {
    const body = await readJson(request);
    const playlist = await playlistStore.find(guildId, stringField(body, 'name')!);
    if (!playlist) throw new HttpError(404, 'PLAYLIST_NOT_FOUND', 'Không tìm thấy playlist.');
    if (playlist.tracks.length === 0) throw new HttpError(400, 'PLAYLIST_EMPTY', 'Playlist đang trống.');
    const voiceChannelId = stringField(body, 'voiceChannelId')!;
    const channel = await requireGuildVoiceChannel(client, guild, voiceChannelId);
    ensureMusicReadiness(summarizeMusicReadiness(channel, guild, client));
    getOrCreatePlayer(channel);
    playlist.tracks.forEach((track) => enqueue(guildId, track));
    await recordAudit('playlist.play', guildId, `${playlist.name} · ${playlist.tracks.length} tracks`, audit);
    sendJson(response, 200, { added: playlist.tracks.length, player: getPlayerSnapshot(guildId) });
    return;
  }

  if (request.method === 'GET' && suffix === 'equalizer') {
    sendJson(response, 200, { settings: await equalizer.getAsync(guildId) });
    return;
  }

  if (request.method === 'POST' && suffix === 'equalizer') {
    const body = await readJson(request);
    const preset = stringField(body, 'preset', false) as EqualizerPreset | undefined;
    if (preset) {
      if (preset !== 'flat' && preset !== 'focus' && preset !== 'warm') throw new HttpError(400, 'INVALID_PRESET', 'Preset phải là flat, focus hoặc warm.');
      const settings = await equalizer.setPreset(guildId, preset);
      await recordAudit('equalizer.preset', guildId, `preset=${preset}`, audit);
      sendJson(response, 200, { settings });
      return;
    }
    const gain = (field: string) => {
      const value = body[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < -12 || value > 12) throw new HttpError(400, 'INVALID_GAIN', `${field} phải nằm trong khoảng -12 đến +12 dB.`);
      return value;
    };
    const settings = await equalizer.set(guildId, { bass: gain('bass'), mid: gain('mid'), treble: gain('treble') });
    await recordAudit('equalizer.bands', guildId, 'bands=updated', audit);
    sendJson(response, 200, { settings });
    return;
  }

  if (request.method === 'GET' && suffix === 'music-access') {
    sendJson(response, 200, { permissions: await musicPermissionStore.get(guildId) });
    return;
  }

  if (request.method === 'POST' && suffix === 'music-access') {
    const body = await readJson(request);
    const action = stringField(body, 'action')!;
    if (action === 'mode') {
      const mode = stringField(body, 'mode') as MusicPermissionMode;
      if (mode !== 'allowlist' && mode !== 'all') throw new HttpError(400, 'INVALID_PERMISSION_MODE', 'mode phải là allowlist hoặc all.');
      const permissions = await musicPermissionStore.setMode(guildId, mode);
      await recordAudit('music-access.mode', guildId, mode, audit);
      sendJson(response, 200, { permissions });
      return;
    }
    const userId = stringField(body, 'userId')!;
    if (action === 'add') {
      const permissions = await musicPermissionStore.addUser(guildId, userId);
      await recordAudit('music-access.add', guildId, userId, audit);
      sendJson(response, 200, { permissions });
      return;
    }
    if (action === 'remove') {
      await musicPermissionStore.removeUser(guildId, userId);
      await recordAudit('music-access.remove', guildId, userId, audit);
      sendJson(response, 200, { permissions: await musicPermissionStore.get(guildId) });
      return;
    }
    throw new HttpError(400, 'INVALID_PERMISSION_ACTION', 'Action quyền Music không được hỗ trợ.');
  }

  if (request.method === 'POST' && suffix === 'voice/join') {
    const body = await readJson(request);
    const channelId = stringField(body, 'channelId')!;
    const channel = await requireGuildVoiceChannel(client, guild, channelId);
    ensureMusicReadiness(summarizeMusicReadiness(channel, guild, client));
    const channelSummary = summarizeVoiceChannel(channel, guild, client);
    if (channelSummary.canConnect === false) {
      throw new HttpError(403, 'VOICE_CONNECT_FORBIDDEN', 'LocalBot không có quyền Connect vào voice channel này.');
    }
    if (channelSummary.canSpeak === false) {
      throw new HttpError(403, 'VOICE_SPEAK_FORBIDDEN', 'LocalBot không có quyền Speak trong voice channel này.');
    }
    try {
      joinOrMovePlayer(channel);
    } catch (error) {
      throw new HttpError(409, 'VOICE_JOIN_FAILED', error instanceof Error ? error.message : 'Không thể tham gia voice channel.');
    }
    await recordAudit('voice.join', guildId, channel.id, audit);
    sendJson(response, 200, {
      guild: summarizeGuild(guild, client),
      channel: { ...summarizeVoiceChannel(channel, guild, client), botJoined: true },
      player: getPlayerSnapshot(guildId)
    });
    publishGuildVoice(guildId);
    return;
  }

  if (request.method === 'POST' && suffix === 'voice/leave') {
    const hadTrackedPlayer = Boolean(getPlayerSnapshot(guildId));
    destroyGuildPlayer(guildId);
    if (!hadTrackedPlayer && guild.members.me?.voice.channelId) {
      await guild.members.me.voice.disconnect('LocalBot voice session ended from native app');
    }
    await recordAudit('voice.leave', guildId, 'voice session ended', audit);
    sendJson(response, 200, { guild: summarizeGuild(guild, client), player: null });
    publishGuildVoice(guildId);
    return;
  }

  if (request.method === 'GET' && suffix === 'player') {
    sendJson(response, 200, { player: getPlayerSnapshot(guildId), stateVersion: getPlayerSnapshot(guildId)?.stateVersion ?? 0 });
    return;
  }

  if (request.method === 'GET' && suffix === 'player/events') {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-store',
      connection: 'keep-alive'
    });
    response.write(': localbot player stream\n\n');
    let closed = false;
    const writeSnapshot = (player: ReturnType<typeof getPlayerSnapshot>) => {
      if (closed || response.writableEnded) return;
      response.write(`data: ${JSON.stringify({ player })}\n\n`);
    };
    const unsubscribe = subscribePlayer(guildId, writeSnapshot);
    const heartbeat = setInterval(() => {
      if (!closed && !response.writableEnded) response.write(': heartbeat\n\n');
    }, 15_000);
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };
    request.once('close', cleanup);
    response.once('close', cleanup);
    return;
  }

  if (request.method === 'POST' && suffix === 'player/play') {
    const body = await readJson(request);
    const voiceChannelId = stringField(body, 'voiceChannelId')!;
    const channel = await requireGuildVoiceChannel(client, guild, voiceChannelId);
    ensureMusicReadiness(summarizeMusicReadiness(channel, guild, client));
    const track = await resolveForBody(body);
    getOrCreatePlayer(channel);
    const position = enqueue(guildId, track);
    await recordAudit('player.enqueue', guildId, `${track.provider}:${track.id} · position ${position}`, audit);
    sendJson(response, 200, { track, position, player: getPlayerSnapshot(guildId) });
    return;
  }

  if (request.method === 'POST' && suffix === 'player/action') {
    const body = await readJson(request);
    const action = stringField(body, 'action')!;
    if (!getPlayerSnapshot(guildId) && action !== 'stop') throw new HttpError(409, 'PLAYER_NOT_ACTIVE', 'Chưa có phiên phát nhạc trong guild này.');
    if (action === 'pause') {
      if (!pause(guildId)) throw new HttpError(409, 'PLAYER_NOT_PLAYING', 'Không có bài đang phát để tạm dừng.');
    } else if (action === 'resume') {
      if (!resume(guildId)) throw new HttpError(409, 'PLAYER_NOT_PAUSED', 'Không có bài đang tạm dừng để tiếp tục.');
    } else if (action === 'skip') {
      if (!skip(guildId)) throw new HttpError(409, 'PLAYER_NOT_PLAYING', 'Không có bài đang phát để bỏ qua.');
    } else if (action === 'previous') {
      if (!previous(guildId)) throw new HttpError(409, 'NO_PREVIOUS_TRACK', 'Chưa có bài trước trong lịch sử phát.');
    } else if (action === 'stop') {
      stop(guildId);
    } else if (action === 'volume') {
      const percent = integerFieldAllowZero(body, 'percent', 0, 100);
      if (setVolume(guildId, percent) == null) throw new HttpError(409, 'PLAYER_NOT_ACTIVE', 'Chưa có phiên phát nhạc trong guild này.');
    } else if (action === 'shuffle') {
      if (toggleShuffle(guildId) == null) throw new HttpError(409, 'PLAYER_NOT_ACTIVE', 'Chưa có phiên phát nhạc trong guild này.');
    } else if (action === 'repeat') {
      const mode = stringField(body, 'mode', false);
      if (mode) {
        if (mode !== 'off' && mode !== 'all' && mode !== 'one') throw new HttpError(400, 'INVALID_REPEAT_MODE', 'mode phải là off, all hoặc one.');
        if (setRepeatMode(guildId, mode) == null) throw new HttpError(409, 'PLAYER_NOT_ACTIVE', 'Chưa có phiên phát nhạc trong guild này.');
      } else if (cycleRepeat(guildId) == null) throw new HttpError(409, 'PLAYER_NOT_ACTIVE', 'Chưa có phiên phát nhạc trong guild này.');
    } else {
      throw new HttpError(400, 'INVALID_ACTION', 'Action không được hỗ trợ.');
    }
    await recordAudit(`player.${action}`, guildId, action === 'volume' ? `percent ${body.percent ?? ''}` : String(body.mode ?? ''), audit);
    sendJson(response, 200, { player: getPlayerSnapshot(guildId) });
    return;
  }

  if (request.method === 'POST' && suffix === 'player/queue/remove') {
    const body = await readJson(request);
    const removed = removeFromQueue(guildId, integerField(body, 'position'));
    if (!removed) throw new HttpError(404, 'QUEUE_ITEM_NOT_FOUND', 'Không tìm thấy bài trong hàng đợi.');
    await recordAudit('queue.remove', guildId, `position ${body.position}`, audit);
    sendJson(response, 200, { removed, player: getPlayerSnapshot(guildId) });
    return;
  }

  if (request.method === 'POST' && suffix === 'player/queue/move') {
    const body = await readJson(request);
    const moved = moveInQueue(guildId, integerField(body, 'from'), integerField(body, 'to'));
    if (!moved) throw new HttpError(400, 'INVALID_QUEUE_MOVE', 'Không thể di chuyển bài trong hàng đợi.');
    await recordAudit('queue.move', guildId, `${body.from} → ${body.to}`, audit);
    sendJson(response, 200, { player: getPlayerSnapshot(guildId) });
    return;
  }

  if (request.method === 'POST' && suffix === 'player/queue/clear') {
    clearQueue(guildId);
    await recordAudit('queue.clear', guildId, 'pending queue cleared', audit);
    sendJson(response, 200, { player: getPlayerSnapshot(guildId) });
    return;
  }

  if (request.method === 'GET' && suffix === 'queue') {
    sendJson(response, 200, { player: getQueue(guildId) });
    return;
  }

  throw new HttpError(404, 'NOT_FOUND', 'Route không tồn tại.');
}

export async function startControlServer(client: Client, options: ControlServerOptions = {}): Promise<Server | null> {
  if (!config.controlEnabled) return null;
  validateControlBinding(config.controlHost, config.controlPort);
  const server = createServer((request, response) => {
    void handleRequest(client, request, response, options).catch((error: unknown) => {
      if (!response.headersSent) sendError(response, error);
      else if (!response.writableEnded) response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.controlPort, config.controlHost, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  console.log(`LocalBot control listening on http://${config.controlHost}:${config.controlPort}`);
  return server;
}
