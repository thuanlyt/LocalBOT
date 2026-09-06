# LocalBot — Claude Code Brief

## Mission

Build LocalBot into a polished, modular Discord assistant. The current product slice is YouTube playback. The next product surface is a lightweight native Windows control and music app.

Claude Code is the implementation agent. Keep this file short; load detailed guidance only when the task requires it.

## Current state

- Runtime: TypeScript, Node.js `>=22.12.0`, ESM.
- Bot entry: `src/index.ts`.
- Discord commands: `src/commands.ts`; voice queue/player: `src/player.ts`; YouTube adapter: `src/youtube.ts`.
- Existing scripts: `npm run dev`, `npm run build`, `npm run typecheck`, `npm test`, `npm run register`, `npm run native:dev`, `npm run native:build`, `npm run native:verify`, `npm run audit:static`, `npm run audit:docs`, and Windows-only `npm run native:smoke`.
- YouTube dependency: `youtubei.js`; voice stack: `@discordjs/voice` + `ffmpeg-static`.
- Native app shell now exists in `native/` as a separate Tauri 2 + React/Vite/TypeScript project. Its local control/runtime bridge uses `127.0.0.1:2901`; use `npm run native:dev` for Vite HMR/Tauri dev mode. A Next.js web companion is optional future work.
- Native is the sole owner of the bot runtime: it auto-starts the workspace bot, stops its process tree on native close, and exposes an opt-in Windows startup setting through Tauri Autostart. Never start/adopt an external bot when testing the native app.
- Native Music integration is implemented for YouTube + optional official SoundCloud: real thumbnails/source tags, search, queue CRUD, Discord/local Windows output, session-local local queue/seek, live Discord player SSE with polling fallback, playlists, EQ, and hotkeys. Native Community includes guild/voice management, Music permission controls, and XP leaderboard. The release pipeline verifies filtered bundled runtime content and has a fail-closed isolated NSIS smoke gate; clean-machine and configured-provider acceptance remain separate.
- The bot has `/rank` and `/leaderboard [page]`, cooldown-backed per-guild Community persistence with ignored channels/roles, bounded XP/role multipliers and additive role rewards, native cooldown/pagination controls, provider status with SoundCloud enable/disable/test controls, a native Windows Credential Manager path for SoundCloud credentials, Welcome/Goodbye templates, AutoMod dry-run plus opt-in bounded message enforcement (delete or fixed 60-second timeout), kill switch, anti-raid/anti-nuke telemetry, and an explicit Message Content Intent capability gate (`LOCALBOT_MESSAGE_CONTENT_INTENT=true` only after the matching Discord Developer Portal switch). Optional Ollama configuration/health and bounded read-only suggestions remain disabled by default, with a bounded local audit log. Remaining roadmap work is richer Community/Logs, live onboarding acceptance, AutoMod recovery/appeals, autonomous AI actions (out of scope until separately approved), clean-machine installed-build acceptance, vault live acceptance/advanced rotation-recovery, and authenticated remote administration.
- The runtime uses `DISCORD_TOKEN` as canonical bot-token key and accepts `BOT_TOKEN` only as a compatibility alias; other local keys are documented in `docs/ENVIRONMENT.md`.

## Non-negotiables

1. Never read, print, commit, or expose `.env`, tokens, cookies, or secrets. Use `.env.example` and variable names only.
2. Do not scan `node_modules/`, `dist/`, `.cache/`, or generated build output unless diagnosing a dependency/build problem.
3. Read `docs/README.md`, then `docs/SDD.md` and the relevant feature document before changing code. Do not scan the entire repository by default.
4. Before editing, name the stable requirement ID, scope, out-of-scope behavior, contract, and acceptance checks. If no requirement exists, update the spec first.
5. Make one phase-sized change at a time. Preserve unrelated user changes.
6. Do not put Discord/YouTube/SoundCloud credentials in browser persistence or any `NEXT_PUBLIC_*` variable. SoundCloud native input must use the Tauri vault boundary in `docs/SOUNDCLOUD_CREDENTIALS_SPEC.md`; never add a credential route to the loopback API.
7. For native app UI or optional web UI, follow the approved `docs/UI_UX_V1.md`, then `docs/DASHBOARD_SPEC.md`, `docs/DESIGN_SYSTEM.md`, `DEMO/README.md`, and `design-system/localbot/pages/dashboard.md`; use strict monochrome, Be Vietnam Pro, friendly UX, and purposeful motion. Do not invent a second visual language.
8. Use the UI/UX Pro Max skill for dashboard UI work. Generate/persist a design system before implementing a new page when the skill is available.
9. Never add fake production records or success states without authoritative backend confirmation; use explicit loading/empty/offline/error states.
10. Run the smallest relevant checks, then the full checks before declaring a phase complete.

## Read routing

- Any task: `docs/README.md`, then this file's matching document.
- Product/feature scope: `docs/PROJECT_BRIEF.md` + `docs/ROADMAP.md` + `docs/MUSIC_SPEC.md` for Music.
- Autopilot routing: `CLAUDE-ROADMAP/AUTOPILOT_PROMPT.md` and `CLAUDE-ROADMAP/ROADMAP.md`; Codex integration roadmap: `CODEX-ROADMAP/ROADMAP.md`.
- Multi-agent safety: read `docs/AGENT_COORDINATION.md` before editing when another agent may be active.
- Bot/YouTube/voice: `docs/ARCHITECTURE.md` + `docs/ENVIRONMENT.md`.
- Local JSON schema/recovery changes: `docs/PERSISTENCE_SPEC.md` + `docs/RECOVERY_SPEC.md` + `docs/DECISIONS.md`.
- Dashboard/UI: `docs/ARCHITECTURE.md` + `docs/UI_UX_V1.md` + `docs/DASHBOARD_SPEC.md` + `docs/DESIGN_SYSTEM.md`.
- Agent workflow: `docs/CLAUDE_WORKFLOW.md` + `.claude/skills/localbot-project/SKILL.md`.
- Architecture change: `docs/DECISIONS.md`; add an ADR before implementing a materially different approach.

## Default implementation workflow

1. Create or update the requirement in the relevant spec; state the phase, files likely to change, scope, out-of-scope behavior, and acceptance criteria.
2. Define the backend/UI contract and state matrix before inspecting implementation files.
3. Inspect only those files and targeted symbols with `rg`.
4. Implement the smallest coherent slice.
5. Update docs when behavior, env, routes, commands, or architecture changes.
6. Run relevant tests/typecheck/build and record exact evidence against each acceptance item.
7. End with changed files, remaining risks, and the next smallest task; do not mark Planned work as complete.

## Definition of done

The requested behavior works, secrets are protected, loading/error/empty states exist, accessibility is considered, tests or checks pass, docs reflect reality, and no unrelated files were changed.
