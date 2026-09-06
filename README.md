# LocalBOT

> 🚧 **Active Development / Pre-release**
>
> LocalBOT is under active development. Features, APIs, configuration and deployment workflows
> may still change. There is no stable release yet.

LocalBOT is a local-first Discord bot with a native Windows control console and a deliberately
small headless runtime for Discord slash commands. It is designed for operators who want real
provider data, local persistence, safe server controls, and a clear choice between a full native
experience and a lightweight server process.

> This repository is not claiming a completed VPS deployment. The Linux profile, systemd reference,
> packaging notes, and local contract checks are prepared; target-host Linux, FFmpeg, permissions,
> network, and live playback checks remain explicitly Blocked until a VPS is available.

## Choose a runtime

| Use case | Profile | What it provides | Current status |
| --- | --- | --- | --- |
| Windows Native Full | `native` | Tauri window, HMR, loopback control, guild/channel management, Music UI, Windows output, autostart | 🚧 Active Development; installed/manual gates remain |
| Windows CMD / Headless | `headless` | Shared Discord/Music core, slash commands, optional local bridge; no GUI required | ✅ Available locally; live long-running validation remains |
| Linux VPS Slash-only | `slash-only` | Discord gateway, slash commands, providers, persistence, logs; no UI and no HTTP listener | 🧪 Source/local contract verified; target-host QA pending |

The native window is the owner of the Windows bot runtime. Closing it stops the owned bot process.
The slash-only profile is a separate deployment choice; it never starts the native UI or binds
`127.0.0.1:2901`.

## Features

- YouTube Music search, real metadata and thumbnails, queue/player controls, playlists, repeat and shuffle modes, volume, Equalizer, and Discord voice playback.
- Optional official SoundCloud API adapter with explicit enable/configure state, URN-first identity, official `/streams` resolution, HLS AAC selection, and safe unavailable states.
- Guild and voice-channel discovery, join/move/leave, Discord/Windows/both output selection in the native app, and realtime reconciliation through the native-owned control bridge.
- Local JSON persistence with atomic writes for playlists, queue recovery state, permissions, Equalizer, Community, greetings, AutoMod, providers, Ollama settings, and redacted audit logs.
- Community XP, rank, leaderboard, role multipliers/rewards, Welcome/Goodbye, disabled-by-default AutoMod, moderation telemetry, review metadata, and permission boundaries.
- Optional Ollama local intelligence settings with bounded read-only suggestions; it cannot execute commands, mutate servers, run shell commands, or browse secretly.
- Safe slash-command operations: `/bot status`, `/bot providers`, manager-only `/bot diagnostics`, and guild-scoped `/bot sync`.
- Native Settings includes a secret-free operator readiness view (`LB-OPS-001`) for runtime ownership, Discord gateway, providers, and privileged-intent state.

No sample guild, fake track, fake queue, fake progress, or placeholder provider result is part of
the active runtime. Missing credentials, offline providers, empty stores, and unavailable guild
state are represented as explicit states.

## Technology

- Node.js 22.12+ / TypeScript 5.9 / ESM
- `discord.js` 14 and `@discordjs/voice`
- `youtubei.js` for the current YouTube adapter
- Official SoundCloud API using OAuth Client Credentials when configured
- FFmpeg for Discord audio processing and Equalizer filters
- Tauri 2 + Rust + React 19 + Vite 7 for the Windows native console
- Motion, Lucide/Iconify fallbacks, Be Vietnam Pro, and a grayscale modern UI system in `native/`
- Local JSON stores with versioned validation and atomic persistence; SQLite is not introduced without an evidence-backed migration decision

## Quick start: Windows native development

Requirements: Windows, Node/npm, Rust/Cargo, Tauri prerequisites, and WebView2.

```powershell
npm install
npm --prefix native install
npm run native:dev
```

Tauri owns the bot child and the native frontend uses HMR. Do not start another `npm run dev` in
the same session. Configure the local `.env` with at least the Discord token and
`DISCORD_CLIENT_ID`; use the matching Discord Developer Portal intents only when the related
feature is required. Native injects `LOCALBOT_RUNTIME_PROFILE=native`,
`LOCALBOT_CONTROL_ENABLED=true`, `LOCALBOT_CONTROL_HOST=127.0.0.1`, and
`LOCALBOT_CONTROL_PORT=2901` into its owned child.

Port `2901` is a loopback control bridge, not a public web dashboard. The native app can configure
startup with Windows through Settings (`Khởi động cùng Windows`); it is opt-in. The UI theme defaults
to `Dark`; Light and the mixed Default theme remain user choices.

## Quick start: Windows headless / CMD

Use this mode when a graphical Native window is not needed. It uses the same LocalBOT Core and
Discord slash commands, but does not require Tauri, React, a browser, or port `2901`.

```powershell
npm ci
npm run doctor
npm run build
npm start
```

Set `LOCALBOT_RUNTIME_PROFILE=headless` and keep `LOCALBOT_CONTROL_ENABLED=false` for the smallest
local process. `npm run doctor` reports missing key names and runtime boundaries without printing
secrets. Use `npm run register` when explicit slash registration is needed; the manager-only
`/bot sync` command remains available after the bot is online.

## Quick start: slash-only build for a VPS

This is the lightweight mode for an operator who only needs Discord slash commands. It does not
start Next.js, React, Tauri, a dashboard, SSE, or a public HTTP API.

```powershell
$env:LOCALBOT_RUNTIME_PROFILE = 'slash-only'
$env:LOCALBOT_CONTROL_ENABLED = 'false'
$env:LOCALBOT_AUTO_REGISTER_COMMANDS = 'false'
npm ci
npm run build
npm run register
node dist/index.js
```

