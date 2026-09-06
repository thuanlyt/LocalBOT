import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  throw new Error('The native installer smoke test is Windows-only.');
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootPackage = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const defaultInstaller = path.join(
  projectRoot,
  'native',
  'src-tauri',
  'target',
  'release',
  'bundle',
  'nsis',
  `LocalBot_${rootPackage.version}_x64-setup.exe`
);
const installerArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const installerPath = path.resolve(installerArgument ?? defaultInstaller);
const smokeParent = path.resolve(os.tmpdir());
const waitMs = 8_000;
const configuredMode = process.argv.includes('--configured');
const musicMode = process.argv.includes('--music');
const recoveryMode = process.argv.includes('--recovery');
const restartMode = process.argv.includes('--restart');
const commandsMode = process.argv.includes('--commands');
const crashMode = process.argv.includes('--crash');
const crashRecoveryMode = process.argv.includes('--crash-recovery');
const soundcloudMode = process.argv.includes('--soundcloud');
const dependencyIsolatedMode = process.argv.includes('--dependency-isolated');
const qaGuildId = process.env.LOCALBOT_QA_GUILD_ID ?? '1541307192534241318';
const qaSearchQuery = process.env.LOCALBOT_QA_SEARCH ?? 'blood moon stupid';
const qaSoundCloudSearch = process.env.LOCALBOT_QA_SOUNDCLOUD_SEARCH ?? 'Sơn Tùng M-TP';

if ((musicMode || recoveryMode || restartMode || commandsMode || crashMode || crashRecoveryMode || soundcloudMode) && !configuredMode) {
  throw new Error('Installed Music, recovery, restart, command, crash, crash-recovery, or SoundCloud smoke requires the configured mode.');
}
if ([musicMode, recoveryMode, restartMode, commandsMode, crashMode, crashRecoveryMode, soundcloudMode].filter(Boolean).length > 1) {
  throw new Error('Installed Music, recovery, restart, command, crash, crash-recovery, and SoundCloud smoke modes are mutually exclusive.');
}

async function assertFile(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Installer smoke is missing ${label}.`);
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function snapshotDirectory(root) {
  const snapshot = new Map();

  async function visit(directory, relativeDirectory = '') {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        snapshot.set(`${relativePath}${path.sep}`, 'directory');
        await visit(entryPath, relativePath);
        continue;
      }
      if (entry.isFile()) {
        const contents = await readFile(entryPath);
        const digest = createHash('sha256').update(contents).digest('hex');
        const metadata = await stat(entryPath);
        snapshot.set(relativePath, `file:${metadata.size}:${metadata.mtimeMs}:${digest}`);
        continue;
      }
      snapshot.set(relativePath, entry.isSymbolicLink() ? 'symlink' : 'special');
    }
  }

  await visit(root);
  return snapshot;
}

function changedSnapshotEntries(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((entryPath) => before.get(entryPath) !== after.get(entryPath));
}

function runProcess(filePath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(filePath, args, {
      cwd: options.cwd,
      stdio: 'ignore',
      windowsHide: true
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

function runProcessCapture(filePath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(filePath, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Installed native process did not exit within the smoke-test timeout.')), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function spawnInstalledNativeProcess() {
  return spawn(path.join(installDir, 'native.exe'), [], {
    cwd: installDir,
    stdio: 'ignore',
    windowsHide: true,
    env: smokeEnvironment
  });
}

async function controlJson(pathname, init = {}, { timeoutMs = 20_000 } = {}) {
  let response;
  try {
    response = await fetch(`http://127.0.0.1:2901/api/v1${pathname}`, {
      ...init,
      headers: { accept: 'application/json', ...(init.headers ?? {}) },
       signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw new Error(`Installed Music control request failed: ${pathname}`);
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    if (response.ok) throw new Error(`Installed Music control response was not JSON: ${pathname}`);
  }
  if (!response.ok) {
    const code = typeof body?.error?.code === 'string' ? body.error.code : 'UNKNOWN_ERROR';
    throw new Error(`Installed Music control request returned HTTP ${response.status} (${code}): ${pathname}`);
  }
  return body;
}

