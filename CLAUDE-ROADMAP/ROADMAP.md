# LocalBot Enterprise Roadmap — Claude Code

Status: Active implementation roadmap for a Claude Code session with no prior context.

Read `CLAUDE-ROADMAP/AUTOPILOT_PROMPT.md` first. This roadmap is subordinate to `docs/SDD.md` and must stay synchronized with `docs/ROADMAP.md`.

## Mission

Implement and verify LocalBot as an enterprise-grade, local-first Windows native Discord bot. The native Tauri app is the root process and sole owner of the bot runtime. Music is the first product path, followed by server administration, Community, safety, and optional local intelligence.

## Division of responsibility

Claude is the implementation partner. Work primarily on the package currently claimed here: provider-neutral Music, Discord commands, persistence-backed feature slices, Community, onboarding, safety, optional Ollama, and targeted native UI/data-flow corrections. Each package must include its SDD contract, deterministic tests, documentation, and a sanitized handoff.

Codex is the integration/release owner. Codex owns native runtime topology, Tauri packaging/installer, Windows ownership and autostart, cross-phase contract reconciliation, live QA in guild `1541307192534241318`, final release evidence, and cleanup. Do not claim or rewrite those areas while Codex has an active claim. If a feature requires a runtime or architecture change, stop at the boundary, update the spec/ADR, and hand off the integration requirement instead of inventing a parallel implementation.

When both agents are active, check `docs/AGENT_COORDINATION.md` and both roadmap claim sections before editing. Never use a passing local test to override a missing installed-build, provider, live-guild, or manual native acceptance gate.

## Required context before touching code

Read in this order:

1. `CLAUDE.md`
2. `docs/SDD.md`
3. `docs/PROJECT_BRIEF.md`
4. `docs/ROADMAP.md`
5. `docs/ARCHITECTURE.md`
6. `docs/MUSIC_SPEC.md`
7. `docs/UI_UX_V1.md`
8. `docs/AUDIT_STATUS.md`
9. `docs/AGENT_COORDINATION.md`
10. `CODEX-ROADMAP/ROADMAP.md`

Inspect only the routed source files after the relevant spec is understood. Do not scan the entire repository repeatedly.

## Product facts that must remain true

- Native app owns the runtime; closing it stops the owned bot. Never adopt or terminate an externally started bot.
- Control service is loopback-only at `127.0.0.1:2901`.
- Preserve `LB-SECURITY-001`: runtime control binding is canonical `127.0.0.1:2901`; invalid host/port configuration fails closed and port `0` is test-only. Remote exposure needs a new authenticated SDD/ADR design.
- Dark is first-install default. v1 has distinct Default split-tone, Dark, and Light themes.
- Music scope is YouTube plus optional SoundCloud through supported/official access. SoundCloud can be explicitly enabled/disabled, connection-tested, and configured through the native Windows Credential Manager boundary in `docs/SOUNDCLOUD_CREDENTIALS_SPEC.md`; `.env` remains fallback. Do not add Spotify without an approved requirement.
- Discord and Windows audio outputs are independent parallel sinks.
- No fake data, placeholder success, invented thumbnails, static progress, or false provider readiness in production code.
- Never print `.env` values, tokens, cookies, OAuth credentials, raw provider payloads, or private member data.

## QA target and safety

Use real guild `1541307192534241318` for controlled integration QA. Discover its real channels at runtime and use a dedicated test fixture/channel where possible. Administrator access does not permit spam, mass deletion, unsolicited announcements, destructive moderation, or damaging anti-nuke tests. Follow `docs/AGENT_COORDINATION.md`.

## Claude work packages

### A0 — Baseline and claim

Do first:

- Verify current scripts, native dev workflow, tests, and documented implementation without exposing secrets.
- Compare source behavior with `docs/AUDIT_STATUS.md`; identify stale claims.
- Claim one narrow package in the roadmap before editing.
- Add/update stable SDD requirement IDs, contract, state matrix, acceptance checks, and ADR when needed.

Exit: baseline report and a claimed, phase-sized slice; no code change based only on assumptions.

### A1 — Production runtime and persistence

- Build a production-capable native-owned runtime/sidecar so the installed app does not depend on the repository or `npm run dev`; current configured installed readiness/playback/recovery/restart/command gates are recorded by Codex through `LB-QA-008`–`LB-QA-013`.
- Preserve readiness, ownership marker, crash/restart, graceful shutdown, port cleanup, and startup registration.
- Add versioned local stores, schema-specific migrations through the shared runner, backup/export, corruption recovery, and restart semantics.
- Verify installed-build autostart enable/disable and clean uninstall.

### A2 — Music completion

- Finish provider-neutral YouTube/SoundCloud search, URL resolve, metadata, thumbnail, duration, source tag, stream, typed error, and health contracts; the configured installed YouTube/pipeline gates are green, while SoundCloud credential/live and device-specific acceptance remain open. Preserve the explicit SoundCloud availability toggle/test boundary and native credential vault boundary.
- Finish native + slash parity for search/play/enqueue/queue/current/skip/pause/resume/stop/previous/shuffle/repeat/playlist/permissions/registration.
- Finish queue reorder/remove/clear, history, playlist CRUD/detail/track management, deduplication, provider filters, and missing-metadata states.
- Keep Discord and Windows output sinks isolated so a local audio failure never stops Discord playback.
- Finish Equalizer behavior; Discord seek is intentionally read-only under `LB-MUSIC-014` for the current non-seekable stream-pipe architecture. A future seekable/cache-aware redesign requires a new SDD gate.
- Use real QA-guild playback and real provider responses; never use sample data to make the UI look complete.

### A3 — Native UX/control-plane hardening

- Reconcile guild/voice/player/provider state through SSE plus recovery polling, with stale/last-updated indicators and retries.
- Keep guild/voice selection in a direct modal and runtime controls in the sticky footer below navigation.
- Fix spacing, icon slot geometry, provider tags, monochrome slider tokens, custom scrollbar, popover clipping, no-flicker action transitions, keyboard focus, reduced motion, and Tauri breakpoints.
- Preserve the approved interaction rule: transport and volume icons do not idle-animate; after click they use a small semantic transition only.

