# LocalBot Roadmap

Order is deliberate: stabilize the bot/control boundary before adding native app polish. Each phase must pass its SDD readiness gate before implementation and its delivery gate before the next phase starts.

## SDD phase gate

Before implementation, every phase-sized task must have:

- one or more stable requirement IDs;
- explicit scope and out-of-scope behavior;
- an API/DTO contract or UI interaction contract;
- loading, success, empty, offline/error, and stale states where relevant;
- deterministic acceptance checks and recorded QA evidence.

If a task changes ports, environment keys, dependencies, persistence, providers, authentication, or runtime topology, update `docs/DECISIONS.md` with an ADR before editing code. A `Planned` item must not be reported as `Current` or used as evidence that a phase is complete.

## Phase 0 — Configuration and runtime foundation

Status: Implemented baseline; configuration validation, compatibility aliases, readiness reporting, and the native control-plane environment contract are in place. Manual login and clean installed-runtime acceptance remain release gates.

Scope:

- Verify the existing bot starts with the current `.env` contract.
- Keep `DISCORD_TOKEN` as the canonical key; accept `BOT_TOKEN` only as a documented compatibility alias and never silently rename either key.
- Add a safe health/readiness signal for future dashboard use.
- Document the control-plane port separately from the dashboard port.

Acceptance criteria:

- Missing required env vars fail with actionable names and never print values.
- Existing YouTube commands and tests remain green.
- The bot process can expose a minimal internal health state without exposing secrets.

Gate: `npm run typecheck`, `npm test`, `npm run build`, and a manual bot login check.

### LB-SECURITY-001 — Canonical loopback control binding

Status: Implemented and release-gated.

Contract: the unauthenticated native control bridge is a local-only boundary and must bind
exactly to `127.0.0.1:2901`. Configuration values that would expose the bridge to a LAN or
change the canonical runtime endpoint fail closed before the server starts. Port `0` is accepted
only by deterministic in-process tests so tests can avoid occupying the product port; it is not a
supported runtime setting. Remote access requires a new SDD requirement, authentication design,
and ADR before implementation.

Acceptance: config tests accept the canonical endpoint and test-only port `0`, reject a LAN host
and noncanonical runtime port, and the control server invokes the guard before listening. Root
typecheck/test/build, static/docs audits, native checks, and release artifact verification remain
green.

## Phase 1 — Native Windows app shell

Status: Implemented baseline; Tauri 2 + React/Vite/TypeScript native shell, branding, responsive v1 UI, HMR dev workflow, native-owned bot runtime, opt-in Windows startup registration, generated bundled Node production-runtime pipeline, native freshness/retry indicators, and `LB-UI-001` semantic theme-chrome correction are working. Installed-build startup, clean-machine, and manual visual/accessibility acceptance remain pending.

Canonical reference: `docs/UI_UX_V1.md` and the interactive demo in `DEMO/uiux-prototype/`.
Historical concept images establish exploration history only. Claude must use the approved v1 behavior plus the generated design-system files and dashboard/app override as implementation guidance, and must not treat generated copy or decorative details as product requirements.

Scope:

- Create a separate `native/` Tauri 2 Windows app with React, Vite, and TypeScript.
- Use `npm run native:dev` for Vite HMR/Tauri dev mode; use `npm run native:build` only for production artifacts.
- Let the native window start/stop the workspace bot with a visible loading state; only a process started by native may be stopped by native.
- In release builds, bundle Node, compiled root runtime, and production dependencies as a Tauri resource; launch from app-local configuration/data paths without requiring the repository, npm, or system Node.
- Provide an opt-in “Khởi động cùng Windows” setting that registers the native app, not `npm` or a separate bot process.
- Use the local control/runtime bridge on `127.0.0.1:2901`; the native window itself does not need a port.
- Use TypeScript with the project design system and semantic tokenized CSS. Keep the native bundle dependency-light; add ESLint or Tailwind only through a separately approved ADR when they provide measurable value for this desktop surface.
- Implement the shell: native title bar, floating hamburger navigation, fixed bottom guild/voice context picker, Overview screen, responsive layout.
- Implement the three explicit themes: `Default` split-tone, `Dark`, and `Light`.
- Make `Dark` the first-install selection and persist the user's explicit choice locally.
- Keep the Next.js browser companion out of this phase.

Acceptance criteria:

- `cargo tauri dev` opens a real Windows app window without browser chrome.
- `cargo tauri build` produces a Windows artifact after the toolchain is installed.
- First paint uses the `Dark` theme without a visible theme flash.
- The three-state toggle uses SunMoon / Moon / Sun in that order and changes between visibly distinct themes.
- `Default` uses dark shell/card headers with light card bodies; `Dark` is dark throughout; `Light` is light throughout.
- The app remains usable without the optional web dashboard.
- Native dev automatically starts and owns `npm run dev` with the root `.env`; release builds start and own the bundled runtime with app-local configuration/data. An externally started bot is shown as unowned and is not adopted or terminated. Closing native stops the owned process tree.
- Windows startup registration is opt-in, reversible, and points to the native executable; it preserves the same native-owned bot startup contract.
- Keyboard navigation, visible focus, reduced motion, loading, empty, and error states are present.
- No bot token is available to client-side JavaScript.

Gate: visual review against `DASHBOARD_SPEC.md`, responsive smoke test, accessibility pass, production build.

### LB-UI-001 — Semantic theme chrome and control geometry

Status: Current for the source/native build; installed visual and accessibility acceptance remains a release gate.

Contract and state matrix:

| State | Expected behavior |
| --- | --- |
| `Dark` (first launch) | Workspace, surfaces, floating navigation, title bar, controls, tags, sliders, and focus states use dark/white/neutral tokens only. |
| `Default` | Workspace/card bodies are light while the title bar, floating primary navigation, and panel headers remain dark; text and border tokens stay readable in both surfaces. |
| `Light` | Workspace, surfaces, title bar, floating navigation, controls, tags, sliders, and focus states use light/black/neutral tokens only; no dark-only navigation literals remain. |
| Hover/focus/active | Controls change through semantic tokens without layout shift, icon distortion, hue accents, or hard-coded theme-inconsistent colors. |
| Reduced motion | CSS and React motion respect `prefers-reduced-motion`; no idle animation is introduced for approved transport/volume controls. |

Scope: replace theme-inconsistent navigation/title-bar/output literals with semantic chrome tokens and preserve the approved v1 layout, icon geometry, motion contract, and three explicit themes.

Out of scope: changing the owner-approved v1 information architecture, adding a fourth theme, or changing playback behavior.

Acceptance: `npm run typecheck`, `npm run native:typecheck`, `npm test`, a native build, and manual visual/accessibility checks for all three themes and the five required logical widths. A source audit must find no fixed dark navigation surface in the Light theme.

Maintenance evidence (2026-09-03): the Equalizer reset action uses the semantic Lucide `RotateCcw` icon; the previous unrelated `Activity` icon was removed without changing the approved monochrome geometry or motion contract.

## Phase 2 — Local control-plane contract

Status: Implemented for the current local Windows slice; loopback v1 read/search/play/action/queue, guild/channel/voice join-leave, slash-command registration, provider status, audit read, SSE player events, and SSE guild/voice events are available behind an opt-in flag. Native guild/channel client, fixed footer controls, and native dev bot process toggle are working.

Scope:

- Define a small internal API between dashboard and bot.
- Use a loopback-only control service on `127.0.0.1:2901` for the native app; Tauri IPC may be used where it is simpler and safer.
- Start with health, guild list, current player state, queue, and playback commands.
- Use a clear versioned contract, for example `/api/v1/...`.
- Use SSE or WebSocket only for state that benefits from live updates; ordinary commands remain request/response.

Acceptance criteria:

- API errors have a consistent shape and safe messages.
- Commands are scoped to a guild and reject missing/invalid guild context.
- Stale or disconnected state is visible in the dashboard.
- Contract tests cover success, validation failure, timeout, and bot-unavailable cases.

Gate: API contract documented in `ARCHITECTURE.md`, tests green, no secrets in network responses.

### LB-COMMANDS-001 — Slash-command schema safety

Status: Current for the approved 26-command surface; live command round-trip and installed-build
interaction acceptance remain release gates.

Scope: validate the JSON definitions sent to Discord before registration. Every command and nested
option must use Discord-safe names and bounded descriptions; sibling options/subcommands and choice
values must be unique; numeric ranges must be ordered; required scalar options must precede optional
scalar options; Music provider, repeat, volume, queue-position, and movement bounds remain explicit.

Out of scope: changing command behavior, adding commands, user OAuth, or simulating Discord
interactions with production data.

Acceptance: `src/commands.test.ts` performs the pure definition checks without a Discord request or
credential. The approved Music provider values are `youtube`/`soundcloud` (plus `all` for search),
repeat values are `off`/`all`/`one`, volume is `0..100`, and queue positions are `>=1`.

### LB-COMMANDS-002 — Safe typed slash-registration failures

Status: Implemented control/API hardening · live Discord and installed interaction acceptance remain release gates

Scope: normalize failures from Discord REST slash-command registration into a bounded, retryable
control response. Network, timeout, rate-limit, and upstream failures are retryable; invalid
configuration or permission failures are not. Raw Discord errors, request payloads, authorization
material, and response bodies never cross the control boundary or enter logs.

Acceptance: deterministic tests cover status classification and the stable redacted message; the
control route returns `COMMAND_REGISTRATION_FAILED` with `retryable` metadata instead of a generic
internal error. Successful guild-scoped registration remains idempotent and unchanged.

## Phase 3 — YouTube native music MVP

Status: Implemented current slice; Discord Music core and native search, real thumbnails, provider tags, queue CRUD, live player state with playback clock, safe pending-queue recovery, local Windows queue/playback, local Windows seek, output selection, playlist detail management, Equalizer, hotkey controls, guild/channel integration, realtime native guild/voice reconciliation, freshness/retry indicators, abort-safe parallel Windows/Discord output, explicit SoundCloud availability control/test, native Windows output-device routing, native Windows credential vault UX, and the intentional Discord read-only seek boundary are implemented. Configured installed YouTube/pipeline acceptance is green; SoundCloud/vault live, device/manual, clean-machine, and signing gates remain.

Current Discord core: provider-neutral tracks, URL auto-detection, YouTube search/playback, optional SoundCloud official adapter, queue edit/shuffle/repeat/previous, guild playlists, permissions, Equalizer, and opt-in loopback control routes. Details: `docs/MUSIC_SPEC.md`.

Scope:

- Search input with explicit provider selection and loading state.
- Result cards with title, channel, duration, thumbnail, and safe external link.
- Enqueue/play actions with optimistic feedback and rollback on failure.
- Now Playing panel, queue reorder/remove, skip/pause/resume/stop.
- Separate output target: play to a Discord voice channel, directly to the Windows local audio device without joining Discord voice, or both.
- Error taxonomy: invalid URL, unavailable video, YouTube rate/block, voice permission, bot offline.

Acceptance criteria:

- Search-to-play works from the native app without Discord chat commands.
- Local playback works without joining a Discord voice channel; Discord playback still respects guild/voice permissions.
- Queue state converges after refresh and after a live update.
- Long titles, missing thumbnails, live videos, and empty results render safely.
- All icon-only actions have accessible names and tooltips.

Gate: end-to-end native flow from search to local playback and Discord voice playback, with YouTube regression coverage.

### LB-MUSIC-010 — Explicit SoundCloud availability control

Status: Implemented provider slice · official API plus native vault/env fallback

Scope: persist only a SoundCloud enabled/disabled flag, expose effective provider readiness, provide a redacted official API connection test, and keep all client credentials/tokens server-side. Native Settings controls availability; native Windows credential entry/clear is specified separately by `LB-MUSIC-012`.

Out of scope: user OAuth, cookies, private content, and provider-specific output devices. These remain separate decisions.

Contract: `GET /api/v1/providers`, `POST /api/v1/providers/soundcloud` with `{ enabled: boolean }`, and `POST /api/v1/providers/soundcloud/test`; local state is `data/provider-settings.json`, excluded from the credential-free backup.

Acceptance: malformed settings quarantine safely; disabled SoundCloud returns a stable error without affecting YouTube; enabling without credentials fails clearly; test responses contain no secret fields; native Settings exposes toggle/test states; root/native checks remain green.

### LB-MUSIC-012 — Native SoundCloud credential vault

Status: Implemented native Windows slice · installed-build and live provider acceptance remain release gates

Scope and contract: see `docs/SOUNDCLOUD_CREDENTIALS_SPEC.md`. Native Settings writes bounded official SoundCloud credentials to Windows Credential Manager through Tauri-only commands; only a stored/not-stored boolean crosses back to the UI. The native shell injects vault values into its owned Node child at startup, with `.env` as fallback. The control API, backups, logs, and screenshots never receive the secret; saving or clearing requires a native-owned bot restart.

Acceptance: Rust validation tests, `cargo check`, native typecheck, and UI build pass; manual Windows save/clear/restart/provider live path remains required.

### LB-RUNTIME-006 — Transactional local backup restore

Status: Implemented backend/native slice · installed-build, failure-injection, and upgrade compatibility acceptance remain release gates

Scope and state contract: see `docs/RECOVERY_SPEC.md`. The loopback route accepts only an explicit `{ confirm: true, backup }` version-one envelope, rejects sensitive-looking keys, creates a pre-restore recovery copy, stages all ten known local stores, atomically installs them, and rolls back on an installation failure. Native Settings adds local JSON import and an explicit native-owned restart-to-apply action; it clears the pending state only after the control bridge reports Ready.

Contract: `POST /api/v1/data/restore` returns fixed store names, `restartRequired: true`, and a recovery filename. It returns stable `RESTORE_CONFIRMATION_REQUIRED`, `INVALID_BACKUP`, `RESTORE_FAILED`, and `BODY_TOO_LARGE` errors without exposing paths or payloads.

Acceptance: deterministic tests cover valid ten-store restore, sensitive/incompatible rejection without mutation, recovery copy retention, and injected install rollback. Native typecheck/Vite build and root tests pass; `LB-QA-011` covers the current configured installed restore contract, while failure-injection on the artifact, upgrade compatibility, and Settings UX remain pending. The shared migration runner is implemented; concrete store migrations remain schema-change scoped.

### LB-RUNTIME-007 — Persistence migration runner

Status: Implemented shared runtime slice · no current store schema changed

Scope: provide an opt-in, deterministic one-step migration chain for versioned local JSON stores. A complete chain is cloned, validated by the current store guard, atomically persisted, and returned with `migrated: true`. Future versions, missing steps, invalid output, thrown migrations, and failed writes never become active data.

Out of scope: guessing undocumented legacy formats. Each real schema change must add its own requirement, ADR, fixture, migration, backup/restore compatibility decision, and retry-after-restart test.

Contract and state matrix: `docs/PERSISTENCE_SPEC.md`.

Acceptance: `src/persistence.test.ts` covers a two-step `v0 -> v1 -> v2` chain, atomic persistence, future-version quarantine, and migration state reporting. Current stores remain version `1` until a concrete schema change is approved.

### LB-RUNTIME-008 — Windows crash-safe process ownership

Status: Implemented native slice · clean installed-build acceptance remains a release gate

Scope: attach every native-owned Windows bot child to a private Job Object with `KILL_ON_JOB_CLOSE`; preserve explicit process-tree shutdown and fail closed if job attachment cannot be established. External listeners on port `2901` remain untouched and are never adopted.

Acceptance: graceful close and unexpected native termination stop the complete owned child tree; an external port owner remains running and is reported as unowned; Rust checks and forced-termination smoke evidence are recorded in `docs/AUDIT_STATUS.md`.

### LB-RUNTIME-009 — Fail-closed explicit stop ownership

Status: Implemented native hardening · installed-build failure/retry observation remains a release gate

Scope: retain the owned child slot until `stop_bot` has terminated and waited for the process successfully. A failed stop remains retryable and cannot silently turn a live owned child into an unowned process.

Acceptance: Rust checks pass; the stop path clears ownership only after successful termination or an already-exited child; the installed UI does not claim stopped while its owned child remains alive.

### LB-RUNTIME-015 — Deterministic Windows child-tree termination regression

Status: Implemented native regression coverage · installed failure/retry observation remains a release gate

Scope: keep the native-owned shutdown contract executable at the Rust layer. A short-lived local
Windows process fixture must be stopped through the same recursive termination path used by the
bot runtime and must be reaped before ownership can be released; no external listener or user data
is touched.

Acceptance: the Windows Rust test confirms `taskkill /T /F` plus `wait` terminates and reaps the
exact fixture tree. This supplements, but does not replace, installed close/retry and unexpected
native termination acceptance.

### LB-RUNTIME-016 — Bounded automatic recovery for the native-owned bot child

Status: Implemented native supervisor · current configured installed acceptance is green
Owner decision: approved for the enterprise autopilot roadmap

Scope: when the native-owned bot child exits unexpectedly after an explicit native start or
application startup, the native supervisor may restart only that owned child. The policy uses
bounded 1/2/4-second backoff, allows at most three consecutive recovery attempts, resets the
counter after a stable 30-second child lifetime, and reports `stable`, `restarting`, or
`exhausted` through the existing native `bot_status` DTO. A manual Stop, native shutdown, or an
external listener on `127.0.0.1:2901` disables recovery; a failed configuration/spawn path never
adopts or terminates an external process.

Out of scope: auto-join, auto-play, current-track/resource restoration, Discord session recovery,
remote restart, unbounded retry loops, or changing the persisted player-state contract.

Given the native app owns a running bot child, when that child terminates unexpectedly, then the
supervisor attempts the bounded restart policy and the native UI shows the recovery state. When
the operator explicitly stops the bot or closes the app, then no restart is attempted and the
owned process tree still terminates before ownership is released.

Failure states: an external port owner, invalid packaged runtime, repeated spawn failure, or
three exhausted attempts produces `exhausted`/offline state with a manual retry path. Recovery
must never report Ready merely because a child process exists; the existing control health gate
remains authoritative.

Acceptance: deterministic backoff/attempt-limit tests, native typecheck/build, Rust tests and
Clippy pass; `npm run native:smoke:crash-recovery` kills only the installed runtime child and
observes a new child plus sanitized health `ready` while preserving isolated profile cleanup.
The existing `npm run native:smoke:crash` remains the forced-root orphan-guard test and must
continue to prove that closing/terminating native stops the child without recovery.

### LB-RUNTIME-010 — Reproducible release bundle hygiene

Status: Current · release staging implemented; final installed-build acceptance remains pending

Scope: keep Tauri release resources limited to the compiled runtime and production dependencies. Rebuild the staging directory from scratch, exclude source maps and package test/spec files, and remove unused Vite/Tauri starter assets after reference checks. Preserve source, tests, specifications, design references, `.env`, and user data.

Out of scope: deleting generated `dist`/`target`/cache from the workspace, deleting test or documentation files, pruning dependencies without import and clean-install evidence, or modifying user data. Those actions remain governed by `docs/CLEANUP_CHECKLIST.md`.

Acceptance: `npm run native:build` passes; the generated runtime contains no source maps or test/spec-named files; native UI output contains no starter assets; root/native typechecks and tests remain green; release artifacts are recorded with hashes.

### LB-RUNTIME-011 — First-run packaged configuration guidance

Status: Current · packaged-build visual acceptance remains part of the release gate

Scope: expose only non-secret native runtime metadata so an installed user can find the app-local `.env` location when the packaged bot is not ready. Native Settings shows the real path, file-presence state, required variable names, and the need to restart/start the native-owned runtime, and provides a native opener action for that directory. Debug mode keeps using the workspace `.env` contract and does not present the packaged path as the setup location.

Out of scope: reading or validating secret values in Rust/UI, copying `.env`, creating credentials, or reporting readiness from file presence alone.

Acceptance: `native_runtime_info` is metadata-only; packaged missing-config state is actionable and honest; the opener uses only the returned app-data path and shows an inline retryable error; no secret crosses IPC or appears in logs; root/native checks and Rust checks pass.

### LB-MUSIC-013 — Bounded provider metadata requests

Status: Current implementation · installed/live provider acceptance remains separate

Scope: protect the local control plane and upstream provider boundaries from accidental search/resolve loops while preserving independent Discord/Windows stream sessions. Search and direct metadata resolve use an in-memory rolling budget of 30 requests per provider per 60 seconds. Excess calls return a retryable typed error and HTTP 429; YouTube and SoundCloud budgets are independent, all-source search can retain results from a non-limited provider, and stream lifetime is not rate-limited.

Acceptance: deterministic fake-clock tests cover provider isolation, expiry, reset, typed error mapping, and no impact on stream sessions; existing Music tests and root/native checks remain green.

### LB-MUSIC-014 — Discord seek policy for the stream-pipe architecture

Status: Accepted and implemented as read-only for the current release.

Discord progress is telemetry-only because the current provider-to-voice pipeline is a non-seekable stream. The native Windows player keeps independent local seek. Adding Discord seek requires a new seekable/cache-aware media architecture, buffering contract, cleanup rules, and live QA; it must not be emulated by restarting or offsetting the current pipe.

Acceptance: native and command contracts expose no draggable/successful Discord seek action; documentation records this as an intentional boundary rather than an open product decision.

### LB-MUSIC-015 — SoundCloud creator attribution metadata

Status: Implemented · official API metadata normalization

SoundCloud responses may expose `metadata_artist` separately from the uploader profile. Normalize that field into the existing provider-neutral `channel` DTO, with a non-empty uploader-name fallback, while retaining provider URL/source tag for attribution. Do not expose raw provider payloads or broaden the provider scope.

Acceptance: deterministic preferred/blank/missing metadata tests pass; root/native checks and static/docs audits remain green; native player still exposes SoundCloud source identity and link context.

