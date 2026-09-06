import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const requiredFiles = [
  'CLAUDE.md',
  'README.md',
  'README-vi.md',
  'docs/CHATGPT_PROJECT_CONTEXT.md',
  'docs/SDD.md',
  'docs/ROADMAP.md',
  'docs/MUSIC_SPEC.md',
  'docs/OPS_SPEC.md',
  'docs/SAFETY_SPEC.md',
  'docs/ENVIRONMENT.md',
  'docs/SOUNDCLOUD_CREDENTIALS_SPEC.md',
  'docs/ARCHITECTURE.md',
  'docs/HEADLESS_PARITY.md',
  'docs/REMAINING_GAPS.md',
  'docs/RELEASE_QA_RUNBOOK.md',
  'docs/AUDIT_STATUS.md',
  'docs/DECISIONS.md',
  'CODEX-ROADMAP/ROADMAP.md',
  'CODEX-ROADMAP/AUTOPILOT_PROMPT.md',
  'CLAUDE-ROADMAP/ROADMAP.md',
  'CLAUDE-ROADMAP/AUTOPILOT_PROMPT.md',
  'deploy/systemd/localbot.service.example'
];

const requiredText = new Map([
  ['README.md', ['127.0.0.1:2901', 'LOCALBOT_CONTROL_ENABLED=true', 'LOCALBOT_CONTROL_HOST=127.0.0.1', 'LOCALBOT_CONTROL_PORT=2901', 'LOCALBOT_RUNTIME_PROFILE', 'slash-only', 'Windows CMD / Headless', 'Active Development / Pre-release', 'npm start', 'npm run doctor', 'npm run qa:headless:smoke', 'Dark', 'Khởi động cùng Windows', 'Native window là cội nguồn', 'LOCALBOT_MESSAGE_CONTENT_INTENT', 'native:smoke:restart', 'native:smoke:commands', 'native:smoke:crash-recovery', '26 commands', '/bot diagnostics', 'LB-OPS-001', 'docs/OPS_SPEC.md', 'docs/HEADLESS_PARITY.md']],
  ['README-vi.md', ['LocalBOT', 'slash-only', 'Windows CMD / Headless', 'Pre-release', 'npm start', 'npm run doctor', 'npm run qa:headless:smoke', 'LOCALBOT_RUNTIME_PROFILE', '1541307192534241318', 'qa:headless', 'LB-OPS-001', 'docs/OPS_SPEC.md', 'docs/HEADLESS_PARITY.md']],
  ['docs/CHATGPT_PROJECT_CONTEXT.md', ['LocalBOT', 'native', 'headless', 'slash-only', '152/152', 'native:test', '1541307192534241318', 'Blocked', 'LB-GUILD-003', 'LB-MUSIC-019', 'LB-OPS-001', 'LB-RUNTIME-019', 'npm run doctor']],
  ['docs/SAFETY_SPEC.md', ['LB-SAFETY-008', 'LOCALBOT_MESSAGE_CONTENT_INTENT', 'Message Content Intent']],
  ['docs/ENVIRONMENT.md', ['LOCALBOT_MESSAGE_CONTENT_INTENT', 'Discord Developer Portal', 'LB-SECURITY-001']],
  ['docs/ARCHITECTURE.md', ['127.0.0.1:2901', 'LB-RUNTIME-002', 'LB-RUNTIME-016', 'LB-RUNTIME-017', 'LB-RUNTIME-018', 'LB-RUNTIME-019', 'LB-OPS-001', 'autostart', 'native executable', 'LOCALBOT_MESSAGE_CONTENT_INTENT', 'last-write-wins', 'slash-only', 'npm start']],
  ['docs/HEADLESS_PARITY.md', ['LB-RUNTIME-019', 'Windows Headless', 'npm start', 'npm run doctor', '/bot diagnostics', 'npm run qa:headless:smoke', 'port 2901']],
  ['docs/MUSIC_SPEC.md', ['LB-MUSIC-014', 'LB-MUSIC-016', 'LB-MUSIC-017', 'LB-MUSIC-019', 'non-seekable', 'Windows']],
  ['docs/OPS_SPEC.md', ['LB-OPS-001', 'GET /api/v1/diagnostics', 'secret-free', 'starting', 'degraded']],
  ['docs/SOUNDCLOUD_CREDENTIALS_SPEC.md', ['LB-MUSIC-017', 'URN', '/tracks/{track_urn}/streams', 'HLS AAC']],
  ['docs/ROADMAP.md', ['LB-COMMANDS-001', 'LB-COMMANDS-003', 'LB-MUSIC-014', 'LB-MUSIC-017', 'LB-MUSIC-018', 'LB-MUSIC-019', 'LB-OPS-001', 'LB-LOG-008', 'LB-SECURITY-001', 'LB-RUNTIME-016', 'LB-RUNTIME-017', 'LB-RUNTIME-018', 'LB-RUNTIME-019', 'LB-QA-006', 'LB-QA-007', 'LB-QA-008', 'LB-QA-009', 'LB-QA-010', 'LB-QA-011', 'LB-QA-012', 'LB-QA-013', 'LB-QA-014', 'LB-QA-015', 'LB-QA-016', 'LB-QA-017']],
  ['docs/REMAINING_GAPS.md', ['LB-MUSIC-014', 'LB-MUSIC-016', 'LB-MUSIC-017', 'LB-OPS-001', 'LB-RUNTIME-016', 'LB-RUNTIME-017', 'LB-RUNTIME-018', 'LB-RUNTIME-019', 'LB-QA-017', 'qa:headless', 'Windows autostart', 'Release trust/signing']],
  ['docs/RELEASE_QA_RUNBOOK.md', ['npm run native:smoke', 'npm run native:smoke:configured', 'npm run native:smoke:music', 'npm run native:smoke:soundcloud', 'npm run native:smoke:restart', 'npm run native:smoke:commands', 'npm run native:smoke:crash', 'npm run native:smoke:crash-recovery', 'npm run qa:headless', 'npm run doctor', 'npm run qa:headless:smoke', 'LB-MUSIC-014', 'LB-QA-017', 'LB-RUNTIME-017', 'autostart']],
  ['docs/AUDIT_LOG_SPEC.md', ['LB-LOG-008', 'before the HTTP success response']],
  ['docs/AUDIT_STATUS.md', ['LB-MUSIC-014', 'LB-MUSIC-016', 'LB-MUSIC-017', 'LB-MUSIC-018', 'LB-MUSIC-019', 'LB-OPS-001', 'LB-RUNTIME-019', 'LB-COMMANDS-001', 'LB-LOG-007', 'LB-LOG-008', 'LB-SECURITY-001', 'LB-RUNTIME-016', 'LB-RUNTIME-017', 'LB-RUNTIME-018', 'LB-QA-006', 'LB-QA-007', 'LB-QA-008', 'LB-QA-009', 'LB-QA-010', 'LB-QA-011', 'LB-QA-012', 'LB-QA-013', 'LB-QA-014', 'LB-QA-015', 'LB-QA-016', 'LB-QA-017', 'LB-UI-002', 'LB-UI-003', 'LB-GUILD-003', '152/152', 'native:test', 'realAppDataChanged:false']],
  ['docs/DECISIONS.md', ['ADR-052', 'ADR-053', 'ADR-054', 'ADR-055', 'ADR-056', 'ADR-057', 'ADR-058', 'ADR-059', 'ADR-060', 'ADR-062', 'ADR-063', 'ADR-064', 'native-session local']],
  ['deploy/systemd/localbot.service.example', ['LOCALBOT_RUNTIME_PROFILE=slash-only', 'LOCALBOT_CONTROL_ENABLED=false', 'User=localbot', 'KillSignal=SIGTERM']],
  ['CODEX-ROADMAP/ROADMAP.md', ['1541307192534241318', 'LB-COMMANDS-001', 'LB-MUSIC-014', 'LB-MUSIC-016', 'LB-MUSIC-017', 'LB-MUSIC-018', 'LB-QA-008', 'LB-QA-009', 'LB-QA-010', 'LB-QA-011', 'LB-QA-012', 'LB-QA-013', 'LB-QA-014', 'LB-QA-015', 'LB-QA-016', 'LB-QA-017', 'LB-RUNTIME-016', 'LB-SECURITY-001', 'LB-UI-003', 'cleanup']],
  ['CLAUDE-ROADMAP/ROADMAP.md', ['1541307192534241318', 'LB-COMMANDS-001', 'LB-MUSIC-014', 'LB-MUSIC-016', 'LB-MUSIC-017', 'LB-MUSIC-018', 'LB-QA-008', 'LB-QA-009', 'LB-QA-010', 'LB-QA-011', 'LB-QA-012', 'LB-QA-013', 'LB-QA-014', 'LB-QA-015', 'LB-QA-016', 'LB-QA-017', 'LB-RUNTIME-016', 'LB-SECURITY-001', 'LB-UI-003', 'No fake data']],
  ['CODEX-ROADMAP/AUTOPILOT_PROMPT.md', ['docs/SDD.md', 'CLAUDE-ROADMAP', '1541307192534241318', 'LB-COMMANDS-001', 'LB-LOG-007', 'LB-LOG-008', 'LB-QA-008', 'LB-SECURITY-001', 'LB-MUSIC-017', 'LB-UI-003']],
  ['CLAUDE-ROADMAP/AUTOPILOT_PROMPT.md', ['docs/SDD.md', 'CODEX-ROADMAP', '1541307192534241318', 'LB-COMMANDS-001', 'LB-LOG-007', 'LB-LOG-008', 'LB-QA-008', 'LB-SECURITY-001', 'LB-MUSIC-017', 'LB-UI-003']]
]);

