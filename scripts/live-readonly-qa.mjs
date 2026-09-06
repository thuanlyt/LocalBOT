import process from 'node:process';

const baseUrl = (process.env.LOCALBOT_CONTROL_URL ?? 'http://127.0.0.1:2901/api/v1').replace(/\/$/, '');
const guildId = process.env.LOCALBOT_QA_GUILD_ID ?? '1541307192534241318';
const searchQuery = process.env.LOCALBOT_QA_SEARCH ?? 'blood moon stupid';
const timeoutMs = 20_000;

const base = new URL(baseUrl);
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) {
  throw new Error('Read-only live QA chỉ cho phép Control API HTTP loopback.');
}

const rootRoutes = [
  '/health',
  '/diagnostics',
  '/guilds',
  '/providers',
  '/ollama',
  `/audit-log?guildId=${encodeURIComponent(guildId)}`,
  '/audit-log/settings'
];

const guildRoutes = [
  `/guilds/${encodeURIComponent(guildId)}/channels`,
  `/guilds/${encodeURIComponent(guildId)}/text-channels`,
  `/guilds/${encodeURIComponent(guildId)}/roles`,
  `/guilds/${encodeURIComponent(guildId)}/permissions`,
  `/guilds/${encodeURIComponent(guildId)}/members?query=localbot&limit=10`,
  `/guilds/${encodeURIComponent(guildId)}/player`,
  `/guilds/${encodeURIComponent(guildId)}/queue`,
  `/guilds/${encodeURIComponent(guildId)}/playlists`,
  `/guilds/${encodeURIComponent(guildId)}/equalizer`,
  `/guilds/${encodeURIComponent(guildId)}/music-access`,
  `/guilds/${encodeURIComponent(guildId)}/community/settings`,
  `/guilds/${encodeURIComponent(guildId)}/community/leaderboard?limit=10&offset=0`,
  `/guilds/${encodeURIComponent(guildId)}/greetings`,
  `/guilds/${encodeURIComponent(guildId)}/automod`,
  `/guilds/${encodeURIComponent(guildId)}/automod/review?status=open&limit=10`,
  `/guilds/${encodeURIComponent(guildId)}/audit-log/discord?limit=10`,
];

function withTimeout() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, clear: () => clearTimeout(timeout) };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasArray(value, key) {
  return isRecord(value) && Array.isArray(value[key]);
}

function hasObject(value, key) {
  return isRecord(value) && isRecord(value[key]);
}

