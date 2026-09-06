# LocalBot — Remaining gaps before enterprise release

Updated: 2026-09-07

This document is the honest release gap list. It separates implemented behavior from work that still needs code, installed-build verification, a product decision, or manual approval. A gap is not considered closed because a mock screen exists or because a development build compiles.

## Current public milestone

[`v0.1.0-alpha.1`](https://github.com/thuanlyt/LocalBOT/releases/tag/v0.1.0-alpha.1) is the first
source-first public development preview. It does not close the beta/stable gates below and must not
be described as production-ready.

## Latest automated baseline

On 2026-09-07 the current workspace passed `npm test` (153/153), `npm run native:test` (4/4), root and native
TypeScript typechecks, Rust tests (6/6), Clippy with `-D warnings`, static/docs audits,
the headless doctor and credential-free headless smoke,
release artifact verification, and the configured installer smoke family. The installed
YouTube/Discord playback, parallel local-audio isolation, backup/restore, controlled
restart, and native slash-registration checks also passed with isolated temporary data.
This evidence is current-machine/configured-build evidence; it does not close the manual
P0 gates below (clean machine, first run, autostart/reboot, SoundCloud credentials, visual
accessibility, device-loss behavior, or signing).

## Gap classification for product planning

This classification is intentionally separate from the P0/P1/P2 release priority below:
priority answers **when** a gap blocks a release, while this section answers **what kind**
of work it is. A manual acceptance gate is not reported as a product defect, and an
unimplemented product idea is not reported as a test failure.

### Correctness / engineering defects

- No known deterministic correctness regression is open in the current automated baseline:
  `npm test` is 153/153, the root/native typechecks pass, the Rust checks pass, and the
  configured installed smoke family is green.
- Unknown Discord cache state in `LB-GUILD-003` is intentional correctness behavior: it is
  represented as `unknown`, never converted into a false denial. Channel-specific
  Connect/Speak/Send checks remain the authority for an actual join/play action.
- `LB-MUSIC-019` now evaluates the selected Music channel directly, including channel overwrites,
  instead of treating guild-level permission summaries as sufficient. Its remaining risk is
  installed/manual visual and authorized live acceptance, not a known deterministic defect.
- `LB-OPS-001` keeps runtime readiness classification in a shared domain helper and exposes only
  bounded, secret-free diagnostics; optional provider/intent states are intentionally not treated
  as core failures.
- Device loss, slow guild switching, and provider expiry are still acceptance scenarios to
  exercise on the installed target; they must be promoted to a correctness defect only when
  a reproducible failure is observed.

### Product completeness gaps

- SoundCloud is implemented behind the official API/vault contract, but the configured live
  provider path is not yet accepted with real credentials. This is a provider-completeness
  and release-acceptance gap, not permission to add unofficial scraping.
- Community, Welcome/Goodbye, Logs, and AutoMod have safe first slices; richer workflows
  such as public appeals, live join/leave verification, remote audit export, and broader
  administration remain product scope to decide and specify.
- Native role/member pickers and permission diagnostics are read-only. Live role hierarchy
  validation or Discord role mutation is a separate product decision and is not implied by
  the current administration UI.
- The shared runtime already supports `native`, `headless`, and `slash-only`; a polished
  VPS operator experience still needs an explicitly scoped product spec rather than a second
  fork of the Discord/Music core.
- Operator readiness is now consolidated in native Settings by `LB-OPS-001`; manual installed
  visual/accessibility and configured live observation remain release acceptance work.

### UX / interaction quality gaps

- Final Tauri visual and accessibility sign-off remains open: logical-width checks,
  reduced-motion behavior, popover/scroll behavior, and no layout jumps must be exercised in the
  installed native window. Native shortcut help (`?`), local seek/volume shortcuts, shared modal
  focus lifecycle, and output-aware Music context copy are now implemented and covered by targeted
  source tests; installed keyboard/focus acceptance remains open.
- The native Music context modal is now the direct guild/channel selection flow and keeps
  permission mutation/external authorization explicit. Installed visual/accessibility checks,
  slow-switch observation, and live authorized channel acceptance remain open.

### Release acceptance (RA) gaps

- Clean-machine install and first-run configuration without repository/Node/npm.
- Windows autostart/reboot ownership, device-loss/output fallback, upgrade/restore
  compatibility, and native visual/accessibility acceptance.
- Configured SoundCloud search/resolve/play plus token-expiry recovery, and AutoMod content
  behavior only after the Discord Developer Portal capability is explicitly enabled.
- Live slash interaction/accountability, signing/provenance, and target-host Linux/VPS
  systemd/FFmpeg/provider/voice verification remain environment-specific gates.

### Future expansion

- Authenticated remote/web dashboard exposure, additional media providers, autonomous AI
  actions, and enterprise distribution/signing policy are future scope. They must not be
  smuggled into the local loopback/native contract or treated as complete because a UI
  placeholder exists.

## Already working in the current native development slice

- Native Tauri window is the product root and sole owner of the bot runtime.
- `127.0.0.1:2901` is the loopback control bridge; native dev uses HMR.
- `LB-SECURITY-001` enforces the canonical endpoint before listen: non-loopback hosts and noncanonical/invalid ports fail closed; `port 0` is test-only.
- YouTube search/resolve/play uses real provider data and real thumbnails.
- SoundCloud has an optional official API adapter; it is unavailable when credentials are absent. The current source contract is `LB-MUSIC-016`: URN-first identity, `/tracks/{track_urn}/streams`, HLS AAC 160/96 selection, and typed byte-stream/HTTPS-URL media input.
- Guild and voice-channel discovery, join/move/leave, bot lifecycle toggle, and repeatable slash-command registration are wired through the control API.
- `LB-MUSIC-019` Music context selection is wired directly to real guild/channel data and a
  structured channel-effective readiness route; selecting context does not join or move the bot.
- Queue/player actions, local JSON playlists, Music permissions, Equalizer, Community XP/rank/leaderboard first slice, audit storage, SSE reconciliation, and source tags are implemented.
- Slash-command accountability is implemented as `LB-LOG-007`: every interaction writes bounded actor/guild/command/subcommand/outcome metadata only; command arguments and provider payloads are excluded, and telemetry failure is isolated from the reply.
- Discord and Windows output sessions are isolated. A live QA run kept Discord playing while a Windows `audio/mpeg` stream was opened and closed.
- Windows playback state and actions intentionally remain native-session local; there is no second `/local-player` REST authority to drift from the WebView audio session.
- Native startup-with-Windows is implemented through Tauri autostart and is opt-in.
- Native Windows child-tree termination has deterministic Rust coverage (`LB-RUNTIME-015`); native-owned bounded recovery is implemented by `LB-RUNTIME-016`, installed forced-root orphan-guard coverage passes via `LB-QA-015`, and child-recovery coverage passes via `LB-QA-017`. Clean-machine, autostart/reboot, upgrade, provider, device, visual/accessibility, and signing gates remain separate.
- Release preparation bundles Node, compiled runtime, and production dependencies into Tauri MSI/NSIS resources.
- Native guild-scoped reads use last-write-wins revisions (`LB-UI-002`), clear the previous player snapshot on selection, and immediately re-read the newly selected guild; slow-response/manual installed visual acceptance remains a release gate.
- `LB-UI-004` adds discoverable Native keyboard shortcuts and truthful local-seek behavior; `LB-UI-005` adds shared dialog focus lifecycle; `LB-UI-006` makes Music context copy truthful for Discord, Windows, and combined output modes. These are source-verified; installed visual/accessibility acceptance remains separate.
- `LB-RUNTIME-017` adds shared `native`, `headless`, and `slash-only` profiles. The slash-only source path does not load the control server or bind port `2901`, and `LB-RUNTIME-018` adds SIGINT/SIGTERM cleanup. `deploy/systemd/localbot.service.example` is a reference only; no Linux/VPS execution has been claimed.
- `LB-RUNTIME-019` adds the Windows Headless operator bootstrap: `npm start`, credential-safe
  `npm run doctor`, manager-only `/bot diagnostics`, bounded audit/greetings and AutoMod operator
  slash surfaces, and a built credential-free smoke. The smoke
  proves the local process boundary and no-listener contract; it does not prove live Discord login,
  external supervision, Linux FFmpeg, or target-host VPS playback.

## P0 — must close before calling the product release-ready

| Gap | Current truth | Required evidence |
| --- | --- | --- |
| Installed native runtime | Final release binary smoke passed from the `F:` workspace path; normal NSIS smoke is green, configured smoke reached sanitized `ready`, `LB-QA-009` exercised real YouTube/Discord playback, and `LB-QA-015` verified forced-root-termination orphan cleanup using an isolated `.env` symlink; all runs removed temporary data and reported no real app-data change, but clean-machine evidence is still absent | Install on a machine without the repo/npm/Node, launch, reach `ready`, play a real track, close app, confirm port and child tree stop |
| First-run configuration | Release reads app-local `.env` through `LOCALBOT_ENV_FILE`; native Settings exposes the real app-local directory, file-presence guidance, and a native `Mở thư mục dữ liệu` action without secrets | Configure a fresh install, verify missing-key errors are safe, then verify valid config without secrets in logs/UI |
| Windows autostart | Plugin and Settings toggle compile and are wired | Enable, disable, log out/in or reboot, verify native launches and owns the bot, then uninstall cleanly |
| Final native UX/accessibility | Backend/API evidence is strong; manual Tauri visual sign-off is still pending | Test logical widths 320/375/768/1024/1440, keyboard-only flow, focus return, reduced motion, popovers, scrollbars, and no layout jumps |
| SoundCloud live path | Official adapter, explicit enable/disable state, redacted connection-test route, native Windows vault path, current URN/HLS AAC implementation contract, `LB-MUSIC-017` refresh-token recovery, and the opt-in `LB-QA-016` installed smoke exist; approved credentials are not configured in the current acceptance run | Configure through native Credential Manager or env fallback, restart the native-owned runtime, run `npm run native:smoke:soundcloud`, search/resolve/play via the official `/streams` HLS AAC path, verify attribution and safe failure, and observe token-expiry recovery; do not use unofficial scraping |
| AutoMod Message Content capability | `LB-SAFETY-008` is implemented with default-off gateway/control/native capability gating; the current live runtime reports the capability as disabled, which is honest and safe | If content-based AutoMod is required, enable Message Content Intent in Discord Developer Portal, set `LOCALBOT_MESSAGE_CONTENT_INTENT=true`, restart the native-owned runtime, and verify a non-destructive dry-run fixture or operator-generated test message; otherwise keep the feature disabled |
| Release trust/signing | Current MSI/NSIS files are unsigned local artifacts with recorded SHA-256 hashes | Define the Windows signing certificate/ownership policy, sign MSI/NSIS, verify the signature on a clean machine, and document hash/signature provenance before distribution |

## P1 — required for a dependable daily-use product

- Freshness/last-updated/stale indicators and retry actions are implemented for the current SSE/polling-backed guild, voice, player, and provider surfaces; retain this as a regression gate.
- Restore UI and coordinated native restart are implemented by `LB-RUNTIME-006`; remaining acceptance is installed-build restore, failure injection, and upgrade compatibility. Multi-version schema migrations are still planned. Credential-free export is available at `GET /api/v1/data/export` and restore at `POST /api/v1/data/restore`.
- Discord seek is intentionally read-only in the current release under `LB-MUSIC-014`; Windows seek is supported by the independent local session. A future seekable/cache-aware Discord design requires a new SDD requirement and QA gate.
- Windows output-device selection is implemented in the native Player when WebView `setSinkId` is available; remaining acceptance is device-loss/permission/manual installed-build QA and the documented fallback to the system default.
- Restart semantics are defined by `LB-MUSIC-009`: persist only bounded pending Discord queue/history/preferences with `current:null`, never persist active resource/position/voice/stream state, and keep Windows queue/playback session-local. `LB-QA-012` covers controlled installed restart with no auto-join/no-auto-play, `LB-QA-015` covers orphan cleanup after forced native termination, and `LB-QA-017` covers bounded recovery after exact child failure on the current configured machine; migration/upgrade compatibility and autostart/reboot remain.
- SoundCloud credential vault: `LB-MUSIC-012` implements Windows Credential Manager save/clear/status and env fallback. Verify the installed-build save/clear/restart/live provider path; define any future rotation/recovery UX beyond explicit clear-and-replace.
- Provider metadata rate limiting is implemented by `LB-MUSIC-013` (30 requests per provider per 60 seconds; stream sessions excluded). A local authentication boundary is still required before any control API exposure beyond loopback.
- Guild administration ergonomics: `LB-GUILD-001` provides a real cached role picker for Community XP multiplier/reward settings, `LB-GUILD-002` provides a bounded capability-gated member picker for Music allow-lists, `LB-COMMUNITY-006` provides native pickers for existing Community XP channel/role exclusions, and `LB-GUILD-003` provides read-only effective permission diagnostics. Live role-hierarchy/assignment and installed permission acceptance remain separate future work; no permission mutation is implied by these surfaces.
- Music permission ergonomics: `LB-GUILD-002` now provides a bounded member search/picker with an explicit Members Intent capability state and manual ID fallback. Full member-directory completeness still requires the operator to opt in to `LOCALBOT_GUILD_MEMBERS_INTENT=true`; live installed acceptance remains separate.

## P2 — remaining product modules

- Community: richer configuration beyond the implemented XP/cooldown/ignored-channel-role/pagination/member-detail/reset/multiplier/reward foundation, plus live role hierarchy acceptance.
- Logs: local redacted activity, passive moderation telemetry, scoped export, and the on-demand permission-checked Discord audit view (`LB-LOG-006`) are implemented. Remote entries remain read-only/in-memory; installed-build/manual source separation and any future remote export/actor privacy review remain release checks.
- Welcome/Goodbye: the first validated per-guild template, preview, test-send, enable/disable, HTTPS-image limit, fallback, and real text-channel picker slice is implemented. Remaining: optional live join/leave verification after explicit Members Intent opt-in.
- AutoMod: the disabled-by-default, guild-scoped spam/flood/configured-link/scam detector, opt-in bounded message enforcement, anti-raid join telemetry, anti-nuke destructive-event telemetry, exemptions, persistence, audit, control route, native policy editor, persisted operator kill switch, per-guild volatile-history recovery, confirmed emergency safe-mode recovery, bounded redacted review queue, and explicit Message Content Intent capability gate are implemented by `LB-SAFETY-001` through `LB-SAFETY-008`. Content rules are deliberately a safe no-op until both the Discord Developer Portal capability and `LOCALBOT_MESSAGE_CONTENT_INTENT=true` are enabled. Remaining: public review/appeal tooling and isolated installed-build acceptance. Destructive behavior must use synthetic fixtures or an isolated resource, never the QA guild.
- Ollama: optional endpoint/model settings, health, persistence, native controls, backup inclusion, safe offline states, and bounded read-only help/music/community suggestions are implemented by `LB-AI-001`/`LB-AI-002`. Remaining: richer privacy-reviewed suggestions only if separately approved; autonomous AI actions remain out of scope.

## QA and release discipline

The authorized live QA guild is `1541307192534241318`. Discover channels at test time and use a dedicated fixture where possible. Do not mass-message, mass-delete, raid, nuke, or otherwise damage the guild. Keep raw tokens, cookies, OAuth credentials, and provider payloads out of command output, logs, screenshots, and documentation.

Run the deterministic gate from the repository root:

```powershell
npm test
npm run audit:static
npm run audit:docs
npm run typecheck
npm run build
npm --prefix native run typecheck
cargo check --manifest-path native/src-tauri/Cargo.toml
npm run native:build
npm run native:verify
npm run native:smoke
npm run qa:live
npm run qa:headless
```

`npm run qa:live` is a sanitized, loopback-only read probe. A successful result proves that the current control contract is reachable; it does not prove native ownership, configured provider playback, autostart, clean-machine installation, or visual/accessibility acceptance.

Only after P0/P1 evidence is complete may `docs/CLEANUP_CHECKLIST.md` be executed. Generated runtime resources, native targets, caches, screenshots, and logs must be classified and backed up before removal; approved design references, SDD documents, tests, and QA evidence are not disposable junk.

## Linux VPS readiness status

| Capability | Local source status | Target-host status |
| --- | --- | --- |
| `slash-only` profile | Implemented and covered by `npm run qa:headless` | Ready for operator verification; VPS execution Blocked |
| No native/UI/control listener | Enforced by profile contract and dynamic import | Must verify on target host |
| systemd lifecycle reference | `deploy/systemd/localbot.service.example` | Install/permissions/journald/restart Blocked |
| Discord slash registration | Explicit `npm run register` and guild `/bot sync` | Real target-host command registration Blocked |
| Discord voice playback | Existing native/local evidence | Linux FFmpeg/voice/provider playback Blocked |
| Windows Headless operator path | `npm start`, `npm run doctor`, `/bot diagnostics`, bounded `/bot audit`, `/bot greetings`, `/bot automod ...`, and `npm run qa:headless:smoke` are locally verified | External supervisor integration, live Discord login, and Windows headless long-running acceptance remain separate gates |