### A4 — Server administration and permissions

- Complete guild/channel discovery, join/leave, bot run toggle, slash registration/re-registration, per-guild settings, user/role allow-list, all-members mode, and least-privilege checks.
- Add attributable, redacted audit events for all admin, bot, guild, playback, permission, and moderation actions.

### A5 — Community and onboarding

- Finish XP/level/rank/leaderboard configuration, cooldowns, ignored channels/roles, pagination, reset, persistence, and member detail.
- Finish searchable logs with retention/redaction controls.
- Add welcome/goodbye templates with text/image preview, test-send, enable/disable, bounded assets, and safe failure states.

### A6 — Safety

- Implement AutoMod spam/flood/link/scam in dry-run first, then explicit bounded enforcement. `LB-SAFETY-003` is implemented with native confirmation, permission checks, one message mutation, and a 20-per-guild/minute limiter; isolated installed-build acceptance remains.
- Add anti-raid and anti-nuke with thresholds, exemptions, audit, operator override, emergency disable, and recovery. Dry-run telemetry is current through `LB-SAFETY-004`; bounded message enforcement is current through `LB-SAFETY-003`; per-guild reset and emergency safe-mode recovery are current through `LB-SAFETY-005`/`LB-SAFETY-006`, while anti-raid/nuke enforcement, broader recovery, and appeals remain planned and high risk.
- Test on synthetic fixtures or isolated resources; never damage the QA guild to test destructive behavior.

### A7 — Optional Ollama

- Add explicit local endpoint/model settings, connection test, timeout/privacy, and disable state. Configuration/health and bounded read-only suggestions are current through `LB-AI-001`/`LB-AI-002`; autonomous actions remain out of scope.
- Keep AI untrusted and non-authoritative. Add deterministic permission, malformed-output, offline, prompt-injection, and redaction tests.

### A8 — QA, release, documentation, cleanup

- Run unit/contract/integration/E2E tests, native typecheck/build, the reproducible `npm run native:smoke` installer gate (including Rust-validated temp-scoped Tauri data isolation and the built-in before/after SHA-256 real-profile audit requiring `realAppDataChanged:false`), clean-machine installer tests, live guild/provider tests, reconnect/crash/timeout tests, sink-isolation tests, accessibility/visual tests, security/dependency/secret scans, and performance checks.
- Before live changes, run the sanitized loopback-only `npm run qa:live` probe. It reports method/path/status only and does not replace native-owned, configured-provider, playback, or manual acceptance.
- Update README/operator/user/troubleshooting/recovery/release docs with real commands and current statuses.
- Do not clean generated output until all release gates pass. Then follow `docs/CLEANUP_CHECKLIST.md` with backup/reference checks.

Current release-hygiene baseline: `LB-RUNTIME-010` rebuilds the native runtime staging directory, removes source maps and package test/spec files, and excludes unused Vite/Tauri starter assets. This is not permission to delete workspace build output or project documentation; final cleanup remains gated by installed-build evidence and `docs/CLEANUP_CHECKLIST.md`.

## Active claims

None. `LB-SAFETY-007` has been released after Codex integration and evidence review. `LB-SAFETY-008` is an accepted Codex integration contract for explicit Message Content Intent capability gating; do not duplicate it or silently enable the privileged intent.

## Completed slices log

### 2026-09-04 — `LB-COMMANDS-002` — Safe typed slash-registration failures

Codex integration hardening now maps Discord REST registration failures to a stable control/API
contract with `COMMAND_REGISTRATION_FAILED` and `retryable` metadata. Claude must preserve this
redaction boundary and must not surface raw Discord error objects, command payloads, or credentials
in native UI/logs. The installed QA-guild registration smoke remains green with 25 guild-scoped
commands; manual command interaction is still a release check.

### 2026-09-03 — `LB-UI-002` — Native reconciliation handoff baseline

Agent: Codex integration owner; no Claude implementation claim.

The native client now uses last-write-wins revisions for guild-scoped reads and clears the
previous guild's player before reading the newly selected guild. Claude must preserve this
contract when touching native control or feature refresh paths: a response is authoritative only
for the guild and request revision that produced it. SSE remains complementary to recovery polling.

Evidence: root/native typecheck, `npm test` 131/131, static production audit, and documentation
audit pass. Installed-build, reconnect, rapid guild-switch, and manual visual/accessibility
acceptance remain Codex release gates.

### 2026-09-03 — `LB-UI-003` — Native action reconciliation handoff baseline

Agent: Codex integration owner; no Claude implementation claim.

Guild-scoped native actions must capture their originating guild and monotonic selection revision, and ignore stale state/loading/
feedback commits after a guild switch. This applies to Join/Leave, player/queue, Discord output-toggle
handoff, playlist, Equalizer, Music access, Community, onboarding, AutoMod/review, and registration. Do not cancel
the Discord operation; reconcile through the current guild's authoritative read/SSE path.

Evidence: native typecheck, root tests, static/docs audits, and release build pass. Manual rapid
switch during pending actions remains a Codex release gate.

### 2026-09-03 — `LB-MUSIC-017` — SoundCloud refresh-token recovery handoff baseline

Agent: Codex integration owner; no Claude implementation claim.

If SoundCloud rejects an invalid or expired single-use refresh token, the adapter clears only its
in-memory token cache and obtains a fresh app token through the official Basic-auth Client
Credentials flow. Network/timeouts remain retryable and must not clear the cache. The deterministic
suite now exercises the rejected-refresh → fresh-token flow through mocked HTTP without real
credentials or network access. Never persist or expose token values, and never fall back to cookies
or undocumented endpoints.

Evidence: deterministic provider tests and root/native checks pass; configured token-expiry/rotation
and installed-vault playback remain Codex release gates.

### 2026-09-03 — `LB-COMMANDS-001` — Slash-command schema safety handoff

Agent: Codex integration owner; no Claude implementation claim.

The approved 26-command registry now has a pure deterministic contract test for Discord-safe
names/descriptions, unique nested options and choices, ordered required/optional options, valid
numeric bounds, and Music provider/repeat/volume/queue-position values. Keep this test green when
adding or changing commands; live command round-trip remains a release gate.

