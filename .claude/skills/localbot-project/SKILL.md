---
name: localbot-project
description: Use for any LocalBot feature, bug fix, architecture change, native app/dashboard work, documentation update, or Claude Code handoff. It keeps work phase-sized, docs-first, secret-safe, and aligned with the project's current bot and planned Tauri Windows app.
---

# LocalBot project workflow

1. Read `CLAUDE.md`, `docs/README.md`, and `docs/SDD.md`.
2. Load only the task-specific documents from the index.
3. Identify the stable requirement ID, roadmap phase, target files, contract, acceptance criteria, and out-of-scope work before editing. If the requirement is absent, update the relevant spec first.
4. Never read or print `.env`; never scan `node_modules/`, `dist/`, or `.cache/` by default.
5. Preserve unrelated user changes and avoid opportunistic dependency/refactor work.
6. For native app UI, read `docs/UI_UX_V1.md` first, then `docs/DASHBOARD_SPEC.md`, `docs/DESIGN_SYSTEM.md`, `DEMO/README.md`, `design-system/localbot/MASTER.md`, and `design-system/localbot/pages/dashboard.md`; use the UI/UX Pro Max skill when available. UI/UX v1 is approved and must not be redesigned implicitly. The direction is strict black/white/neutral grayscale, Be Vietnam Pro, friendly Vietnamese copy, Dark as the default theme, and purposeful motion.
7. Keep Discord/YouTube credentials and raw provider responses server-side. Never add fake production data to satisfy an undefined state; render loading/empty/offline/error instead.
8. Run the smallest relevant checks, then reconcile every acceptance item, update docs, and report exact evidence.

## Reference map

- Product scope: `docs/PROJECT_BRIEF.md`
- Delivery order: `docs/ROADMAP.md`
- Boundaries/contracts: `docs/ARCHITECTURE.md`
- Dashboard UX: `docs/DASHBOARD_SPEC.md`
- Design tokens/motion: `docs/DESIGN_SYSTEM.md`
- Env/security: `docs/ENVIRONMENT.md`
- Decisions: `docs/DECISIONS.md`
- Prompt/handoff discipline: `docs/CLAUDE_WORKFLOW.md`
- Approved UI baseline: `docs/UI_UX_V1.md`