### LB-MUSIC-016 — SoundCloud current URN and HLS AAC playback contract

Status: Implemented · configured live acceptance remains separate

Scope: align SoundCloud playback with the current official API/OpenAPI contract. Require `urn` as the track identity, reject numeric-only records, request `/tracks/{track_urn}/streams`, and select `hls_aac_160_url` with `hls_aac_96_url` fallback. Model provider audio as either a byte stream or an HTTPS media URL so FFmpeg can consume YouTube's pipe and SoundCloud's HLS manifest without scraping or pretending that a manifest is audio bytes. Progressive MP3 and the removed singular `/stream` route are not valid release fallbacks. The current product scope is public-only and uses Client Credentials; user-scoped Authorization Code/PKCE, cookies, and private-content access require a separate approved SDD requirement.

Acceptance: deterministic URN/encoded-endpoint/stream-selection tests pass; player and local-audio control paths compile and preserve independent Discord/Windows lifecycle; root/native checks and static/docs audits remain green. Configured SoundCloud live HLS playback and installed-vault acceptance remain release gates.

### LB-MUSIC-017 — SoundCloud single-use refresh recovery

Status: Implemented · deterministic recovery covered; configured live credential rotation remains a release gate

Scope: when a cached SoundCloud refresh token is rejected as invalid or expired, discard that
single-use token and obtain a fresh app token through the documented Client Credentials flow.
Transient network failures must remain retryable and must not discard a usable refresh token. No
credential or token value may enter logs, DTOs, backups, or native UI state.

Acceptance: deterministic tests distinguish invalid-auth fallback from transient network failure
and execute the rejected-refresh → fresh Client Credentials flow through a mocked HTTP boundary;
the official Basic-auth Client Credentials header and refresh request contract remain unchanged;
provider rate-limit behavior is preserved; root/native checks and static/docs audits remain green.
Configured live token expiry/rotation remains a provider acceptance gate.

### LB-MUSIC-018 — Player action dispatch correctness

Status: Implemented in the control-plane action dispatcher · installed playback acceptance is tracked by `LB-QA-009`.

Scope: every supported `player/action` operation must end in exactly one intentional branch. A
successful `pause`, `resume`, `skip`, `previous`, `volume`, `shuffle`, or `repeat` operation must
return the updated player snapshot; `stop` remains valid when no player exists so cleanup is
idempotent. Unsupported actions must return `INVALID_ACTION`, while state preconditions retain
their typed `PLAYER_*` errors. No successful operation may fall through to `INVALID_ACTION`.

Acceptance: deterministic control contracts remain green, and the configured installed YouTube
smoke exercises pause/resume/stop through the packaged control bridge without printing payloads.

### LB-MUSIC-019 — Direct Guild / Voice Readiness Flow

Status: Implemented in the current source slice · installed visual/accessibility and authorized live acceptance remain release gates

Scope: add a Music-owned guild/channel context flow backed by real Discord discovery and a
channel-effective readiness contract. The native selector resets stale channel/readiness state on
guild change, reports `ready`, `missing_permission`, `unknown`, and `unsupported`, and never
auto-joins or moves the bot during selection. Discord play/join/playlist operations revalidate
`ViewChannel`, `Connect`, and `Speak` at operation time; Windows-only playback remains independent.

Out of scope: permission mutation, Stage speaker semantics, auto-join, remote exposure, raw
Discord objects, or a second real-time transport.

Contract: `GET /api/v1/guilds/:guildId/channels/:channelId/music-readiness` returns the structured
readiness DTO from `docs/MUSIC_SPEC.md`; typed operation errors include the same DTO under
`error.details.readiness`. The native Music modal owns selection, loading/error/retry, and honest
disabled states, while existing SSE/polling remains the reconciliation mechanism.

Acceptance: deterministic voice/control tests cover channel overwrite precedence, unknown cache,
Stage/invalid/foreign channels, operation-time rejection, and structured responses; native
typecheck/build plus stale guild/channel state checks pass; no selection action invokes join/move.

### LB-OPS-001 — Operator Readiness & Diagnostics

Status: Implemented additive control/native slice · live configured acceptance remains a release gate

Scope: expose one bounded, secret-free readiness snapshot for the selected runtime profile,
loopback control boundary, native ownership presence, Discord gateway, visible guild count,
provider availability, and privileged-intent configuration. The native Settings surface presents
the snapshot with explicit ready/starting/degraded, offline, loading, and retry states.

Out of scope: remote exposure, authentication, telemetry upload, mutation, automatic provider or
intent enablement, filesystem paths, credentials, and replacement of `/health` or `/providers`.

Contract: `GET /api/v1/diagnostics` and the domain classifier in `src/runtime-diagnostics.ts`.
Optional SoundCloud/Ollama and privileged intents are informational when disabled or unconfigured;
only core gateway/ownership/control-boundary failures can degrade the runtime status.

Acceptance: domain tests cover ready, starting, degraded ownership, optional integrations, and
non-native profiles; control tests verify the exact DTO is bounded and does not expose the runtime
owner marker; native typecheck/build, root regression, headless verification, and docs/static audits
remain required.

### LB-RUNTIME-013 — Reproducible installed-artifact smoke gate

Status: Implemented QA tooling · configured installed readiness is evidenced on the current machine; clean-machine and playback acceptance remain separate release gates

Scope: provide a repeatable Windows smoke check for the version-matched NSIS artifact. The gate installs into a system-temp directory, verifies the installed native executable and bundled production runtime, refuses to launch when the real app-local `.env` exists, removes credential/configuration variables from the smoke process environment, redirects the child process's `LOCALAPPDATA`, `APPDATA`, `TEMP`, `TMP`, and `WEBVIEW2_USER_DATA_FOLDER` to isolated directories inside that temporary installation, and passes the test-only `LOCALBOT_INSTALLER_SMOKE=1` plus a temp-scoped `LOCALBOT_INSTALLER_SMOKE_DATA_DIR` marker so the Tauri shell's own app-data path is isolated too. It starts the native window briefly, stops its exact process tree, runs the generated uninstaller, and removes only the temporary installation and isolated app/browser data.

Out of scope: claiming bot `ready`, Discord login, SoundCloud credentials, playback, autostart/reboot, clean-machine isolation, accessibility, or visual acceptance. The gate must never read or print secret values and must never terminate an external LocalBot process.

Contract: `npm run native:smoke` is Windows-only and uses the installer matching the version in `package.json` unless an explicit installer path is supplied. The two installer-smoke markers are accepted only by the native test path and the data marker must be an absolute child of the current system temp directory. It emits only sanitized status fields and fails closed on missing runtime files, an existing real app-local `.env`, early native exit, failed process-tree stop, failed uninstall, invalid isolation paths, unsafe temporary-path cleanup, or any change detected by its before/after SHA-256 snapshot of the real app-data profile.

Acceptance: the smoke script runs successfully against the current NSIS artifact and reports `realAppDataChanged:false`; `runtime/node.exe`, `runtime/dist/index.js`, and `runtime-manifest.json` are present; the installed native process remains alive through the startup window and exits after exact-tree termination; isolated app-data is removed with the temporary install; syntax, root typecheck, and the existing artifact verifier remain green.

### LB-QA-008 — Configured installed-native readiness

Status: Current for the configured machine profile · clean-machine, playback, autostart/reboot, and manual UX acceptance remain separate release gates.

Scope and contract: provide an explicit opt-in acceptance path for the version-matched NSIS artifact when the operator has already configured the workspace `.env`. `npm run native:smoke:configured` installs into a system-temp directory, links the existing `.env` into the temporary app-local Tauri profile without copying or printing secret values, starts the packaged native executable, waits for the sanitized loopback health envelope `{ status: "ready", service: "localbot-control", version: "v1" }`, then stops the exact native-owned tree, uninstalls, and removes only temporary files.

The configured smoke must never expose credential values, print raw runtime logs, mutate guild resources, adopt an external listener, or claim Music playback. It is intentionally not a clean-machine test: it proves configured packaged readiness on the current Windows profile only.

Acceptance evidence: 2026-09-04 `npm run native:smoke:configured` passed with `configuredRuntimeReady:true`, `nativeProcessTreeStopped:true`, `isolatedAppData:true`, `realAppDataChanged:false`, and `temporaryInstallRemoved:true`. The installed-build playback, SoundCloud/vault, Windows sink, autostart/reboot, upgrade/restore, accessibility, and signing gates remain open.

### LB-QA-009 — Configured installed YouTube playback smoke

Status: Implemented opt-in acceptance · current-machine configured installed YouTube/Discord evidence is green; clean-machine and other sink/provider gates remain separate.

Scope and contract: extend the configured installer harness with `npm run native:smoke:music`.
After packaged health reaches `ready`, the harness must discover the authorized QA guild from
`LOCALBOT_QA_GUILD_ID` (default `1541307192534241318`), select only a real voice channel with
Connect/Speak permission and no existing LocalBot voice session, search a real YouTube query,
require a normalized HTTPS thumbnail, and exercise `player/play` → observed `playing` → `pause`
→ `resume` → `stop` → `voice/leave`. The harness must verify the player identity/channel and
final disconnected state using sanitized response checks only.

The smoke must refuse to mutate an already-active voice session, never print track/provider
payloads, URLs, credentials, or member data, never send messages or moderation actions, and always
attempt stop/leave before terminating the exact native-owned process tree. It proves installed
YouTube/Discord playback only; it does not claim SoundCloud, Windows sink isolation, autostart,
clean-machine, restore, accessibility, or signing acceptance.

Acceptance evidence: 2026-09-04 `npm run native:smoke:music` passed with packaged health ready,
real YouTube thumbnail validation, play/pause/resume/stop/leave state checks, exact process-tree
shutdown, `realAppDataChanged:false`, and temporary-install removal. The test used only the
authorized QA guild and refused active sessions; no raw provider or member data was emitted.

### LB-QA-010 — Installed parallel Discord/local-audio pipeline smoke

Status: Implemented opt-in acceptance · current-machine installed pipeline isolation is green; full native WebView output-device acceptance remains manual.

Scope and contract: while the configured installed YouTube smoke has a real Discord player in
`playing`, open the guild-scoped `local-audio` stream for the same real track, require HTTP 200
with `audio/mpeg` and at least one non-empty audio chunk, cancel only that local request, then
verify the Discord player remains on the same voice channel/current provider and is still
`playing`. The test must not print stream URLs, provider payloads, credentials, or member data.

The local request is a pipeline-isolation check, not proof that a Tauri WebView selected the
correct Windows device. It must never change Discord playback state; installed output-device
selection, device loss, fallback, and actual audible dual-output behavior remain separate manual
acceptance gates.

Acceptance evidence: 2026-09-04 `npm run native:smoke:music` passed the `LB-QA-010` checks with
`installedLocalAudioPipeline:true`, HTTP `audio/mpeg`, a non-empty audio chunk, Discord still
playing on the tested voice channel after cancellation, exact process-tree shutdown,
`realAppDataChanged:false`, and temporary-install removal. No raw stream URL or provider payload
was emitted.