Evidence: `npm test` 131/131 and the latest root/native/release/docs checks pass.

### 2026-09-03 — `LB-LOG-007` — Metadata-only Discord command accountability handoff

Agent: Codex integration owner; no Claude implementation claim.

Every slash-command interaction writes a bounded local audit record with actor, guild, command,
optional subcommand, and success/denied/error outcome only. Search text, URLs, playlist names,
provider payloads, and credentials are excluded. Permission denials from `/music-access` and
`/community-config` must remain `denied`; audit persistence failures are isolated from command
replies. Keep the pure helper tests and the existing redacted audit-store boundary intact.

Evidence: `npm test` 131/131, root/native typecheck/build, static/docs audit, and release checks
pass. Installed command round-trip and live audit observation remain Codex release gates.

### 2026-09-04 — `LB-LOG-008` — Awaited mutation audit boundary handoff

Agent: Codex integration owner; no Claude implementation claim.

The Control API now awaits the request-scoped redacted audit attempt before committing a successful
mutation response. All mutation call sites receive the injected audit store explicitly; audit
failure remains isolated from the primary operation without unhandled rejection or secret/provider
payload leakage. Read-only search, health, preview and stream routes remain audit-free.

Evidence: Equalizer control regression proves response ordering and store isolation; `npm test`
131/131 and the current root/native/release/docs gates pass. Keep `docs/AUDIT_LOG_SPEC.md` and ADR-059
as the contract when adding future mutations.

### 2026-09-04 — `LB-SECURITY-001` — Canonical loopback binding handoff

Agent: Codex integration owner; no Claude implementation claim.

The control bridge now validates its endpoint before listening and accepts only the native-owned
`127.0.0.1:2901` runtime binding. LAN hosts and noncanonical ports are rejected; `port 0` exists
only for deterministic in-process tests. Do not add a remote-control shortcut through `.env`; a
future remote surface needs a new authenticated SDD requirement and ADR.

Evidence: config rejection/acceptance tests and the server-start guard. Preserve this boundary
when modifying configuration, native IPC, provider controls, or release startup.

### 2026-09-03 — LB-COMMUNITY-002 — Ignored channels/roles for Community XP

Agent: Claude. Phase: A5 (Community and onboarding).

Files changed: `src/community.ts`, `src/community.test.ts`, `src/commands.ts`, `src/index.ts`, `docs/ROADMAP.md`.

Checks run: `npm run typecheck` (pass), `npm test` (38/38 pass, including 1 new ignored-channel/role test), `npm run build` (pass).

Live QA: none run in this session — no Discord token/guild access confirmed available in this environment; the slash command shape (`/community-config ignore-channel|ignore-role|show`) and permission gate follow the existing `/music-access` pattern exactly, so live registration is expected to work but is unverified. Record real registration + a live `/community-config` round trip against guild `1541307192534241318` as the first acceptance check once Discord access is available.

Historical limitations at the time of `LB-COMMUNITY-002`: per-guild cooldown override, reset, leaderboard pagination, and a native Community settings UI were not yet implemented; these are tracked by the subsequent Community slices.

Next unblocked slice: configured-provider live QA and installed-build acceptance for Music; native freshness/stale markers are already implemented and still need the documented manual visual/accessibility pass.

### 2026-09-03 — LB-RUNTIME-004 — Local JSON store corruption recovery

Agent: Claude. Phase: A1 (production runtime and persistence).

Files changed: `src/persistence.ts` (new), `src/persistence.test.ts` (new), `src/audit-log.test.ts` (new), `src/playlists.ts`, `src/music-permissions.ts`, `src/equalizer.ts`, `src/community.ts`, `src/audit-log.ts`, `src/playlists.test.ts`, `src/music-permissions.test.ts`, `src/community.test.ts`, `src/equalizer.test.ts`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (ADR-021), `docs/AUDIT_STATUS.md`, `docs/ROADMAP.md`.

Checks run: `npm run typecheck` (pass), `npm test` (37/37 pass, including 8 new corruption-recovery tests), `npm run build` (pass).

Live QA: none required — backend-only local-file behavior, no Discord/provider surface touched.

Historical limitations at this slice: native restore UI, coordinated cache reload, and migration execution remained `Planned`; `LB-RUNTIME-006` later implemented transactional restore and native restart-to-apply, and `LB-RUNTIME-007` later added the shared migration runner. Concrete store migrations remain schema-change scoped.

Historical next-slice note: configured SoundCloud live search/resolve/play and installed-build acceptance were unblocked at that point. The provider toggle/test boundary is implemented as `LB-MUSIC-010`; native Windows credential storage is now implemented as `LB-MUSIC-012`, while advanced rotation/recovery, Discord seek policy, and device-specific output remain separate acceptance/decision items.

### 2026-09-03 — LB-MUSIC-010 — SoundCloud availability hardening

Agent: Codex. Phase: A2 (Music completion).

Files changed: `src/provider-settings.ts`, `src/provider-settings.test.ts`, `src/config.ts`, `src/soundcloud.ts`, `src/control-server.ts`, `native/src/App.tsx`, `native/src/App.css`, `docs/MUSIC_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/ENVIRONMENT.md`, `docs/DECISIONS.md` (ADR-026), `docs/ROADMAP.md`, `docs/AUDIT_STATUS.md`, `README.md`.

Behavior: SoundCloud has an explicit local enabled flag, stable disabled/configuration errors, a redacted official connection-test route, and a native Windows vault path. No token, secret, cookie, or raw provider payload crosses the native control API boundary or enters the backup envelope.

Checks: `npm test` 48/48, root typecheck/build, native typecheck, native Vite build, and final Tauri MSI/NSIS release build passed. A live control probe reports `ready` and redacted provider status; configured SoundCloud live search/resolve/play and installed-build verification remain pending.

### 2026-09-03 — LB-COMMUNITY-003 — Community cooldown and leaderboard pagination

Agent: Codex. Phase: A5 (Community and onboarding).

