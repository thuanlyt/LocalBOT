# LocalBot capability inventory

Updated: 2026-09-07

This is an evidence-oriented inventory for planning and handoff. “Implemented” means
there is a source entrypoint and automated coverage; it does not mean every installed,
clean-machine, visual, provider-credential, or production-operation gate is closed.

| Capability | Source entrypoints | Automated evidence | Native | Headless / slash-only | Current truth and next risk |
| --- | --- | --- | --- | --- | --- |
| YouTube search, metadata, thumbnail, resolve and Discord playback | `src/youtube.ts`, `src/media.ts`, `src/player.ts`, `/media/search`, `/player/play` | `youtube.test.ts`, media/player/control tests, native music smoke | Search, thumbnails, queue and player controls | Shared core; slash commands | Implemented. Live/provider throttling and installed-machine acceptance remain. |
| SoundCloud official adapter | `src/soundcloud.ts`, `src/provider-settings.ts`, credential vault bridge | `soundcloud.test.ts`, optional installed smoke | Settings, enable/disable, Credential Manager path | Shared core when configured | Implemented but opt-in. Official credentials, live stream and expiry recovery remain release gates. |
| Queue and playback policy | `src/player.ts`, `src/player-state.ts`, `src/queue.ts` | player/queue tests and native smoke | Queue, previous/skip, repeat, shuffle, volume, SSE | Slash commands and shared player | Implemented. Discord seek is intentionally read-only; restart/migration and device-loss acceptance remain. |
| Playlists and Equalizer | `src/playlists.ts`, `src/equalizer.ts` | playlists/equalizer/control tests | CRUD, play, presets and bands | Slash commands/shared local JSON | Implemented. Multi-version schema migration and installed UX remain. |
| Music permissions | `src/music-permissions.ts`, music-access/member routes, command guards | `music-permissions.test.ts`, control tests | Guild-scoped allowlist/all mode and bounded member picker | Slash command enforcement | Implemented. Native picker is capability-gated; manual ID remains the honest fallback when Members Intent is off. |
| Guild and voice operations | `src/voice.ts`, voice routes, `src/player.ts`, Music readiness route | voice/control tests, live read probe, permission diagnostics | Guild selection, direct Music channel context, effective per-channel readiness, join/move/leave, live SSE | Shared Discord core; no UI in slash-only | Implemented. Channel overwrite/live installed acceptance remain. |
| Native runtime ownership and recovery | `native/src-tauri/src/lib.rs`, runtime profile, `src/index.ts` | Rust 6/6, clippy, native smoke/recovery families | Tauri owns child, toggle, close, recovery, HMR | Not applicable | Implemented on configured machine. Clean install, reboot/autostart, signing and upgrade acceptance remain. |
| Control API | `src/control-server.ts`, port `127.0.0.1:2901` | control-server tests, static/docs audits | Full native bridge, SSE, local audio | Disabled in slash-only | Implemented. Loopback-only boundary remains mandatory before any remote exposure. |
| Operator readiness diagnostics | `src/runtime-diagnostics.ts`, `/diagnostics`, native Settings panel | runtime-diagnostics/control-server tests, native typecheck/build | Secret-free profile, ownership, gateway, provider and intent checks | Shared route when control is enabled; no slash-only listener | Implemented (`LB-OPS-001`). Optional integrations remain informational; installed/manual acceptance remains separate. |
| Community XP / rank / leaderboard | `src/community.ts`, community routes and slash commands | community/control tests | Leaderboard, settings, role multiplier/reward and native exclusion pickers | Shared core and slash commands | Implemented first slice plus native exclusion management. Role hierarchy/live assignment and richer analytics remain. |
| Welcome / Goodbye | `src/greetings.ts`, greeting routes | greetings/control tests | Template, preview, send-test, text-channel picker | Shared core where intents/config permit | Implemented first slice. Live join/leave acceptance requires explicit Members Intent. |
| AutoMod / review | `src/automod.ts`, enforcement/review/runtime modules | automod test families, control tests | Policy editor, dry-run, kill switch, review queue | Shared core, capability-gated | Implemented safely disabled by default. Content intent and isolated live acceptance remain. |
| Logs and audit | `src/audit-log.ts`, command audit, Discord audit reader | audit/control tests and static audit | Local log, Discord read view, JSON/CSV export | Shared local store; slash accountability | Implemented with redaction/bounds. Installed source separation and privacy review remain. |
| Ollama | `src/ollama.ts`, settings/suggest routes | ollama/control tests | Opt-in health/settings/read-only suggestions | Shared core when configured | Implemented as non-authoritative suggestions. Richer features require separate approval. |
| Persistence, backup and restore | `src/persistence.ts`, backup/restore stores | persistence/backup/restore tests, restart smoke | Export/restore and coordinated restart | Shared local JSON | Implemented. Upgrade migrations and failure-injection acceptance remain. |
| Runtime profiles | `src/runtime-profile.ts`, `src/index.ts` | runtime profile and `qa:headless` | Native full profile | `headless` and `slash-only` source contracts | Implemented. Real Linux target/systemd/FFmpeg/network validation is blocked until a target host is available. |

## Deployment preservation matrix

| Deployment | Must retain | Deliberately absent | Evidence boundary |
| --- | --- | --- | --- |
| Windows native full | Tauri, React/Vite UI, Rust supervisor, loopback Control API, local Windows audio, all current modules | None of the feature modules | Current configured-machine build/smoke; clean-machine and reboot gates remain |
| Linux VPS slash-only | Node shared core, slash commands, Discord voice/music, local persistence | Tauri, native UI, Control API, port 2901 | `qa:headless` and source audit; target VPS execution is not claimed |
| Linux VPS web/dashboard (future) | Shared core and an explicitly authenticated remote control boundary | No assumption that loopback API is safe remotely | Requires a new SDD/security decision |
| Windows headless / future web | Shared core and explicit lifecycle contract | No second runtime owner | Future scope; native remains the preferred product root |

## Inventory rules

- A placeholder, mock fixture, screenshot, or compile success is not live capability evidence.
- Optional providers must report disabled/not-configured states rather than fabricate results.
- Any new remote-control surface needs authentication, authorization, rate limits, audit, and a new SDD requirement.
- If a capability cannot be proven on the current machine, keep the status honest and record the exact blocker in `docs/REMAINING_GAPS.md`.
