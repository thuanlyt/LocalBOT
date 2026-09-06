# LocalBot Release Cleanup Checklist

Status: Planned — do not run before the product release gate.

This checklist prevents useful source, QA evidence, UI references, or local data from being deleted while LocalBot is still changing.

## Cleanup gate

Run cleanup only after:

- all approved requirements in the current release are `Current` and their acceptance checks pass;
- `npm test`, backend/native typechecks, and `npm run native:build` pass;
- `npm run native:verify` and the Windows `npm run native:smoke` installer gate pass;
- the installed Windows build has passed startup, bot lifecycle, Discord playback, Windows playback, permissions, offline/error, and accessibility smoke checks;
- the candidate distribution artifacts are signed according to the project's Windows release policy, or an explicit unsigned-internal-release exception is recorded;
- a backup/export of local data has been made;
- every proposed deletion has a reason and a replacement path.

## Keep permanently

- `src/`, `native/src/`, `native/src-tauri/`, package manifests, lockfiles, and tests;
- `docs/SDD.md`, feature specs, ADRs, audit evidence, and `CLAUDE.md` routing docs;
- approved UI references under `DEMO/` and `design-system/`;
- `.env` and local `data/` files. Never delete secrets or user data as part of cleanup.

## Candidates to remove or regenerate only after review

- build output: `dist/`, `native/dist/`, and `native/src-tauri/target/`;
- provider/cache output such as `.cache/youtube/` when a clean cache is intentionally desired;
- unused dependencies after import/reference analysis and a clean install test;
- abandoned prototypes or duplicated assets only when no document, script, import, or QA flow references them.

## Safe procedure

1. Inventory with `rg --files` and search references with `rg`; do not infer from filenames alone.
2. Separate generated output, disposable cache, source, user data, and documentation.
3. Prefer moving candidates to a dated backup/trash folder before permanent deletion.
4. Run the full test/typecheck/build suite after each cleanup group.
5. Re-open the native app and verify HMR, release startup, bot ownership, port `2901`, Music providers, and local persistence.
6. Record what was removed and what can be restored in `docs/AUDIT_STATUS.md`.
