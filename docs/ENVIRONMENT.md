# LocalBot Environment Contract

Status: Current keys verified from the local `.env` without reading values.

## Current bot variables

| Variable | Required | Owner | Notes |
| --- | --- | --- | --- |
| `DISCORD_TOKEN` | Yes* | Bot runtime | Canonical secret key; never client-side |
| `BOT_TOKEN` | Yes* | Bot runtime | Compatibility alias used only when `DISCORD_TOKEN` is empty |
| `DISCORD_CLIENT_ID` | Yes | Command registration | Non-secret identifier |
| `DISCORD_GUILD_ID` | No | Command registration | Recommended for fast local command updates |
| `YOUTUBE_LANGUAGE` | No | YouTube adapter | Defaults to `vi` in current code |
| `YOUTUBE_LOCATION` | No | YouTube adapter | Defaults to `VN` in current code |
| `YOUTUBE_CACHE_DIR` | No | YouTube adapter | Defaults to `.cache/youtube` |
| `SOUNDCLOUD_CLIENT_ID` | No | SoundCloud adapter | Official API app credential; required only when SoundCloud is enabled |
| `SOUNDCLOUD_CLIENT_SECRET` | No | SoundCloud adapter | Secret; server-side only, paired with `SOUNDCLOUD_CLIENT_ID` |
| `LOCALBOT_PLAYLISTS_FILE` | No | Music persistence | Defaults to `data/playlists.json`; local JSON, atomic writes |
| `LOCALBOT_MUSIC_PERMISSIONS_FILE` | No | Music permissions | Defaults to `data/music-permissions.json`; local per-guild allow-list/all mode |
| `LOCALBOT_EQUALIZER_FILE` | No | Music equalizer | Defaults to `data/equalizer.json`; local per-guild bass/mid/treble settings |
| `LOCALBOT_COMMUNITY_FILE` | No | Community progression | Defaults to `data/community.json`; local per-guild XP/level/rank data |
| `LOCALBOT_XP_COOLDOWN_SECONDS` | No | Community progression | Defaults to `60`; prevents message-spam XP farming |
| `LOCALBOT_AUDIT_FILE` | No | Operations | Defaults to `data/audit-log.json`; bounded, redacted local action history |
| `LOCALBOT_AUDIT_RETENTION_DAYS` | No | Operations | Optional `1..3650` day retention; unset keeps the hard 2,000-entry bound without time pruning |
| `LOCALBOT_GREETINGS_FILE` | No | Welcome/Goodbye | Defaults to `data/greetings.json`; versioned per-guild templates, HTTPS image URLs only |
| `LOCALBOT_GUILD_MEMBERS_INTENT` | No | Welcome/Goodbye | `true` only after enabling Server Members Intent in Discord Developer Portal; default `false` so the bot remains startable |
| `LOCALBOT_MESSAGE_CONTENT_INTENT` | No | AutoMod content rules | `true` only after enabling Message Content Intent in Discord Developer Portal; default `false`; when disabled, content-based AutoMod is a safe no-op |
| `LOCALBOT_AUTOMOD_FILE` | No | AutoMod | Defaults to `data/automod.json`; versioned per-guild dry-run rules and exemptions |
| `LOCALBOT_AUTOMOD_REVIEW_FILE` | No | AutoMod review | Defaults to `data/automod-review.json`; bounded redacted per-match review metadata |
| `LOCALBOT_OLLAMA_FILE` | No | Ollama | Defaults to `data/ollama.json`; non-secret endpoint/model/timeout/enable settings |
| `LOCALBOT_PROVIDER_SETTINGS_FILE` | No | Provider settings | Defaults to `data/provider-settings.json`; stores only SoundCloud enabled/disabled state |
| `LOCALBOT_RUNTIME_OWNER_ID` | Internal | Native runtime ownership | Ephemeral marker injected by Tauri; never set manually, logged, or exposed as a secret |
| `LOCALBOT_CONTROL_ENABLED` | No | Native/control bridge | Defaults to `false`; set `true` to enable the loopback API used by native |
| `LOCALBOT_CONTROL_HOST` | No | Native/control bridge | Canonical and enforced as `127.0.0.1`; non-loopback values fail closed |
| `LOCALBOT_CONTROL_PORT` | No | Native/control bridge | Canonical and enforced as `2901`; `0` is test-only and this is not a web dashboard port |
| `LOCALBOT_RUNTIME_PROFILE` | No | Shared runtime boundary | `native`, `headless`, or `slash-only`; defaults to `headless` and invalid values fail closed |
| `LOCALBOT_AUTO_REGISTER_COMMANDS` | No | Slash registration policy | Explicit `true`/`false`; when empty it defaults on except for `slash-only` |