function validateShape(route, body) {
  const pathname = new URL(`${baseUrl}${route}`, 'http://localbot.invalid').pathname;
  if (!isRecord(body)) return false;

  if (pathname === '/api/v1/health') {
    return ['ready', 'starting'].includes(body.status) && body.service === 'localbot-control' && body.version === 'v1';
  }
  if (pathname === '/api/v1/diagnostics') {
    return ['ready', 'starting', 'degraded'].includes(body.status)
      && typeof body.generatedAt === 'string'
      && ['native', 'headless', 'slash-only'].includes(body.profile)
      && hasObject(body, 'control')
      && hasObject(body, 'discord')
      && hasObject(body, 'capabilities')
      && hasArray(body, 'providers')
      && hasArray(body, 'checks')
      && !Object.hasOwn(body, 'runtimeOwnerId');
  }
  if (pathname === '/api/v1/guilds') return hasArray(body, 'guilds');
  if (pathname === '/api/v1/providers') return hasArray(body, 'providers');
  if (pathname === '/api/v1/ollama') return hasObject(body, 'settings') && hasObject(body, 'health');
  if (pathname === '/api/v1/audit-log') return hasArray(body, 'entries');
  if (pathname === '/api/v1/audit-log/settings') return typeof body.maxEntries === 'number' && (body.retentionDays === null || typeof body.retentionDays === 'number');
  if (pathname === '/api/v1/media/search') return hasArray(body, 'tracks');

  if (pathname.includes('/channels/') && pathname.endsWith('/music-readiness')) {
    return typeof body.guildId === 'string' && hasObject(body, 'readiness') && ['ready', 'missing_permission', 'unknown', 'unsupported'].includes(body.readiness.readiness);
  }
  if (pathname.endsWith('/channels')) return hasObject(body, 'guild') && hasArray(body, 'channels');
  if (pathname.endsWith('/text-channels')) return hasArray(body, 'channels');
  if (pathname.endsWith('/roles')) return hasArray(body, 'roles');
  if (pathname.endsWith('/permissions')) return hasObject(body, 'permissions') && typeof body.guildId === 'string';
  if (pathname.endsWith('/members')) return hasArray(body, 'members') && typeof body.intentEnabled === 'boolean' && typeof body.complete === 'boolean' && ['discord', 'cache'].includes(body.source);
  if (pathname.endsWith('/player') || pathname.endsWith('/queue')) return Object.hasOwn(body, 'player');
  if (pathname.endsWith('/playlists')) return hasArray(body, 'playlists');
  if (pathname.endsWith('/equalizer')) return hasObject(body, 'settings');
  if (pathname.endsWith('/music-access')) return hasObject(body, 'permissions');
  if (pathname.endsWith('/community/settings')) return hasObject(body, 'settings');
  if (pathname.endsWith('/community/leaderboard')) return hasArray(body, 'leaderboard') && typeof body.hasMore === 'boolean';
  if (pathname.endsWith('/greetings')) return hasObject(body, 'settings') && typeof body.intentEnabled === 'boolean';
  if (pathname.endsWith('/automod/review')) return hasArray(body, 'entries');
  if (pathname.endsWith('/automod')) return hasObject(body, 'settings') && hasObject(body, 'capabilities');
  if (pathname.endsWith('/audit-log/discord')) return body.source === 'discord' && typeof body.guildId === 'string' && typeof body.fetchedAt === 'string' && hasArray(body, 'entries');
  return true;
}

async function request(pathname, init = {}) {
  const timeout = withTimeout();
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...init,
      signal: timeout.controller.signal,
      headers: { accept: 'application/json', ...(init.headers ?? {}) }
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: response.status };
    }
    let body;
    try {
      body = await response.json();
    } catch {
      return { status: response.status, contract: 'invalid-shape' };
    }
    return { status: response.status, contract: validateShape(pathname, body) ? 'ok' : 'invalid-shape', body };
  } catch (error) {
    return { status: null, error: error?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    timeout.clear();
  }
}

const checks = [];
for (const pathname of [...rootRoutes, ...guildRoutes]) {
  const result = await request(pathname);
  checks.push({ method: 'GET', path: pathname.split('?')[0], status: result.status, ...(result.contract ? { contract: result.contract } : {}), ...(result.error ? { error: result.error } : {}) });
  if (pathname.endsWith('/channels') && result.status === 200 && isRecord(result.body) && Array.isArray(result.body.channels)) {
    const voiceChannel = result.body.channels.find((channel) => isRecord(channel) && channel.type === 'voice');
    if (isRecord(voiceChannel) && typeof voiceChannel.id === 'string') {
      const readinessPath = `/guilds/${encodeURIComponent(guildId)}/channels/${encodeURIComponent(voiceChannel.id)}/music-readiness`;
      const readiness = await request(readinessPath);
      checks.push({ method: 'GET', path: readinessPath.split('?')[0], status: readiness.status, ...(readiness.contract ? { contract: readiness.contract } : {}), ...(readiness.error ? { error: readiness.error } : {}) });
    }
  }
}

const search = await request('/media/search', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: searchQuery, source: 'all' })
});
checks.push({ method: 'POST', path: '/media/search', status: search.status, ...(search.contract ? { contract: search.contract } : {}), ...(search.error ? { error: search.error } : {}) });

// A second request is deliberately not made here: the probe must never print
// provider bodies, titles, URLs, member data, credentials, or stream URLs.
const failed = checks.some((check) => check.status === null || check.status >= 400 || check.contract === 'invalid-shape');
process.stdout.write(`${JSON.stringify({
  status: failed ? 'failed' : 'reachable',
  base: 'loopback',
  guildScope: Boolean(guildId),
  checks
})}\n`);

if (failed) process.exitCode = 1;
