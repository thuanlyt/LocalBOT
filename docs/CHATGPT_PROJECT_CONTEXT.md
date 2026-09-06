# LocalBOT — ChatGPT project context

Use this file as the compact context for planning, roadmap, scope, task breakdown, QA design, and
deployment decisions. Do not paste `.env`, tokens, cookies, OAuth headers, provider secrets, raw
provider payloads, or user data into an AI session.

## 1. Project identity and purpose

LocalBOT is a local-first Discord bot project by ThuanLYT. Its product direction is enterprise-
quality reliability without pretending that unverified behavior is complete. The bot should support
Music, Community, Logs, Welcome/Goodbye, AutoMod, provider settings, optional Ollama assistance,
safe permissions, persistence, auditability, and a polished modern native Windows experience.

The primary current feature is Music: search real YouTube content, optionally use official
SoundCloud, show real metadata/thumbnails/source tags, queue and play in Discord, optionally play
to Windows at the same time, manage playlists, repeat/shuffle/volume/Equalizer, and keep Discord
and Windows output failures isolated.

## 2. Deployment decision

There is one shared Node/Discord/Music core and three explicit runtime profiles:

- `native`: the full Windows product. Tauri owns the bot child and the React/Vite console. Closing
  the native window stops the owned bot runtime. The loopback bridge is fixed at `127.0.0.1:2901`.
- `headless`: Node-only local runtime for development or a future local service; control is optional.
- `slash-only`: lightweight Discord slash-command runtime for a Linux VPS. It must not load Tauri,
  React, a dashboard, SSE, the control server, or bind port 2901. Command registration is explicit,
  not a global sync on every boot.

The repository currently prepares the VPS source contract and a systemd reference only. No real VPS
deployment or Linux target-host QA has been performed. Any plan must label Node/FFmpeg setup,
systemd, permissions, firewall/network, provider credentials, upgrade/rollback, and Linux voice
playback as `Blocked` until a real target host is available.

## 3. Technology stack

- Node.js 22.12+, TypeScript 5.9, ESM, `tsx`
- `discord.js` 14 and `@discordjs/voice`
- `youtubei.js` for YouTube metadata/search/stream resolution
- Official SoundCloud API Client Credentials adapter; no cookies or unofficial scraping
- FFmpeg and Opus for audio pipeline/equalizer
- Tauri 2, Rust, React 19, Vite 7, native Windows WebView2
- Motion, Lucide/Iconify fallback icons, Be Vietnam Pro, grayscale UI tokens
- Versioned local JSON stores with atomic writes; do not introduce SQLite without an ADR and
  evidence that JSON is insufficient

## 4. Implemented source boundaries

- `src/runtime-profile.ts`: fail-closed `native|headless|slash-only` policy and command registration defaults.
- `src/index.ts`: shared Discord runtime, dynamic control-server import, SIGINT/SIGTERM cleanup.
- `src/commands.ts`: Music/Community commands plus safe `/bot status`, `/bot providers`, and
  manager/admin guild-scoped `/bot sync`; no shell/restart/systemd command.
- `src/control-server.ts`: native-only loopback bridge when explicitly enabled.
- `src/runtime-diagnostics.ts`: shared secret-free readiness classifier for the native operator
  diagnostics surface (`LB-OPS-001`).
- `src/runtime-doctor.ts` and `scripts/runtime-doctor.mjs`: credential-safe headless configuration
  validation for the `LB-RUNTIME-019` bootstrap contract; it reports key presence and boundaries,
  never secret values.
- `scripts/smoke-headless-runtime.mjs`: built credential-free process-boundary smoke proving no
  Tauri dependency, bounded configuration failure, cleanup hooks, and no port `2901` listener.
- `GET /api/v1/guilds/:guildId/roles`: bounded read-only role discovery for native Community
  configuration; only non-managed, non-@everyone roles are returned and role IDs remain the
  persisted contract (`LB-GUILD-001`).
- `GET /api/v1/guilds/:guildId/members`: bounded Music allow-list directory; Discord search is
  opt-in through `LOCALBOT_GUILD_MEMBERS_INTENT`, otherwise the DTO explicitly reports cache-only
  incomplete results (`LB-GUILD-002`).
- `src/player.ts`: guild-scoped Discord players, persistence, queue, and destroy-all cleanup.
- `native/src-tauri/src/lib.rs`: native-owned child, runtime env injection, Job Object/supervision,
  autostart and Windows Credential Manager boundary.
- `deploy/systemd/localbot.service.example`: non-root slash-only reference, not deployment proof.
- `docs/HEADLESS_PARITY.md`: current Native/Headless/slash-only capability matrix and explicit gaps.

## 5. Product behavior that must not regress

- Native remains the Windows runtime owner; do not create a second bot process or public control API.
- Port 2901 is loopback-only native control, not a web dashboard port.
- Default theme is Dark; the approved UI also has Light and mixed Default modes.
- Player transport controls stay centered. Shuffle, previous/next, play/pause, repeat, and volume
  animate only on appropriate click/state transitions; visual motion must not hide state errors.
- Source tags must use a stable provider-neutral DTO and deduplicate discovery results conservatively.
- Discord and Windows audio are separate sinks; a Windows/local-audio failure cannot stop Discord.
- No fake guilds, tracks, thumbnails, queues, progress, provider readiness, or placeholder data in
  production runtime. Use loading/empty/offline/error/stale states.
