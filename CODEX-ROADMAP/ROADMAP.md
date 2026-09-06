# LocalBot Enterprise Roadmap — Codex

Status: Active autopilot roadmap.

This is the integration and release roadmap for the current Codex session. It is governed by `docs/SDD.md`; `docs/ROADMAP.md` remains the product-level source of truth and must be synchronized whenever a requirement changes.

## Mission

Deliver LocalBot as a reliable, local-first Windows native application whose native window is the sole owner of the bot runtime. The finished product must use real Discord/provider state, expose honest loading/empty/offline/error states, support Music smoothly, and pass deterministic, integration, security, accessibility, performance, and release QA.

## Division of responsibility

This roadmap is the Codex integration track. Codex owns the cross-cutting truth of the repository and the final release decision:

- runtime topology, Tauri/native lifecycle, bundled release runtime, Windows autostart, crash/close ownership, installer and cleanup gates;
- cross-feature contracts, SDD/ADR reconciliation, security boundaries, live QA in the authorized guild, release evidence, and final documentation sign-off;
- integration fixes that span more than one Claude package or invalidate an existing acceptance claim.

Claude Code owns implementation packages recorded in `CLAUDE-ROADMAP/ROADMAP.md`: backend/provider/command/community/safety slices, their deterministic tests, targeted native UI work, and a sanitized handoff. Claude must not overwrite an active Codex claim. Codex must not silently rewrite an active Claude claim; if an integration change is necessary, release the claim or record the conflict in `docs/AGENT_COORDINATION.md` first.

The agents share the SDD process, product specs, tests, and QA safety rules. A package is not complete until the owning agent records implementation evidence; Codex may then accept, reject, or keep it partial at the integration gate.

## Non-negotiable product boundaries

- Native Tauri Windows app is the product root. If the native app closes, the bot it owns must stop. An externally started bot is never adopted or terminated.
- The loopback control service is bound to `127.0.0.1:2901`; the native window itself does not require an external dashboard port.
- `LB-SECURITY-001` is a hard boundary: runtime configuration must remain exactly `127.0.0.1:2901`; invalid host/port values fail closed. Port `0` is test-only. Remote exposure requires a new authenticated SDD/ADR design.
- First-install theme is `Dark`; the approved v1 theme options are distinct `Default` split-tone, `Dark`, and `Light`.
- Music providers in scope are YouTube and optional SoundCloud through supported/official access paths. Spotify is not in scope unless a new approved requirement and legal/technical design are added.
- Discord output and Windows output are independent sinks and may run in parallel. Failure of one sink must not cancel or falsely report success for the other.
- Credentials, cookies, OAuth material, and provider responses stay server-side/native-side and are never exposed to client JavaScript or user-facing logs.
- No fake production data. If real data is unavailable, render an explicit unavailable, offline, loading, empty, or stale state.

## QA target

Primary live integration guild: `1541307192534241318`.

Discover its real voice/text channels at test time. Use a dedicated test channel or fixture when one exists. The user granted admin permission for QA, but destructive moderation, mass messaging, mass deletion, and production-like safety actions remain prohibited. Follow `docs/AGENT_COORDINATION.md`.

## Baseline at roadmap creation

Documented implementation exists for the Tauri native shell, Vite HMR, native-owned dev runtime, autostart dependency/toggle, loopback v1 control routes, YouTube Music flow, optional SoundCloud adapter with explicit enable/disable/redacted connection test and native Windows credential vault, queue/player/playlist/permission slices, Windows + Discord output architecture, provider tags/thumbnails, guild/voice controls, SSE reconciliation, Community XP/rank/leaderboard first slice, local audit storage with scoped export and passive moderation telemetry, production runtime bundling, and abort-safe Windows audio cleanup.

The release is not yet enterprise-complete. Known gates include installed-build runtime/autostart/restore acceptance, concrete store-specific legacy migrations, SoundCloud vault live acceptance/token rotation observation, richer logs/onboarding, AutoMod installed-build/review-appeal acceptance, richer privacy-reviewed AI behavior, full live-guild QA, accessibility/manual native QA, signing, and final cleanup. Credential-free backup export/restore, scoped audit JSON/CSV export, metadata-only slash-command accountability, the shared migration runner, crash-safe native process ownership, freshness indicators, native output-device routing, native audit retention editing, Ollama configuration/health/read-only suggestions, and the intentional Discord read-only seek boundary are implemented but still need their remaining manual acceptance where noted.

## Active claims

None. `LB-SAFETY-007`, `LB-RUNTIME-015`, `LB-RUNTIME-016`, `LB-COMMANDS-002`, `LB-QA-014`,
`LB-QA-015`, `LB-QA-016`, and `LB-QA-017` were released after their implementation, tests, and
synchronized evidence landed.

Integration note: `LB-SAFETY-008` is the current gateway capability hardening slice. Codex owns
the contract and release evidence; implementation is intentionally small and must preserve the
native-owned runtime boundary. The privileged portal switch and configured live content check
remain manual gates, not reasons to fabricate AutoMod readiness.

## Completed slices

### 2026-09-04 — `LB-QA-014` — Dependency-isolated packaged runtime

Codex added `--dependency-isolated` to the installed NSIS smoke harness and exposed configured
commands `npm run native:smoke:isolated` and `npm run native:smoke:music:isolated`. The native
child receives only Windows system directories in `PATH` and no Node/npm discovery hints, while
the packaged shell must launch its bundled `runtime/node.exe`. The host Node process only
orchestrates the test. Temporary app/browser data remains isolated and the real app-data snapshot
boundary is unchanged.

Evidence: both new commands passed on 2026-09-04; the Music variant completed real
YouTube/Discord playback and independent local-audio validation. Each run reported
`dependencyIsolatedMode:true`, `nativeProcessTreeStopped:true`, `isolatedAppData:true`,
`realAppDataChanged:false`, and `temporaryInstallRemoved:true`. `npm test` 132/132, root/native
typecheck, Rust tests 5/5, Clippy, static/docs audits, and artifact verification also passed.
This is not physical clean-machine, autostart/reboot, SoundCloud/vault, device,
visual/accessibility, crash/upgrade, or signing acceptance.

### 2026-09-04 — `LB-QA-015` — Forced native termination orphan guard

Codex extended the configured installed NSIS smoke with `npm run native:smoke:crash`. It waits for
sanitized readiness, force-terminates only the exact native root PID without `/T`, verifies that
the Windows Job Object removes the owned runtime child and releases port `2901`, then preserves
the isolated profile cleanup and real AppData snapshot boundary.

Evidence: the configured run passed with `forcedTerminationVerified:true`,
`nativeProcessTreeStopped:true`, `isolatedAppData:true`, `realAppDataChanged:false`, and
`temporaryInstallRemoved:true`. This proves orphan cleanup after forced native termination;
bounded child crash recovery is covered separately by `LB-QA-017`; autostart/reboot, clean-machine,
provider, device, manual UX, upgrade, and signing acceptance remain separate.

### 2026-09-04 — `LB-RUNTIME-016` / `LB-QA-017` — Bounded native child recovery

Codex added a native-owned supervisor with exact-child ownership, 1/2/4-second backoff, three
consecutive attempts, 30-second stability reset, redacted UI state, and explicit Stop/shutdown/
external-listener boundaries. Recovery never auto-joins or auto-plays. The installed smoke
`npm run native:smoke:crash-recovery` passed: it killed only the bundled `runtime/node.exe` child,
kept native alive, observed a replacement reach health `ready`, then cleaned the isolated profile.
Evidence included `crashRecoveryVerified:true`, `nativeProcessTreeStopped:true`,
`realAppDataChanged:false`, and `temporaryInstallRemoved:true`.

### 2026-09-04 — `LB-QA-016` — Installed SoundCloud official playback smoke

Codex extended the configured installed Music harness with `npm run native:smoke:soundcloud`.
The path is provider-specific: it searches only SoundCloud, requires a real HTTPS thumbnail and
SoundCloud identity, exercises Discord play/pause/resume/stop/leave, and preserves the existing
isolated cleanup and no-secret output boundary. It never falls back to YouTube when SoundCloud is
unconfigured, disabled, or rejected.

