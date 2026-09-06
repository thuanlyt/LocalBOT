# LocalBot Documentation Index

This folder is the low-token knowledge base for Claude Code. Read the index first, then load only the documents relevant to the current task.

## Source of truth

1. `docs/SDD.md` — spec-driven process and quality gates.
2. `CLAUDE.md` — short project rules and read routing.
3. `docs/PROJECT_BRIEF.md` — product intent and scope.
4. `docs/ROADMAP.md` — delivery order, phase gates, and acceptance criteria.
5. `CODEX-ROADMAP/ROADMAP.md` — Codex autopilot integration and release roadmap.
6. `CODEX-ROADMAP/AUTOPILOT_PROMPT.md` — prompt kích hoạt Codex autopilot.
7. `CLAUDE-ROADMAP/ROADMAP.md` — Claude Code implementation roadmap.
8. `CLAUDE-ROADMAP/AUTOPILOT_PROMPT.md` — prompt khởi tạo Claude Code không có ngữ cảnh.
9. `docs/AGENT_COORDINATION.md` — shared claim, handoff, and live-QA safety protocol.
10. `docs/ARCHITECTURE.md` — runtime boundaries and integration contracts.
11. `docs/UI_UX_V1.md` — owner-approved UI/UX v1 baseline; authoritative for the native UI.
12. `docs/MUSIC_SPEC.md` — compact Music contract, commands, persistence, and provider rules.
13. `docs/COMMUNITY_SPEC.md` — compact Community XP, cooldown, leaderboard, and configuration contract.
14. `docs/DASHBOARD_SPEC.md` — dashboard product and UX specification.
15. `docs/DESIGN_SYSTEM.md` — human-owned visual tokens and motion rules.
16. `design-system/localbot/MASTER.md` — generated UI/UX Pro Max base system.
17. `design-system/localbot/pages/dashboard.md` — dashboard override; highest UI priority after UI/UX v1.
18. `docs/ENVIRONMENT.md` — environment variables and security boundaries.
19. `docs/DECISIONS.md` — architectural decisions and tradeoffs.
20. `docs/CLAUDE_SETUP.md` — Claude Code skills and UI/UX skill setup.
21. `docs/CLAUDE_WORKFLOW.md` — compact prompting and handoff workflow.
22. `docs/CLEANUP_CHECKLIST.md` — release-gated cleanup policy; never clean generated or project files early.
23. `docs/REMAINING_GAPS.md` — release gap list, phân biệt code đã chạy với acceptance còn thiếu.
24. `docs/RECOVERY_SPEC.md` — backup restore transaction, recovery copy, rollback, and native restart contract.
25. `docs/PERSISTENCE_SPEC.md` — local JSON schema migration runner, state matrix, and upgrade rules.
26. `docs/SOUNDCLOUD_CREDENTIALS_SPEC.md` — native Windows vault boundary, commands, precedence, and acceptance.
27. `deploy/systemd/localbot.service.example` — non-root slash-only service reference; not a VPS deployment claim.
28. `README-vi.md` — Vietnamese companion to the canonical English README.
29. `docs/CHATGPT_PROJECT_CONTEXT.md` — compact context for planning/roadmap/QA handoffs.
30. `docs/CHATGPT_HANDOFF_PROMPT.md` — ready-to-paste self-contained prompt for a fresh ChatGPT planning session.
31. `docs/CAPABILITY_INVENTORY.md` — evidence-oriented capability and deployment matrix.
32. `docs/CHECKPOINT_2026-09-06.md` — current non-Git workspace baseline and selected SDD slice.
33. `docs/AUDIT_EXPORT_SPEC.md` — scoped JSON/CSV audit export boundary and acceptance.
34. `docs/AUDIT_MODERATION_SPEC.md` — passive Discord moderation-event telemetry boundary and privacy rules.
35. `docs/AUDIT_DISCORD_SPEC.md` — on-demand, permission-checked Discord audit-log read boundary and minimal DTO.
36. `docs/SAFETY_SPEC.md` — AutoMod dry-run/enforce contract, bounded actions, kill switch, and QA safety boundary.
37. `docs/CLEANUP_INVENTORY.md` — classified cleanup candidates and evidence required before final deletion.
38. `docs/RELEASE_QA_RUNBOOK.md` — low-token SDD checklist for deterministic, installed-build, live, accessibility, autostart, and cleanup gates; includes `npm run audit:static`, `npm run audit:docs`, and `npm run qa:live`.
39. `docs/COMMAND_AUDIT_SPEC.md` — metadata-only Discord slash-command accountability and privacy boundary (`LB-LOG-007`).
40. `docs/GUILD_PERMISSIONS_SPEC.md` — read-only effective bot permission diagnostics and highest-role contract (`LB-GUILD-003`).