Files changed: `src/community.ts`, `src/community.test.ts`, `src/commands.ts`, `src/control-server.ts`, `src/control-server.test.ts`, `native/src/App.tsx`, `native/src/App.css`, `docs/COMMUNITY_SPEC.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md` (ADR-027), `docs/AUDIT_STATUS.md`, `docs/REMAINING_GAPS.md`, `README.md`.

Behavior: each guild may override the XP cooldown from `0..86400` seconds or reset to the global default; leaderboard reads are bounded, paginated, and preserve absolute ranks; invalid native/API writes do not mutate the store. Native Community exposes the real settings and page controls.

Checks: `npm test` 51/51, root typecheck, and native typecheck passed. Native release build, installed-build verification, and live Discord command round-trip remain pending release acceptance.

### 2026-09-03 — LB-COMMUNITY-004 — Confirmed Community reset and member detail

Agent: Codex. Phase: A5 (Community and onboarding).

Files changed: `src/community.ts`, `src/community.test.ts`, `src/control-server.ts`, `src/control-server.test.ts`, `src/commands.ts`, `src/commands.test.ts`, `native/src/App.tsx`, `native/src/App.css`, `docs/COMMUNITY_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md` (ADR-028), `docs/AUDIT_STATUS.md`, `docs/REMAINING_GAPS.md`, `README.md`.

Behavior: native and control surfaces can inspect a real member rank; reset requires explicit confirmation, is guild-scoped, preserves Community settings, and emits a count-only audit entry. Slash reset is manager-gated and requires `confirm:true`.

Checks: `npm test` 54/54, root typecheck, and native typecheck passed. Native release rebuild, installed-build verification, and live Discord command round-trip remain pending release acceptance.

### 2026-09-03 — LB-LOG-002 — Audit retention and write-time redaction

Agent: Codex. Phase: A5 (Activity logs and onboarding).

Files changed: `src/config.ts`, `src/audit-log.ts`, `src/audit-log.test.ts`, `src/control-server.ts`, `src/control-server.test.ts`, `docs/ENVIRONMENT.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md` (ADR-029), `docs/AUDIT_STATUS.md`, `docs/REMAINING_GAPS.md`, `README.md`.

Behavior: audit storage keeps a hard 2,000-entry cap, optionally prunes by `LOCALBOT_AUDIT_RETENTION_DAYS`, and redacts/truncates new actor/action/detail strings before persistence. The control API exposes only effective metadata, never secrets or raw provider payloads.

Checks at slice completion: `npm test` 56/56 and root typecheck passed. A later native release rebuild passed on 2026-09-03; installed-build verification and moderation/onboarding work remain pending.

### 2026-09-03 — LB-ONBOARD-001 — Welcome/Goodbye control/runtime slice

Agent: Codex. Phase: A5 (Activity logs and onboarding).

Behavior: per-guild Welcome/Goodbye templates persist locally with bounded text, HTTPS-only images, safe token rendering, preview, and explicit test-send. Native Community exposes configuration and reports whether the privileged Members Intent is enabled; runtime member events are opt-in through `LOCALBOT_GUILD_MEMBERS_INTENT=true`.

Checks: `npm test` 61/61, root/native typecheck, and native Vite build pass. Live join/leave delivery requires explicit Discord Developer Portal opt-in; text-channel picker and installed-build verification remain pending.

### 2026-09-03 — LB-ONBOARD-002 — Real text-channel picker

Agent: Codex. Phase: A5 (Activity logs and onboarding).

Behavior: the control API returns real guild text/announcement channels with current bot send/embed permission state; native Welcome/Goodbye uses this list and does not invent or mutate Discord channels.

Acceptance: deterministic channel permission coverage plus native typecheck/build; live guild permission verification and installed-build testing remain pending. Evidence at slice completion: `npm test` 67/67; current full suite: 73/73.

### 2026-09-03 — LB-SAFETY-001 — AutoMod dry-run detector

Agent: Codex. Phase: A6 (Safety).

Behavior: disabled-by-default per-guild spam/flood/link/scam detection with user/role exemptions, bounded in-memory history, atomic settings, and a loopback GET/POST contract. Runtime records only redacted `automod.dry_run_match` audit entries with `enforced:false`; no deletion, timeout, ban, lockdown, permission mutation, anti-raid, or anti-nuke action is possible in this slice.

Checks: `npm test` 67/67, root typecheck/build, native typecheck, and native Vite build pass. Native Safety editor and kill switch are now implemented; explicit enforcement and live/installed acceptance remain pending.

### 2026-09-03 — LB-SAFETY-002 — Native dry-run policy editor

Agent: Codex. Phase: A6 (Safety).

Behavior: native Community/Safety uses the selected guild's server-confirmed AutoMod settings, exposes bounded spam/flood/link/scam controls, exemptions, blocked domains, honest offline/loading states, and a persisted `Tắt ngay` kill switch. No enforcement or Discord moderation mutation is exposed.

Checks: `npm test` 67/67, root typecheck/build, native typecheck, and native Vite build pass. Manual focus/reduced-motion and installed-build acceptance remain pending.

### 2026-09-03 — LB-MUSIC-011 — Native Windows output-device routing

Agent: Codex. Phase: A2 (Music completion).

Behavior: native Player discovers real `audiooutput` devices through the WebView, applies a selected device with `setSinkId`, persists only its opaque ID locally, refreshes on device changes, and falls back to the Windows default without touching Discord. Unsupported routing is reported honestly.

Checks: native typecheck and Vite build pass. Manual device-loss/accessibility and installed-build acceptance remain pending.

### 2026-09-03 — LB-RUNTIME-006 — Transactional local backup restore

Agent: Codex. Phase: A1 (production runtime and persistence).

Behavior: `POST /api/v1/data/restore` requires explicit confirmation, validates the version-one credential-free envelope and sensitive-looking keys, keeps a pre-restore recovery copy, stages and atomically installs all ten stores, and rolls back an injected installation failure. Native Settings can select a JSON backup and offers a native-owned restart-to-apply action; it waits for Ready before clearing pending state.

Checks: `npm test` 73/73, native typecheck, and native Vite build pass. Final packaged native smoke reached `ready` and the real QA guild; installed-build restore and real Windows failure-injection remain release gates; concrete schema migrations are added only when a store shape changes.