Implementation checks: script syntax, docs/static audits, the YouTube dependency-isolated smoke,
and the existing 132/132 deterministic suite remain green. The current opt-in SoundCloud run
failed closed at `503 SOUNDCLOUD_NOT_CONFIGURED` before voice/player mutation and cleaned the
installed profile; credentialed live acceptance must still be run after native vault/env setup,
without printing credential/provider payloads.

### 2026-09-04 — `LB-COMMANDS-002` — Safe typed slash-registration failures

Codex wrapped Discord REST registration failures in a bounded error contract. The native control
route now returns `COMMAND_REGISTRATION_FAILED` with only a stable message and `retryable` boolean;
unknown/network/rate-limit/upstream failures are retryable, while 4xx failures are not. No raw
Discord error, command payload, authorization material, or response body crosses the boundary.

Evidence: deterministic tests, root/native typecheck, root/native build, static/docs audits, and
rebuilt MSI/NSIS verification pass. Installed native registration for QA guild
`1541307192534241318` passed with 25 guild-scoped commands; command-by-command interaction remains
a separate release gate.

### 2026-09-04 — `LB-RUNTIME-015` — Deterministic Windows child-tree termination regression

Codex added a short-lived local `cmd.exe` fixture to the native Rust test suite. The test exercises
the production `taskkill /T /F` plus `wait` path and verifies the root process is reaped before
ownership can be released. It does not touch the bot token, port `2901`, Discord, or user data.

Evidence: `cargo test --manifest-path native/src-tauri/Cargo.toml` passed 5/5, root/native
typecheck, static audit, and documentation audit passed. Installed stop-failure/retry observation
remains a manual release gate.

### 2026-09-03 — `LB-UI-002` — Last-write-wins guild reconciliation

Agent: Codex integration owner. Phase: A3 (Native UX/control-plane hardening).

Behavior: native guild-scoped reads now carry per-surface revisions and the originating guild
ID. Late responses from an earlier guild, stale polling calls, or a bridge that went offline
cannot overwrite current state. Guild switching clears the old player immediately and performs
an immediate read for the selected guild; SSE remains an update path and polling remains recovery.

Covered surfaces: guilds, voice channels, player, playlists, Equalizer, Music access, Community,
Welcome/Goodbye, AutoMod/review, local/Discord audit, and provider readiness.

Checks: root/native typecheck, `npm test` 131/131, `npm run audit:static`, and
`npm run audit:docs` pass. Native release rebuild, installer smoke, and manual rapid-switch/
reconnect visual acceptance remain the next release checks.

### 2026-09-03 — `LB-UI-003` — Guild-scoped action response reconciliation

Agent: Codex integration owner. Phase: A3 (Native UX/control-plane hardening).

Behavior: guild-scoped action callbacks capture their originating guild and monotonic selection revision and guard state commits,
loading cleanup, and user feedback against a guild switch or bridge loss. Join/Leave, player and
queue actions, Discord output-toggle handoff, playlist CRUD, Equalizer, Music access, Community,
onboarding, AutoMod/review, and registration no longer let a late response present old-guild
success or state in the new guild.
The server operation is not cancelled; current-guild refresh/SSE remains authoritative.

Checks: native typecheck, root tests, static/docs audits, and the release build pass after this
slice. Manual rapid-switch while actions are pending remains a release acceptance check.

### 2026-09-03 — `LB-MUSIC-017` — SoundCloud refresh-token recovery

Agent: Codex integration owner. Phase: A2 (Provider/runtime hardening).

The SoundCloud adapter now falls back to a fresh documented Client Credentials token when an
invalid/expired single-use refresh token is rejected, while transient network failures remain
retryable. No token value is persisted or exposed.

Checks: root tests, root/native typecheck, static/docs audits, and the native release build pass.
The regression suite now exercises the rejected-refresh → fresh Client Credentials flow through
a mocked HTTP boundary without real credentials or network access. Live configured token-expiry/
rotation and vault playback remain acceptance gates.

### 2026-09-03 — `LB-COMMANDS-001` — Slash-command schema safety

Agent: Codex integration owner. The 26-command registry is guarded before Discord registration
by pure deterministic checks for Discord-safe names, bounded descriptions, unique nested options
and choices, numeric ranges, required-before-optional ordering, and the approved Music provider,
repeat, volume, and queue-position contract.

Evidence: `npm test` 131/131, root/native typecheck, build, static/docs audit, and the latest
native artifact verification/smoke pass. Live command round-trip and installed-build interaction
acceptance remain release gates.

### 2026-09-03 — `LB-LOG-007` — Metadata-only Discord command accountability

Agent: Codex integration owner. Phase: A4 (guild administration and audit).

Every slash-command interaction now emits a bounded local audit record containing only actor,
guild, command, optional subcommand, and success/denied/error outcome. Query text, URLs, playlist
names, provider payloads, and credential-like values are excluded; audit write failure cannot
change the Discord command result. Manager permission denials are recorded as denied rather than
success.

Evidence: `npm test` 131/131, root/native typecheck, build, static/docs audit, and release
verification remain green. Installed command round-trip and live audit observation remain release
acceptance gates.

### 2026-09-04 — `LB-LOG-008` — Awaited mutation audit boundary

Agent: Codex integration owner. Phase: A4/A8 (audit integrity and release integration).

Control API mutations now await the request-scoped, redacted audit attempt before committing a
success response. Every mutation call site passes the injected audit store explicitly, so isolated
runtime/test stores cannot be bypassed by the process-global default. Audit persistence failure is
still isolated from the primary operation and never becomes an unhandled rejection or payload leak.

Evidence: Equalizer response-order/isolation coverage and `npm test` 131/131 pass; root/native
typecheck/build, Rust checks, static/docs audit, release build, artifact verify and installer smoke
remain green. See `docs/AUDIT_LOG_SPEC.md`, `docs/DECISIONS.md` ADR-059 and `docs/AUDIT_STATUS.md`.

### 2026-09-04 — `LB-SECURITY-001` — Canonical loopback control binding

Agent: Codex integration owner. Phase: A8 (security and release integration).

The configuration and Control API now fail closed unless the native bridge uses exactly
`127.0.0.1:2901`. A loopback-only unauthenticated bridge is not made remotely reachable through
`.env`; port `0` is accepted only for in-process tests. Any future remote control must begin with
a new authenticated SDD requirement and ADR.

Evidence: canonical/port-zero acceptance and LAN/noncanonical rejection tests; `npm test` 131/131,
root/native checks, static/docs audit, and the rebuilt release artifact gates remain required.

### 2026-09-03 — `LB-RUNTIME-010` — Codex

- Hardened `scripts/prepare-native-runtime.mjs` to rebuild the generated staging directory and remove source maps plus package test/spec files before Tauri packaging.
- Added `npm run native:verify` as a deterministic post-build artifact verifier for the bundled runtime and MSI/NSIS outputs.
- Removed the unused Vite/Tauri starter assets from `native/public/` after reference checks; product logos and approved design references remain.
- Evidence: final `npm test` 98/98, root/native typechecks and builds passed, `npm audit --omit=dev --audit-level=high` reported 0 vulnerabilities, Rust checks/tests passed, and `npm run native:build` produced MSI/NSIS artifacts recorded in `docs/AUDIT_STATUS.md`.
- Remaining acceptance: installed clean-machine/startup/restore/vault/download/manual visual/accessibility checks; final workspace cleanup remains release-gated.

### 2026-09-03 — `LB-RUNTIME-011` — Codex

- Added a metadata-only Tauri `native_runtime_info` command and packaged-only Settings guidance for first-run app-local `.env` setup.
- The UI shows the real application data directory and `.env` file-presence metadata, lists variable names only, and never treats file presence as readiness. Debug mode does not show packaged setup instructions.
- Evidence: root tests/typecheck/build, native typecheck/build, Rust check/test (3/3), `npm run native:verify`, and release artifact rebuild pass. A packaged conflict smoke kept the external Node listener untouched and spawned no bot-like child; clean-machine first-run acceptance remains a release gate.