*One of `DISCORD_TOKEN` or `BOT_TOKEN` is required. If both are present, `DISCORD_TOKEN` wins. This compatibility alias avoids breaking existing local setups; new documentation should use `DISCORD_TOKEN`.

## Proposed native app/control variables

Add only when the relevant phase is implemented:

| Variable | Suggested value | Notes |
| --- | --- | --- |
| `WEB_DASHBOARD_PORT` | `2902` | Optional future Next.js companion; not part of native MVP |
| `WEB_DASHBOARD_ORIGIN` | `http://localhost:2902` | Optional web origin allow-list / CSRF checks |
| `DASHBOARD_SESSION_SECRET` | generated random value | Server-only; required when auth/session exists |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Optional default endpoint used when the Ollama settings store is first created; HTTP(S) only |
| `OLLAMA_MODEL` | explicit local model name | Optional default model used when the Ollama settings store is first created; never required for core features |

The optional control bridge uses the current keys above: `LOCALBOT_CONTROL_ENABLED` is `false` by default, and the `LB-SECURITY-001` runtime contract is fixed to `127.0.0.1:2901`. Noncanonical host/port values are rejected before listening so an unauthenticated bridge cannot be exposed to the LAN or silently moved away from the native-owned endpoint. Port `0` is accepted only by in-process tests.

## Runtime profiles and Linux VPS preparation

The Node runtime has one shared core with a deliberately small profile axis. `native` is
Tauri-owned on Windows and requires the loopback control bridge plus the ephemeral native owner
marker. `headless` is a Node-only process for development or a future local service and may use
the loopback bridge when explicitly enabled. `slash-only` is the minimal Discord runtime for a
Linux VPS: it does not import the control server, does not bind `127.0.0.1:2901`, does not load
the native UI, and does not auto-register commands on every boot. Use `npm run register` or the
guild-scoped `/bot sync` action when command registration is intentionally requested.

The repository includes `deploy/systemd/localbot.service.example` as a non-root, journald-friendly
reference. It is not a production deployment or Linux verification result. The service expects
compiled `dist/`, `/usr/bin/node`, `/opt/localbot`, `/var/lib/localbot`, and an operator-managed
`/etc/localbot/localbot.env`; VPS install, permissions, firewall, restart, upgrade, and rollback
must be verified on the target host.

The Tauri window itself does not listen on a port. Port `2901` belongs to the local control/runtime bridge. Do not run an optional web server on `2901` at the same time.

Windows startup is configured from the native Settings screen through the Tauri autostart plugin. It does not require an environment variable and is disabled by default. The registration targets the native executable; it never stores or forwards bot credentials.

During native development, Tauri is the sole supported owner of the bot runtime: it starts `npm run dev` from the workspace root, injects an ephemeral `LOCALBOT_RUNTIME_OWNER_ID`, and lets the Node process load the existing `.env` without exposing values to the native frontend. Native accepts the loopback bridge only when the managed child and health marker agree. A process started in another terminal is not adopted or terminated; the native UI reports an unowned-port conflict and asks the operator to stop it first. Closing the native window terminates the owned process tree and releases port `2901`.

In a release installation, the same ownership contract uses the bundled Node runtime prepared by `scripts/prepare-native-runtime.mjs`. The installed app does not require the repository, npm, or system Node. Put a user-owned `.env` in the app-local data directory shown by the native runtime error/help surface on first run; the release process reads it through `LOCALBOT_ENV_FILE` and stores playlists, permissions, EQ, Community, and audit data under `LOCALBOT_DATA_DIR`. Never copy `.env` into the installer resource directory. Clean-machine, upgrade, uninstall, and startup/reboot checks remain release acceptance work.

## Installer smoke-only environment

These keys are test harness markers, not user configuration and must not be copied into `.env`, `.env.example`, an installer, or a production launch shortcut:

