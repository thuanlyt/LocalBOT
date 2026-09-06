import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeDoctorReport } from './runtime-doctor.js';

const baseInput = {
  profile: 'headless' as const,
  control: { enabled: false, host: '127.0.0.1', port: 2901, ownerPresent: false },
  required: { discordTokenPresent: true, discordClientIdPresent: true },
  optional: { soundCloudConfigured: false, soundCloudEnabled: false },
  autoRegisterCommands: true
};

test('runtime doctor accepts a Windows headless runtime without the control bridge', () => {
  const report = buildRuntimeDoctorReport(baseInput);
  assert.equal(report.status, 'warn');
  assert.equal(report.profile, 'headless');
  assert.equal(report.control.enabled, false);
  assert.equal(report.checks.find((item) => item.id === 'control-bridge')?.status, 'pass');
  assert.equal(report.checks.find((item) => item.id === 'soundcloud')?.status, 'warn');
});

test('runtime doctor fails closed when required Discord configuration is absent', () => {
  const report = buildRuntimeDoctorReport({
    ...baseInput,
    required: { discordTokenPresent: false, discordClientIdPresent: false }
  });
  assert.equal(report.status, 'fail');
  assert.equal(report.checks.find((item) => item.id === 'discord-token')?.status, 'fail');
  assert.equal(report.checks.find((item) => item.id === 'discord-client-id')?.status, 'fail');
});

test('runtime doctor rejects slash-only ownership and control settings', () => {
  const report = buildRuntimeDoctorReport({
    ...baseInput,
    profile: 'slash-only',
    control: { enabled: true, host: '127.0.0.1', port: 2901, ownerPresent: true },
    autoRegisterCommands: false
  });
  assert.equal(report.status, 'fail');
  assert.equal(report.checks.find((item) => item.id === 'runtime-profile')?.status, 'fail');
});

test('runtime doctor catches a non-loopback control binding without exposing secrets', () => {
  const report = buildRuntimeDoctorReport({
    ...baseInput,
    control: { enabled: true, host: '0.0.0.0', port: 2901, ownerPresent: false }
  });
  assert.equal(report.status, 'fail');
  const detail = report.checks.find((item) => item.id === 'control-bridge')?.detail ?? '';
  assert.match(detail, /127\.0\.0\.1/);
  assert.doesNotMatch(detail, /token|secret|cookie/i);
});