## Handoff status

`docs/CLAUDE_FIRST_PROMPT.md` is the historical first handoff. The Discord Music backend, native Tauri dev shell, native-owned runtime, opt-in Windows startup registration, native Music integration, Community first slice, and local control contract are now implemented; use the roadmap and targeted specs for follow-up work.

## Demo status

The owner-approved UI/UX v1 is the interactive prototype in `DEMO/uiux-prototype/`; the current native implementation is in `native/`. Historical concept images remain references only.

## Read by task

| Task | Read |
| --- | --- |
| Fix current bot | `ARCHITECTURE`, `ENVIRONMENT`, then targeted source files |
| Add a Discord command | `PROJECT_BRIEF`, `ROADMAP`, `ARCHITECTURE` |
| Audit Discord command execution | `COMMAND_AUDIT_SPEC`, `AUDIT_LOG_SPEC`, `ARCHITECTURE`, `DECISIONS` |
| Add YouTube/SoundCloud/Music behavior | `MUSIC_SPEC`, `ARCHITECTURE`, `ENVIRONMENT`, `DECISIONS` |
| Start the native app | `ROADMAP` Phase 1, `UI_UX_V1`, `DASHBOARD_SPEC`, `DESIGN_SYSTEM`, `CLAUDE_SETUP` |
| Configure Windows startup | `ARCHITECTURE` (`LB-RUNTIME-002`), `DECISIONS` (ADR-020), `ENVIRONMENT`, `native/README.md` |
| Backup/recovery | `RECOVERY_SPEC`, `ARCHITECTURE` (`LB-RUNTIME-005`/`LB-RUNTIME-006`), `DECISIONS` (ADR-024) |
| Change a local JSON shape | `PERSISTENCE_SPEC`, `ARCHITECTURE` (`LB-RUNTIME-004`/`LB-RUNTIME-007`), `DECISIONS` |
| Change dashboard data flow | `ARCHITECTURE`, `ENVIRONMENT`, `DECISIONS` |
| Review visual quality | `UI_UX_V1`, `DASHBOARD_SPEC`, `DESIGN_SYSTEM`, UI/UX Pro Max skill |
| Configure optional Ollama and read-only suggestions | `OLLAMA_SPEC`, `ARCHITECTURE`, `ENVIRONMENT`, `DECISIONS` (ADR-035/ADR-037) |
| Configure local audit retention | `AUDIT_LOG_SPEC`, `ARCHITECTURE`, `DECISIONS`, `AUDIT_STATUS` |
| Configure SoundCloud credentials | `SOUNDCLOUD_CREDENTIALS_SPEC`, `MUSIC_SPEC`, `ENVIRONMENT`, `DECISIONS` |
| Export local audit activity | `AUDIT_EXPORT_SPEC`, `AUDIT_LOG_SPEC`, `ARCHITECTURE`, `DECISIONS` |
| Review Discord moderation telemetry | `AUDIT_MODERATION_SPEC`, `AUDIT_LOG_SPEC`, `SAFETY_SPEC`, `DECISIONS` |
| Read Discord audit activity | `AUDIT_DISCORD_SPEC`, `AUDIT_LOG_SPEC`, `ARCHITECTURE`, `DECISIONS` |
| Configure AutoMod safely | `SAFETY_SPEC`, `ARCHITECTURE`, `DECISIONS`, `AUDIT_STATUS` |
| Run release QA or decide whether cleanup is safe | `RELEASE_QA_RUNBOOK`, `REMAINING_GAPS`, `CLEANUP_CHECKLIST`, `AUDIT_STATUS` |

## Documentation rules

- Keep `CLAUDE.md` short and factual; move procedures and reference material here.
- Every new decision that changes boundaries, ports, auth, storage, or dependencies gets an entry in `DECISIONS.md`.
- Every new route, command, environment variable, or external integration must be documented.
- Mark assumptions as `Proposed`, facts as `Current`, and unfinished work as `Planned`.
- Update stale docs in the same task as the code change that invalidates them.
- Never copy secrets or real IDs into documentation.
- Follow `docs/SDD.md`: every phase-sized change needs a stable requirement ID, an explicit contract, acceptance checks, and QA evidence before it is called complete.
