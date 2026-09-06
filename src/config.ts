import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { parseAutoRegisterCommands, parseRuntimeProfile, validateRuntimeProfile, type RuntimeProfile } from './runtime-profile.js';

export const CONTROL_HOST = '127.0.0.1';
export const CONTROL_PORT = 2901;

loadDotenv({ path: process.env.LOCALBOT_ENV_FILE?.trim() || undefined, quiet: true });

export function parseControlPort(value: string | undefined, fallback = CONTROL_PORT): number {
  if (value == null || value.trim() === '') return fallback;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : Number.NaN;
}

function parseSeconds(value: string | undefined, fallback: number): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 86_400 ? seconds : fallback;
}

function parseOptionalDays(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 3_650 ? days : null;
}

export function resolveLocalPath(value: string | undefined, fallback: string, dataDir: string): string {
  const configured = value?.trim() || fallback;
  if (!dataDir || path.isAbsolute(configured)) return configured;
  return path.join(dataDir, configured);
}

const dataDir = process.env.LOCALBOT_DATA_DIR?.trim() || '';
const runtimeProfile: RuntimeProfile = parseRuntimeProfile(process.env.LOCALBOT_RUNTIME_PROFILE);
const runtimeOwnerId = process.env.LOCALBOT_RUNTIME_OWNER_ID?.trim() || null;
const controlEnabled = process.env.LOCALBOT_CONTROL_ENABLED?.trim().toLowerCase() === 'true';

export const config = {
  // DISCORD_TOKEN is canonical; BOT_TOKEN is accepted as a compatibility
  // alias so an existing local setup does not fail at startup.
  discordToken: process.env.DISCORD_TOKEN?.trim() || process.env.BOT_TOKEN?.trim() || '',
  discordClientId: process.env.DISCORD_CLIENT_ID?.trim() || '',
  discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
  youtubeLanguage: process.env.YOUTUBE_LANGUAGE?.trim() || 'vi',
  youtubeLocation: process.env.YOUTUBE_LOCATION?.trim() || 'VN',
  youtubeCacheDir: resolveLocalPath(process.env.YOUTUBE_CACHE_DIR, '.cache/youtube', dataDir),
  soundcloudClientId: process.env.SOUNDCLOUD_CLIENT_ID?.trim() || '',
  soundcloudClientSecret: process.env.SOUNDCLOUD_CLIENT_SECRET?.trim() || '',
  dataDir,
  playlistsFile: resolveLocalPath(process.env.LOCALBOT_PLAYLISTS_FILE, 'data/playlists.json', dataDir),
  musicPermissionsFile: resolveLocalPath(process.env.LOCALBOT_MUSIC_PERMISSIONS_FILE, 'data/music-permissions.json', dataDir),
  equalizerFile: resolveLocalPath(process.env.LOCALBOT_EQUALIZER_FILE, 'data/equalizer.json', dataDir),
  communityFile: resolveLocalPath(process.env.LOCALBOT_COMMUNITY_FILE, 'data/community.json', dataDir),
  greetingsFile: resolveLocalPath(process.env.LOCALBOT_GREETINGS_FILE, 'data/greetings.json', dataDir),
  automodFile: resolveLocalPath(process.env.LOCALBOT_AUTOMOD_FILE, 'data/automod.json', dataDir),
  automodReviewFile: resolveLocalPath(process.env.LOCALBOT_AUTOMOD_REVIEW_FILE, 'data/automod-review.json', dataDir),
  ollamaFile: resolveLocalPath(process.env.LOCALBOT_OLLAMA_FILE, 'data/ollama.json', dataDir),
  auditFile: resolveLocalPath(process.env.LOCALBOT_AUDIT_FILE, 'data/audit-log.json', dataDir),
  playerStateFile: resolveLocalPath(process.env.LOCALBOT_PLAYER_STATE_FILE, 'data/player-state.json', dataDir),
  providerSettingsFile: resolveLocalPath(process.env.LOCALBOT_PROVIDER_SETTINGS_FILE, 'data/provider-settings.json', dataDir),
  auditRetentionDays: parseOptionalDays(process.env.LOCALBOT_AUDIT_RETENTION_DAYS),
  guildMembersIntentEnabled: process.env.LOCALBOT_GUILD_MEMBERS_INTENT?.trim().toLowerCase() === 'true',
  messageContentIntentEnabled: process.env.LOCALBOT_MESSAGE_CONTENT_INTENT?.trim().toLowerCase() === 'true',
  communityXpCooldownMs: parseSeconds(process.env.LOCALBOT_XP_COOLDOWN_SECONDS, 60) * 1000,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL?.trim() || '',
  runtimeProfile,
  autoRegisterCommands: parseAutoRegisterCommands(process.env.LOCALBOT_AUTO_REGISTER_COMMANDS, runtimeProfile),
  controlEnabled,
  controlHost: process.env.LOCALBOT_CONTROL_HOST?.trim() || CONTROL_HOST,
  controlPort: parseControlPort(process.env.LOCALBOT_CONTROL_PORT),
  runtimeOwnerId
};

export function validateControlBinding(host: string, port: number): void {
  if (host.trim() !== CONTROL_HOST) {
    throw new Error(`LOCALBOT_CONTROL_HOST phải là ${CONTROL_HOST}; Control API không được bind ra LAN.`);
  }
  // Port 0 is reserved for deterministic in-process tests. A malformed or
  // non-canonical runtime value reaches this guard as an invalid number and
  // fails closed rather than silently falling back to the product port.
  if (port !== CONTROL_PORT && port !== 0) {
    throw new Error(`LOCALBOT_CONTROL_PORT phải là ${CONTROL_PORT}; native app chỉ hỗ trợ control bridge canonical này.`);
  }
}

export function validateDiscordConfig(): void {
  validateRuntimeProfile(config.runtimeProfile, config.controlEnabled, config.runtimeOwnerId);
  const missing = [
    ['DISCORD_TOKEN', config.discordToken],
    ['DISCORD_CLIENT_ID', config.discordClientId]
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')} (or BOT_TOKEN for the bot token)`);
  }
}