async function runInstalledMusicSmoke(provider = 'youtube') {
  const searchQuery = provider === 'soundcloud' ? qaSoundCloudSearch : qaSearchQuery;
  const providerLabel = provider === 'soundcloud' ? 'SoundCloud' : 'YouTube';
  const guildPath = encodeURIComponent(qaGuildId);
  const channelsPayload = await controlJson(`/guilds/${guildPath}/channels`);
  if (!Array.isArray(channelsPayload?.channels)) {
    throw new Error('Installed Music smoke received an invalid voice-channel envelope.');
  }
  if (channelsPayload.channels.some((channel) => channel?.botJoined === true)) {
    throw new Error('Installed Music smoke refused to run because the QA guild already has a LocalBot voice session.');
  }
  const voiceChannel = channelsPayload.channels.find((channel) =>
    (channel?.type === 'voice' || channel?.type === 'stage') &&
    channel.canConnect === true &&
    channel.canSpeak === true &&
    typeof channel.id === 'string'
  );
  if (!voiceChannel) throw new Error(`Installed ${providerLabel} smoke found no selectable QA voice channel.`);

  const before = await controlJson(`/guilds/${guildPath}/player`);
  if (before?.player) throw new Error('Installed Music smoke refused to replace an existing player session.');

  const searchPayload = await controlJson('/media/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: searchQuery, source: provider })
  });
  const track = Array.isArray(searchPayload?.tracks)
    ? searchPayload.tracks.find((candidate) =>
      candidate?.provider === provider &&
      typeof candidate.id === 'string' &&
      typeof candidate.thumbnail === 'string' &&
      candidate.thumbnail.startsWith('https://')
    )
    : null;
  if (!track) throw new Error(`Installed ${providerLabel} smoke found no real track with an HTTPS thumbnail.`);

  musicSessionStarted = true;
  const play = await controlJson(`/guilds/${guildPath}/player/play`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      voiceChannelId: voiceChannel.id,
      query: typeof track.url === 'string' && track.url ? track.url : track.id,
      source: provider
    })
  });
  if (play?.player?.voiceChannelId !== voiceChannel.id) {
    throw new Error(`Installed ${providerLabel} smoke play response did not retain the discovered voice channel.`);
  }

  let playing = null;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const snapshot = await controlJson(`/guilds/${guildPath}/player`);
    const candidate = snapshot?.player;
    if (
      candidate?.status === 'playing' &&
      candidate.voiceChannelId === voiceChannel.id &&
      candidate.current?.provider === provider &&
      typeof candidate.current.thumbnail === 'string' &&
      candidate.current.thumbnail.startsWith('https://')
    ) {
      playing = candidate;
      break;
    }
    await delay(1_000);
  }
  if (!playing) throw new Error(`Installed ${providerLabel} player did not reach playing state within the acceptance timeout.`);

  if (provider === 'youtube') {
    const localInput = typeof track.url === 'string' && track.url ? track.url : track.id;
    let localResponse;
    try {
      localResponse = await fetch(`http://127.0.0.1:2901/api/v1/guilds/${guildPath}/local-audio?url=${encodeURIComponent(localInput)}`, {
        signal: AbortSignal.timeout(20_000)
      });
    } catch {
      throw new Error('Installed local-audio pipeline request failed while Discord was playing.');
    }
    if (!localResponse.ok || !(localResponse.headers.get('content-type') ?? '').toLowerCase().includes('audio/mpeg')) {
      await localResponse.body?.cancel();
      throw new Error(`Installed local-audio pipeline did not return audio/mpeg (HTTP ${localResponse.status}).`);
    }
    const localReader = localResponse.body?.getReader();
    if (!localReader) throw new Error('Installed local-audio pipeline returned no readable body.');
    let localChunk;
    try {
      localChunk = await localReader.read();
    } finally {
      await localReader.cancel();
    }
    if (!localChunk?.value || localChunk.value.byteLength === 0) {
      throw new Error('Installed local-audio pipeline returned an empty audio chunk.');
    }
    const afterLocal = await controlJson(`/guilds/${guildPath}/player`);
    if (
      afterLocal?.player?.status !== 'playing' ||
      afterLocal.player.voiceChannelId !== voiceChannel.id ||
      afterLocal.player.current?.provider !== provider
    ) {
      throw new Error('Discord playback did not remain playing after the local-audio request was cancelled.');
    }
  }

  const paused = await controlJson(`/guilds/${guildPath}/player/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'pause' })
  });
  if (paused?.player?.status !== 'paused') throw new Error(`Installed ${providerLabel} player did not report paused state.`);

  const resumed = await controlJson(`/guilds/${guildPath}/player/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'resume' })
  });
  if (resumed?.player?.status !== 'playing') throw new Error(`Installed ${providerLabel} player did not report resumed playing state.`);

  const stopped = await controlJson(`/guilds/${guildPath}/player/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'stop' })
  });
  if (stopped?.player?.current !== null || stopped?.player?.status !== 'idle') {
    throw new Error(`Installed ${providerLabel} player stop did not clear the current track and enter idle state.`);
  }

  await controlJson(`/guilds/${guildPath}/voice/leave`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  const after = await controlJson(`/guilds/${guildPath}/player`);
  if (after?.player !== null) throw new Error(`Installed ${providerLabel} player remained active after leave.`);
  let left = false;
  const leaveDeadline = Date.now() + 15_000;
  while (Date.now() < leaveDeadline) {
    const afterChannels = await controlJson(`/guilds/${guildPath}/channels`);
    const testedChannel = afterChannels?.channels?.find((channel) => channel?.id === voiceChannel.id);
    if (testedChannel?.botJoined === false) {
      left = true;
      break;
    }
    await delay(500);
  }
  if (!left) throw new Error(`Installed ${providerLabel} smoke did not observe the bot leaving the tested voice channel.`);
  musicSessionStarted = false;
}

async function runInstalledRecoverySmoke() {
  const backup = await controlJson('/data/export');
  const storeNames = ['playlists', 'musicPermissions', 'equalizer', 'community', 'audit', 'playerState', 'greetings', 'automod', 'automodReview', 'ollama'];
  if (
    backup?.format !== 'localbot-backup' ||
    backup?.version !== 1 ||
    !backup?.stores ||
    storeNames.some((name) => !Object.hasOwn(backup.stores, name))
  ) {
    throw new Error('Installed recovery smoke received an invalid credential-free backup envelope.');
  }
  const restored = await controlJson('/data/restore', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: true, backup })
  });
  if (
    restored?.restartRequired !== true ||
    !Array.isArray(restored.stores) ||
    storeNames.some((name) => !restored.stores.includes(name))
  ) {
    throw new Error('Installed recovery smoke did not confirm all stores and restart-required state.');
  }
}

async function waitForInstalledReady(child) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch('http://127.0.0.1:2901/api/v1/health', { signal: AbortSignal.timeout(2_000) });
      const payload = response.ok ? await response.json() : null;
      if (payload?.status === 'ready' && payload?.service === 'localbot-control' && payload?.version === 'v1') {
        return;
      }
    } catch {
      // The native-owned child may still be connecting to Discord.
    }
    await delay(750);
  }
  throw new Error('Configured installed native runtime did not reach sanitized control health ready.');
}

async function assertControlUnavailableBeforeStart() {
  try {
    const response = await fetch('http://127.0.0.1:2901/api/v1/health', { signal: AbortSignal.timeout(750) });
    throw new Error(`Refusing forced-termination smoke: port 2901 already has an HTTP listener (status ${response.status}).`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Refusing forced-termination smoke:')) throw error;
    // Connection refusal/timeout is the expected precondition. Native start
    // still fails closed if a non-HTTP process occupies the port.
  }
}

async function waitForControlUnavailable() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:2901/api/v1/health', { signal: AbortSignal.timeout(750) });
      if (response.ok || response.status > 0) {
        await delay(250);
        continue;
      }
    } catch {
      return;
    }
    await delay(250);
  }
  throw new Error('Forced native termination left the LocalBot control port reachable.');
}

async function runInstalledCrashSmoke() {
  const pid = nativeProcess?.pid;
  if (!pid) throw new Error('Forced native termination smoke could not identify the installed native PID.');

  const result = await runProcess('taskkill.exe', ['/PID', String(pid), '/F']);
  if (result.code !== 0) {
    throw new Error(`Forced native termination failed for the exact native PID (code ${result.code ?? 'unknown'}).`);
  }
  await waitForExit(nativeProcess, 10_000);
  await waitForControlUnavailable();
  forcedTerminationVerified = true;
}

async function findInstalledRuntimeChildPid() {
  if (!nativeProcess?.pid) return null;
  const parentPid = String(nativeProcess.pid);
  const query = `$parent = ${parentPid}; Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $parent -and $_.Name -eq 'node.exe' -and $_.ExecutablePath -like '*\\runtime\\node.exe' } | Select-Object -ExpandProperty ProcessId`;
  let result;
  try {
    result = await runProcessCapture('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', query]);
  } catch {
    return null;
  }
  if (result.code !== 0) return null;
  const pids = [...result.stdout.matchAll(/\b(\d+)\b/g)].map((match) => Number(match[1])).filter((pid) => Number.isInteger(pid) && pid > 0);
  if (pids.length !== 1) return null;
  return pids[0];
}

async function runInstalledCrashRecoverySmoke() {
  const guildPath = encodeURIComponent(qaGuildId);
  const channels = await controlJson(`/guilds/${guildPath}/channels`);
  if (!Array.isArray(channels?.channels) || channels.channels.some((channel) => channel?.botJoined === true)) {
    throw new Error('Installed crash-recovery smoke refused to run while the QA guild has an active LocalBot voice session.');
  }
  const player = await controlJson(`/guilds/${guildPath}/player`);
  if (player?.player !== null) {
    throw new Error('Installed crash-recovery smoke refused to run while the QA guild has an active player session.');
  }

  const originalChildPid = await findInstalledRuntimeChildPid();
  if (!originalChildPid) throw new Error('Installed crash-recovery smoke could not identify the bundled runtime child.');
  const result = await runProcess('taskkill.exe', ['/PID', String(originalChildPid), '/F']);
  if (result.code !== 0) {
    throw new Error(`Installed crash-recovery could not terminate the exact runtime child (code ${result.code ?? 'unknown'}).`);
  }

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (nativeProcess.exitCode !== null) {
      throw new Error('Native root exited while the owned runtime child was being recovered.');
    }
    const recoveredChildPid = await findInstalledRuntimeChildPid();
    if (recoveredChildPid && recoveredChildPid !== originalChildPid) {
      try {
        const response = await fetch('http://127.0.0.1:2901/api/v1/health', { signal: AbortSignal.timeout(2_000) });
        const payload = response.ok ? await response.json() : null;
        if (payload?.status === 'ready' && payload?.service === 'localbot-control' && payload?.version === 'v1') {
          crashRecoveryVerified = true;
          return;
        }
      } catch {
        // The replacement child may still be reconnecting to Discord.
      }
    }
    await delay(500);
  }
  throw new Error('Installed native supervisor did not replace the terminated runtime child with a Ready process within the acceptance timeout.');
}

async function runInstalledRestartSmoke() {
  const guildPath = encodeURIComponent(qaGuildId);
  const beforeChannels = await controlJson(`/guilds/${guildPath}/channels`);
  if (!Array.isArray(beforeChannels?.channels)) {
    throw new Error('Installed restart smoke received an invalid voice-channel envelope.');
  }
  if (beforeChannels.channels.some((channel) => channel?.botJoined === true)) {
    throw new Error('Installed restart smoke refused to run because the QA guild already has a LocalBot voice session.');
  }
  const beforePlayer = await controlJson(`/guilds/${guildPath}/player`);
  if (beforePlayer?.player !== null) {
    throw new Error('Installed restart smoke refused to run because the QA guild already has a player session.');
  }

  await stopProcessTree(nativeProcess);
  if (crashMode) await assertControlUnavailableBeforeStart();
  nativeProcess = spawnInstalledNativeProcess();
  await waitForInstalledReady(nativeProcess);

  const afterChannels = await controlJson(`/guilds/${guildPath}/channels`);
  if (afterChannels.channels?.some((channel) => channel?.botJoined === true)) {
    throw new Error('Installed restart smoke observed an unexpected automatic voice join.');
  }
  const afterPlayer = await controlJson(`/guilds/${guildPath}/player`);
  if (afterPlayer?.player !== null) {
    throw new Error('Installed restart smoke observed an unexpected automatic player or playback state.');
  }
}

async function runInstalledCommandSmoke() {
  const result = await controlJson('/commands/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guildId: qaGuildId })
  }, { timeoutMs: 60_000 });
  if (result?.scope !== 'guild' || result.guildId !== qaGuildId || result.count !== 26) {
    throw new Error('Installed command smoke did not confirm the current guild-scoped command contract.');
  }
}

async function removeWithRetry(target, attempts = 12) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) throw error;
      await delay(150 + (attempt * 150));
    }
  }
  throw lastError;
}

async function stopProcessTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  await runProcess('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']);
  await waitForExit(child, 10_000);
}

await assertFile(installerPath, 'the NSIS installer');
if (configuredMode) await assertFile(path.join(projectRoot, '.env'), 'the workspace .env for opt-in configured QA');

const installDir = await mkdtemp(path.join(smokeParent, 'localbot-installer-smoke-'));
if (!installDir.startsWith(smokeParent + path.sep)) {
  throw new Error('Refusing to use an installer smoke directory outside the system temp directory.');
}

let nativeProcess;
let installCompleted = false;
let uninstallError = null;
let musicSessionStarted = false;
let forcedTerminationVerified = false;
let crashRecoveryVerified = false;
let smokeEnvironment;
const appDataRoot = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'com.localbot.app')
  : path.join(os.homedir(), 'AppData', 'Local', 'com.localbot.app');
let realAppDataBefore;

try {
  if (await fileExists(path.join(appDataRoot, '.env'))) {
    throw new Error('Refusing installer smoke: the real native app-local .env exists; the smoke test will not start a configured bot.');
  }
  realAppDataBefore = await snapshotDirectory(appDataRoot);

  const installerResult = await runProcess(installerPath, ['/S', `/D=${installDir}`]);
  if (installerResult.code !== 0) {
    throw new Error(`NSIS installer exited with code ${installerResult.code ?? 'unknown'}.`);
  }
  installCompleted = true;

  const runtimeDir = path.join(installDir, 'runtime');
  await assertFile(path.join(installDir, 'native.exe'), 'the installed native executable');
  await assertFile(path.join(runtimeDir, 'node.exe'), 'the bundled Node executable');
  await assertFile(path.join(runtimeDir, 'dist', 'index.js'), 'the compiled runtime entry');
  await assertFile(path.join(runtimeDir, 'runtime-manifest.json'), 'the runtime manifest');

  const manifest = JSON.parse(await readFile(path.join(runtimeDir, 'runtime-manifest.json'), 'utf8'));
  if (manifest.product !== 'LocalBot' || manifest.runtime !== 'native-owned-node') {
    throw new Error('Installed runtime manifest does not describe the native-owned LocalBot runtime.');
  }

  smokeEnvironment = { ...process.env };
  for (const secretKey of [
    'BOT_TOKEN',
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_GUILD_ID',
    'SOUNDCLOUD_CLIENT_ID',
    'SOUNDCLOUD_CLIENT_SECRET',
    'LOCALBOT_CONTROL_ENABLED',
    'LOCALBOT_ENV_FILE',
    'LOCALBOT_DATA_DIR',
    'LOCALBOT_INSTALLER_SMOKE',
    'LOCALBOT_INSTALLER_SMOKE_DATA_DIR'
  ]) {
    delete smokeEnvironment[secretKey];
  }

  if (dependencyIsolatedMode) {
    // The release shell must launch its bundled Node executable by absolute
    // resource path. Remove host Node/npm discovery hints and leave only the
    // Windows system directories in the child PATH. The smoke runner itself
    // still uses the host Node process to orchestrate the test.
    const pathKey = Object.keys(smokeEnvironment).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
    smokeEnvironment[pathKey] = 'C:\\Windows\\System32;C:\\Windows';
    for (const hostRuntimeKey of ['NODE_PATH', 'NODE_OPTIONS', 'NPM_CONFIG_PREFIX', 'npm_config_prefix', 'NPM_CONFIG_USERCONFIG', 'npm_config_userconfig']) {
      delete smokeEnvironment[hostRuntimeKey];
    }
  }

  // Keep the installed app completely away from the user's operational
  // profile. The native shell and WebView2 can each resolve user-data paths
  // independently; an installer smoke must not create logs, settings,
  // browser cache, or recovery files in the real profile.
  const isolatedLocalAppData = path.join(installDir, 'isolated-localappdata');
  const isolatedRoamingAppData = path.join(installDir, 'isolated-appdata');
  const isolatedTemp = path.join(installDir, 'isolated-temp');
  const isolatedTauriData = path.join(isolatedTemp, 'tauri-data');
  const isolatedWebViewData = path.join(installDir, 'isolated-webview2');
  await mkdir(isolatedLocalAppData, { recursive: true });
  await mkdir(isolatedRoamingAppData, { recursive: true });
  await mkdir(isolatedTemp, { recursive: true });
  await mkdir(isolatedTauriData, { recursive: true });
  await mkdir(isolatedWebViewData, { recursive: true });
  if (configuredMode) {
    // Never copy credentials into the test profile. The temporary Tauri data
    // directory receives a symlink to the operator-owned .env and is removed
    // with the isolated install during cleanup.
    await import('node:fs/promises').then(({ symlink }) => symlink(path.join(projectRoot, '.env'), path.join(isolatedTauriData, '.env')));
  }
  smokeEnvironment.LOCALAPPDATA = isolatedLocalAppData;
  smokeEnvironment.APPDATA = isolatedRoamingAppData;
  smokeEnvironment.TEMP = isolatedTemp;
  smokeEnvironment.TMP = isolatedTemp;
  smokeEnvironment.WEBVIEW2_USER_DATA_FOLDER = isolatedWebViewData;
  smokeEnvironment.LOCALBOT_INSTALLER_SMOKE = '1';
  smokeEnvironment.LOCALBOT_INSTALLER_SMOKE_DATA_DIR = isolatedTauriData;

  nativeProcess = spawnInstalledNativeProcess();
  if (configuredMode) {
    await waitForInstalledReady(nativeProcess);
    if (musicMode) await runInstalledMusicSmoke();
    if (soundcloudMode) await runInstalledMusicSmoke('soundcloud');
    if (recoveryMode) await runInstalledRecoverySmoke();
    if (restartMode) await runInstalledRestartSmoke();
    if (commandsMode) await runInstalledCommandSmoke();
    if (crashMode) await runInstalledCrashSmoke();
    if (crashRecoveryMode) await runInstalledCrashRecoverySmoke();
  } else {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  if (!crashMode && nativeProcess.exitCode !== null) {
    throw new Error(`Installed native executable exited during startup with code ${nativeProcess.exitCode}.`);
  }
} finally {
  if (musicSessionStarted) {
    try {
      await controlJson(`/guilds/${encodeURIComponent(qaGuildId)}/player/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'stop' })
      });
    } catch (error) {
      uninstallError = uninstallError ?? error;
    }
    try {
      await controlJson(`/guilds/${encodeURIComponent(qaGuildId)}/voice/leave`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
    } catch (error) {
      uninstallError = uninstallError ?? error;
    }
  }
  try {
    await stopProcessTree(nativeProcess);
  } catch (error) {
    uninstallError = error;
  }

  if (installCompleted) {
    const uninstallerPath = path.join(installDir, 'uninstall.exe');
    try {
      await assertFile(uninstallerPath, 'the generated uninstaller');
      const uninstallResult = await runProcess(uninstallerPath, ['/S'], { cwd: installDir });
      if (uninstallResult.code !== 0) {
        throw new Error(`NSIS uninstaller exited with code ${uninstallResult.code ?? 'unknown'}.`);
      }
    } catch (error) {
      uninstallError = uninstallError ?? error;
    }
  }

  try {
    await removeWithRetry(installDir);
  } catch (error) {
    uninstallError = uninstallError ?? error;
  }

  try {
    const realAppDataAfter = await snapshotDirectory(appDataRoot);
    const changed = realAppDataBefore ? changedSnapshotEntries(realAppDataBefore, realAppDataAfter) : [];
    if (changed.length > 0) {
      uninstallError = uninstallError ?? new Error('Installer smoke changed the real native app-data profile.');
    }
  } catch (error) {
    uninstallError = uninstallError ?? error;
  }
}

if (uninstallError) throw uninstallError;
process.stdout.write(JSON.stringify({
  status: 'verified',
  installer: path.basename(installerPath),
  configuredMode,
  musicMode,
  soundcloudMode,
  recoveryMode,
  restartMode,
  commandsMode,
  crashMode,
  crashRecoveryMode,
  dependencyIsolatedMode,
  installedRuntime: true,
  nativeWindowStartup: true,
  configuredRuntimeReady: configuredMode,
  installedMusicPlayback: musicMode || soundcloudMode,
  installedLocalAudioPipeline: musicMode,
  installedSoundCloudPlayback: soundcloudMode,
  installedRecovery: recoveryMode,
  installedRestartSemantics: restartMode,
  installedCommandRegistration: commandsMode,
  forcedTerminationVerified,
  crashRecoveryVerified,
  nativeProcessTreeStopped: true,
  isolatedAppData: true,
  realAppDataChanged: false,
  realAppDataFiles: realAppDataBefore ? [...realAppDataBefore.keys()].filter((entryPath) => !entryPath.endsWith(path.sep)).length : 0,
  temporaryInstallRemoved: true
}) + '\n');