### LB-QA-011 — Installed backup/restore contract smoke

Status: Implemented opt-in acceptance · current-machine installed backup/restore contract is green; failure-injection and upgrade compatibility remain separate.

Scope and contract: add an opt-in `npm run native:smoke:recovery` path that starts the configured
installed runtime, exports the credential-free `localbot-backup` envelope, restores that same
validated envelope with explicit `confirm:true`, and verifies `restartRequired:true` plus the
complete known-store list. The test must run only inside the temporary app profile, never print
backup contents or credentials, and remove the profile/install afterwards.

It does not prove native Settings file-picker UX, crash recovery, cross-version migration, or
upgrade persistence; those require separate installed/manual evidence.

Acceptance evidence: 2026-09-04 `npm run native:smoke:recovery` passed the credential-free
`localbot-backup` export and explicit restore, verified all 10 known stores and
`restartRequired:true`, stopped the exact native-owned tree, removed the temporary install/profile,
and reported `realAppDataChanged:false`.

### LB-QA-012 — Installed restart no-auto-join/no-auto-play smoke

Status: Implemented opt-in acceptance · current-machine configured installed restart semantics are green; clean-machine/crash and reboot acceptance remain separate.

Scope and contract: add an opt-in `npm run native:smoke:restart` path on the configured installed
runtime. Before restart, it must refuse an already-active QA voice session or player. It then stops
the exact native-owned process tree, starts the same installed app/profile again, waits for sanitized
health `ready`, and verifies the authorized QA guild has no `botJoined` voice channel and no active
player. The smoke must be read-only with respect to Discord resources, never adopt or kill an external
port owner, never print credentials/provider/member data, and remove the isolated profile/install.

It does not prove crash recovery, migration/upgrade compatibility, Windows login autostart, or manual
native UI behavior; those remain separate release gates.

Acceptance evidence: 2026-09-04 `npm run native:smoke:restart` passed on the configured installed
profile, observed no auto-join and no auto-play after the controlled native restart, stopped the exact
process tree, removed the temporary install/profile, and reported `realAppDataChanged:false`.

### LB-QA-013 — Installed native slash-command registration parity

Status: Implemented opt-in acceptance · current-machine configured installed registration is green; command-by-command Discord interaction remains a separate gate.

Scope and contract: add an opt-in `npm run native:smoke:commands` path that calls the same
native-owned `/api/v1/commands/register` route used by the UI for the authorized QA guild. It must
confirm the guild-scoped result and the current 26-command contract without printing command payloads,
credentials, member data, or Discord response bodies. Registration is idempotent and scoped only to
the explicitly selected QA guild.

It does not claim that every slash command has been manually invoked or that destructive commands need
to be exercised; interaction coverage remains non-destructive and command-specific.

Acceptance evidence: 2026-09-04 `npm run native:smoke:commands` passed through the installed native
control bridge, confirmed 25 guild-scoped commands for `1541307192534241318`, stopped the exact
process tree, removed the temporary install/profile, and reported `realAppDataChanged:false`.

### LB-QA-014 — Dependency-isolated packaged runtime

Status: Implemented QA tooling · current-machine dependency isolation is green; physical clean-machine acceptance remains separate

Scope and contract: add `--dependency-isolated` to the installed NSIS smoke harness. The native
child receives a minimal Windows system `PATH` and no `NODE_PATH`, `NODE_OPTIONS`, npm prefix, or
npm user-config hints. The harness must still launch the bundled `runtime/node.exe` by the native
resource path, reach sanitized readiness, and clean its temporary app/browser data. The optional
Music variant must additionally exercise real YouTube/Discord playback and the independent local
audio pipeline. The host Node process may orchestrate the test; it is not evidence that the
installed application depends on host Node/npm.

Out of scope: claiming a different physical machine, Windows reboot/login behavior, SoundCloud
credentials, visual/accessibility acceptance, or code signing. The test must never copy or print
credentials and must preserve the real app-data snapshot boundary.

Acceptance evidence: `npm run native:smoke:isolated` and
`npm run native:smoke:music:isolated` pass with `configuredRuntimeReady:true`, the expected
Music fields for the latter, `nativeProcessTreeStopped:true`, `isolatedAppData:true`,
`realAppDataChanged:false`, and `temporaryInstallRemoved:true`.

### LB-QA-015 — Forced native termination orphan guard

Status: Implemented QA tooling · installed configured evidence is green

Scope and contract: extend the configured NSIS smoke harness with an opt-in `--crash` mode
that starts the installed native app, waits for sanitized health `ready`, then force-terminates
only the exact native root PID (without `/T`). The gate must verify that the Windows Job Object
terminates the native-owned runtime child and that `127.0.0.1:2901` becomes unavailable, while
never touching an external listener or any process outside the installed native PID boundary.
The harness must still uninstall the temporary package, remove only isolated data, and preserve
the real app-data snapshot.

Out of scope: automatic restart, automatic Discord re-join/playback, recovery of active player
state, testing a native crash on the operator's live installation, or claiming clean-machine,
autostart, provider, device, visual/accessibility, or signing acceptance.

Given a configured installed native app owns the bot runtime, when the native root is forcibly
terminated, then the owned child tree is gone, the control port is unavailable, and the harness
reports cleanup success. A normal native close continues to use the existing deliberate stop path.

Failure states: if the root exits before readiness, if the port remains reachable after the
forced root termination, if the exact root cannot be terminated/reaped, or if temporary cleanup
changes real app data, the gate fails without claiming crash safety.

Acceptance evidence: 2026-09-04 `npm run native:smoke:crash` passed against the configured NSIS
artifact and reported `forcedTerminationVerified:true`, `nativeProcessTreeStopped:true`,
`realAppDataChanged:false`, and `temporaryInstallRemoved:true`; the exact native root was forced
to exit without `/T`, its owned child/control port disappeared, and temporary install data was
removed. Bounded child crash recovery is covered separately by `LB-QA-017`; clean-machine,
autostart, provider, device, visual/accessibility, and signing gates remain separate.

### LB-QA-017 — Installed native child crash recovery

Status: Implemented QA tooling · current configured installed evidence is green

Scope and contract: add an opt-in `--crash-recovery` path to the configured NSIS smoke. After
sanitized health `ready`, the harness refuses an active QA voice/player session, identifies only
the bundled `runtime/node.exe` whose parent is the exact installed native PID, and force-terminates
that child without `/T`. The native root must remain alive, create a replacement owned child, and
return sanitized control health `ready`. The test then stops the exact native root, removes only
the isolated profile/install, and preserves the real app-data snapshot.

Out of scope: killing native root, testing automatic Discord re-join/playback, restoring active
player state, external-process adoption, raw runtime logs, credentials, provider payloads, or
claiming clean-machine, autostart, SoundCloud, device, visual/accessibility, upgrade, or signing
acceptance. `LB-QA-015` remains the separate forced-root orphan-guard test.

Failure states: if the child cannot be identified exactly, the native root exits, no replacement
child reaches `ready` within 30 seconds, the port is held by an external process, or cleanup
changes real app data, the gate fails closed.

Acceptance: `npm run native:smoke:crash-recovery` reports
`crashRecoveryVerified:true`, `configuredRuntimeReady:true`, `nativeProcessTreeStopped:true`,
`isolatedAppData:true`, `realAppDataChanged:false`, and `temporaryInstallRemoved:true`.

Acceptance evidence: 2026-09-04 `npm run native:smoke:crash-recovery` passed against the rebuilt
configured NSIS artifact. The harness killed only the exact bundled `runtime/node.exe` child,
observed the native root remain alive, observed a replacement child reach sanitized health `ready`,
then stopped the root and cleaned the isolated install. It reported
`crashRecoveryVerified:true`, `configuredRuntimeReady:true`, `nativeProcessTreeStopped:true`,
`isolatedAppData:true`, `realAppDataChanged:false`, and `temporaryInstallRemoved:true`.

### LB-QA-016 — Installed SoundCloud official playback smoke

Status: Implemented QA tooling · credentialed live acceptance pending

Scope and contract: add an opt-in `--soundcloud` path to the configured NSIS Music smoke. The
installed native-owned runtime must use only the official SoundCloud OAuth client-credentials
boundary, search source `soundcloud`, require a normalized real HTTPS thumbnail and SoundCloud
identity, play the selected track into a discovered QA voice channel, observe `playing`, then
pause/resume/stop/leave and clean the isolated profile. The smoke must not print credentials,
tokens, raw provider payloads, stream URLs, or member data.

Out of scope: unofficial scraping, cookies, Spotify, SoundCloud content bypass, Windows audible
device acceptance, token values in logs, or silently falling back to YouTube when SoundCloud is
unconfigured/disabled. Missing or rejected credentials must produce a typed failure and leave
YouTube unaffected.

Given official SoundCloud credentials are configured through the native vault or env fallback and
the provider is enabled, when the operator runs the opt-in smoke, then the selected real
SoundCloud track reaches Discord `playing` and all cleanup/state checks pass. If credentials are
absent or the provider is disabled, the smoke fails with an actionable unavailable/configuration
result rather than claiming playback.

Acceptance: `npm run native:smoke:soundcloud` passes only on a credentialed Windows profile with
`installedSoundCloudPlayback:true`, exact native-owned cleanup, and
`realAppDataChanged:false`; deterministic provider tests and the existing YouTube/pipeline gates
remain green. On 2026-09-04 the opt-in run correctly failed closed at `503
SOUNDCLOUD_NOT_CONFIGURED` without a voice/player mutation; credentialed playback remains open.

### LB-UI-002 — Last-write-wins guild reconciliation

Status: Implemented native data-flow slice · manual installed visual/accessibility acceptance remains a release gate

Scope: protect guild-scoped native reads and live refreshes from out-of-order responses. When the operator changes the selected guild, or a newer refresh for the same surface starts, an older response must be discarded before it can replace player, voice-channel, playlist, Equalizer, Community, permission, onboarding, AutoMod, or audit state. The native UI also clears the previous guild's player snapshot at selection change and performs an immediate player read for the newly selected guild; SSE remains the live path and polling remains recovery-only.

Out of scope: optimistic writes, inventing local records, changing the Discord/API authority, cancelling a Discord operation that already reached the server, or persisting native UI state as backend truth.

Given a guild-scoped request is in flight, when the selected guild changes or a newer request for that surface completes first, then the older response and its stale error/loading transition do not mutate the currently selected guild's UI. If the bridge goes offline, late responses are ignored and the UI keeps the explicit offline/empty state.

Failure states: the current guild may show loading, stale, offline, empty, or retryable error state; no previous guild's track, channels, settings, or audit records may be presented as current data.

Contract: native refresh functions carry a per-surface request revision and selected-guild scope; only the latest revision whose guild still matches and whose bridge is online may commit state. The player endpoint is read once on guild selection in addition to the existing player SSE/polling recovery path.