### 2026-09-03 — LB-RUNTIME-007 — Persistence migration runner

Agent: Codex. Phase: A1 (production runtime and persistence).

Behavior: `src/persistence.ts` now accepts an opt-in chain of one-step migrations. A complete chain is cloned, validated by the store's current guard, atomically persisted, and returned with `migrated:true`. Future versions, incomplete chains, invalid outputs, thrown steps, and failed writes are never accepted as current data. Existing stores remain version `1` until a real schema change has an approved fixture.

Checks: `npm test` 73/73 and root typecheck pass. Contract and state matrix are documented in `docs/PERSISTENCE_SPEC.md`; native/build checks are unchanged because this slice does not alter the UI or runtime bundle.

### 2026-09-03 — LB-RUNTIME-008 — Windows crash-safe native ownership

Agent: Codex. Phase: A1 (production runtime and persistence).

Behavior: every Windows-owned Node child is attached to a private Job Object configured with `KILL_ON_JOB_CLOSE`; deliberate stop keeps the existing recursive task termination. If Job Object setup fails, the just-started child is terminated and native reports a failed start. External listeners are never adopted or killed.

Checks: `cargo check --manifest-path native/src-tauri/Cargo.toml` passes with the Windows-specific dependency and code path. The orphan from the previous forced dev stop was identified by its owner marker and cleaned up; the final release binary reached `ready` with the real QA guild present, was force-terminated without `stop_bot`, its owned Node tree exited, and port `2901` became free. Controlled installed no-auto-join/no-auto-play is now covered by `LB-QA-012`; crash-recovery acceptance remains a separate release gate.

### 2026-09-03 — LB-RUNTIME-009 — Fail-closed explicit stop ownership

Behavior: native keeps the owned child in its runtime slot until `stop_bot` has terminated and waited for the process successfully. A failed stop remains retryable and never silently turns a still-running owned child into an external process.

Checks: `cargo check --manifest-path native/src-tauri/Cargo.toml` and `cargo test --manifest-path native/src-tauri/Cargo.toml` pass (2/2). Installed-build induced stop-failure/retry observation remains a release gate.

### 2026-09-03 — LB-AI-001 — Optional Ollama configuration and health

Agent: Codex. Phase: A7 (Optional Ollama).

Behavior: native Settings and loopback control now support a disabled-by-default, bounded Ollama endpoint/model/timeout configuration with safe health states. `data/ollama.json` is included in the ten-store credential-free backup/restore. No AI action, private Discord data, API key, prompt, or raw provider response crosses the control boundary.

Checks: `npm test` 81/81, root typecheck, native typecheck, and native Vite build pass. Final native release rebuild plus installed/manual acceptance remain release gates. Read-only AI actions require a separate privacy/prompt-injection requirement.

### 2026-09-03 — LB-SAFETY-004 — Anti-raid and anti-nuke dry-run telemetry

Agent: Codex. Phase: A6 (Safety).

Behavior: AutoMod settings now include legacy-safe, bounded `antiRaid` and `antiNuke` threshold rules. Opt-in member-join and channel/role deletion events produce only redacted, `enforced:false` audit signals; no Discord mutation or raw audit-log fetch occurs. Native AutoMod exposes both rules.

Checks: `npm test` 83/83, root typecheck, native typecheck, and native Vite build pass. Live destructive enforcement remains intentionally out of scope; installed-build and manual UI acceptance remain release gates.

### 2026-09-03 — LB-SAFETY-003 — Bounded AutoMod message enforcement

Agent: Codex. Phase: A6 (Safety).

Behavior: AutoMod accepts `dry-run`/`enforce` with dry-run as the safe default. Native confirmation gates enforce mode. Runtime may execute only one permission-checked message delete or fixed 60-second timeout, limited to 20 mutations per guild per rolling minute; every result is redacted/audited. Anti-raid/anti-nuke and quarantine remain alert-only.

Checks: `npm test` 98/98, root typecheck, native typecheck pass. Use synthetic Discord-shaped fixtures for destructive paths; never enable enforcement or send destructive fixtures to guild `1541307192534241318`.

### 2026-09-03 — LB-AI-002 — Bounded read-only Ollama suggestions

Agent: Codex. Phase: A7 (Optional Ollama).

Behavior: native Settings can send a bounded operator question for help/music/community guidance only when Ollama is explicitly enabled and healthy. The adapter sends no Discord/member/queue/provider context, returns only length-limited plain text, and never interprets model output as a command. Disabled, unconfigured, timed-out, malformed, or offline states fail safely.

Checks: `npm test` 86/86, root typecheck, native typecheck, and native Vite build pass. Autonomous AI actions remain out of scope and would require a new privacy, prompt-injection, permission, confirmation, and audit contract.

### 2026-09-03 — LB-LOG-003 — Native audit retention policy editing

Agent: Codex. Phase: A5 (Activity logs and onboarding).

Files changed: `src/audit-log.ts`, `src/audit-log.test.ts`, `src/control-server.ts`, `src/control-server.test.ts`, `native/src/App.tsx`, `native/src/App.css`, `docs/AUDIT_LOG_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/AUDIT_STATUS.md`, `docs/REMAINING_GAPS.md`, `README.md`.

Behavior: native Community reads and updates the local audit retention policy through the validated control route. `null` or `1..3650` days are accepted; the version-one file persists non-secret settings beside entries; updates prune atomically and preserve the hard 2,000-entry limit. Native has loading/offline/error-safe states and does not expose arbitrary entry deletion.

Checks: `npm test` 89/89, root typecheck, and native typecheck pass. Installed-build/manual acceptance, richer audit permissions, moderation ingestion, and export controls remain planned.

### 2026-09-03 — LB-MUSIC-012 — Native SoundCloud credential vault

Agent: Codex. Phase: A2 (Music completion).

Behavior: native Windows Settings now offers transient SoundCloud Client ID/secret input backed by Windows Credential Manager. Status is boolean-only; the loopback API, backup, logs, and UI never receive the secret. Native injects vault values into its owned Node child at startup, with `.env` fallback, and shows an explicit restart reminder.

