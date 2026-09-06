# LocalBOT Windows Headless / Slash Parity

Status: Current for the implemented bootstrap slice; feature gaps below remain explicit.

This matrix separates capabilities that naturally belong to the Native Windows surface from
shared capabilities that should remain usable through Discord slash commands. It is not a claim
that every Native control has to be duplicated as a slash command.

## Runtime surfaces

| Surface | Owner | Control | Port 2901 | Current evidence |
| --- | --- | --- | --- | --- |
| Windows Native Full | Tauri supervisor and owned Node child | Native UI plus Discord slash commands | Loopback only when enabled | Native build/smoke and Rust lifecycle checks |
| Windows Headless / CMD | Node process or external supervisor | Discord slash commands | Disabled by default | `npm start`, `npm run doctor`, credential-free headless smoke |
| Linux VPS slash-only | Node process/systemd | Discord slash commands | Must remain disabled | `npm run qa:headless`; real host validation is pending |

All three surfaces use the same Discord, provider, player, permission and persistence modules.
The Native UI is not a second implementation of those semantics.

## Capability matrix

| Capability | Native | Headless / slash-only | Native-only by nature | Gap / action |
| --- | --- | --- | --- | --- |
| YouTube search/play/queue/player | Available | Available through existing Music commands | No | Keep shared provider/player tests and add live command acceptance separately. |
| SoundCloud official adapter | Available when configured | Available when configured | No | Credential/vault/live stream acceptance remains pending. |
| Playlists, repeat, shuffle, volume, Equalizer | Available | Available through existing commands | No | Keep command contract backward compatible. |
| Music permission allow-list/all mode | Native picker plus route | Enforcement is shared; configuration is currently native/manual-ID oriented | No | Plan a bounded slash admin configuration slice; do not expose arbitrary member search. |
| Guild/voice readiness and join/move/leave | Direct native context and route | `/join` uses the invoking member's voice context | Guild picker is native UX | Preserve `LB-MUSIC-019`; add explicit slash diagnostics only where useful. |
| Discord audio output | Available | Available | No | Linux/Windows target-host playback remains an acceptance gate. |
| Windows local audio output/device selection | Available | Not applicable | Yes | Never make Discord playback depend on this sink. |
| Bot status/providers | Native Settings and UI | `/bot status`, `/bot providers` | No | Current. |
| Runtime readiness diagnostics | Native Settings route | `/bot diagnostics` for manager/operator | No | Implemented by `LB-RUNTIME-019`; output is bounded and secret-free. |
| Slash command registration | Native action and explicit CLI | `npm run register`, `/bot sync` | No | Slash-only does not silently register global commands on every boot. |
| Community rank/leaderboard | Native UI and commands | `/rank`, `/leaderboard` | No | Current. |
| Community configuration | Native picker/editor and `/community-config` | Partial through `/community-config` | No | Continue only with bounded, confirmation-gated operations. |
| Welcome/Goodbye configuration | Native editor/preview/test | No dedicated slash configuration surface | No | Planned headless parity slice; live delivery still needs Members Intent acceptance. |
| AutoMod policy/review | Native editor and route | No dedicated slash configuration surface | No | Planned separately; keep default-off and destructive actions out of the QA guild. |
| Local/Discord audit viewing/export | Native UI and route | No dedicated slash viewer/export | No | Planned bounded operator read surface; never include raw content or secrets. |
| Backup/restore | Native workflow | No slash restore by design | Native UX is safer | Keep filesystem/CLI backup path documented; do not add destructive slash restore casually. |
| Ollama settings/suggestions | Native settings | Shared optional core, no required slash setup | Native UX only | Keep suggestions non-authoritative and opt-in. |
| Windows autostart/Credential Manager | Native Settings | Not applicable | Yes | Native-only. |
| Native lifecycle/recovery/Job Object | Tauri-owned | External process/supervisor | Yes | Do not let Headless adopt or terminate Native-owned processes. |

## Headless bootstrap contract (`LB-RUNTIME-019`)

- `npm run build` produces the shared Node runtime.
- `npm start` runs `node dist/index.js`; it does not require Tauri or React.
- `npm run doctor` checks required configuration, profile boundaries, control binding, command
  registration policy and optional SoundCloud state without printing credential values.
- A headless profile can run with `LOCALBOT_CONTROL_ENABLED=false` and does not need port `2901`
  (the control bridge port 2901).
- Missing `DISCORD_TOKEN`/`BOT_TOKEN` or `DISCORD_CLIENT_ID` fails fast with key names only.
- `npm run qa:headless:smoke` proves the credential-free failure boundary, no Native import, signal
  cleanup markers and no listener on port `2901`. It is not a claim of real Discord login or VPS
  voice playback.

## Deliberate non-goals

- No Next.js or public dashboard requirement for headless operation.
- No shell execution, restart, systemd or arbitrary filesystem slash command.
- No second business-logic implementation for Windows Headless.
- No GitHub Release, stable tag or VPS deployment in this slice.