| Variable | Owner | Contract |
| --- | --- | --- |
| `LOCALBOT_INSTALLER_SMOKE` | `scripts/smoke-native-installer.mjs` | Must be exactly `1` to activate the Tauri-only data-directory override. |
| `LOCALBOT_INSTALLER_SMOKE_DATA_DIR` | `scripts/smoke-native-installer.mjs` | Absolute Tauri app-data path below the current system temp directory; any other path is rejected. |

`npm run native:smoke` creates these values for the installed native child together with isolated `LOCALAPPDATA`, `APPDATA`, `TEMP`, `TMP`, and `WEBVIEW2_USER_DATA_FOLDER` paths. The Rust shell validates the Tauri path independently, so the smoke cannot create settings, logs, recovery files, or WebView2 data in the real user profile. The markers are removed from inherited environment variables before the smoke values are set, are never emitted to the control API, and are not supported by normal runtime startup.

## Read-only live-QA overrides

These optional variables belong to the developer QA probe and are not bot configuration, credentials, or installer inputs:

| Variable | Default | Contract |
| --- | --- | --- |
| `LOCALBOT_CONTROL_URL` | `http://127.0.0.1:2901/api/v1` | `npm run qa:live` target; the probe rejects non-loopback HTTP hosts |
| `LOCALBOT_QA_GUILD_ID` | `1541307192534241318` | Guild scope for read-only checks; discover channels at runtime |
| `LOCALBOT_QA_SEARCH` | `blood moon stupid` | Search text for the non-mutating media metadata check |

The probe prints only method/path/status. It does not print response bodies, track URLs, provider payloads, member data, credentials, or stream addresses. Do not place these keys in `.env` unless a local operator explicitly wants to override the probe for one command.

## Verified Windows native toolchain

Verified on the development machine on 2026-08-29:

| Tool | Version / status |
| --- | --- |
| Rust | `rustc 1.98.0`, MSVC target `stable-x86_64-pc-windows-msvc` |
| Cargo / rustup | `cargo 1.98.0`, `rustup 1.29.0` |
| Tauri | Tauri 2, CLI `2.11.4` |
| Node / npm | Node `24.13.0`, npm `11.6.2` |
| Windows WebView2 | `152.0.4191.53` |

The native shell is in `native/`. Use `npm run native:dev` for the long-running HMR loop and `npm run native:build` only for a production artifact. A newly opened terminal may be required after installing Rust so `%USERPROFILE%\\.cargo\\bin` is visible on `PATH`.

## Security rules

- `.env` remains local and ignored by git.
- Never log token values, cookies, authorization headers, or raw InnerTube session data.
- Never prefix secrets with `NEXT_PUBLIC_`.
- Server routes validate input before forwarding to the bot.
- CORS/CSRF/origin policy must be explicit when the control plane is added.
- Local-only MVP can bind to loopback; do not bind an unauthenticated control API to all interfaces.
- If a secret may have been exposed, stop and ask the user to rotate it; do not paste it into diagnostics.

## Music provider behavior

- YouTube works with the existing `youtubei.js` adapter and needs no YouTube API key in the current public-flow implementation.
- SoundCloud is optional and uses the official API Client Credentials flow for public search, URL resolution, and playback. User-scoped Authorization Code/PKCE and private-content access are intentionally out of scope. Missing credentials do not disable YouTube.
- SoundCloud playback uses the current official URN + `/tracks/{track_urn}/streams` HLS AAC contract; LocalBot prefers `hls_aac_160_url`, falls back to `hls_aac_96_url`, and rejects numeric-only/progressive-only stream records.
- SoundCloud client credentials and OAuth tokens stay server-side; they are never returned to the control API or Discord messages. On Windows, native Settings may write/clear the official Client ID and secret through Windows Credential Manager; the UI receives only a stored/not-stored status. The native shell injects vault values into its owned Node child at startup, with env as fallback.
- Native Settings can enable/disable SoundCloud, run a redacted connection test, and manage the native vault. `data/provider-settings.json` contains no secret and is not part of the backup envelope; vault entries are never exported.
- Native Settings can optionally configure Ollama endpoint/model and run a bounded health probe. `data/ollama.json` contains no credentials and is included in the credential-free backup; Ollama remains disabled by default.

## Safe diagnostics

It is safe to report variable names, whether a required key is present, selected ports, and sanitized error codes. It is not safe to report values or full `.env` contents.