const forbiddenCurrentClaims = [
  'Decide whether Discord seek is intentionally read-only',
  'decide/document whether Discord seek is supported or intentionally read-only'
];

const failures = [];
const contents = new Map();

for (const relative of requiredFiles) {
  const absolute = path.join(root, relative);
  try {
    contents.set(relative, await readFile(absolute, 'utf8'));
  } catch {
    failures.push(`${relative}: missing or unreadable`);
  }
}

for (const [relative, needles] of requiredText) {
  const content = contents.get(relative);
  if (!content) continue;
  for (const needle of needles) {
    if (!content.includes(needle)) failures.push(`${relative}: missing contract marker (${needle})`);
  }
}

for (const relative of ['docs/ROADMAP.md', 'docs/REMAINING_GAPS.md', 'docs/AUDIT_STATUS.md', 'CODEX-ROADMAP/ROADMAP.md', 'CLAUDE-ROADMAP/ROADMAP.md']) {
  const content = contents.get(relative);
  if (!content) continue;
  for (const phrase of forbiddenCurrentClaims) {
    if (content.includes(phrase)) failures.push(`${relative}: stale unresolved seek decision`);
  }
}

const readme = contents.get('README.md') ?? '';
if (/\b8080\b/.test(readme)) failures.push('README.md: stale port 8080 reference');

if (failures.length > 0) {
  console.error(JSON.stringify({ status: 'failed', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'passed', filesChecked: requiredFiles.length, contract: 'native-owned/2901/dark/autostart/music-seek-policy/soundcloud-urn-hls' }));
}