Acceptance: native typecheck/build pass; source review confirms every guild-scoped refresh guards success, error, and loading commits; a manual slow-response test changes guilds while reads are pending and confirms that the new guild remains authoritative; the existing `npm test`, `npm run audit:static`, `npm run audit:docs`, and release smoke gates remain green.

### LB-UI-003 — Guild-scoped action response reconciliation

Status: Implemented native data-flow slice · manual rapid-switch/action acceptance remains a release gate

Scope: extend the selected-guild reconciliation rule from reads and SSE to responses from
guild-scoped writes and commands. Join/leave, player and queue actions, output-toggle handoff,
playlist CRUD, Equalizer, Music access, Community, onboarding, AutoMod/review, and slash
registration must capture the guild and monotonic selection revision that started the action. A
late response, error, toast, or loading transition from a previous guild
must not mutate the currently selected guild's UI. The server operation itself is not cancelled;
the server remains authoritative and the next current-guild refresh reconciles the result.

Out of scope: cancelling requests already accepted by Discord, optimistic cross-guild mutation,
cross-window synchronization, or hiding a real server-side failure.

Given a guild-scoped action is in flight, when the operator selects another guild (including a
return to the original guild) or a newer action
for the same surface supersedes it, then the old response cannot replace current state, clear a
current loading indicator, or show a success/error toast as if it belonged to the new guild. A
current-guild action may commit only while its guild is still selected and the bridge is online.

Acceptance: native typecheck/build pass; source review confirms action state commits and loading
cleanup are guild-guarded; deterministic root tests remain green; manual rapid guild-switch while
Join/Leave, player, playlist, and settings actions are pending confirms no cross-guild UI mutation.

## Phase 4 — Persistence, auth, and server management

Status: Partially implemented; local playlists, Music permissions, audit persistence, guild discovery, voice management, command registration, credential-free export, transactional local restore, and a shared opt-in migration runner are implemented. Local JSON stores now recover from a corrupted file instead of crashing (`LB-RUNTIME-004`). Concrete legacy schema migrations, multi-user OAuth, role mapping, and remote exposure remain intentionally out of scope for the current local-only slice.

- Add Discord OAuth2 only when multi-user administration is needed.
- Add richer persistent guild preferences; the bounded pending Discord queue/history/preferences recovery contract is already implemented by `LB-MUSIC-009`, while active playback and Windows session state intentionally remain non-persistent.
- Introduce role/permission mapping with least privilege; the current local control plane remains loopback-only and unauthenticated.
- Add audit log for dashboard actions; the bounded local slice is implemented, with a separate on-demand Discord read in `LB-LOG-006`.

Gate: threat model, auth tests, migration/backup story, and explicit permission matrix.

## Phase 5 — Multi-source media and universal links

Status: Partially implemented; YouTube + optional SoundCloud adapters, supported URL auto-detection, and native Windows output-device routing exist. Broader resolver/collection support remains planned.

Scope:

- Define a provider-neutral media contract and canonical track/collection model.
- Keep YouTube behind its adapter and add a universal link resolver for pasted URLs.
- Detect YouTube, SoundCloud, and future providers without leaking provider-specific shapes into the player or dashboard.
- Keep additional providers out of scope until explicitly approved; add them only through supported APIs and permitted playback/metadata behavior.
- Keep provider credentials server-side and feature-flag unfinished adapters.

Acceptance criteria:

- Existing YouTube search/play/queue behavior remains green.
- A pasted supported link resolves to a canonical media result; an unsupported link gets a useful explanation and recovery path.
- Provider failure, rate limiting, unavailable content, and missing metadata have stable error categories.
- The player and dashboard do not need provider-specific branching for basic queue operations.

Gate: contract tests for URL resolution and at least two providers, with YouTube regression coverage.

### LB-MUSIC-011 — Native Windows output-device routing

Status: Implemented native slice · device enumeration support varies by WebView

Scope: let the native Player enumerate real `audiooutput` devices and apply a selected device to the Windows-only audio sink through `setSinkId`. Persist only the opaque device ID in native local storage; keep Discord state and the control API independent.

Failure states: unsupported WebView, denied/failed enumeration, or a disconnected device falls back to the explicit system-default option and reports the limitation. No device is shown as selected until the browser call succeeds, and a Windows routing failure does not alter Discord playback.

Acceptance: native typecheck/Vite build pass; the control is real-data-only, feature-detected, keyboard labeled, responsive, and has no backend/Discord side effect. Manual device-loss, focus, and installed-build checks remain release gates.

## Phase 6 — Community progression

Status: Implemented through `LB-COMMUNITY-006`; per-guild XP with cooldown, levels, ranks, leaderboard command, native leaderboard, persistent local storage, ignored channels/roles, native exclusion pickers, per-guild cooldown override, bounded leaderboard pagination, member detail, confirmation-gated reset, bounded XP multipliers, and additive level role rewards are available. Richer role-policy/live hierarchy acceptance remains pending.

Scope:

- Add per-guild XP events, cooldowns, levels, ranks, and leaderboard views.
- Make XP rules configurable and transparent; prevent spam farming and bot/self-generated event abuse.
- Add dashboard summaries and member-facing command output without coupling progression to playback.

### LB-COMMUNITY-002 — Ignored channels and roles for XP awarding

Status: Current · Owner decision: approved; deterministic/API/native coverage is green and installed guild-scoped command-registration evidence now exists for QA guild `1541307192534241318`; command-by-command interaction QA remains a release gate

Scope: per-guild `ignoredChannelIds`/`ignoredRoleIds` lists in the existing `data/community.json` store, a `/community-config` slash command (`ignore-channel add|remove`, `ignore-role add|remove`, `show`) restricted to server managers (`ManageGuild`/`Administrator`), and skipping XP/message-count entirely for a message in an ignored channel or sent by a member holding an ignored role.

Out of scope: per-guild cooldown override, leaderboard resets, leaderboard pagination, and XP multipliers/role rewards — these are covered by later Community slices.

Given a guild manager has configured ignored channels/roles, when a non-bot guild message arrives in an ignored channel or from a member holding an ignored role, then `communityStore.recordMessage` returns `null` without incrementing XP or message count for that member; an unconfigured guild behaves exactly as before (no ignored channels/roles).

Failure states: an invalid subcommand target (channel/role already ignored, or not present when removing) replies with a clear no-op message instead of throwing; only server managers may change the lists, others receive a permission-denied reply consistent with `/music-access`.

Contract: `CommunityStore.getSettings(guildId)`, `addIgnoredChannel`/`removeIgnoredChannel`, `addIgnoredRole`/`removeIgnoredRole`; `recordMessage(guildId, userId, username, now?, context?)` takes an optional `{ channelId, roleIds }` context.

Acceptance: deterministic unit tests prove a message in an ignored channel and a message from an ignored-role member are both skipped, that removing the entry restores normal XP awarding, and that settings persist across a store restart; `npm test`/`npm run typecheck`/`npm run build` stay green.

### LB-COMMUNITY-006 — Native XP exclusion pickers

Status: Implemented deterministic/control/native slice · installed-build and live Discord interaction acceptance remain release gates

Scope: extend the existing Community settings route so the native app can add/remove bounded
ignored text-channel and role IDs using the selected guild's real discovery data. Keep slash
command operations, guild scoping, and the message-evaluation behavior unchanged.

Out of scope: permission mutation, role management, arbitrary remote administration, unbounded
fetches, and replacing the existing slash-command authorization boundary.

Contract and acceptance: see `docs/COMMUNITY_SPEC.md`. The route accepts at most 50 unique bounded
IDs per exclusion type and rejects malformed/oversized input without partial mutation. Native shows
loading/offline/missing-cache states and uses the server response as the committed state. The new
store/control regression and native typecheck/build evidence pass; installed visual and live
command/message acceptance remain separate gates.

### LB-COMMUNITY-003 — Per-guild cooldown and paginated leaderboard

Status: Current · Owner decision: approved for local-only administration · deterministic/API/native checks passed

Scope: add a backward-compatible per-guild `cooldownSeconds` override (`0..86400`, `null` for global default), expose Community settings through the control API and native UI, and add bounded leaderboard `limit`/`offset` pagination while preserving absolute rank. Extend `/leaderboard` with a page option and `/community-config` with a cooldown subcommand.

Out of scope: resets, XP multipliers/role rewards, member profile editing, remote auth, and moderation/AutoMod.

Acceptance: cooldown override is isolated per guild, reset and zero values work, invalid writes do not mutate data, paginated ranks remain continuous, local persistence is atomic/backward-compatible, native controls display real settings/leaderboard data, and slash registration/typecheck/test/build gates remain green. Evidence: `npm test` 51/51 at slice completion; current full suite is 73/73. Installed-build/live Discord round-trip remains release QA work.

Acceptance criteria:

- XP and leaderboard data are scoped to a guild and survive restart once persistence is introduced.
- Cooldowns and ignored channels/roles are testable and visible to operators.
- Ties, inactive members, resets, and pagination have defined behavior.

Gate: deterministic XP tests, permission review, and a documented guild configuration model.

### LB-COMMUNITY-004 — Member detail and confirmed progress reset

Status: Implemented control/native slice · live Discord command round-trip remains a release QA gate · owner decision: approved for local-only administration

Scope: expose the existing member rank contract in native Community and add a guild-scoped reset operation that requires explicit confirmation, preserves Community settings, and records a redacted audit event. Extend `/community-config` with `reset confirm:true`.

Out of scope: restore/undo, cross-guild operations, multipliers, role rewards, moderation, and remote authentication.

Acceptance: read requests never create data; reset removes only the selected guild's member progress; invalid/false confirmation is rejected without mutation; manager permission and native confirmation are enforced; deterministic tests, typecheck/build, and route/command documentation are green. Evidence: `npm test` 54/54 at slice completion; current full suite is 73/73. Installed-build/live Discord round-trip remains a release QA gate.

### LB-COMMUNITY-005 — XP multipliers and level role rewards

Status: Implemented deterministic/API/native slice · owner decision: approved for bounded local administration · live role hierarchy acceptance pending

Scope and contract: see `docs/COMMUNITY_SPEC.md` and ADR-034. Community settings now include a guild multiplier (`1..5`), up to 25 role multipliers (`1..5`), and up to 25 unique level rewards (`2..100`). Matching role multipliers use the largest value once. Eligible messages award the bounded calculated XP; the runtime attempts only safe, manageable role additions and never removes roles or mutates hierarchy.

Acceptance: invalid or oversized updates never partially mutate settings; old version-one stores retain x1/no rules; slash/native/API settings converge; role reward updates are idempotent; read-only eligibility does not create data; `npm test` is 76/76 and root/native checks pass. Live Discord role assignment and installed-build verification remain release gates.

## Phase 7 — Activity logs and onboarding

Status: Current first slices; bounded redacted audit persistence, optional retention pruning, secret-free retention metadata, searchable/filterable native activity, native retention policy editing, scoped JSON/CSV export, passive moderation-event telemetry, and the Welcome/Goodbye control plus real text-channel picker slices are available. Human actor attribution and richer moderation ingestion remain planned.