Checks: Rust validation/unit tests, `cargo check --manifest-path native/src-tauri/Cargo.toml`, and native TypeScript typecheck pass. Installed-build save/clear/restart and configured SoundCloud live search/resolve/play remain release gates. Read `docs/SOUNDCLOUD_CREDENTIALS_SPEC.md` before changing this boundary.

### 2026-09-03 — LB-MUSIC-013 — Provider metadata request budget

Agent: Codex. Phase: A2 (Music completion).

Behavior: search and direct metadata resolve now use an independent in-memory rolling budget of 30 requests per provider per 60 seconds. Excess calls return retryable `MEDIA_RATE_LIMITED`/HTTP 429; all-source search can retain results from a provider that is not limited, and stream lifetime is not throttled so Discord/Windows output isolation remains intact.

Checks: fake-clock limiter tests pass and the full suite is 104/104; configured provider, live guild, and installed-build acceptance remain release gates.

### 2026-09-03 — LB-SAFETY-005 — Per-guild AutoMod memory recovery

Agent: Codex. Phase: A6 (Safety hardening).

Behavior: disabled AutoMod evaluations clear only the selected guild's volatile message/security histories and cooldown markers, so a later re-enable begins with a clean observation window. Other guilds, persisted settings, and audit entries are unchanged.

Checks: targeted AutoMod tests and the full 105/105 suite pass; no live mutation or destructive QA is required.

### 2026-09-03 — LB-SAFETY-006 — Emergency AutoMod safe-mode recovery

Agent: Codex. Phase: A6 (Safety hardening; integration-owned).

Behavior: the confirmed guild-scoped recovery route forces `enabled:false` and `mode:"dry-run"`, invokes the native-owned per-guild engine reset immediately, preserves rules/exemptions/persisted audit/other guilds, and performs no Discord mutation. Native exposes an explicit confirmation action and updates only after the server response.

Checks: targeted AutoMod/control tests `27/27`, full suite `105/105`, root/native typechecks and build, Rust check/test `4/4`, `npm audit` 0 vulnerabilities, `npm run native:verify`, and `npm run native:smoke` pass. Review/appeal tooling and installed-build acceptance remain planned.

### 2026-09-03 — LB-SAFETY-007 — Bounded AutoMod review queue

Agent: Codex integration owner. Claude claim: none.

Behavior: every AutoMod match now creates one bounded `automod-review.json` record with redacted rule/reason/action/outcome metadata and no message content, usernames, raw Discord payloads, provider data, or credentials. Native Community reads guild-scoped open/confirmed/dismissed records and can make local confirm/dismiss annotations with a bounded note; repeated same-direction decisions are idempotent and opposite decisions are rejected without Discord mutation. Backup/restore includes the store.

### 2026-09-03 — LB-SAFETY-008 — Explicit Message Content Intent capability

Agent: Codex integration owner. Claude must preserve this boundary when touching AutoMod.

Behavior: content-based AutoMod requires both the Discord Developer Portal Message Content Intent switch and `LOCALBOT_MESSAGE_CONTENT_INTENT=true`. The runtime requests the privileged intent only when enabled; when unavailable, content-based rules are a safe no-op and native shows the exact setup guidance. No credentials or message content cross the control boundary.

Checks: review store/control tests, backup/restore tests, full `npm test` `110/110` at the original slice, root build/typecheck, native typecheck, native Tauri release build, `npm run native:verify`, and `npm run audit:static` pass. Installed/manual review acceptance, public appeals, content recovery, automatic reversal/punishment, anti-raid/nuke enforcement, and AI decisions remain out of scope.

### 2026-09-03 — LB-LOG-004 — Scoped audit export

Agent: Codex. Phase: A5 (Activity logs and onboarding).

Behavior: `GET /api/v1/audit-log/export` requires one guild scope, reuses bounded redacted entries, supports the current action/search filters, and returns JSON or CSV. Native Community exposes both downloads and never offers all-guild/raw-diagnostic export.

Checks: `npm test` 90/90, root typecheck, and native typecheck pass. Installed-build download/opening and richer audit permissions remain planned.

### 2026-09-03 — LB-LOG-005 — Passive Discord moderation telemetry

Agent: Codex. Phase: A5 (Activity logs and onboarding).

Behavior: existing Discord events for message delete, bulk delete, channel delete, and role delete now create minimal bounded audit entries. Content, usernames, actor guesses, and raw Discord audit-log payloads are excluded; persistence failures never block the bot and no new privileged intent or destructive action is added.

Checks: deterministic formatter tests, root typecheck/build, and `npm test` are the current acceptance gate; live QA remains observation-only.

### 2026-09-03 — LB-LOG-006 — On-demand Discord audit-log view

Agent: Codex. Phase: A5 (Activity logs and onboarding).

Behavior: added a guild-scoped, on-demand Discord audit-log read requiring `ViewAuditLog`. The minimal newest-first DTO stays in memory and is kept separate from LocalBot's redacted local audit store; native Community exposes distinct Local/Discord views and safe loading, empty, permission, offline, and retryable error states.

Checks: `npm test` 104/104, root/native typechecks pass. The authorized read-only loopback probe returned HTTP 200 with the documented DTO in guild `1541307192534241318`; installed-build acceptance remains pending. Remote export, mutation, and raw Discord payloads remain out of scope.

### 2026-09-03 — LB-UI-001 — Semantic theme chrome and control geometry

Agent: Codex. Phase: A3 (Native UX/control-plane hardening).

Behavior: title-bar metadata, floating primary navigation, menu separators, and active output text now use semantic chrome/theme tokens. Light keeps a light shell, Default keeps the approved dark shell over light content, and Dark remains the first-install default. Approved icon-slot geometry, centered player controls, sticky footer, volume popover, monochrome sliders, and reduced-motion behavior are unchanged. The Equalizer reset action uses Lucide `RotateCcw` rather than the unrelated `Activity` icon.

Checks: root/native typechecks, full `npm test` (105/105), native Vite/Tauri release build, `npm run native:verify`, `npm run native:smoke`, and sanitized `npm run qa:live` pass. Manual Tauri visual/accessibility checks at all documented widths and themes remain release gates.

