# Claude Code Workflow for LocalBot

## Goal

Give Claude enough context to make a correct change without forcing a full codebase scan. Use progressive disclosure, stable requirement IDs, and phase-sized tasks. The project follows `docs/SDD.md`: the spec is written or updated before implementation.

## Token-efficient task recipe

Start each task with a prompt containing:

```text
Read CLAUDE.md, docs/README.md, and docs/SDD.md. Work only on requirement [LB-AREA-NNN] in [phase/task].
Load [specific docs]. Do not scan node_modules, dist, .cache, or .env.
Inspect targeted files/symbols, preserve unrelated changes, and do not refactor outside scope.
Before editing, state scope, out-of-scope behavior, contract, state matrix, files likely to change, and acceptance criteria.
After editing, run [checks], reconcile each acceptance item, update affected docs, and report changed files, risks, evidence, and one next step.
```

## SDD task gate

Claude must not start implementation until the task has:

1. A stable requirement ID linked to a roadmap phase.
2. Explicit scope and out-of-scope behavior.
3. A backend/API/DTO or UI interaction contract.
4. Loading, success, empty, offline/error, and stale states where relevant.
5. Deterministic acceptance checks and the smallest relevant QA command set.

If the request changes a port, environment key, dependency, persistence format, provider, auth boundary, or runtime topology, add or update an ADR before implementation.

## Read budget

- Always: `CLAUDE.md`, `docs/README.md`.
- Feature work: one product doc + one architecture doc + one relevant spec.
- UI work: `UI_UX_V1` + native app spec + design system + UI/UX skill; do not load bot internals unless the data contract requires it. Treat v1 as approved; do not redesign by assumption.
- API work: architecture + environment + decisions; inspect only route/service symbols involved.
- Load source files after the plan, not before.

## Search budget

Prefer targeted searches such as:

```text
rg -n "symbol|route|command|ENV_NAME" src dashboard docs
rg --files -g "!node_modules" -g "!dist" -g "!.cache" -g "!*.env*"
```

Avoid broad recursive listings and generated directories. If a dependency issue requires generated output, inspect only the exact package/file and say why.

## Change discipline

- One user-visible slice per task.
- No opportunistic rewrites, dependency upgrades, or formatting churn.
- Do not combine native shell, auth, control API, and YouTube features in one task.
- Prefer an adapter/service boundary over leaking Discord.js or provider-specific types into the native UI.
- Keep error codes stable and user messages safe.

## Verification matrix

| Change | Minimum checks |
| --- | --- |
| Bot/TypeScript | `npm run typecheck`, targeted tests |
| YouTube adapter | unit tests + sanitized live smoke test when network is available |
| Dashboard UI | lint/typecheck/build + browser responsive/accessibility smoke test |
| Control API | contract tests + unauthorized/invalid-input cases |
| Env/config | missing-key test; confirm values are never logged |

## Handoff format

Claude should end each task with:

1. Requirement IDs and roadmap phase.
2. What changed, in user-visible terms.
3. Acceptance evidence item by item.
4. Files changed.
5. Checks run and exact result.
6. Risks/known limitations, including any Planned work still visible.
7. One recommended next task, no more than one phase ahead.

## Ready-to-paste prompts

### Native app shell (historical bootstrap)

> Read `CLAUDE.md`, `docs/README.md`, Roadmap Phase 1, `docs/UI_UX_V1.md`, `docs/DASHBOARD_SPEC.md`, `docs/DESIGN_SYSTEM.md`, `DEMO/README.md`, `design-system/localbot/MASTER.md`, `design-system/localbot/pages/dashboard.md`, and `docs/CLAUDE_SETUP.md`. Build only the Tauri 2 native Windows shell in `native/`. Do not implement the bot control API or auth. Follow the approved v1: strict black/white/neutral grayscale only, Be Vietnam Pro throughout, Dark as the default theme, explicit `Default` / `Dark` / `Light` three-state toggle using SunMoon / Moon / Sun icons, approved floating navigation behavior, accessible purposeful motion, and explicit loading/empty/error states. Keep the control bridge at `127.0.0.1:2901`. Run native-window checks and report exact results.

### Control plane (historical bootstrap)

> Read `CLAUDE.md`, Roadmap Phase 2, `docs/ARCHITECTURE.md`, `docs/ENVIRONMENT.md`, and `docs/DECISIONS.md`. Design and implement only health + read-only player state first. Keep the control plane loopback-only at `127.0.0.1:2901`, versioned, and secret-free. Do not build native UI in this task. Add contract tests and update the API table with actual behavior.

### YouTube native app (historical bootstrap)

> Read `CLAUDE.md`, Roadmap Phase 3, `docs/DASHBOARD_SPEC.md`, `docs/DESIGN_SYSTEM.md`, and the control API contract. Implement only native-app search → result → enqueue/play plus now playing/queue controls, with an explicit local Windows output target and Discord voice output target. Handle loading, empty, error, stale, long-title, live-video, and reduced-motion states. Do not add recommendations, persistence, auth, or unrelated bot commands.
