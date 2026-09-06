import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const indexSource = await readFile(path.join(root, 'src', 'index.ts'), 'utf8');
const serviceSource = await readFile(path.join(root, 'deploy', 'systemd', 'localbot.service.example'), 'utf8');

const requiredSourceMarkers = [
  "if (config.controlEnabled)",
  "await import('./control-server.js')",
  "process.once('SIGTERM'",
  'destroyAllPlayers()',
  'closeAllConnections'
];
const requiredServiceMarkers = [
  'LOCALBOT_RUNTIME_PROFILE=slash-only',
  'LOCALBOT_CONTROL_ENABLED=false',
  'User=localbot',
  'KillSignal=SIGTERM',
  'Restart=on-failure'
];
const failures = [];
for (const marker of requiredSourceMarkers) {
  if (!indexSource.includes(marker)) failures.push(`src/index.ts missing ${marker}`);
}
for (const marker of requiredServiceMarkers) {
  if (!serviceSource.includes(marker)) failures.push(`systemd example missing ${marker}`);
}
if (indexSource.includes("import { startControlServer } from './control-server.js'")) {
  failures.push('slash-only source path statically imports control-server');
}

const profileCheck = await import('../src/runtime-profile.ts');
if (profileCheck.parseRuntimeProfile('slash-only') !== 'slash-only') failures.push('slash-only profile did not parse');
if (profileCheck.parseAutoRegisterCommands(undefined, 'slash-only') !== false) failures.push('slash-only auto-registration default is not false');
profileCheck.validateRuntimeProfile('slash-only', false, null);
try {
  profileCheck.validateRuntimeProfile('slash-only', true, null);
  failures.push('slash-only accepted a control bridge');
} catch {}
try {
  profileCheck.validateRuntimeProfile('slash-only', false, 'unexpected-owner');
  failures.push('slash-only accepted a runtime owner');
} catch {}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'passed', profile: 'slash-only', listener: 'none', systemd: 'reference-only' }));
}