### 2026-09-03 — LB-QA-002 — Sanitized live probe rerun

Agent: Codex integration owner. Claude implementation claim: none.

Evidence: `npm run qa:live` was rerun against the authorized guild `1541307192534241318`; every configured read/search check returned HTTP 200. This is contract reachability evidence only because the current port listener is an external unowned Node process. No source claim or implementation ownership changed.

### 2026-09-03 — LB-QA-003 — Static production-data regression gate

Agent: Codex integration owner. Claude implementation claim: none.

Evidence: added `npm run audit:static`; it scans only `src/`, `native/src/`, and
`native/src-tauri/src/` and passes without printing source lines, response bodies, or
secrets. The slash-command registry regression is also green and the current full suite is
`106/106`. These gates are now part of the release checklist and must remain green for future
feature slices.

### 2026-09-03 — LB-QA-004 — Documentation contract regression gate

Agent: Codex integration owner. Claude implementation claim: none.

Evidence: added `npm run audit:docs`; it checks the 14 routed SDD/spec/roadmap/README files for
native ownership, port `2901`, Dark default, Windows autostart guidance, QA-guild scope, and
the accepted `LB-MUSIC-014` Discord seek boundary. It passes without reading `.env`, user data,
generated output, or the full codebase. The command is documented in README, the release
runbook, and both autopilot prompts.

### 2026-09-03 — LB-MUSIC-015 — SoundCloud creator attribution metadata

Agent: Codex integration owner. Claude implementation claim: none.

Evidence: the official adapter prefers SoundCloud `metadata_artist` and safely falls back to
the uploader profile name through the existing `channel` DTO. Two deterministic mapping tests,
the `112/112` root suite, typecheck/build, static/docs audits, native release rebuild,
`native:verify`, and `native:smoke` pass. Configured SoundCloud live playback/attribution and
clean-machine acceptance remain release gates.

### 2026-09-03 — LB-MUSIC-016 — SoundCloud current URN + HLS AAC contract

Agent: Codex integration owner. Claude implementation claim: none.

Before changing provider code, the contract was recorded: require SoundCloud string `urn`, reject
numeric-only track records, call
`/tracks/{track_urn}/streams`, prefer `hls_aac_160_url`, and fall back to `hls_aac_96_url`.
Progressive MP3 and the removed singular `/stream` endpoint are prohibited fallbacks. The
provider boundary must represent either a YouTube byte stream or a SoundCloud HTTPS media URL;
the Discord and Windows FFmpeg sinks remain independently owned.

Evidence: prior release gate `npm test` 116/116, root/native typecheck/build, static/docs audits, native release
rebuild, artifact verification, installer smoke, Rust tests, and npm audits pass. Configured
SoundCloud HLS playback, installed credential-vault acceptance, and clean-machine acceptance
remain release gates.

### 2026-09-03 — LB-QA-005 — Live guild slash-command registration

Agent: Codex integration owner. Claude implementation claim: none.

Evidence: `npm run register` successfully registered 25 guild-scoped commands for the authorized
QA guild `1541307192534241318`, replacing the guild command set idempotently and reporting only
count/scope metadata. Full live interaction round-trip and installed-build parity remain release
acceptance work.

### 2026-09-04 — LB-QA-008 — Configured installed-native readiness

Agent: Codex integration/release owner. Claude claim: none.

The opt-in `npm run native:smoke:configured` gate now launches the version-matched NSIS artifact
with the existing `.env` linked into a temporary app-local profile, waits for sanitized control
health `ready`, stops only the exact native-owned tree, and removes the temporary install/profile.
It does not print or duplicate secret values, mutate the QA guild, or claim Music playback.

Evidence: the 2026-09-04 run reported `configuredRuntimeReady:true`, `nativeProcessTreeStopped:true`,
`realAppDataChanged:false`, and `temporaryInstallRemoved:true`. Clean-machine, installed playback,
SoundCloud/vault, autostart/reboot, visual/accessibility, and signing acceptance remain separate
release gates. Claude must preserve this opt-in, secret-safe boundary when adding future installer
or runtime checks.

### 2026-09-04 — LB-MUSIC-018 — Player action dispatch correctness

Agent: Codex integration/release owner. Claude claim: none.

The first installed Music acceptance exposed a backend dispatcher fall-through where successful
pause/resume and related supported actions returned `INVALID_ACTION`. The explicit branch fix is
now in `src/control-server.ts`; preserve typed precondition errors and idempotent stop behavior.
The packaged runtime was rebuilt and `LB-QA-009` is now green on the current configured machine
profile; clean-machine and other provider/sink acceptance remain separate.

### 2026-09-07 — LB-MUSIC-019 — Direct Guild / Voice Readiness Flow

Agent: Codex integration/release owner. Claude claim: none. Status: implemented in the current
source slice; installed visual/accessibility and authorized live channel acceptance remain gates.

Music now selects a real guild and voice channel directly in its own context modal. Readiness is
computed from the selected channel's effective `ViewChannel`, `Connect`, and `Speak` permissions,
including channel overwrites; unknown bot-member cache remains unknown, and Stage is explicit
unsupported. Selection is preflight-only and cannot auto-join or move the bot. Play, playlist play,
and voice join revalidate at operation time, while Windows-only output remains independent.

Evidence: `src/voice.test.ts` and `src/control-server.test.ts` cover ready, overwrite/multiple
missing permissions, unknown cache, Stage, invalid/foreign/missing channels, structured errors,
and rejection before provider resolve. Native/root typechecks pass. Claude must preserve the route
and DTO in `docs/MUSIC_SPEC.md` and must not replace it with guild-level-only permission checks.

### 2026-09-07 — LB-OPS-001 — Operator Readiness & Diagnostics

Agent: Codex integration/release owner. Claude claim: none. Status: implemented additive
control/native slice; installed visual and configured live acceptance remain separate.

