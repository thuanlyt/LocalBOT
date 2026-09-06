# LocalBot Native

Tauri 2 + React + Vite + TypeScript shell for the Windows app. The approved visual contract lives in `../docs/UI_UX_V1.md`; this folder is the native implementation surface, not a second web dashboard.

## Development with hot reload

From `F:\dev\LocalBot`:

```powershell
npm run native:dev
```

Or from this folder:

```powershell
npm run tauri dev
```

Vite serves the React UI on `http://localhost:1420` with HMR. Editing files under `native/src/` updates the running native window without a production rebuild. Rust/Tauri configuration changes can trigger a native shell rebuild; that is expected and is still handled by the same dev process.

When the Node control bridge is offline, the app shows an explicit offline/empty state and does not fabricate guilds, tracks, playlists, or player progress. When `LOCALBOT_CONTROL_ENABLED=true` is set for the bot, the shell probes `127.0.0.1:2901` and shows the bridge state without receiving any token or provider secret.

The Community surface reads guilds and voice channels from the loopback control API and can join, move, or leave the bot's voice session without a Discord command when the bot runtime is running. It also has an explicit `Đăng ký slash commands` action for the selected guild; the bot additionally registers the command contract automatically on Discord ready.

Community also contains the Welcome/Goodbye control slice: choose a per-guild template, enable or disable it, choose a real text/announcement channel from the guild picker (channels without `SendMessages` are disabled), render a non-sending preview, and send an explicit test message. Automatic join/leave delivery is inert until `LOCALBOT_GUILD_MEMBERS_INTENT=true` is set and Server Members Intent is enabled in the Discord Developer Portal.

The same Community surface contains AutoMod: select a real guild, review or edit bounded spam/flood/link/scam/anti-raid/anti-nuke rules, exemptions, proposed actions, and blocked domains, then save through the loopback API. It is disabled by default and visibly dry-run-only; enforce mode requires an explicit confirmation and is limited to one permission-checked delete or fixed 60-second timeout per matched message with a rolling guild limit. `Tắt ngay` persists the master disable state. Anti-raid, anti-nuke, quarantine, ban, kick, bulk deletion, lockdown, and role/permission mutation remain non-mutating.

## Bot runtime ownership

The native window is the product root and automatically starts the workspace Node bot on launch. The bottom `Bật bot` / `Bot đang chạy` control can stop or restart that owned runtime during development. Tauri launches `npm run dev` from `F:\dev\LocalBot`, injects an ephemeral ownership marker, and the bot loads the existing root `.env` contract (`BOT_TOKEN`/`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, and `LOCALBOT_CONTROL_ENABLED`) without sending secrets to React. The native app reconciles both child-process ownership and `127.0.0.1:2901` readiness.

For safety, a bot started manually from another terminal is detected as an external/unowned process; the native app does not take ownership of or terminate it. Stop that process first, then start LocalBot from the native window. Closing the native window terminates the owned process tree, so the Discord client and control server stop together. On Windows, the owned tree is additionally attached to a Job Object with kill-on-close protection, covering a native crash or forced termination. The dev runner is intentionally workspace-based. A release build now bundles a Node executable, compiled root runtime, and production dependencies as a Tauri resource; the release process uses app-local `.env` and data paths. When a packaged runtime is offline, Settings shows the real app-local data directory and whether `.env` exists; file presence alone never means that required variables are valid. Clean-machine, first-run configuration, and startup/reboot acceptance are still required before distribution.

## Start with Windows

Open `Cài đặt` → `Control runtime` and enable `Khởi động cùng Windows` when LocalBot should open after you sign in. The setting is disabled by default and can be disabled from the same control. It uses the [official Tauri autostart plugin](https://v2.tauri.app/plugin/autostart/) to register the native executable for the current Windows user; it does not register `npm`, a shell command, or bot credentials. After startup, the native app starts the owned bot runtime using the same lifecycle contract as a manual launch.

Local data can be exported from the same screen and restored from a JSON file created by LocalBot. Restore requires an explicit confirmation, replaces the ten supported local stores transactionally (including bounded AutoMod review metadata), keeps a pre-restore recovery copy under the app data directory, and exposes `Áp dụng ngay` to restart the native-owned bot. The button is not marked complete until the control bridge reports `Ready`; malformed, incompatible, or sensitive-looking backup files are rejected without claiming success.

Music search uses YouTube and SoundCloud through the backend provider adapters. When the bridge is online, the app renders backend thumbnails, source tags, queue state, playback actions, and can route a track to Discord, Windows, or both. SoundCloud availability can be toggled and connection-tested from `Cài đặt`; credentials remain inside the Node/env boundary. Windows output is delivered through the loopback local-audio stream and uses the persisted guild Equalizer settings. The native Player enumerates real Windows audio outputs and applies a selected device through WebView `setSinkId` when available; unsupported or disconnected routing falls back to the system default without touching Discord. The player now receives the Discord resource playback clock through the player snapshot/SSE stream; the progress slider is read-only for Discord output because server-side seeking is not yet supported. Volume stays icon-only in the resting player layout and reveals its slider on hover/focus without shifting the controls. Community also offers a separate on-demand Discord audit view when the bot has `View Audit Log`; those entries remain in memory and are not mixed with local audit retention/export.

The `Dark` theme is the first-launch default and keeps the workspace, cards, feature surface, progress tracks, tags, and controls monochrome. `Default` remains the intentionally split-tone mode (dark navigation/headers with light content surfaces), while `Light` is light throughout.

## Production build

```powershell
npm run native:build
npm run native:verify
npm run native:smoke
```

This runs the frontend build, regenerates the production-only runtime, clears the generated release staging directory so removed files/source maps cannot leak into a later artifact, and creates the Windows Tauri artifact. `npm run native:verify` then verifies the bundled Node executable and compiled entry, rejects source maps, test/spec-named files, environment files, and unused starter assets, and confirms that MSI/NSIS output exists. `npm run native:smoke` performs an isolated NSIS install/start/stop/uninstall check, redirects the installed Tauri data, Node child, and WebView2 profile to temporary paths, refuses to launch when the real app-local `.env` exists, and performs a before/after SHA-256 audit of the real app-data profile (`realAppDataChanged:false` required). Its Tauri data marker is test-only, validated below system temp by Rust, and never belongs in a user `.env`. On a missing-config install, Settings offers `Mở thư mục dữ liệu` so the operator can create `.env` in the correct app-local directory; it never opens, copies, or displays secret contents. These checks do not replace clean-machine installation, autostart, provider, playback, accessibility, or live Discord acceptance.