### 2026-09-03 — `LB-RUNTIME-014` — First-run data-directory opener

- Added a native Settings action that opens the packaged app-local data directory through the Tauri opener plugin when the bot is offline and configuration guidance is visible.
- The action receives only the metadata path returned by `native_runtime_info`, has an inline retryable error state, and never reads, copies, or displays `.env` contents.
- Evidence: native TypeScript typecheck/build, full MSI/NSIS rebuild, `npm run native:verify`, and `npm run native:smoke` passed; clean installed first-run configuration remains a manual release gate.

### 2026-09-03 — `LB-MUSIC-006` + `LB-RUNTIME-005` — Codex

- Implemented native freshness/stale/error/offline markers with retry actions for guild, voice, player, and provider surfaces.
- Implemented credential-free local backup export at `GET /api/v1/data/export` and the native Settings download action; hardened validation for all ten known version-one store shapes, including Welcome/Goodbye, AutoMod, bounded AutoMod review metadata, and Ollama settings.
- Added tests for malformed JSON, malformed version-one shapes, envelope validation, credential exclusion, and the control route.
- Evidence at that historical slice: `npm test` 42/42, root typecheck, root build, native typecheck, and Tauri release build all passed. The current rebuilt runtime resource has 4,583 files, 0 source maps, `runtime/node.exe`, compiled `runtime/dist/index.js`, and production dependencies. MSI/NSIS artifacts were regenerated again after later slices.
- Live evidence already recorded in `docs/AUDIT_STATUS.md`: real YouTube playback, concurrent Windows stream isolation, typed local sink failure isolation, health recovery, and backup endpoint response.
- Remaining acceptance: manual Tauri visual/accessibility checks, installed clean-machine/startup/upgrade/uninstall/restore checks, SoundCloud vault save/clear/restart/live provider path, concrete store migration fixtures when schemas evolve, and the remaining enterprise phases. The reproducible installer smoke now also validates a Rust-enforced temp-scoped Tauri data marker and has a no-real-profile-change hash audit.

### 2026-09-03 — `LB-LOG-001` — Codex

- Added bounded, redacted audit query filters for guild, action namespace, and case-insensitive search; preserved the existing response envelope and newest-first ordering.
- Added native Community controls for log search, action group, apply, reset, loading, and empty filtered results.
- Evidence: `npm test` 43/43, root typecheck, native typecheck, and Tauri release build all passed; MSI/NSIS were regenerated with the filtered runtime resource.
- Remaining acceptance: richer audit permissions/moderation event ingestion and manual native visual/accessibility review remain planned/pending.

### 2026-09-03 — `LB-MUSIC-009` — Codex

- Added the version-one `player-state.json` store with strict track/queue/settings validation, bounded history and pending queue limits, corruption quarantine, and atomic writes.
- Hydrated the Discord queue only when a selected voice player is created; the persisted snapshot omits the active track/resource and cannot auto-join or auto-play after restart.
- Evidence: `npm test` 45/45, root typecheck, root build, native typecheck, and Tauri release build all passed. The backup envelope now includes the safe player-state store.
- Remaining acceptance at the original slice is now narrowed: `LB-QA-012` covers controlled installed no-auto-join/no-auto-play on the configured current machine; crash recovery, current-track auto-resume decision, upgrade compatibility, and the other `LB-MUSIC-007` hardening items remain.

### 2026-09-03 — `LB-MUSIC-010` — Codex

- Added a version-one local provider-settings store containing only SoundCloud's enabled flag; malformed data is quarantined through the shared persistence helper.
- Added secret-free control routes to inspect effective provider readiness, enable/disable SoundCloud, and run a minimal official API connection test. Enabling without credentials fails safely; YouTube remains independent.
- Added native Settings controls for SoundCloud availability and connection testing; no credential input or secret crosses the native/control boundary.
- Evidence: `npm test` 48/48, root typecheck/build, native typecheck, native Vite build, and final Tauri MSI/NSIS release build passed. A live control probe reports `ready` and redacted provider status; SoundCloud is correctly unavailable when credentials are absent.
- Remaining acceptance: configured SoundCloud live search/resolve/play and installed-build provider/vault save-clear-restart acceptance; the OS-backed vault decision is now implemented by `LB-MUSIC-012`.

### 2026-09-03 — `LB-COMMUNITY-003` — Codex

- Added guild-scoped Community cooldown overrides (`0..86400`, `null` for the global default) with atomic local persistence and backward-compatible version-one data.
- Added bounded leaderboard pagination in the store/control API with absolute ranks and `hasMore`; extended `/leaderboard [page]` and `/community-config cooldown seconds`.
- Added native Community controls for saving/resetting cooldown and navigating leaderboard pages; all values come from the real control API.
- Evidence: `npm test` 51/51, root typecheck, and native typecheck passed. Native Tauri release build and live Discord round-trip remain release gates.
- Remaining acceptance: live command registration/round-trip in guild `1541307192534241318` and installed-build verification.

### 2026-09-03 — `LB-COMMUNITY-004` — Codex

- Added a guild-scoped Community progress reset that requires `{ confirm: true }`, preserves cooldown and ignore settings, returns a removed-member count, and records a redacted audit event.
- Added the `/community-config reset confirm:true` contract and command-definition tests; member detail reads remain non-mutating.
- Added native Community member inspection plus a confirmation-gated `Reset XP` action wired to the real control API.
- Evidence: `npm test` 54/54, root typecheck, and native typecheck passed. Native release rebuild, installed-build verification, and live Discord round-trip remain release gates.
- Remaining acceptance: live manager permission/command round-trip in guild `1541307192534241318`, reset behavior on a disposable fixture, and restore/undo remains out of scope.

### 2026-09-03 — `LB-LOG-002` — Codex

- Added optional `LOCALBOT_AUDIT_RETENTION_DAYS` (`1..3650`) with the existing hard 2,000-entry cap; time pruning happens on store load/write and unset remains backward-compatible.
- Added write-time redaction/truncation for credential-like key/value material and a secret-free `GET /api/v1/audit-log/settings` metadata route.
- Evidence at slice completion: `npm test` 56/56, root typecheck, and native typecheck passed. A later native release rebuild passed on 2026-09-03; current MSI/NSIS checksums are recorded in `docs/AUDIT_STATUS.md`.
- Remaining acceptance: richer audit permissions/moderation ingestion and installed-build verification.

### 2026-09-03 — `LB-ONBOARD-001` — Codex

- Added a version-one, per-guild Welcome/Goodbye store with bounded text, HTTPS-only image URLs, documented token rendering, mention suppression, and atomic local persistence.
- Added validated control routes for settings, non-sending preview, and explicit test-send; Discord member events are included only when `LOCALBOT_GUILD_MEMBERS_INTENT=true`.
- Added native Community controls for Welcome/Goodbye editing, preview, test-send, and honest Members Intent/offline status; the backup envelope now includes the credential-free greetings store.
- Evidence: `npm test` 61/61, root/native typecheck, and native Vite build pass. Live join/leave verification remains opt-in and installed-build acceptance remains pending.

### 2026-09-03 — `LB-ONBOARD-002` — Codex

- Added real guild text/announcement channel discovery with bot `SendMessages`/`EmbedLinks` permission state and a stable control route.
- Native Community now selects a real text channel for Welcome/Goodbye, disables channels the bot cannot send to, and preserves a saved ID if cache refresh is temporarily incomplete.
- Evidence: `npm test` 62/62 at slice completion; current full suite is 73/73. Root/native typecheck and native Vite build pass; live permission verification remains part of QA guild acceptance.

### 2026-09-03 — `LB-SAFETY-001` — Codex

- Added a disabled-by-default, per-guild AutoMod dry-run store and deterministic detector for spam, flood, configured blocked domains, and bounded scam patterns, with user/role exemptions and match cooldowns.
- Added `GET/POST /api/v1/guilds/:guildId/automod`; invalid writes preserve previous settings. Non-bot runtime messages can create only redacted `automod.dry_run_match` audit entries with `enforced:false`; no Discord moderation API is called.
- Added the AutoMod store to the credential-free backup envelope and documented the contract in `docs/SAFETY_SPEC.md` plus ADR-031.
- Evidence: `npm test` 67/67 at slice completion; the current full suite is 73/73. Root typecheck/build, native typecheck, and native Vite build pass. Native Safety editor and kill switch are now implemented; explicit enforcement, anti-raid/anti-nuke, and live/installed acceptance remain intentionally pending.