Scope:

- Add structured, searchable operational and moderation logs with safe redaction and guild scoping.
- Add welcome/goodbye text and image templates with preview, test-send, enable/disable, and failure feedback.
- Keep image handling bounded and safe; never expose local paths or secrets through Discord/dashboard output.

Acceptance criteria:

- Every dashboard or moderation action has an attributable event when logging is enabled.
- Log filters distinguish playback, configuration, moderation, permission, and system events.
- Welcome/goodbye messages can be previewed before sending and degrade gracefully when an image is unavailable.

Gate: redaction tests, retention decision, permission matrix, and an end-to-end preview/test-send flow.

### LB-ONBOARD-001 — Welcome/Goodbye templates and safe preview

Status: Implemented control/runtime first slice · live event acceptance requires explicit Discord Members Intent opt-in

Scope: add versioned local per-guild Welcome/Goodbye settings with enable/disable, target text channel, bounded text template, optional HTTPS image URL, token rendering, native configuration/preview/test-send, and event delivery when the operator explicitly enables the Discord Members Intent in the environment and Discord Developer Portal.

Out of scope: arbitrary local file upload, scraping/profile-image proxying, mass announcements, remote administration, and enabling a privileged Discord intent silently.

Contract: `GET/POST /api/v1/guilds/:guildId/greetings` reads/writes validated settings; `POST /api/v1/guilds/:guildId/greetings/preview` renders without sending; `POST /api/v1/guilds/:guildId/greetings/test-send` sends only the selected configured template to its configured channel. Native controls show intent-disabled/unconfigured/offline/error states honestly. Tokens are `{user}`, `{username}`, `{guild}`, and `{memberCount}`.

Failure states: invalid channel/template/image is rejected without mutation; missing text-channel permission produces a typed test-send failure; event delivery failures are logged safely; the feature remains inert when Members Intent is disabled.

Acceptance: deterministic store/template/validation tests, control route tests, native typecheck/build, and a safe preview/test-send fixture pass. Live join/leave event verification requires the owner to enable the privileged intent and must not mass-message the QA guild.

Evidence: `npm test` covers default/persistence/validation/rendering, control GET/POST/preview/test-send, invalid-kind rejection, and non-mutating failure paths. Native typecheck/Vite build pass; live join/leave events remain intentionally untested until the operator enables the privileged intent in Discord Developer Portal.

### LB-ONBOARD-002 — Real text-channel picker for greetings

Status: Implemented control/native slice · live permission verification remains part of the Discord QA gate

Scope: expose real guild text and announcement channels with their current bot permissions, and use that list in the native Welcome/Goodbye editor instead of requiring manual channel IDs. The saved ID remains visible if Discord temporarily omits the channel from cache.

Out of scope: channel creation, permission mutation, forum/thread delivery, and selecting a channel the bot cannot see or send to.

Contract: `GET /api/v1/guilds/:guildId/text-channels` returns `{ channels: [{ id, name, category, position, canSend, canEmbed }] }`, sorted by Discord position. Native disables channels with `canSend:false`, keeps an honest empty/offline state, and persists only the selected ID through the existing greetings update route.

Failure states: missing guild returns the existing guild error; unavailable/permission-unknown channels are not presented as sendable; refresh failure clears the discovered list and shows an error without overwriting the saved template.

Acceptance: deterministic channel-summary permission test, native typecheck/build, and control route coverage; no permission mutation or fake channel is allowed.

### LB-LOG-001 — Searchable redacted audit activity

Status: Implemented first slice · Owner decision: approved for local-only audit data

Scope: keep the existing bounded local audit store, add case-insensitive search across actor/action/detail, an action-prefix filter, and guild scoping. The native Community activity panel exposes these filters and only reports results returned by the control API.

Out of scope: Discord's server-side audit-log API, moderation event ingestion, retention configuration, remote access, and unredacted diagnostic payloads.

Contract: `GET /api/v1/audit-log?limit=...&guildId=...&action=...&search=...` returns `{ entries }`. `action` matches an exact action or action namespace prefix (for example `player` matches `player.play`); `search` matches actor, action, or detail case-insensitively. Query values are bounded and invalid values return the standard `INVALID_QUERY` error.

States: native shows loading skeletons, empty filtered results with a reset/retry action, offline/error feedback, and the selected guild scope. Filter controls do not claim success until the API response arrives.

Acceptance: deterministic store tests prove guild/action/search filtering and newest-first ordering; control-route tests prove the query contract and bounded validation; native typecheck/build pass; no secret or raw provider payload is returned.

### LB-LOG-002 — Retention and write-time redaction

Status: Implemented deterministic/control slice · native policy editing is covered by `LB-LOG-003`; richer moderation ingestion and installed-build/live acceptance remain planned · owner decision: approved for local-only operations

Scope: add an optional `LOCALBOT_AUDIT_RETENTION_DAYS` policy (bounded to `1..3650`, unset means retain the existing bounded 2,000-entry store), prune expired entries on load/write, and redact credential-like key/value material plus oversized detail strings before persistence. Expose the effective policy through a secret-free control metadata route.

Out of scope: importing Discord's remote audit-log API into the local store, remote administration, unredacted provider payloads, arbitrary deletion from the native UI, and changing existing event ownership semantics.

Contract: `GET /api/v1/audit-log/settings` returns `{ retentionDays: number | null, maxEntries: 2000 }`; `GET /api/v1/audit-log` applies the same retention boundary. Invalid/missing timestamps are retained for manual inspection but remain bounded; no token, cookie, secret, authorization header, or raw provider response may be persisted.

Acceptance: deterministic tests prove retention filtering, bounded storage, write-time redaction/truncation, safe defaults, metadata response, and failure non-mutation; current search/guild/action filters remain green. Evidence at the combined current slice is tracked in `docs/AUDIT_STATUS.md`; native policy editing is implemented by `LB-LOG-003`, while installed-build/live acceptance remains pending.

### LB-LOG-003 — Native audit retention policy editing

Status: Implemented local policy/control/native slice; importing remote Discord moderation data, arbitrary deletion, and installed-build/manual acceptance remain planned. The separate read-only remote view is `LB-LOG-006`.

Contract and state matrix: see `docs/AUDIT_LOG_SPEC.md`. Native Community can read and update the local `retentionDays` policy (`null` or `1..3650`) through `POST /api/v1/audit-log/settings`. Successful control-plane mutations, including Equalizer preset/band updates, emit a metadata-only local audit event before the success response; read-only search/preview routes are not mutation events. The version-one audit file stores this non-secret metadata alongside entries, remains compatible with legacy files without settings, prunes atomically on update, and keeps the hard 2,000-entry limit.

Acceptance: invalid updates do not mutate the previous policy or entries; successful updates return the normalized server-confirmed value; backup remains credential-free; native loading/offline/error states remain honest.

### LB-LOG-004 — Scoped JSON/CSV audit export

Status: Implemented local/control/native slice; remote export, richer permission review, and installed-build/manual acceptance remain planned.

Contract and state matrix: see `docs/AUDIT_EXPORT_SPEC.md`. `GET /api/v1/audit-log/export` requires one `guildId`, supports the existing bounded action/search filters, caps output at 100 entries, and returns a redacted JSON or CSV attachment. Native Community exports the selected guild using the current filters and disables the action while offline or busy. There is no all-guild export, raw diagnostic mode, or delete action.

Acceptance: deterministic control tests cover scope, isolation, redaction, JSON/CSV shape, and invalid format; native typecheck/build and release build pass; manual download/opening in the installed native window remains a release check.

### LB-LOG-005 — Passive Discord moderation-event telemetry

Status: Implemented passive event slice; actor attribution inside passive events, remote import, enforcement, and installed-build/manual acceptance remain planned. On-demand Discord reads are covered separately by `LB-LOG-006`.

Contract and state matrix: see `docs/AUDIT_MODERATION_SPEC.md`. Existing Discord events for message delete, bulk delete, channel delete, and role delete create minimal redacted audit records with no content or actor guess. No privileged intent or destructive action is added; write failures do not block the bot.

Acceptance: deterministic formatter tests cover shape, malformed IDs, bounded bulk counts, and content exclusion; root tests/typecheck/build pass; live QA remains observation-only.

### LB-LOG-006 — On-demand Discord audit-log view

Status: Implemented bounded read slice; remote export, Discord mutation, and installed-build/manual acceptance remain planned.

Contract and state matrix: see `docs/AUDIT_DISCORD_SPEC.md`. `GET /api/v1/guilds/:guildId/audit-log/discord?limit=...` reads at most 100 official Discord audit entries for the selected guild, requires the bot's `ViewAuditLog` permission, returns only minimal metadata, and keeps the result in memory. Native Community separates this source from LocalBot's local retention and export view.

Failure states: not-ready, missing permission, Discord fetch failure, missing guild, offline, empty, and loading are explicit; remote failures never appear as fresh local activity.

Acceptance: deterministic reader/control tests cover permission gating, bounded request, newest-first minimal DTO, omission of reason/changes/raw payload, and normalized provider failure; native typecheck/build pass. Live QA is read-only and may use guild `1541307192534241318`.

### LB-LOG-007 — Metadata-only Discord command accountability

Status: Implemented runtime/helper slice; live command round-trip and installed-build acceptance remain release gates.

Contract: see `docs/COMMAND_AUDIT_SPEC.md`. Every slash-command interaction records one local,
guild-scoped event with the Discord actor, command name, optional subcommand, and `success`,
`denied`, or `error` outcome. Search text, URLs, playlist names, provider payloads, tokens, and
message content are excluded. The existing audit store supplies redaction, retention, atomic
persistence, and bounded export.

Acceptance: deterministic helper tests prove all outcomes and argument exclusion; a `finally` path
in `handleCommand` covers early returns and handled failures; a failed telemetry write cannot change
the user-facing command result. No destructive Discord action is needed for this gate.

### LB-LOG-008 — Awaited mutation audit boundary

Status: Implemented control-plane hardening; installed-build/manual acceptance remains a release gate.

Contract and state matrix: see `docs/AUDIT_LOG_SPEC.md`. Every successful state-changing Control API
operation awaits the common metadata-only audit attempt before committing its HTTP success response.
The request's injected `AuditLogStore` is propagated to every mutation call site, so isolated
runtime/test stores cannot be bypassed by the process-global default. Audit failure remains isolated
from the primary operation, is redacted, and never becomes an unhandled rejection. Read-only
search, health, preview, and stream routes do not emit mutation events.

Acceptance: control tests prove Equalizer mutation response ordering and isolated audit-store
coverage; source inspection confirms all Control API mutation audit calls are awaited and use the
request-scoped store; root tests/typecheck/build, static/docs audits, and native release checks
remain green.

## Phase 8 — AutoMod and server safety