Use a real server-managed environment file instead of committing secrets. Set
`LOCALBOT_DATA_DIR` and `YOUTUBE_CACHE_DIR` to persistent writable directories. Registration is
intentional and repeatable; slash-only does not overwrite global commands on every boot. The
manager-only `/bot sync` command can register the current guild after the bot is online.

The reference unit is [`deploy/systemd/localbot.service.example`](deploy/systemd/localbot.service.example).
It uses a non-root `localbot` account, SIGTERM, journald, bounded stop time, persistent data/cache,
and restart-on-failure. It is a template, not a completed VPS installation. Verify Node path,
FFmpeg availability, Discord permissions, service ownership, firewall/network, upgrade, rollback,
and `systemctl` behavior on the target host.

## Environment contract

Copy `.env.example` as the starting reference. The runtime accepts `DISCORD_TOKEN` and the legacy
`BOT_TOKEN` alias; `DISCORD_TOKEN` wins when both exist. `DISCORD_CLIENT_ID` is required for
registration. `DISCORD_GUILD_ID` is recommended for fast development updates.
`LOCALBOT_MESSAGE_CONTENT_INTENT` is opt-in and must be enabled both in this environment and in
the Discord Developer Portal before content-based AutoMod can inspect message text.

Runtime keys:

```text
LOCALBOT_RUNTIME_PROFILE=native|headless|slash-only
LOCALBOT_AUTO_REGISTER_COMMANDS=true|false
LOCALBOT_CONTROL_ENABLED=false
LOCALBOT_CONTROL_HOST=127.0.0.1
LOCALBOT_CONTROL_PORT=2901
```

`native` requires native ownership and control. `slash-only` rejects control/ownership and does
not create a listener. Invalid profile and binding values fail closed. Never log or commit tokens,
cookies, SoundCloud secrets, OAuth headers, or raw provider payloads.

## Slash commands

The current registry contains 26 commands. Music includes `/play`, `/search`, `/info`, `/join`,
`/queue`, `/now-playing`, `/clear`, `/remove`, `/move`, `/shuffle`, `/repeat`, `/previous`,
`/skip`, `/pause`, `/resume`, `/volume`, `/stop`, `/leave`, `/playlist`, `/equalizer`, and
`/music-access`. Community includes `/rank`, `/leaderboard`, and `/community-config`.

Registration choices:

- `npm run register`: explicit guild registration when `DISCORD_GUILD_ID` is set, otherwise global.
- `/bot sync`: safe manager/admin guild registration for the current server.
- Native’s command-registration UI: the same idempotent native-owned route.

## QA and honest status

Run deterministic checks from the repository root:

```powershell
npm test
npm run typecheck
npm run build
npm run doctor
npm run qa:headless:smoke
npm run native:typecheck
npm run native:test
npm run qa:headless
npm run audit:static
npm run audit:docs
```

Native release checks:

```powershell
npm run native:build
npm run native:verify
npm run native:smoke
npm run native:smoke:restart
npm run native:smoke:commands
npm run native:smoke:crash
npm run native:smoke:crash-recovery
```

The authorized non-destructive QA guild is `1541307192534241318`. Discover real channels at test
time. Never mass-message, mass-delete, raid, nuke, or enable destructive AutoMod enforcement for
testing. `npm run qa:live` and native smoke evidence are current-machine evidence, not proof of
clean-machine installation, Windows reboot/autostart, SoundCloud credentials, physical audio
devices, signing, or Linux VPS behavior.

## Project documents

- [`docs/SDD.md`](docs/SDD.md) — spec-driven development rules and acceptance boundaries.
- [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) — product context and current scope.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — native ownership, control boundary, profiles, and lifecycle.
- [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) — complete environment and deployment contract.
- [`docs/MUSIC_SPEC.md`](docs/MUSIC_SPEC.md) — providers, queue, persistence, outputs, and playback boundaries.
- [`docs/OPS_SPEC.md`](docs/OPS_SPEC.md) — operator readiness and diagnostics contract.
- [`docs/HEADLESS_PARITY.md`](docs/HEADLESS_PARITY.md) — Native, Windows Headless, and slash-only capability matrix.
- [`docs/RELEASE_QA_RUNBOOK.md`](docs/RELEASE_QA_RUNBOOK.md) — reproducible QA and release gates.
- [`docs/AUDIT_STATUS.md`](docs/AUDIT_STATUS.md) — evidence with historical/current distinctions.
- [`docs/REMAINING_GAPS.md`](docs/REMAINING_GAPS.md) — open gates and explicit VPS blockers.
- [`CODEX-ROADMAP/ROADMAP.md`](CODEX-ROADMAP/ROADMAP.md) and [`CLAUDE-ROADMAP/ROADMAP.md`](CLAUDE-ROADMAP/ROADMAP.md) — agent handoff plans.
- [Vietnamese README](README-vi.md)

The older native UI label `Native window là cội nguồn` describes the Windows ownership rule. The
new headless profile is intentionally available only when the operator chooses a non-native
deployment.

## 💖 Support the Project

LocalBOT is **free and open source**. If it saves you time, please give us a ⭐ **Star** — it keeps the project alive and helps us ship more features.

<a href="https://github.com/thuanlyt/LocalBOT/stargazers">
  <img src="https://img.shields.io/github/stars/thuanlyt/LocalBOT?style=social" alt="GitHub Stars">
</a>

### 🤝 Community & Support

* 📖 [Read the Docs](https://github.com/thuanlyt/LocalBOT#readme)
* 🐛 [Report an Issue](https://github.com/thuanlyt/LocalBOT/issues)
* 🌐 [ThuanLYT Website](https://thuanlyt.id.vn)

<p align="center"><em>Built with ❤️ by ThuanLYT</em></p>
