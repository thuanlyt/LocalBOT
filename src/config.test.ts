import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { CONTROL_HOST, CONTROL_PORT, parseControlPort, resolveLocalPath, validateControlBinding } from './config.js';

test('production data paths are rooted in the native app data directory', () => {
  const dataDir = path.join('C:', 'Users', 'LocalBot', 'AppData');
  assert.equal(
    resolveLocalPath(undefined, 'data/playlists.json', dataDir),
    path.join(dataDir, 'data', 'playlists.json')
  );
  assert.equal(
    resolveLocalPath('settings/custom.json', 'data/fallback.json', dataDir),
    path.join(dataDir, 'settings', 'custom.json')
  );
});

test('explicit absolute data paths remain unchanged', () => {
  const absolutePath = path.resolve('LocalBot-data', 'playlists.json');
  assert.equal(resolveLocalPath(absolutePath, 'data/fallback.json', 'C:\\LocalBot'), absolutePath);
});

test('development paths remain relative when no app data directory is supplied', () => {
  assert.equal(resolveLocalPath(undefined, 'data/playlists.json', ''), 'data/playlists.json');
});

test('control binding accepts the canonical native endpoint and an ephemeral test port', () => {
  assert.equal(CONTROL_HOST, '127.0.0.1');
  assert.equal(CONTROL_PORT, 2901);
  assert.doesNotThrow(() => validateControlBinding(CONTROL_HOST, CONTROL_PORT));
  assert.doesNotThrow(() => validateControlBinding(CONTROL_HOST, 0));
});

test('control binding rejects LAN hosts and non-canonical runtime ports', () => {
  assert.throws(() => validateControlBinding('0.0.0.0', CONTROL_PORT), /LOCALBOT_CONTROL_HOST/);
  assert.throws(() => validateControlBinding(CONTROL_HOST, 2902), /LOCALBOT_CONTROL_PORT/);
  assert.throws(() => validateControlBinding(CONTROL_HOST, Number.NaN), /LOCALBOT_CONTROL_PORT/);
});

test('control port parser keeps default only for absent values and marks malformed input invalid', () => {
  assert.equal(parseControlPort(undefined), CONTROL_PORT);
  assert.equal(parseControlPort(''), CONTROL_PORT);
  assert.equal(parseControlPort('2901'), CONTROL_PORT);
  assert.ok(Number.isNaN(parseControlPort('not-a-port')));
  assert.ok(Number.isNaN(parseControlPort('0')));
});