Status: `LB-SAFETY-001`/`LB-SAFETY-002` dry-run detector/editor, `LB-SAFETY-003` bounded message enforcement, `LB-SAFETY-004` anti-raid/anti-nuke telemetry, `LB-SAFETY-005` per-guild memory reset, `LB-SAFETY-006` emergency safe-mode recovery, `LB-SAFETY-007` bounded redacted review queue, and `LB-SAFETY-008` explicit Message Content Intent capability gating implemented; public appeals and installed-build acceptance remain planned and high-risk.

Scope:

- AutoMod rules for spam, flood, malicious links, and scam patterns.
- Anti-raid detection and response with thresholds, quarantine/lockdown options, and operator override.
- Anti-nuke protection for destructive permission/channel/role changes with emergency disable and recovery guidance.
- Start with audit/dry-run mode; enforcement must be explicit and observable.

Acceptance criteria:

- Every rule has scope, action, reason, cooldown/rate limit, exemption, and audit event.
- Safety actions respect Discord permissions and fail safely when permissions are missing.
- False positives can be reviewed, overridden, and traced; no destructive bulk action is silent.
- Emergency disable is available and protected by explicit operator permission.

Gate: threat model, adversarial tests, dry-run results, least-privilege review, and rollback/recovery procedure.

### LB-SAFETY-001 — AutoMod dry-run detection

Status: Implemented deterministic/control slice · owner decision: approved for local-only administration

Contract and state matrix: see `docs/SAFETY_SPEC.md`. The first slice persists disabled-by-default per-guild spam/flood/link/scam rules, supports exemptions and proposed-action metadata, evaluates only non-bot messages, and records redacted dry-run audit matches. It never deletes, times out, bans, locks down, changes permissions, or performs anti-raid/anti-nuke actions.

Acceptance gate: deterministic evaluator/store/control tests, root/native checks, and safe live settings/audit observation only. Destructive moderation is explicitly out of scope for the QA guild.

Evidence: `npm test` 73/73, root typecheck/build, and native typecheck passed. Runtime integration is dry-run-only and does not call Discord moderation APIs.

### LB-SAFETY-002 — Native dry-run policy editor

Status: Implemented native editor/kill-switch slice · owner decision: approved for local-only administration

Scope and state contract: see `docs/SAFETY_SPEC.md`. The native editor uses the selected guild's current AutoMod settings, including mode, rule toggles, bounded thresholds/windows/cooldowns, exemptions, blocked domains, and an explicit persisted disable/kill switch. Enforce mode is separately confirmed and execution is limited by `LB-SAFETY-003`; the editor never fabricates policy data.

Acceptance evidence: native loads and saves only server-confirmed settings, displays a mode-specific warning, keeps the master policy disabled when offline/no guild is selected, gates enforce mode with explicit confirmation, and exposes a persisted `Tắt ngay` kill switch. `npm test` 98/98, root typecheck/build, native typecheck, and native Vite build pass. Manual focus/reduced-motion and installed-build checks remain release gates.

### LB-SAFETY-003 — Bounded message enforcement

Status: Implemented opt-in enforcement slice; isolated-fixture and installed-build acceptance remain release gates.

Contract and state matrix: see `docs/SAFETY_SPEC.md` and ADR-042. The persisted `mode` accepts `dry-run` or `enforce`, but defaults to dry-run and the native UI requires explicit confirmation before enforce-mode save. Runtime enforcement is limited to one message-scoped `delete` or fixed 60-second `timeout`, checks Discord deletable/moderatable state, coalesces multiple matches, and caps mutations at 20 per guild per rolling minute. Quarantine, ban, kick, bulk deletion, permissions, lockdown, anti-raid, and anti-nuke mutation remain unavailable.

Acceptance evidence: deterministic action-selection/limiter/runtime-fixture tests, invalid mode rejection, root typecheck/build, and native typecheck pass. Live QA remains non-destructive and must keep guild `1541307192534241318` disabled or dry-run.

### LB-SAFETY-004 — Anti-raid and anti-nuke dry-run telemetry

Status: Implemented deterministic/event telemetry slice; enforcement and lockdown remain planned and high risk.

Contract and state matrix: see `docs/SAFETY_SPEC.md`. AutoMod now has bounded `antiRaid` and `antiNuke` threshold rules. With Members Intent already explicitly enabled, member joins produce anti-raid signals; channel/role deletion events produce generic anti-nuke signals. Signals are in-memory, time-pruned, redacted audit entries with `enforced:false`; even in AutoMod enforce mode no anti-raid/anti-nuke mutation or audit-log payload fetch occurs.

Acceptance evidence: deterministic threshold/cooldown/legacy-default tests, root typecheck, and native typecheck pass. Native editor exposes both rules as dry-run controls. Destructive enforcement remains out of scope for the QA guild and requires its own threat-model, isolated fixture, kill-switch, and rollback gate.

### LB-SAFETY-005 — Clear volatile detector state on policy disable

Status: Current implementation slice · no live mutation required

When a guild AutoMod policy is disabled, clear only that guild's in-memory message/security history and cooldown markers. Re-enabling starts with a clean observation window and cannot inherit stale events from the disabled interval. The operation does not change persisted settings, audit entries, or another guild's detector state.

Acceptance: deterministic message/security-history and guild-isolation tests pass; no Discord mutation or live destructive QA is needed.

### LB-SAFETY-006 — Emergency safe-mode recovery

Status: Current implementation slice · no Discord mutation required

Add a dedicated confirmed recovery action for one guild. It atomically disables AutoMod, forces `dry-run`, clears that guild's volatile detector memory immediately, preserves rule configuration/audit history, and returns only the normalized settings. Native must require explicit confirmation and show success only after the control response.

Acceptance: control confirmation/scope/response tests, immediate engine-reset integration wiring, native typecheck/build, and root test suite pass.

### LB-SAFETY-007 — Bounded AutoMod review queue

Status: Implemented local store/control/native slice; installed-build and live acceptance remain release gates

Contract and state matrix: see `docs/SAFETY_SPEC.md`. Every detector match creates one bounded, guild-scoped review record containing only rule/reason/action/outcome/enforcement metadata and IDs; message content, usernames, raw Discord payloads, provider data, and credentials are excluded. Native Community can filter open/confirmed/dismissed records and locally confirm or dismiss an entry with an optional bounded note. A decision is idempotent for the same direction, rejects an opposite direction with `409 REVIEW_ALREADY_DECIDED`, and never mutates Discord state.

Acceptance: deterministic store/control tests cover persistence, redaction shape, 1,000-record bound, guild isolation, status/decision/note validation, same-decision idempotency, opposite-decision conflict, and corruption recovery. Backup/restore includes `automod-review.json`; native typecheck/build and root checks pass. Public appeals, content recovery, automatic reversal/punishment, anti-raid/nuke enforcement, and AI decisions remain out of scope.

### LB-SAFETY-008 — Explicit Message Content Intent capability

Status: Implemented gateway/control/native capability slice; portal opt-in and installed-build acceptance remain operator gates.

Contract and state matrix: see `docs/SAFETY_SPEC.md` and ADR-055. `LOCALBOT_MESSAGE_CONTENT_INTENT` defaults to `false`; the runtime requests `GatewayIntentBits.MessageContent` only when explicitly enabled. Without the flag, content-based AutoMod is a safe no-op and native reports the missing portal/env capability instead of claiming protection. Members Intent and independent anti-raid/anti-nuke event telemetry remain separately gated.

Acceptance: pure intent-builder/content-availability tests, root typecheck/build, native typecheck, control response capability metadata, and documentation markers pass. Live QA does not enable enforcement or send destructive fixtures; the portal switch plus configured-content live check remains a manual release gate.

## Phase 9 — Optional local intelligence with Ollama

Status: Configuration/health and bounded read-only suggestions implemented by `LB-AI-001`/`LB-AI-002`; autonomous actions remain out of scope.

Implemented scope:

- Persist a bounded, non-secret endpoint/model/timeout/enable configuration in `data/ollama.json`.
- Expose native Settings controls and loopback settings/health routes.
- Probe `/api/tags` with a timeout and return only disabled/not-configured/ready/model-unavailable/offline state.
- Include Ollama settings in the credential-free backup and transactional restore.

Remaining planned scope:

- Add richer, privacy-reviewed read-only help/intent suggestions only where a separate contract is approved.
- Keep AI output untrusted: deterministic validation, permission checks, safety policies, and confirmation remain authoritative.
- Add no autonomous mutation without a separate threat model, permission boundary, confirmation flow, and isolated acceptance fixture.

Acceptance criteria:

- LocalBot starts and all non-AI features work when Ollama is absent.
- No secret, token, or private data is sent to a remote provider by default.
- AI cannot autonomously delete, ban, change permissions, or alter safety rules.
- Every AI-assisted action shows that it is a suggestion, includes confidence/limitations where applicable, and is logged safely.

Gate: privacy review, offline/failure tests, prompt-injection tests, permission review, and explicit opt-in documentation.

### LB-AI-001 — Optional Ollama configuration and health

Status: Implemented configuration/health slice · AI-assisted actions remain out of scope

Contract and state matrix: see `docs/OLLAMA_SPEC.md`. Native Settings can explicitly enable/disable Ollama, edit a safe HTTP(S) endpoint and model, and request a bounded health probe. The Node runtime never sends or persists credentials, prompts, private Discord data, or raw provider responses in this slice. Missing Ollama is represented as disabled, not configured, or offline and never blocks the core bot.

Acceptance evidence: deterministic tests cover defaults, persistence, invalid endpoint/timeout rejection without mutation, health states, corruption quarantine, backup/restore inclusion, and control API redaction. Root/native typecheck and builds remain part of the current delivery gate; live `ready` status is optional until a local model is supplied.

### LB-AI-002 — Bounded read-only Ollama suggestions

Status: Implemented bounded adapter/control/native slice; autonomous actions remain out of scope.

Contract and state matrix: see `docs/OLLAMA_SPEC.md`. Native Settings may send an operator-written question for help/music/community guidance only after Ollama is explicitly enabled and a model is selected. Input, output, generation budget, and timeout are bounded; only the plain suggestion crosses the control boundary. The query, prompt, raw response, Discord data, and private member data are not persisted or returned. AI text is untrusted and cannot execute a LocalBot action.

Acceptance evidence: deterministic provider/control tests cover safe extraction, invalid/disabled/offline/timeout states, bounds, redaction, and no mutation; native typecheck/build and the full release gate remain required.

### LB-QA-001 — Sanitized loopback live-QA probe

Status: Current QA tooling · read-only contract probe; native ownership and configured playback remain separate gates

Scope and contract: `npm run qa:live` checks loopback health, guild/channel/role discovery, provider readiness, Music read routes, Community, onboarding, AutoMod, local/Discord audit, Ollama, and a non-mutating all-source media search. It defaults to the authorized QA guild `1541307192534241318`, accepts only an HTTP loopback Control API URL, emits method/path/status plus a safe DTO-contract result, and never prints response bodies, secrets, member data, raw provider payloads, or stream URLs.

Failure states: network/timeout/HTTP `4xx`/`5xx`, invalid JSON, or a missing required response envelope cause a failed probe. The probe must not be used to claim native-owned clean-install or visual/accessibility acceptance.

