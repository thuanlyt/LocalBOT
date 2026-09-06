import { readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const root = process.cwd();
const port = 2901;
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function isPortFree() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (free) => {
      socket.destroy();
      resolve(free);
    };
    socket.once('connect', () => finish(false));
    socket.once('error', (error) => finish(error.code === 'ECONNREFUSED'));
    socket.setTimeout(750, () => finish(true));
  });
}

function runHeadlessChild() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      DISCORD_TOKEN: '',
      BOT_TOKEN: '',
      DISCORD_CLIENT_ID: '',
      LOCALBOT_ENV_FILE: path.join(root, '.localbot-headless-smoke.env'),
      LOCALBOT_RUNTIME_PROFILE: 'headless',
      LOCALBOT_CONTROL_ENABLED: 'false',
      LOCALBOT_AUTO_REGISTER_COMMANDS: 'false'
    };
    const child = spawn(process.execPath, [path.join(root, 'dist', 'index.js')], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('headless runtime did not fail fast within 5 seconds'));
    }, 5_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, output });
    });
  });
}

const source = await readFile(path.join(root, 'src', 'index.ts'), 'utf8');
const built = await readFile(path.join(root, 'dist', 'index.js'), 'utf8');

assert(source.includes("if (config.controlEnabled)"), 'shared runtime must gate the control bridge');
assert(source.includes("process.once('SIGINT'"), 'headless runtime must register SIGINT cleanup');
assert(source.includes("process.once('SIGTERM'"), 'headless runtime must register SIGTERM cleanup');
assert(source.includes('destroyAllPlayers()'), 'headless shutdown must destroy players');
assert(source.includes('client.destroy()'), 'headless shutdown must destroy the Discord client');
assert(!built.includes('@tauri-apps/'), 'headless build must not load Tauri packages');

const beforeFree = await isPortFree();
assert(beforeFree, 'port 2901 must be free before the credential-free headless smoke');

let childResult;
try {
  childResult = await runHeadlessChild();
  assert(childResult.code !== 0, 'missing Discord configuration must fail the runtime fast');
  assert(childResult.signal === null, 'configuration failure must exit without an orphaned signal state');
  assert(childResult.output.includes('DISCORD_TOKEN'), 'failure must name the canonical token key');
  assert(childResult.output.includes('DISCORD_CLIENT_ID'), 'failure must name the application key');
  for (const secret of [process.env.DISCORD_TOKEN, process.env.BOT_TOKEN, process.env.SOUNDCLOUD_CLIENT_SECRET]) {
    if (secret) assert(!childResult.output.includes(secret), 'headless failure output must not contain a credential value');
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : 'headless child smoke failed');
}

const afterFree = await isPortFree();
assert(afterFree, 'port 2901 must remain free when the headless control bridge is disabled');

if (failures.length > 0) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: 'passed',
    profile: 'headless',
    configurationFailure: 'bounded',
    controlListener: 'none',
    nativeDependency: 'none',
    orphanedChild: false,
    port: 2901
  }));
}
