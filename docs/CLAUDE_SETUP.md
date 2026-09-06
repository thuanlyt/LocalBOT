# Claude Code Setup

## Project instructions

Claude Code automatically reads a project-level `CLAUDE.md`. LocalBot keeps durable facts and high-priority guardrails in the root file, while detailed material is linked under `docs/`.

## Project skill

The project-local skill is:

`.claude/skills/localbot-project/SKILL.md`

It is intentionally short and points to the documents that should be loaded for each task. Do not duplicate all roadmap or design content inside the skill; skill content remains in context after loading.

## UI/UX Pro Max skill

The suggested external skill is [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill). Its documented Claude Code installation options are:

```text
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

Or use its CLI installer:

```text
npm install -g ui-ux-pro-max-cli
uipro init --ai claude
```

Use the skill for native app/dashboard UI tasks. The recommended workflow is: detect the actual stack, generate a design system first, persist it under the project, then implement screens against the master system and page overrides. The generator has now been run with Python 3; the generated base is in `design-system/localbot/MASTER.md` and the dashboard/app-specific override is in `design-system/localbot/pages/dashboard.md`. `docs/UI_UX_V1.md` is the owner-approved visual baseline, while `docs/DESIGN_SYSTEM.md` remains the human-owned rationale and token refinement layer.

## UI task rule

Before Claude writes native app or dashboard UI:

1. Read `docs/DASHBOARD_SPEC.md` and `docs/DESIGN_SYSTEM.md`.
2. Confirm the actual stack from the native app manifest/package files; do not assume.
3. If the external skill is installed and Python is available, run its design-system workflow for the actual native/web stack and persist the result. Preserve project decisions unless the user explicitly changes them.
4. Check accessibility, responsive behavior, reduced motion, loading, empty, error, and stale-data states.
5. For Tauri, run a native-window smoke check; for an optional web companion, run a visual/browser check before calling the phase complete.