### 2026-09-03 — `LB-SAFETY-002` — Codex

- Added the real selected-guild native AutoMod dry-run editor with server-confirmed loading/saving, bounded rule controls, proposed-action metadata, exemptions, blocked domains, offline/loading states, and a persisted `Tắt ngay` kill switch.
- Kept the safety boundary explicit: no enforcement control, message mutation, timeout/ban/kick, role/permission mutation, anti-raid, or anti-nuke behavior is exposed.
- Evidence: `npm test` 67/67 at slice completion; the current full suite is 73/73. Root typecheck/build, native typecheck, and native Vite build pass. Manual focus/reduced-motion and installed-build checks remain release gates.

### 2026-09-03 — `LB-MUSIC-011` — Codex

- Added native Windows output-device discovery through WebView `enumerateDevices` and sink routing through `setSinkId`, with the explicit system-default option, local opaque-ID persistence, device-change refresh, and safe fallback.
- Kept routing native-only: no device data enters Node, the control API, Discord, or the backup envelope; Windows routing failure cannot mutate the Discord sink.
- Evidence: native typecheck and Vite build pass. Manual device-loss, accessibility, and installed-build checks remain release gates; the next Tauri release rebuild must include this UI slice.

### 2026-09-03 — `LB-RUNTIME-006` — Codex

- Added an explicit-confirmation `POST /api/v1/data/restore` contract for the ten-store credential-free backup envelope.
- Added sensitive-key validation, pre-restore recovery copy, staged atomic installation, transaction rollback, stable failure responses, and an 8 MiB body limit.
- Added native Settings JSON import and a restart-to-apply action owned by the Tauri runtime; pending state clears only after the bridge reports Ready.
- Evidence: `npm test` 73/73, native typecheck, and native Vite build pass. Installed-build restore and failure injection on a real Windows artifact remain release gates; the shared migration runner is implemented and concrete store migrations remain schema-change scoped.

### 2026-09-03 — `LB-RUNTIME-008` — Codex

- Added Windows Job Object ownership with `KILL_ON_JOB_CLOSE`; failed attachment terminates the just-spawned child and returns a failed start.
- Verified the final release native binary reached `ready` with the real QA guild present, then force-terminated native without invoking `stop_bot`; the owned Node tree exited and port `2901` became free.
- Installed-build crash/restart and external-listener non-interference remain release checks.

### 2026-09-03 — `LB-RUNTIME-009` — Codex

- Hardened `native/src-tauri/src/lib.rs` so `stop_bot` retains the owned child until process-tree termination and wait succeed; a failure leaves the child managed and retryable instead of silently orphaning it.
- Evidence: `cargo check --manifest-path native/src-tauri/Cargo.toml` and `cargo test --manifest-path native/src-tauri/Cargo.toml` pass (2/2). Induced installed-build failure/retry observation remains a release check.

## Execution order

### C0 — SDD inventory and coordination

Status: In progress.

Tasks:

- Keep `docs/SDD.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/MUSIC_SPEC.md`, `docs/AUDIT_STATUS.md`, and this roadmap synchronized.
- Convert every new feature into a stable requirement ID, state matrix, contract, tests, owner, and acceptance evidence before implementation.
- Maintain a sanitized change/QA log and active file claims.
- Resolve conflicts between old UI/demo text and the approved v1/native-owned product behavior.

Gate: no unexplained spec conflict; every active slice has an owner and acceptance checks.

### C1 — Production native runtime and release foundation

Status: Build pipeline implemented; configured installed readiness/playback/recovery/restart/command gates are green on the current machine; clean-machine, autostart/reboot, and signing acceptance remain.

Tasks:

- Keep the packaged app independent from the workspace through a distributable bundled Node runtime with production dependencies.
- Preserve native-only ownership, graceful shutdown, restart, crash detection, readiness, and port cleanup.
- Verify Windows startup registration in an installed build: enable, disable, reboot/login launch, bot readiness, and clean uninstall.
- Add versioned local data directories, store-specific migrations, backup/export, corruption recovery, and a clear recovery message. The shared migration runner is implemented; each actual schema change still requires its own fixture and acceptance.
- Produce signed-or-explicitly-unsigned release documentation, MSI/NSIS artifacts, checksums, and a clean-machine installation checklist.

Current evidence: `scripts/prepare-native-runtime.mjs` creates the filtered runtime resource; Tauri resource mapping and Rust release launch are implemented; MSI and NSIS artifacts include `runtime/node.exe`, compiled `runtime/dist/index.js`, and production dependencies. `npm run native:verify`, the fail-closed `npm run native:smoke` installer gate, and configured installed gates `LB-QA-008` through `LB-QA-015` plus `LB-QA-017` are green on the current machine, including readiness, real YouTube playback, parallel local-audio isolation, bounded child recovery, controlled restart semantics, native slash registration, and forced-root orphan cleanup. Credential-gated `LB-QA-016` remains honest unavailable/configuration evidence until official SoundCloud credentials are supplied. Remaining acceptance: clean machine/first-run, upgrade compatibility, startup/reboot, device/vault/manual checks, and signing documentation.

Acceptance: installed app runs without the repository or Node/npm; app close stops only its owned runtime; startup setting is reversible; data survives upgrade; no secret is logged.

### C2 — Music completion and resilience

Status: Current implementation slice; configured installed YouTube/pipeline evidence is green, while SoundCloud/vault, device/manual, clean-machine, and budget observation gates remain.

Tasks:

- Finish the first-run path: start bot → Ready → choose guild → choose voice channel → choose Discord/Windows/both → search/play.
- Complete provider-neutral search/resolve/stream contracts for YouTube and optional official SoundCloud.
- Show real thumbnail, source tag, duration, title, author, URL, and explicit metadata fallback states in discovery, queue, now playing, history, and playlists.
- Implement robust queue CRUD/reorder/clear, previous/next, shuffle, repeat `off/all/one`, stop/pause/resume/seek policy, history, playlist CRUD and track management.
- Keep Discord and Windows sink lifecycle, buffering, errors, retries, and cancellation isolated. The local HTTP/FFmpeg stream now cancels its reader and owns all pipe errors so an aborted Windows request cannot crash the Discord runtime.
- Complete source-aware URL auto-detection, duplicate filtering with conservative evidence, provider health/configuration, rate limits, and typed user-safe errors.
- Finish Equalizer presets/manual bands; Discord seek is intentionally read-only under `LB-MUSIC-014` for the current non-seekable stream-pipe architecture. A future seekable/cache-aware redesign requires a new SDD gate.
- Maintain slash-command parity with native actions and allow repeatable command registration from the native app.
- Keep the approved interaction rule: transport icons have no idle animation; after click they use a small semantic transition only. Volume stays compact/icon-only until hover/focus.

Current evidence: real QA-guild YouTube search/play returned a thumbnail and played to Discord; configured installed `LB-QA-009` repeated the playback lifecycle, and `LB-QA-010` returned `audio/mpeg` data while Discord remained `playing` after local cancellation. Cleanup left health `ready`. Remaining acceptance: SoundCloud with configured official credentials, Windows device-loss/audible output acceptance, clean-machine playback, and live observation of provider budget behavior.

Acceptance: real search-to-play works in the native app; the QA guild can receive Discord output while Windows output is enabled/disabled independently; an intentional sink failure leaves the other sink healthy; refresh/reconnect converges state; no fake record appears.

### C3 — Native control plane and UX hardening

Status: Partially implemented; freshness/retry indicator slice added, manual native QA pending.

Tasks:

