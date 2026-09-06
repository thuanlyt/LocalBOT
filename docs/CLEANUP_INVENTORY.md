# LocalBot Cleanup Inventory

Updated: 2026-09-04

This is an inventory, not permission to delete files. Final workspace cleanup is blocked until the installed-build and manual native acceptance gates in `docs/REMAINING_GAPS.md` pass.

## Safe to regenerate, after backup and release acceptance

| Path | Classification | Rule |
| --- | --- | --- |
| `dist/` | Root TypeScript build output | Regenerate with `npm run build`; do not remove while a native build or runtime smoke uses it. |
| `native/dist/` | Native Vite build output | Regenerate with `npm --prefix native run build`; verify native UI after removal. |
| `native/src-tauri/target/` | Cargo/Tauri build output | Regenerate with `npm run native:build`; retain the final MSI/NSIS artifacts and hashes first. |
| `.cache/youtube/` | Provider cache | Remove only when intentionally resetting the YouTube cache; never copy it into backup or installer. |

## Review before removal

| Path | Why it needs review |
| --- | --- |
| `data/native-runtime.log` | User/runtime diagnostic data; rotate or archive, never treat it as disposable build output. |
| `node_modules/` and `native/node_modules/` | Dependency installations; remove only with a clean lockfile install and all checks rerun. |
| Any duplicated asset or prototype | Search references in source, docs, scripts, and QA evidence before moving it to dated backup/trash. |
| `native/src/assets/react.svg` | Unreferenced Vite starter candidate; keep until the final cleanup gate, then re-run reference checks and rebuild before moving it. |

## Keep

- `src/`, `native/src/`, `native/src-tauri/`, tests, package manifests, lockfiles, and generated-resource preparation scripts.
- `docs/`, `CLAUDE.md`, `CODEX-ROADMAP/`, and `CLAUDE-ROADMAP/`.
- Approved UI references in `DEMO/`, `DESIGN/`, and `design-system/`.
- `.env` and all files under `data/`; these may contain user configuration or operational history.

## Current cleanup already applied

- Removed unused Vite/Tauri starter assets from `native/public/` after reference checks.
- Native release staging removes source maps and package test/spec files and fails the build if any remain.
- `npm run native:verify` provides a deterministic post-build check for the bundled runtime, environment-file exclusion, starter assets, and MSI/NSIS presence.

## Required evidence before final deletion

1. Export/backup local data and record the recovery location privately.
2. Confirm all current requirements and installed-build gates are accepted.
3. Move each approved generated candidate to dated backup/trash, not permanent deletion first.
4. Run the complete test/typecheck/build/release suite and reopen the native app.
5. Record exact removals and restoration steps in `docs/AUDIT_STATUS.md`.
