# LocalBot checkpoint — 2026-09-06

## Repository state

- Workspace: `F:\dev\LocalBot`
- Git metadata: unavailable. `git status`, `git rev-parse`, and `git log` report that this workspace is not a Git repository.
- Therefore there is no trustworthy HEAD, branch, commit checkpoint, or diff baseline. No repository was initialized and no unknown work was discarded.
- This file is a documentation checkpoint only. Existing source, tests, docs, build artifacts, design assets, and local data were preserved.

## Automated baseline

The following commands passed before the next implementation slice:

| Check | Result |
| --- | --- |
| `npm test` | 135/135 passed |
| `npm run typecheck` | passed |
| `npm run native:typecheck` | passed |
| `cargo check --manifest-path native/src-tauri/Cargo.toml` | passed |
| `cargo test --manifest-path native/src-tauri/Cargo.toml` | 6/6 passed |
| `cargo clippy --manifest-path native/src-tauri/Cargo.toml --all-targets -- -D warnings` | passed |
| `npm run qa:headless` | passed; slash-only has no listener |
| `npm run audit:static` | passed |
| `npm run audit:docs` | passed; 20 files checked |
| `npm run native:verify` | passed; 4,587 runtime files, no source maps/test specs/env files |

## Safety boundary

- The authorized live QA guild is `1541307192534241318`; use only non-destructive fixtures.
- Secrets in `.env`, tokens, cookies, OAuth credentials, and provider payloads were not read or copied into this checkpoint.
- No live Discord action was performed by this checkpoint.

## Next slice selected

Guild administration ergonomics: expose real Discord role metadata through the existing
loopback Control API and use role pickers for Community XP multiplier/reward configuration.
The storage contract remains role IDs; no permission mutation or new remote surface is added.

## Slice completion evidence

- `npm test`: 135/135 passed.
- Root/native TypeScript typechecks, `npm run build`, static/docs audits, and `node --check scripts/live-readonly-qa.mjs`: passed.
- Tauri release build, `native:verify`, Rust check/test (6/6), Clippy `-D warnings`, headless QA, and installer smoke: passed.
- Final artifact verification: 4,587 runtime files, 202,753,112 runtime bytes, no source maps/test specs/env files, one MSI and one NSIS artifact.
- Installer smoke ended with `nativeProcessTreeStopped:true`, `isolatedAppData:true`, `realAppDataChanged:false`; port 2901 was free afterward.
- Live guild role read was not claimed in this slice because no native-owned runtime was left running during the final QA pass; use `npm run qa:live` against a native-owned session for target guild evidence.

## Slice update — LB-GUILD-002 member picker

- Implemented a bounded `GET /api/v1/guilds/:guildId/members` contract for Music allow-list configuration.
- The route reports `intentEnabled`, `complete`, and `source` so cache-only results are never presented as a complete Discord directory. Bots are excluded and no raw upstream errors are returned.
- Native Community can search by display name, username, or ID, add a real cached/Discord member to the allow-list, and still accepts a manual numeric ID when Members Intent is unavailable.
- `npm test`: 136/136 passed; no tests were removed or weakened.
- Root/native typecheck, root build, static/docs audits, and `node --check scripts/live-readonly-qa.mjs`: passed.
- Tauri release build, `native:verify`, Rust check/test (6/6), Clippy `-D warnings`, `qa:headless`, and installer smoke: passed.
- Final artifact verification: 4,587 runtime files, 202,754,971 runtime bytes, no source maps/test specs/env files, one MSI and one NSIS artifact.
- Installer smoke: `nativeWindowStartup:true`, `nativeProcessTreeStopped:true`, `isolatedAppData:true`, `realAppDataChanged:false`, `temporaryInstallRemoved:true`.
- Port 2901 was free after the run. No native-owned live guild/member probe was claimed; target-guild acceptance still requires a deliberately started native-owned session.

## Slice update — LB-COMMUNITY-006 native XP exclusion pickers

- The existing ignored channel/role Community behavior is now exposed through the native app using
  real selected-guild text-channel and role metadata.
- `POST /api/v1/guilds/:guildId/community/settings` accepts bounded `ignoredChannelIds` and
  `ignoredRoleIds` lists with all-or-nothing normalization; invalid writes preserve prior state.
- `npm test`: 137/137 passed; root/native typecheck, root build, static audit, and headless QA passed.
- Native release rebuild, artifact verification, Rust checks, and installer smoke remain required
  after this UI/control-plane change; no live Discord mutation was performed by this slice.

### Final verification for LB-COMMUNITY-006

- Tauri release build completed with MSI and NSIS bundles.
- `native:verify`: 4,587 runtime files, 202,758,139 runtime bytes, zero source maps, test specs,
  or `.env` files; one MSI and one NSIS artifact.
- Rust check passed; native Rust tests passed 6/6; Clippy with `-D warnings` passed.
- `qa:headless`, `audit:static`, and `audit:docs` passed.
- Installer smoke reported `nativeWindowStartup:true`, `nativeProcessTreeStopped:true`,
  `isolatedAppData:true`, `realAppDataChanged:false`, and `temporaryInstallRemoved:true`.
- Port 2901 was free after the final smoke run.
- Native-owned live read-only QA then confirmed the target guild `1541307192534241318` route
  envelopes through the dev runtime; the listener ancestry included `native.exe`, and after the
  controlled stop port 2901 was free with zero `native.exe` processes. This is contract/ownership
  evidence only, not live slash interaction, playback, or permission-mutation acceptance.

### Configured installed smoke family

- `native:smoke:configured`, `native:smoke:music`, `native:smoke:commands`,
  `native:smoke:recovery`, and `native:smoke:restart` passed against the current NSIS artifact.
- The configured Music smoke verified real YouTube playback plus the independent local-audio
  pipeline; command registration, credential-free restore, and no-auto-join/no-auto-play restart
  contracts also passed.
- `native:smoke:crash` and `native:smoke:crash-recovery` passed: forced root termination left no
  owned process tree, and killing the bundled runtime child triggered bounded replacement recovery.
- `native:smoke:isolated` and `native:smoke:music:isolated` passed with dependency discovery
  isolated from Node/npm; the Music variant retained the real YouTube/Discord and local-audio
  checks.
- These runs reported `configuredRuntimeReady:true`, `nativeProcessTreeStopped:true`,
  `isolatedAppData:true`, `realAppDataChanged:false`, and `temporaryInstallRemoved:true`.
  They strengthen current-machine configured evidence only; clean-machine, autostart/reboot,
  SoundCloud credentials/live playback, device-loss, visual/accessibility, upgrade, and signing
  gates remain open.

### Follow-up slice — LB-GUILD-003

- Added `GET /api/v1/guilds/:guildId/permissions` and a native Community permission-readiness
  panel. It reports effective bot permissions and highest role without mutating Discord.
- Missing bot-member cache is represented as unknown (`null`), never as a false denial; per-channel
  Connect/Speak/Send checks remain authoritative for real actions.
- `npm test`: 138/138 passed; root and native TypeScript checks passed; live QA returned
  `200`/`contract:ok` for the new permissions route and all existing read-only checks in the
  authorized guild. Tauri release build, `native:verify`, Rust check/test/clippy, headless QA,
  normal installer smoke, configured installer smoke, and configured Music smoke also passed;
  the latter reported real installed YouTube/Discord playback plus the independent local-audio
  pipeline. Installed visual,
  accessibility, and live permission interaction remain manual gates.