- Add visible freshness/last-updated/stale markers and retry actions for player, guild, voice, provider, and bot runtime surfaces. Guild/Voice/Player/provider indicators are now implemented in the native shell; bot runtime indicator still relies on its managed/online status and manual UI verification.
- Make guild + voice selection a direct modal with real-time updates, join/leave state, permissions, and clear failure recovery.
- Keep the global sticky footer below the navigation; do not let bot toggle or guild picker cover the floating navigation.
- Fix all responsive native-window breakpoints, spacing, icon box alignment, tag sizing, scrollbars, focus return, keyboard navigation, reduced motion, and no-flicker transitions.
- Use the approved monochrome token system, Be Vietnam Pro, Lucide with Iconify fallback, and motion only where the interaction contract calls for it.
- Ensure dashboard/discovery is a real music discovery surface with recent/trending/playlist data only when the backend supplies it; otherwise show honest empty states.

Acceptance: manual Tauri visual pass at 320, 375, 768, 1024, and 1440 logical pixels; keyboard-only pass; no clipped tooltip/popover; no layout jump on action; no icon distortion.

### C4 — Server administration and permission model

Status: Partially implemented.

Tasks:

- Provide real guild discovery, bot status, join/leave voice, channel selection, and slash-command registration/re-registration.
- Complete per-guild owner/admin/operator/member permission mapping, Music allow-list/all-members mode, role/user targeting, and refusal messages.
- Add least-privilege checks against Discord permissions and local operator permissions; never infer authorization from UI visibility.
- Add audit events for bot lifecycle, guild/channel actions, configuration changes, playback, permissions, and moderation.
- Add safe data export/import and backup/restore for local configuration. Export, transactional restore, and the shared multi-step migration runner are implemented; actual legacy store migrations remain schema-change scoped.

Acceptance: all allowed/denied paths are tested; guild isolation is proven; audit records are attributable and redacted; commands and native controls converge.

### C5 — Community and onboarding

Status: Partially implemented / planned.

Tasks:

- Complete per-guild XP, level, rank, leaderboard, cooldown, ignored channel/role, pagination, reset, and member detail behavior.
- Complete structured searchable logs with categories, retention, redaction, export, and clear permission boundaries.
- Add welcome/goodbye text + image templates with preview, test-send, enable/disable, fallback, and safe asset limits.

Acceptance: deterministic progression tests, restart persistence, preview-before-send, failure recovery, and live test fixture evidence.

### C6 — AutoMod, anti-raid, and anti-nuke

Status: Dry-run detector/editor, bounded message enforcement, anti-raid/anti-nuke telemetry, per-guild memory reset, and emergency safe-mode recovery implemented; review/appeal tooling and installed-build acceptance remain high risk/planned.

Tasks:

- Implement spam/flood/link/scam rules with thresholds, cooldowns, exemptions, actions, reasons, and audit events.
- Implement anti-raid detection and response with dry-run, quarantine/lockdown options, operator override, and emergency disable.
- Implement anti-nuke detection for destructive channel/role/permission changes with recovery guidance; never test by damaging the QA guild.
- Add adversarial tests, rate limits, least-privilege review, false-positive review, rollback, and kill switch.

Acceptance: dry-run evidence first; enforcement is explicit; missing Discord permissions fail safely; every action is attributable and reversible where possible.

### C7 — Optional Ollama/local intelligence

Status: Configuration/health and bounded read-only suggestions implemented by `LB-AI-001`/`LB-AI-002`; autonomous actions remain out of scope.

Tasks:

- Add explicit Ollama endpoint/model settings, health, timeout, privacy, and disable controls. Configuration/health, persistence, native Settings, backup/restore, and bounded read-only suggestions are implemented; autonomous actions remain out of scope.
- Allow third-party API configuration only through explicit user settings; never send secrets or private Discord data by default.
- Use AI only for bounded read-only help/intent suggestions first. Deterministic code remains authoritative for permissions, playback, moderation, and destructive actions.
- Add prompt-injection, offline, malformed-output, and data-redaction tests.

Acceptance: LocalBot is fully usable with Ollama absent; AI cannot ban/delete/change permissions or safety policy autonomously.

### C8 — Enterprise QA, release, and cleanup

Status: Blocked until C1–C7 gates pass; current deterministic/native gates are green, installed/manual/live acceptance remains.

Tasks:

- Run deterministic unit/contract tests, native typecheck/build, installer tests, live Discord/provider E2E in guild `1541307192534241318`, reconnect/crash/timeout tests, and parallel sink failure tests.
- Use the sanitized loopback-only `npm run qa:live` probe before any live mutation; it checks current route reachability without printing response bodies or secrets.
- Run security checks: secret scanning, dependency audit, loopback boundary, input validation, permission matrix, log redaction, path traversal, and local data protection.
- Run accessibility and visual QA in the actual Tauri window, including reduced motion and keyboard focus.
- Record known limitations honestly and produce release notes, operator guide, user guide, troubleshooting, backup/recovery, and test report.
- Only then execute `docs/CLEANUP_CHECKLIST.md`: remove generated caches/output and obsolete artifacts only after reference checks and backup. Never delete source, specs, QA evidence, user data, or approved DEMO/design references.

Final gate: all requirements are `Current`, all acceptance checks have evidence, clean installed build works, no fake/placeholder production state remains, and cleanup is reversible or backed up.

### 2026-09-03 — `LB-QA-001` — Sanitized live contract probe

- Added `scripts/live-readonly-qa.mjs` and `npm run qa:live` for loopback-only status checks across health, guild/channel, providers, Music, Community, onboarding, AutoMod, audit, and Ollama routes plus a non-mutating all-source media search.
- The probe rejects non-loopback targets, cancels response bodies without printing them, reports only method/path/status, and fails on network/timeout/HTTP `4xx`/`5xx`. It never mutates queue, playback, settings, Discord state, or local data.
- Evidence: `npm run qa:live` returned `status:"reachable"`; all current checks returned HTTP 200 through the currently listening loopback runtime. Native clean-install/ownership and configured provider/manual gates remain separate.

### 2026-09-03 — `LB-UI-001` — Semantic theme chrome and control geometry

- Replaced fixed dark-only title-bar/navigation/output literals with semantic chrome/theme tokens. Light now keeps the entire shell light, Default keeps its approved dark shell over light content, and Dark remains the first-install default.
- Preserved the approved icon-slot geometry, centered transport cluster, volume popover contract, grayscale slider tokens, sticky footer, and reduced-motion behavior.
- Corrected the Equalizer reset action to use Lucide `RotateCcw` instead of the unrelated `Activity` icon; no layout, token, or playback behavior changed.
- Remaining acceptance: native visual/accessibility checks at the documented logical widths and all three themes after the current release rebuild.

### 2026-09-03 — LB-AI-001 — Optional Ollama configuration and health

Agent: Codex. Phase: C7 (Optional Ollama/local intelligence).

Files changed: `src/config.ts`, `src/ollama.ts`, `src/ollama.test.ts`, `src/index.ts`, `src/control-server.ts`, `src/control-server.test.ts`, `src/backup.ts`, `src/backup.test.ts`, `src/restore.ts`, `src/restore.test.ts`, `native/src/App.tsx`, `native/src/App.css`, `docs/OLLAMA_SPEC.md`, `docs/ENVIRONMENT.md`, `docs/ARCHITECTURE.md`, `docs/RECOVERY_SPEC.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/AUDIT_STATUS.md`, `README.md`, `CLAUDE.md`.

Behavior: Ollama is disabled by default and can be configured from native Settings with a bounded HTTP(S) endpoint, model, and timeout. The loopback API returns only `disabled`, `not_configured`, `ready`, `model_unavailable`, or `offline` health state. Settings are included in the ten-store credential-free backup/restore; no API key, prompt, private Discord data, or raw provider response is accepted or emitted.

Checks: `npm test` 81/81, root typecheck, and native typecheck pass. Final native release rebuild and installed/manual acceptance remain the release gate; `LB-AI-002` is recorded below.

### 2026-09-03 — LB-SAFETY-004 — Anti-raid and anti-nuke dry-run telemetry

Agent: Codex. Phase: C6 (AutoMod, anti-raid, and anti-nuke).