Acceptance evidence: `npm run qa:live` returns `status:"reachable"` with all current checks reachable through the loopback runtime; environment overrides and path scopes are documented in `docs/ENVIRONMENT.md` and `docs/RELEASE_QA_RUNBOOK.md`.

### LB-QA-003 — Static production-data regression gate

Status: Current QA tooling · source regression guard; installed/manual acceptance remains separate

Scope and contract: `npm run audit:static` scans only `src/`, `native/src/`, and
`native/src-tauri/src/` for common fake/mock/sample record labels, retired demo-track text,
and demo status claims. It reports rule IDs and locations only. Tests, generated resources,
build output, local data, input placeholders, and the documented `demo-guild` migration
compatibility path are outside the scan by design.

Acceptance evidence: the gate passes on the current production source tree and is included in
the README and release runbook. It prevents future slices from replacing honest
loading/empty/offline/error states with fake records; it does not replace live, installed,
visual, or accessibility QA.

### LB-QA-004 — Documentation contract regression gate

Status: Current QA tooling · low-token documentation guard

Scope and contract: `npm run audit:docs` checks the routed SDD/spec/roadmap/README files for
required native ownership, port `2901`, Dark first-launch default, Windows autostart guidance,
the authorized QA guild, and the accepted `LB-MUSIC-014` Discord seek boundary. It checks file
presence and contract markers only; it never reads `.env`, generated output, user data, or the
full source tree.

Acceptance evidence: all required documents pass the marker check, stale unresolved seek
language is rejected, and the command is listed in README, the release runbook, and both
autopilot prompts. This guard catches documentation drift; it does not replace source, live,
installed, visual, or accessibility QA.

### LB-QA-005 — Live guild slash-command registration

Status: Current registration evidence; interaction and installed-build acceptance remain separate

Scope: the native app and maintenance script may repeatably register the complete current slash
command definition set to the configured guild without exposing credentials or requiring a
second bot process.

Acceptance evidence: `npm run register` accepted the current command set and reported 25
guild-scoped commands for the authorized QA guild `1541307192534241318`; the action is idempotent
and output was limited to count/scope metadata. Command-by-command live interaction and installed
native parity remain release checks.

### LB-QA-006 — Live DTO shape and no-placeholder probe

Status: Implemented QA tooling · native ownership, provider playback, and manual acceptance remain separate gates.

Scope and contract: `npm run qa:live` now parses successful JSON responses and validates only the
minimum route DTO shape for health, guild/channel, provider, Music, Community, onboarding, AutoMod,
audit, Ollama, and media-search routes. The probe emits only method/path/status and
`contract:ok` or `contract:invalid-shape`; it never prints response bodies, track titles, URLs,
member data, credentials, provider payloads, or stream URLs. A `200` response with malformed JSON
or a missing required envelope now fails the probe.

Acceptance evidence: the authorized guild probe returns HTTP 200 and `contract:ok` for every
configured check; this strengthens the no-placeholder/API-parity signal but does not claim native
ownership, clean-install, playback, autostart, visual/accessibility, or signing acceptance.

### LB-QA-007 — Native-owned YouTube Music smoke

Status: Implemented dev-mode live evidence; installed-build/provider-vault/manual acceptance remains separate.

Scope and contract: in a native-owned dev session, discover a real voice channel in the authorized
QA guild, search `blood moon stupid`, enqueue/play a real YouTube result with its provider-neutral
thumbnail, observe player state, pause/resume, then stop and leave. The smoke must emit only
sanitized metadata and must clean up the voice session; it must not mutate permissions, messages,
moderation settings, or unrelated guild resources.

Acceptance evidence: 2026-09-04 native-owned run found a Connect/Speak-capable voice channel,
returned 10 real YouTube results with an HTTPS thumbnail, reached `status:playing`, returned
`paused` then `playing`, and ended with no active player and `botJoined:false`. Port `2901` and
the native-owned process tree were free after close. This does not close installed-build playback,
SoundCloud credentials, Windows sink isolation, autostart, accessibility, or signing gates.

### LB-RUNTIME-017 — First-class headless and slash-only runtime profiles

Status: Implemented source contract; target-host VPS verification remains Blocked.

Scope: keep one Discord/Music core while making deployment intent explicit through
`LOCALBOT_RUNTIME_PROFILE=native|headless|slash-only`. Native is injected by Tauri and requires
the owner marker/control bridge. Headless remains the compatible Node-only default. Slash-only
does not import or start the control server, never binds `127.0.0.1:2901`, does not load native
code, and defaults `LOCALBOT_AUTO_REGISTER_COMMANDS` to false. Explicit `npm run register` and
guild-scoped `/bot sync` remain available.

Acceptance: pure profile tests, `npm run typecheck`, `npm run build`, and `npm run qa:headless`
pass. A Linux VPS, systemd, target Node/FFmpeg, firewall, provider, and real Discord voice check
must be performed on the operator's host; no local run may claim those results.

### LB-COMMANDS-003 — Safe slash-only operator surface

Status: Implemented source contract.

`/bot status` exposes only runtime profile, readiness, guild count, loopback control status, and
the current guild player summary. `/bot providers` exposes YouTube readiness and SoundCloud
enabled/configured/available booleans without credentials. `/bot sync` is manager/admin-only,
guild-scoped, idempotent, audited by the existing command boundary, and never performs global
registration implicitly. No Discord command can execute a shell command, restart the process, or
change systemd state.

Acceptance: command schema tests and root typecheck pass; live interaction and installed parity
remain release gates.

### LB-RUNTIME-018 — Graceful headless shutdown

Status: Implemented source contract.

`SIGINT`/`SIGTERM` stop all guild players, close the optional control server, and destroy the
Discord client exactly once. The systemd reference uses a non-root service, SIGTERM, bounded stop
timeout, journald, persistent data/cache paths, and restart-on-failure. It is documentation and
packaging preparation only; no VPS deployment is claimed.

Acceptance: source lifecycle review, root tests, and local headless contract QA pass. Signal
behavior against a real Linux process and provider playback remains Blocked until a target VPS is
available.

### LB-GUILD-001 — Real role discovery for native Community configuration

Status: Current · owner decision: approved

Scope: expose the selected guild's cached, non-managed Discord roles through the existing
loopback Control API and use them in the native Community XP multiplier/reward pickers.
Persist only the existing role IDs; keep the route read-only.

Out of scope: granting/removing Discord roles, editing role permissions, unbounded member
fetches, remote Control API access, or changing slash-command authorization.

Given a native-owned runtime with a selected guild, when the Community page requests roles,
then it receives a bounded minimal DTO sorted by Discord position and can display real role names.
When the cache is empty or a configured role disappears, the UI shows loading/empty/missing-ID
states and does not invent or rewrite data.

Contract: `GET /api/v1/guilds/:guildId/roles` returns `{ roles: [{ id, name, color, position,
managed, mentionable }] }`; the route is guild-scoped and loopback-only through the existing
control boundary. `@everyone` and integration-managed roles are omitted.

Acceptance: control-server fixture covers ordering and filtering; native typecheck passes;
full root tests, static/docs audits, native build verification, and the configured guild's
read-only role discovery are rerun. A missing role remains represented by its stored ID.

### LB-GUILD-002 — Capability-gated member picker for Music allow-list

Status: Current · owner decision: approved

Scope: add a bounded, read-only guild member search route and native Music permission picker.
With the Members Intent opt-in, the route may use Discord's bounded search; without it, the UI
must clearly label cache-only/incomplete results and retain the manual ID fallback.

Out of scope: granting Discord permissions, fetching the entire guild, changing slash-command
authorization, exposing remote administration, or making Members Intent mandatory for startup.

Contract: `GET /api/v1/guilds/:guildId/members?query=...&limit=...` returns `{ members,
intentEnabled, complete, source }` with at most 25 non-bot members and bounded display metadata.
Discord search failure falls back to cache-only data without raw upstream errors.

Acceptance: deterministic control tests cover cache-only filtering and bounded DTO shape; native
typecheck/build pass; the UI supports search, add-from-result, incomplete-state guidance, and
manual numeric ID fallback; `qa:live` validates the route envelope without printing member data.

### LB-GUILD-003 — Effective guild permission readiness diagnostics

Status: Implemented read-only control/native slice; installed visual and live permission acceptance remain separate release gates.

Scope: expose the bot member's effective guild-level permissions and highest role through the
existing loopback route, then render a selected-guild diagnostic panel in native Community. The
panel explains missing capability without sending the operator to Discord for every diagnosis.

Out of scope: granting/removing permissions, editing channel overwrites, role creation, role
hierarchy mutation, member fetching, remote authentication, or changing slash authorization.

Contract: `GET /api/v1/guilds/:guildId/permissions` returns a bounded `permissions` object with
`botMemberPresent`, `botUserId`, optional `highestRole`, and fixed boolean-or-null checks for
view/send/embed/connect/speak/move/manage-messages/moderate/manage-roles/manage-guild/audit-log/
application-commands. A missing cached bot member returns `null` checks rather than false.

Acceptance: deterministic voice/control tests cover granted, denied, and unknown states; native
typecheck/build passes; `qa:live` validates only the envelope; per-channel checks remain
authoritative for real actions; no Discord mutation is required.

### LB-RUNTIME-019 — Windows Headless Operator Bootstrap

Status: Current for startup, diagnostics, Music/Community slash control, audit/greetings parity,
and bounded AutoMod administration; target-host VPS acceptance remains Planned.

Scope: give Windows CMD/PowerShell operators a conventional `npm start` path, a credential-safe
`npm run doctor`, a bounded `/bot diagnostics` operator command, and a deterministic
`npm run qa:headless:smoke` boundary. Keep the implementation on the shared Node/Discord/Music
core and keep the Native Tauri owner separate.

Out of scope: Linux VPS deployment, public control APIs, a second Music implementation, a music-only
fork, shell/systemd slash commands, and Native lifecycle changes.

Acceptance: root tests include doctor and command contract coverage; `npm run build` followed by
`npm run qa:headless:smoke` proves no Tauri dependency, bounded credential failure, cleanup hooks,
and no control listener on port `2901`; `npm run qa:headless` keeps the slash-only dynamic-import
contract green; Native/Rust regression checks remain green.

Next planned slices, in order:

1. Keep Music, Community, audit/greetings and AutoMod slash surfaces under live command acceptance
   without enabling destructive moderation in the authorized QA guild.
2. Add target-host VPS acceptance only when a real host is available; do not infer Linux/systemd
   correctness from the Windows headless smoke.
3. Treat Members Intent, Message Content Intent, SoundCloud credentials, clean-machine install,
   and signed release verification as explicit environment/release gates.

## Recommended next Claude prompt

Use the ready-to-paste next handoff in `docs/CLAUDE_FIRST_PROMPT.md`. It routes Claude through the low-token documentation set, records the completed Discord Music baseline, and starts with native Music integration instead of asking Claude to scan or reimplement the backend.