- Secrets stay server-side/local vault; never log or expose them through UI, API, backup, smoke, or docs.
- Native Settings includes `GET /api/v1/diagnostics` for profile, ownership, gateway, provider,
  and privileged-intent readiness. Optional integrations are informational, not core failures.

## 6. Current slash command contract

The registry currently has 26 commands: Music (`play`, `search`, `info`, `join`, `queue`,
`now-playing`, `clear`, `remove`, `move`, `shuffle`, `repeat`, `previous`, `skip`, `pause`,
`resume`, `volume`, `stop`, `leave`, `playlist`, `equalizer`, `music-access`), Community
(`rank`, `leaderboard`, `community-config`), plus `ping` and `bot`.

The `bot` group now also exposes manager-only `/bot diagnostics`, a bounded secret-free readiness
snapshot suitable for Windows Headless operators. Top-level command count remains 26.
It also exposes bounded manager-only `/bot audit local|discord` reads and
`/bot greetings show|set|preview`; greeting preview is local-only and does not send a message.
AutoMod headless parity is now available through manager-only
`/bot automod show|policy|rule|domain|exempt|review|decide|recover` with explicit confirmation,
redacted review metadata, and safe recovery; destructive moderation and privileged-intent setup
remain release gates.

Registration is explicit through `npm run register`, the native registration action, or
manager-only `/bot sync` for the current guild. Do not silently replace guild/global registration
semantics without an SDD requirement.

## 7. QA baseline and honest gaps

Current local evidence after the runtime-profile, role-discovery, member-picker, Community exclusion-picker, direct Music guild/voice readiness, operator diagnostics, audit/greetings, and AutoMod headless parity slices:

- `npm test`: 153/153 pass.
- `npm run native:test`: 4/4 native Music context state-contract tests pass.
- root TypeScript typecheck/build: pass.
- native TypeScript typecheck: pass.
- Rust check/test/clippy: pass; Rust tests 6/6.
- `npm run qa:headless`: pass; slash-only source contract and no-listener boundary.
- `npm run doctor`: pass with an informational SoundCloud warning when optional credentials are absent.
- `npm run qa:headless:smoke`: pass; credential-free fail-fast, no Tauri dependency, no port `2901` listener.
- static/docs audit: pass.
- native release build and artifact verification: pass; artifacts unsigned and current-machine only.
- configured installed smoke family: readiness, YouTube/Discord plus parallel local-audio, command
  registration, restore, controlled restart, forced termination, child recovery, and dependency-
  isolated variants passed on 2026-09-06 with isolated app data and no real app-data change.
- Port 2901 was free after checks; no running native runtime was claimed.
- `LB-GUILD-001`: role route fixture ordering/filtering passed; native role pickers use real
  cached Discord role names and retain an explicit missing-cache label for old IDs.
- `LB-GUILD-002`: bounded member route fixture and native member-picker path passed; the picker
  is explicitly Members-Intent-gated, cache-only/incomplete without that capability, excludes
  bots, and preserves manual numeric-ID fallback.
- `LB-COMMUNITY-006`: native Community now manages existing ignored text-channel and role lists
  through real guild discovery data; bounded all-or-nothing settings writes and missing-cache IDs
  are covered. Current automated suite is 153/153, with 4/4 native Music context state-contract tests.
- `LB-GUILD-003`: native Community now shows effective guild-level bot permissions and highest
  role through a read-only route; missing bot-member cache is explicit unknown rather than denied.
- `LB-MUSIC-019`: Music now owns a direct guild/voice context flow. Readiness is evaluated on the
  selected channel's effective ViewChannel/Connect/Speak permissions, stale guild/channel
  responses are discarded, Stage is reported unsupported, and selection never auto-joins.
- `LB-OPS-001`: native Settings now reads a bounded diagnostics snapshot for profile, ownership,
  gateway, providers, and privileged intents without exposing the runtime ownership marker.
- `LB-RUNTIME-019`: Windows Headless now has `npm start`, `npm run doctor`, `/bot diagnostics`,
  bounded audit/greetings and AutoMod operator slash surfaces, and a credential-free built smoke
  boundary. This proves the local process/config contract, not real Discord login, Linux FFmpeg,
  or target-host VPS playback.

Still open or explicitly gated: clean-machine installed UX, Windows autostart/reboot, SoundCloud
live credentials/vault/playback, Windows device-loss behavior, visual/accessibility/manual native
QA, live Members-Intent member discovery, upgrade/migration/signing, command-by-command live
interaction, and all target-host VPS QA.

## 8. How an AI planner should reason

Do not follow a request blindly. First identify whether it changes the product scope, security
boundary, persistence, provider terms, runtime ownership, or deployment profile. Challenge ideas
that add unnecessary services, duplicate authorities, expose secrets, bind a public port, rely on
unofficial provider access, or claim QA without evidence. Prefer the smallest coherent change with:

1. a stable SDD requirement and explicit out-of-scope list;
2. a behavior/state/API/command contract;
3. deterministic tests for success, validation, failure, offline, and stale paths;
4. real-provider or real-Discord QA only when safe and authorized;
5. documentation/evidence updated after implementation;
6. a truthful `Current`, `Planned`, or `Blocked` status.

Read `docs/SDD.md`, `docs/ARCHITECTURE.md`, `docs/ENVIRONMENT.md`, `docs/MUSIC_SPEC.md`,
`docs/RELEASE_QA_RUNBOOK.md`, and `docs/REMAINING_GAPS.md` before proposing broad work. The
authorized non-destructive QA guild is `1541307192534241318`; discover channels at runtime and do
not perform destructive testing there.