Behavior: AutoMod now normalizes legacy settings with disabled `antiRaid` and `antiNuke` rules, counts opt-in member joins and channel/role deletion signals in bounded in-memory windows, and records only redacted `enforced:false` matches. Native exposes both threshold rules. No Discord mutation, lockdown, audit-log fetch, or destructive QA was added.

Checks: `npm test` 83/83, root typecheck, and native typecheck pass. Native Vite/release build, live event observation, and manual UI acceptance remain release gates; enforcement requires a separate threat-model and isolated fixture.

### 2026-09-03 — LB-SAFETY-003 — Bounded AutoMod message enforcement

Agent: Codex. Phase: C6 (AutoMod, anti-raid, and anti-nuke).

Behavior: AutoMod now accepts explicit `dry-run`/`enforce` mode while defaulting to dry-run. Native confirmation gates enforce-mode saves. Runtime executes at most one permission-checked action per matched message: delete when Discord reports the message deletable or a fixed 60-second timeout when the member is moderatable. A rolling limiter caps mutations at 20 per guild per minute; all outcomes are redacted/audited. Anti-raid, anti-nuke, quarantine, ban, kick, bulk deletion, permissions, and lockdown remain non-mutating.

Checks: `npm test` 98/98, root typecheck, and native typecheck pass. Destructive behavior is covered by synthetic fixtures only; live QA, installed-build confirmation, recovery, and appeal tooling remain release gates.

### 2026-09-03 — LB-AI-002 — Bounded read-only Ollama suggestions

Agent: Codex. Phase: C7 (Optional Ollama/local intelligence).

Behavior: added `POST /api/v1/ollama/suggest` and an explicit native Settings suggestion-only surface for help/music/community questions. Query, prompt, private Discord data, and raw provider response never cross back to the client or audit log; output, timeout, generation budget, and provider state are bounded. AI output cannot execute LocalBot actions.

Checks: `npm test` 86/86, root typecheck, native typecheck, and native Vite build pass. Release rebuild and installed/manual acceptance remain pending; autonomous AI actions are not enabled.

### 2026-09-03 — `LB-LOG-003` — Native audit retention policy editing

- Implemented the server-confirmed native Community editor for audit retention. The policy accepts `null` or `1..3650` days, keeps the hard 2,000-entry cap, persists version-one metadata, and atomically prunes expired entries without exposing arbitrary deletion.
- Added deterministic/control coverage for legacy compatibility, invalid non-mutation, persisted updates, null reset, and route response shape. The update route awaits its audit write so native success corresponds to a durable write.
- Evidence: `npm test` 89/89, root/native typecheck pass. Native release rebuild, installed-build/manual acceptance, richer audit permissions, moderation ingestion, and export controls remain pending.

### 2026-09-03 — `LB-MUSIC-012` — Native SoundCloud credential vault

- Added a Windows-only Tauri boundary backed by Windows Credential Manager for bounded SoundCloud Client ID/secret save, status, and clear operations.
- Native-owned runtime startup reads the vault and injects values only into its Node child environment; `.env` remains the fallback. The loopback API, UI status, backups, logs, and screenshots never receive or return credential values.
- Added transient native Settings inputs, stored/not-stored state, explicit clear, restart guidance, responsive layout, and provider enable/test controls in the credential-aware card.
- Added `docs/SOUNDCLOUD_CREDENTIALS_SPEC.md` and ADR-039; synchronized Music, architecture, environment, README, remaining gaps, and agent guidance.
- Evidence: Rust validation/unit tests, `cargo check`, native TypeScript typecheck pass. Installed-build save/clear/restart and configured SoundCloud live search/resolve/play remain release gates.

### 2026-09-03 — `LB-LOG-004` — Scoped audit export

- Added `GET /api/v1/audit-log/export` with required guild scope, bounded 100-entry output, current action/search filters, JSON/CSV attachments, CSV formula-prefix protection, and reuse of the redacted audit store.
- Native Community now offers JSON and CSV export actions and disables them while offline, without a selected guild, or during another export.
- Evidence: `npm test` 90/90, root typecheck, native typecheck pass. Installed-build download/opening and richer permission boundaries remain release checks.

### 2026-09-03 — `LB-LOG-005` — Passive Discord moderation telemetry

- Added a pure bounded formatter and existing Discord event listeners for message delete, bulk delete, channel delete, and role delete. Entries contain only guild/channel/target/count metadata; no content, usernames, actor guesses, or raw Discord audit payloads.
- Telemetry write failures are isolated from event processing and the rest of the bot. No privileged intent or destructive moderation action was added.
- Evidence: `npm test` 92/92, root typecheck/build, and native release build pass; live QA remains observation-only.

### 2026-09-03 — `LB-LOG-006` — On-demand Discord audit-log view

- Added a guild-scoped `GET /api/v1/guilds/:guildId/audit-log/discord?limit=...` read path guarded by the bot's `ViewAuditLog` permission.
- The route returns newest-first minimal in-memory metadata only; Discord `reason`, `changes`, `extra`, raw payloads, and remote data are not persisted, exported, or mixed into LocalBot's local audit store.
- Native Community now separates Local and Discord sources and renders permission, loading, empty, offline, and retryable failure states.
- Evidence: `npm test` 102/102, root/native typechecks pass; the authorized read-only loopback probe returned HTTP 200 with the documented seven-key DTO in guild `1541307192534241318`; installed-build acceptance remains a release gate.

### 2026-09-03 — `LB-RUNTIME-013` — Reproducible NSIS installer smoke gate

- Added `scripts/smoke-native-installer.mjs` and `npm run native:smoke`. The gate selects the installer matching `package.json`, installs only into a system-temp directory, verifies the installed native executable plus bundled Node/compiled runtime/manifest, refuses to run when the real app-local `.env` exists, strips credential/configuration and inherited smoke-marker variables from the smoke environment, redirects `LOCALAPPDATA`/`APPDATA`/`TEMP`/`TMP` and `WEBVIEW2_USER_DATA_FOLDER` to child-scoped temporary paths, passes a Rust-validated temp-scoped Tauri data marker, starts the installed native window briefly, stops its exact process tree, invokes the generated uninstaller, and removes the temporary install plus isolated app/browser data. The smoke gate itself now performs the before/after SHA-256 audit and reports `realAppDataChanged:false`, failing closed on any real-profile change.
- This gate is intentionally not a clean-machine or configured-bot test; it cannot prove Discord readiness, SoundCloud playback, autostart/reboot, restore, accessibility, or visual quality, and it never adopts or kills an external port owner.
- Evidence: `npm run native:smoke` passed with `realAppDataChanged:false` after the version lookup, fail-closed environment hardening, and built-in real-profile audit; `npm test` 104/104, root/native typechecks, Rust check/test (4/4), and `npm run native:verify` remain green.
- Follow-up evidence: the isolated smoke now redirects `LOCALAPPDATA`/`APPDATA`/`TEMP`/`TMP` to child-scoped paths; a sanitized live contract probe also returned HTTP 200 for 17 read-only Music/community/admin/safety/settings endpoints in the authorized QA guild.

### 2026-09-03 — `LB-MUSIC-013` — Provider metadata request budget

- Added an in-memory rolling limiter of 30 search/direct-resolve requests per provider per 60 seconds. YouTube and SoundCloud budgets are independent; all-source search can keep an available provider's results when the other provider is locally limited.
- Excess metadata requests return retryable `MEDIA_RATE_LIMITED` with the existing HTTP 429 mapping. Download/stream sessions are deliberately outside the budget so dual Discord/Windows playback remains independent.
- Evidence: fake-clock limiter tests pass, the full suite is now 104/104, root build/typecheck remains green; configured-provider and installed-build live acceptance remain separate gates.

### 2026-09-03 — `LB-SAFETY-005` — Per-guild AutoMod memory recovery

- Disabled AutoMod evaluations now clear only the target guild's volatile message/security histories and cooldown markers. Re-enabling cannot inherit events from the disabled interval, while other guilds, persisted settings, and audit history remain untouched.
- Evidence: targeted AutoMod tests pass, the full suite is 105/105, and the change introduces no Discord mutation or live-QA side effect.

### 2026-09-03 — `LB-SAFETY-006` — Emergency AutoMod safe-mode recovery

