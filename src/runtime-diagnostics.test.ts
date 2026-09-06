import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeDiagnostics } from './runtime-diagnostics.js';

const baseInput = {
  profile: 'native' as const,
  control: { enabled: true, host: '127.0.0.1', port: 2901, loopbackOnly: true, ownerPresent: true },
  discord: { ready: true, botTag: 'LocalBot#0001', guildCount: 2 },
  capabilities: { guildMembersIntent: false, messageContentIntent: false },
  providers: [
    { id: 'youtube', label: 'YouTube', enabled: true, configured: true },
    { id: 'soundcloud', label: 'SoundCloud', enabled: false, configured: false }
  ]
};

test('runtime diagnostics reports ready core state and optional integrations as informational', () => {
  const diagnostics = buildRuntimeDiagnostics(baseInput);
  assert.equal(diagnostics.status, 'ready');
  assert.equal(diagnostics.control.loopbackOnly, true);
  assert.equal(diagnostics.providers.find((provider) => provider.id === 'youtube')?.state, 'ready');
  assert.equal(diagnostics.providers.find((provider) => provider.id === 'soundcloud')?.state, 'not_configured');
  assert.equal(diagnostics.checks.find((check) => check.id === 'provider-soundcloud')?.status, 'info');
  assert.equal(diagnostics.checks.find((check) => check.id === 'message-content-intent')?.status, 'info');
});

test('runtime diagnostics distinguishes gateway starting from degraded ownership', () => {
  const starting = buildRuntimeDiagnostics({
    ...baseInput,
    discord: { ...baseInput.discord, ready: false }
  });
  assert.equal(starting.status, 'starting');
  assert.equal(starting.checks.find((check) => check.id === 'discord-runtime')?.status, 'info');

  const degraded = buildRuntimeDiagnostics({
    ...baseInput,
    control: { ...baseInput.control, ownerPresent: false }
  });
  assert.equal(degraded.status, 'degraded');
  assert.equal(degraded.checks.find((check) => check.id === 'runtime-ownership')?.status, 'attention');
});

test('runtime diagnostics keeps non-native profiles honest about ownership and control', () => {
  const diagnostics = buildRuntimeDiagnostics({
    ...baseInput,
    profile: 'slash-only',
    control: { enabled: false, host: '127.0.0.1', port: 2901, loopbackOnly: true, ownerPresent: false }
  });
  assert.equal(diagnostics.status, 'ready');
  assert.equal(diagnostics.checks.find((check) => check.id === 'runtime-ownership')?.status, 'info');
  assert.equal(diagnostics.checks.find((check) => check.id === 'control-boundary')?.status, 'info');
});