`GET /api/v1/diagnostics` and `src/runtime-diagnostics.ts` now provide a bounded, secret-free
readiness snapshot for profile, loopback control, ownership presence, Discord gateway, visible guild
count, provider availability, and privileged intents. Native Settings presents explicit
ready/starting/degraded/offline states with retry. Optional SoundCloud/Ollama or disabled intents
are informational and never fabricate core readiness.

Evidence: 3 domain tests plus 1 control-server DTO test; root/native typechecks pass. No new
dependency, persistence, port, or deployment topology was introduced.

### 2026-09-04 — LB-QA-009 — Configured installed YouTube playback smoke

Agent: Codex integration/release owner. Claude claim: none. Status: implemented; current configured installed evidence is green.

The `npm run native:smoke:music` gate builds on `LB-QA-008`, discovers a real
Connect/Speak-capable voice channel in QA guild `1541307192534241318`, refuse an existing voice
session, search a real YouTube track with HTTPS thumbnail, exercise play/pause/resume/stop/leave,
and emit sanitized results only. It must clean up before exact native-tree termination and must not
print/copy credentials, URLs, provider payloads, or member data. Do not claim this gate passed until
the command produces evidence; SoundCloud, Windows sink, autostart/reboot, clean-machine,
accessibility, and signing remain separate.
`LB-QA-010` now checks installed local-audio pipeline isolation while Discord is playing; the
2026-09-04 run passed with isolated cleanup. It must not be mistaken for full native Windows
device acceptance, which remains manual.

`LB-QA-011` is the installed recovery contract: export/restore a credential-free backup in a
temp profile with explicit confirmation and verify restart-required/store metadata. The
2026-09-04 run passed; keep crash recovery, migrations, upgrade persistence, and Settings UX as
separate gates.

`LB-QA-012` is the controlled installed restart contract: `npm run native:smoke:restart` refuses an
active QA voice/player session, stops and starts the exact native-owned process tree in the isolated
profile, waits for sanitized `ready`, then verifies no automatic voice join and no automatic player or
playback state for guild `1541307192534241318`. The 2026-09-04 run passed with isolated cleanup and
`realAppDataChanged:false`; crash recovery, migrations, upgrades, autostart/reboot, and manual UI
remain separate gates.

`LB-QA-013` verifies the installed native app's slash-command registration parity: the opt-in
`npm run native:smoke:commands` calls the native-owned route for QA guild `1541307192534241318` and
confirms the current 26-command guild-scoped result without printing payloads or credentials. The
2026-09-04 run passed with isolated cleanup and `realAppDataChanged:false`; command-by-command
interaction remains a separate non-destructive gate.
Evidence: the 2026-09-04 run passed packaged health, real YouTube thumbnail validation,
play/pause/resume/stop/leave checks, exact native-tree shutdown, temporary cleanup, and
`realAppDataChanged:false`. SoundCloud, Windows sink, autostart/reboot, clean-machine,
accessibility, and signing remain separate.

`LB-QA-014` is the Codex-owned dependency-isolated packaged smoke. Preserve its boundary when
changing the installer: `npm run native:smoke:isolated` and
`npm run native:smoke:music:isolated` remove host Node/npm discovery hints from the installed
child environment and require the bundled `runtime/node.exe`; the host Node process only
orchestrates the harness. This is stronger same-machine evidence, not physical clean-machine,
autostart/reboot, SoundCloud, device, visual/accessibility, or signing acceptance.

`LB-QA-015` is also Codex-owned release QA. Do not weaken `npm run native:smoke:crash`: it must
force-terminate only the installed native root PID without `/T`, verify the Windows Job Object
removed the owned child and released port `2901`, and preserve isolated cleanup plus the real
AppData snapshot. It is orphan-guard evidence only; it does not enable auto-restart, auto-join,
auto-play, or replace clean-machine/autostart/provider/device/manual UX/signing gates.

`LB-RUNTIME-016`/`LB-QA-017` are Codex-owned native supervisor and installed crash-recovery
evidence. Preserve the exact-child boundary, bounded 1/2/4-second backoff, three-attempt limit,
30-second stability reset, explicit Stop/shutdown behavior, and the rule that recovery never
auto-joins, auto-plays, adopts an external listener, or treats child existence as readiness.
`npm run native:smoke:crash-recovery` must kill only bundled `runtime/node.exe`, observe the same
native root create a replacement that reaches sanitized `ready`, and preserve isolated cleanup.

`LB-QA-016` is Codex-owned opt-in SoundCloud acceptance. Preserve the provider-specific
`npm run native:smoke:soundcloud` path: official OAuth/vault-or-env credentials only, real
SoundCloud search/thumbnail/identity, Discord playback action checks, no YouTube fallback, and
no secret/raw provider output. Do not claim this gate complete until a credentialed run passes;
without approved credentials, record the honest unavailable/configuration state and continue other
implementation packages.

## Claude completion rule

Do not stop at a plan or a compile pass. Continue to the next unblocked package. A package is complete only when implementation, deterministic tests, safe live evidence where applicable, docs, and acceptance status are all updated. If blocked by an unavailable credential, provider, manual UI capability, or user decision, record the exact blocker and continue independent work; never fake a successful result.
## VPS slash-only readiness addendum

Claude must treat this as a continuation of the existing LocalBOT architecture, not an invitation
to fork the bot or replace the native product.

- `LB-RUNTIME-017`: preserve one shared core with `native`, `headless`, and `slash-only` profiles;
  slash-only is Node/Discord/Music only, with no Tauri/React/control listener/2901.
- `LB-COMMANDS-003`: preserve `/bot status`, `/bot providers`, and safe manager-only guild
  `/bot sync`; never expose shell execution, arbitrary restart, or systemd control through Discord.
- `LB-RUNTIME-018`: preserve SIGINT/SIGTERM cleanup and the non-root systemd reference.
- Run `npm run qa:headless`, `npm test`, typechecks, build, static audit, and docs audit. Do not
  report a VPS check as passed without an actual target host.
- Read `README.md`, `README-vi.md`, `docs/ENVIRONMENT.md`, `docs/ARCHITECTURE.md`,
  `docs/RELEASE_QA_RUNBOOK.md`, and `docs/REMAINING_GAPS.md` before changing deployment code.