- Added a confirmed guild-scoped recovery route that atomically forces `enabled:false` and `mode:"dry-run"`, invokes the native-owned engine reset immediately, and preserves rules, exemptions, persisted audit history, and other guilds.
- Native Community/Safety now exposes “Khôi phục an toàn” only when needed, requires an explicit confirmation, and updates its draft only after the authoritative control response succeeds.
- Evidence: targeted AutoMod/control tests `27/27`, full `npm test` `105/105`, root/native typechecks and build, `npm audit` 0 vulnerabilities, Rust check/test `4/4`, Tauri release build, `npm run native:verify` (`4,583` files / `202,727,254` bytes), and `npm run native:smoke` (`realAppDataChanged:false`) all pass. No Discord mutation or destructive QA was required.

### 2026-09-03 — `LB-SAFETY-007` — Bounded AutoMod review queue

- Added `automod-review.json` as a shared-persistence version-one store capped at 1,000 redacted per-match records. It stores only guild/channel/user IDs, rule/reason, proposed action, observed outcome, enforcement flag, timestamp, status, and an optional bounded operator note; it never stores message content or raw Discord/provider data.
- Added guild-scoped `GET /api/v1/guilds/:guildId/automod/review` and `POST /api/v1/guilds/:guildId/automod/review/:reviewId`. Same-direction decisions are idempotent; opposite decisions return `409 REVIEW_ALREADY_DECIDED`; decisions never mutate Discord.
- Native Community now renders real loading/offline/error/empty review states, filters status, and exposes server-confirmed confirm/dismiss actions with local motion. Backup/restore now includes the review store.
- Evidence: review store/control tests, backup/restore tests, full `npm test` `110/110`, root build/typecheck, native typecheck, native Tauri release build, `npm run native:verify`, and `npm run audit:static` pass. Installed/manual review acceptance remains a release gate; public appeals, content recovery, automatic reversal/punishment, anti-raid/nuke enforcement, and AI decisions remain out of scope.

### 2026-09-03 — `LB-SAFETY-008` — Explicit Message Content Intent capability

- Added an independently gated Discord intent builder and `LOCALBOT_MESSAGE_CONTENT_INTENT` contract. Message Content Intent is requested only after explicit operator opt-in; disabled or empty message content is a safe no-op for content-based AutoMod.
- Added capability metadata to the guild AutoMod control response and native warning text that names both the Discord Developer Portal switch and the environment flag. Members Intent and anti-raid/nuke event telemetry remain separate.
- Evidence target: intent/content tests, full root/native checks, static/docs audits, release artifact verification, and non-destructive live QA. Portal configuration and configured-content installed-build acceptance remain open.

### 2026-09-03 — `LB-QA-002` — Sanitized live probe rerun and documentation truth audit

Agent: Codex. Phase: A8 (QA/release integration).

Behavior: reran the loopback-only live contract probe for guild `1541307192534241318`; health, guild/channel, provider, Music, Community, onboarding, AutoMod, audit, Ollama, and all-source media-search checks remained reachable. A source audit found no hard-coded demo track/guild result arrays or fake provider payloads; placeholders are input hints and the legacy `demo-guild` value is migration cleanup only. Documentation now distinguishes release-bundle starter-asset removal from the still-held source candidate.

Checks: `npm run qa:live` passed with all configured checks HTTP 200 and sanitized output. Native-owned playback, configured SoundCloud, autostart/reboot, clean-machine, and manual Tauri accessibility/visual gates remain open.

### 2026-09-03 — `LB-QA-003` — Static production-data regression gate

Agent: Codex. Phase: A8 (QA/release integration).

Behavior: added `npm run audit:static` to scan only production source roots for common
fake/mock/sample record labels, demo status text, and the retired demo track. The gate
prints locations/rule IDs only; placeholders, tests, generated resources, local data, and
the documented `demo-guild` migration compatibility path are excluded intentionally.

Checks: `npm run audit:static` passes for `src/`, `native/src/`, and `native/src-tauri/src/`; the slash-command completeness regression also passes and the current full suite is `106/106`.
Future slices must keep these gates green whenever they add or replace unavailable states.

### 2026-09-03 — `LB-QA-004` — Documentation contract regression gate

Agent: Codex. Phase: A8 (QA/release integration).

Behavior: added `npm run audit:docs` to verify the 14 routed SDD/spec/roadmap/README files for
the native-owned `2901` boundary, Dark first-launch default, Windows autostart guidance,
authorized QA guild, and accepted `LB-MUSIC-014` Discord seek policy. The check is marker-only,
does not read `.env` or generated/user data, and rejects stale unresolved seek language.

Checks: `npm run audit:docs` passes; README, release runbook, and both autopilot prompts list
the gate. This is documentation-drift evidence only and does not replace installed, live,
visual, accessibility, or signing acceptance.

### 2026-09-03 — `LB-MUSIC-015` — SoundCloud creator attribution metadata

Agent: Codex. Phase: A2 (provider normalization).

Behavior: the official SoundCloud adapter now prefers the creator-facing `metadata_artist`
field and falls back to the uploader profile name before mapping into the existing
provider-neutral `channel` DTO. Provider URL/source identity and the no-raw-payload boundary
are unchanged.

Checks: two deterministic SoundCloud mapping tests pass; root typecheck/build, full test suite
(`112/112`), static/docs audits, native release rebuild, artifact verification, and installer
smoke pass. Configured SoundCloud live playback and attribution acceptance remain release gates.

### 2026-09-03 — `LB-MUSIC-016` — SoundCloud current URN + HLS AAC contract

Agent: Codex. Phase: A2 (provider/runtime hardening). Implementation is the current slice.

The official SoundCloud contract is recorded before implementation: require string `urn`, reject
numeric-only track records, call
`/tracks/{track_urn}/streams`, prefer `hls_aac_160_url`, and fall back to `hls_aac_96_url`.
Progressive MP3 and the removed singular `/stream` endpoint are not release fallbacks. The
provider-neutral audio boundary will support both YouTube byte streams and SoundCloud HTTPS
media URLs so each FFmpeg sink can own its lifecycle.

Evidence: prior release gate `npm test` 116/116, root typecheck/build, static/docs audits, native typecheck,
native release rebuild, `native:verify`, `native:smoke`, Rust tests, and npm audits pass. The
current staging runtime has 4,585 files / 202,741,793 bytes; the latest unsigned MSI/NSIS hashes are
recorded in `docs/AUDIT_STATUS.md`. Configured live SoundCloud HLS playback remains a release
gate.

### 2026-09-03 — `LB-QA-005` — Live guild slash-command registration

Agent: Codex. Phase: A8 (QA/release integration).

Evidence: ran `npm run register` with the configured guild scope; Discord accepted and replaced
the command set with 25 guild commands for the authorized QA guild `1541307192534241318`.
The operation is idempotent and emitted only count/scope metadata. A live interaction round-trip
for every command, plus installed-build command parity and observation of `LB-LOG-007` audit rows,
remains a separate acceptance check. The registration was rerun successfully on 2026-09-04.

### 2026-09-04 — `LB-QA-007` — Native-owned YouTube Music smoke

Agent: Codex integration/release owner. Phase: A8 (QA/release integration).

Evidence: after the native-owned dev runtime reached `ready`, the authorized QA guild returned a
real voice channel with Connect/Speak available. The live query `blood moon stupid` returned 10
normalized YouTube results and the selected track had an HTTPS thumbnail. `player/play` enqueued
and started the real track; player reads showed `status:playing`, then pause/resume returned
`paused` and `playing` with advancing state versions and playback telemetry. The session was
stopped and left; a follow-up read showed no active player and `botJoined:false`, and closing the
native window freed port `2901` and stopped the owned runtime tree.

This is controlled dev-mode evidence only. Installed-build playback, configured SoundCloud/vault,
Windows sink isolation, autostart/reboot, visual/accessibility, and signing remain open gates.

### 2026-09-04 — `LB-QA-008` — Configured installed-native readiness

Agent: Codex integration/release owner. Phase: A8 (QA/release integration).

Behavior: added the opt-in `npm run native:smoke:configured` gate. It installs the version-matched
NSIS artifact into a system-temp directory, links the existing workspace `.env` into a temporary
app-local Tauri profile without copying or printing credentials, starts the packaged native
runtime, waits for sanitized control health `ready`, then stops the exact native-owned process
tree, uninstalls, and removes temporary data. It never adopts an external listener or performs
guild mutation/playback.

Evidence: 2026-09-04 reported `configuredRuntimeReady:true`, `nativeProcessTreeStopped:true`,
`isolatedAppData:true`, `realAppDataChanged:false`, and `temporaryInstallRemoved:true`. This closes
configured readiness on the current machine profile only; clean-machine, installed playback,
SoundCloud/vault, Windows sink, autostart/reboot, restore/upgrade, accessibility, and signing
remain release gates.

### 2026-09-04 — `LB-QA-009` — Configured installed YouTube playback smoke

Agent: Codex integration/release owner. Phase: A8 (QA/release integration). Status: implemented; evidence green on the current configured machine profile.

Add the opt-in `npm run native:smoke:music` harness on top of `LB-QA-008`. It must discover a
real Connect/Speak-capable voice channel in the authorized QA guild, refuse to run when a voice
session is already active, search a real YouTube query with an HTTPS thumbnail, exercise
play/pause/resume/stop/leave through the installed control bridge, and verify sanitized final
disconnect state. It must never print provider payloads, URLs, credentials, or member data, and
must clean up the voice session before terminating the exact native-owned tree.

Evidence: after the `LB-MUSIC-018` dispatcher fix, `npm run native:smoke:music` passed with
packaged health ready, real YouTube thumbnail validation, play/pause/resume/stop/leave state
checks, exact process-tree shutdown, temporary-install removal, and `realAppDataChanged:false`.
Installed SoundCloud, Windows sink isolation, autostart/reboot, clean-machine, restore,
accessibility, and signing remain separate gates.

### 2026-09-04 — `LB-QA-010` — Installed parallel Discord/local-audio pipeline smoke

Agent: Codex integration/release owner. Phase: A2/A8. Status: next slice.

The configured installed Music smoke now opens the guild-scoped `local-audio` pipeline while
Discord is `playing`, requires an `audio/mpeg` response with a non-empty chunk, cancels only the
local request, and verifies the same Discord player remains `playing`. Evidence is green on
2026-09-04 with isolated cleanup and no real-profile changes. This does not prove Tauri WebView
device routing or audible dual output; those remain manual.

### 2026-09-04 — `LB-QA-011` — Installed backup/restore contract smoke

Agent: Codex integration/release owner. Phase: A1/A8. Status: implemented; current configured installed evidence is green.

The opt-in configured installed smoke exports the credential-free `localbot-backup`, restores it with
explicit confirmation, validates all known stores and `restartRequired:true`, and removes the isolated
profile. Evidence is green on 2026-09-04 with no real-profile change. Do not print backup contents or
credentials. This is separate from Settings file-picker UX, failure injection, migrations, and upgrade
persistence.

### 2026-09-04 — `LB-QA-012` — Installed restart no-auto-join/no-auto-play smoke

Agent: Codex integration/release owner. Phase: A1/A8. Status: implemented; current configured installed evidence is green.

The opt-in `npm run native:smoke:restart` gate refuses an active QA voice/player session, stops the
exact native-owned installed process tree, starts the same isolated profile again, waits for sanitized
health `ready`, and verifies that the authorized QA guild has neither an automatic voice join nor an
automatic player/playback state. The 2026-09-04 run passed and removed the temporary install/profile
with `realAppDataChanged:false`. Crash recovery, migrations, upgrade compatibility, autostart/reboot,
and manual native UI remain separate gates.

### 2026-09-04 — `LB-QA-013` — Installed native slash-command registration parity

Agent: Codex integration/release owner. Phase: A4/A8. Status: implemented; current configured installed evidence is green.

The opt-in `npm run native:smoke:commands` gate calls the same native-owned registration route used by
the native UI, scopes it to QA guild `1541307192534241318`, and confirms the current 26-command
contract without exposing payloads or credentials. The 2026-09-04 run passed with exact process-tree
shutdown, temporary cleanup, and `realAppDataChanged:false`. Manual interaction coverage remains a
separate non-destructive gate.

### 2026-09-04 — `LB-MUSIC-018` — Player action dispatch correctness

Agent: Codex integration/release owner. Phase: A2/A8.

The first `LB-QA-009` attempt exposed a backend fall-through: supported actions whose operation
succeeded could still reach `INVALID_ACTION`. The dispatcher now uses explicit success branches
for pause, resume, skip, previous, stop, volume, shuffle, and repeat while retaining typed state
errors and idempotent stop cleanup. The packaged runtime was rebuilt and `LB-QA-009` is green.

### 2026-09-07 — `LB-MUSIC-019` — Direct Guild / Voice Readiness Flow

Agent: Codex integration/release owner. Phase: Music context and control-plane correctness.

Implemented a direct native Music guild/channel context flow and the structured readiness route
`GET /api/v1/guilds/:guildId/channels/:channelId/music-readiness`. The backend evaluates effective
channel permissions (`ViewChannel`, `Connect`, `Speak`) rather than trusting guild summaries,
preserves `unknown`, reports unsupported Stage channels, and blocks operation-time play/join before
provider resolution when readiness is not ready. Native resets stale context on guild changes,
discards stale readiness responses, never auto-joins from selection, and keeps Windows output
independent.

Evidence: root/native typechecks pass; deterministic voice/control tests cover ready, overwrite,
unknown, Stage, invalid/foreign/missing channel, structured error, and no-provider-resolve paths.
The live readonly probe now shape-checks one discovered normal voice channel when available.
Installed visual/accessibility and authorized live channel acceptance remain separate gates.

### 2026-09-07 — `LB-OPS-001` — Operator Readiness & Diagnostics

Agent: Codex integration/release owner. Phase: Operations product slice.

Implemented an additive `GET /api/v1/diagnostics` route and shared classifier in
`src/runtime-diagnostics.ts`. The route reports only bounded profile, loopback boundary, ownership
presence, Discord readiness/guild count, provider state, and privileged-intent state. Native Settings
renders live ready/starting/degraded/offline states with retry; optional providers/intents remain
informational and the ephemeral ownership marker is reduced to a boolean.

Evidence: runtime diagnostics unit tests, exact control DTO test, root/native typechecks and native
build. No new dependency, persistence, port, or deployment topology was introduced.

## Codex operating loop

For each iteration: inspect → claim → specify/ADR → implement one slice → test → run safe live QA when relevant → update docs/evidence → release claim → select the next unblocked slice. Continue automatically through the roadmap. If an external authority or user decision is genuinely required, mark only that slice blocked and continue independent work; never fabricate a pass.
## VPS slash-only readiness addendum (2026-09-06)

These items extend the existing native-owned roadmap without creating a second bot codebase.

### LB-RUNTIME-017 — Shared runtime profiles

- Keep `native`, `headless`, and `slash-only` in one source core.
- Native remains Tauri-owned and injects the canonical loopback contract.
- Slash-only must not load the control server, bind 2901, load native UI, or auto-sync commands.
- Verify with `npm run qa:headless`; never claim target-host Linux QA from this check.

### LB-COMMANDS-003 — Safe operator commands

- Maintain `/bot status`, `/bot providers`, and manager-only guild `/bot sync`.
- Do not add arbitrary shell, restart, systemd, or remote administration commands.
- Keep the command registry and installed smoke count synchronized at 26 until a reviewed change.

### LB-RUNTIME-018 — Graceful lifecycle

- On SIGINT/SIGTERM stop all players, close the optional loopback bridge, and destroy Discord once.
- Keep `deploy/systemd/localbot.service.example` as a non-root reference only.
- Mark real VPS/systemd/FFmpeg/network/provider checks Blocked until a target host exists.

Codex may implement source/docs/tests in this workspace, but must not deploy to a VPS, read `.env`,
or invent Linux evidence. Run the deterministic and documentation gates before any cleanup.
