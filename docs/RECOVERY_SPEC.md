# LocalBot Recovery Specification

Status: `LB-RUNTIME-006` implemented in the native-first local control plane; installed-build and failure-injection acceptance remain release gates.

## Objective

Allow an operator to restore the credential-free JSON backup produced by `GET /api/v1/data/export` without corrupting local state, leaking secrets, or silently leaving the running bot on a mixed old/new cache.

## In scope

- Native Settings can select a `.json` backup and request restore through the loopback control API.
- The operator must explicitly confirm the destructive replacement.
- The backend validates the version-one envelope and rejects sensitive-looking object keys.
- All ten known local stores are staged before any live file is replaced.
- The previous store set is retained as a recovery backup; replacement is rolled back when installation fails.
- The response reports that a runtime restart is required. The native app offers an explicit restart action so in-memory player/store state is reloaded as one unit.

## Contract

`POST /api/v1/data/restore`

Request:

```json
{
  "confirm": true,
  "backup": {
    "format": "localbot-backup",
    "version": 1,
    "exportedAt": "2026-09-03T00:00:00.000Z",
    "stores": {}
  }
}
```

Success (`200`):

```json
{
  "restoredAt": "2026-09-03T00:00:00.000Z",
  "stores": ["playlists", "musicPermissions", "equalizer", "community", "audit", "playerState", "greetings", "automod", "automodReview", "ollama"],
  "restartRequired": true,
  "recoveryFile": "localbot-pre-restore-....json"
}
```

Stable failures:

- `400 RESTORE_CONFIRMATION_REQUIRED` when `confirm` is not `true`.
- `400 INVALID_BACKUP` when the JSON envelope, version, store shape, or sensitive-key policy fails.
- `409 RESTORE_FAILED` when staging or transaction installation fails. The service attempts rollback and does not claim success.
- `413 BODY_TOO_LARGE` when the request exceeds the local control-plane restore limit.

The route accepts only data already represented by the known backup envelope. It never accepts or writes `.env`, tokens, cookies, OAuth material, runtime binaries, provider caches, or arbitrary file paths. The response contains only timestamps, fixed store names, the restart flag, and a recovery filename.

## Transaction rules

1. Validate the complete request and backup before touching a live store.
2. Read the current stores into a credential-free pre-restore recovery file.
3. Write every replacement into a sibling temporary file and verify the staged JSON can be read as a valid version-one store envelope.
4. Move existing files to transaction-scoped backup names, then atomically rename staged files into place.
5. On any installation failure, remove only newly installed transaction files and restore the moved originals. Keep the pre-restore recovery file for operator recovery.
6. On success, remove transaction scratch backups but retain the pre-restore recovery file.
7. Return `restartRequired: true`; the native app must not present restored in-memory state as active until the owned runtime has been restarted and health reconciliation completes.

## Native UX

- Settings shows “Nhập backup local” beside the existing export action.
- File selection is local-only and limited to JSON files.
- Confirmation explains that ten local stores will be replaced and that a recovery copy will be retained.
- After success, Settings shows “Khởi động lại bot để áp dụng”; until then it does not claim the running player has loaded the restored data.
- Restart uses the existing native-owned stop/start path. If the runtime is already offline, the app starts it and waits for the normal readiness reconciliation.
- Errors are shown as actionable toasts without raw paths, payloads, or secrets.

## Acceptance

- Valid exported backup restores all ten stores and returns `restartRequired: true`.
- Missing confirmation, malformed JSON, wrong version, incomplete stores, and sensitive-key payloads are rejected without changing any live file.
- An injected installation failure leaves the original store bytes intact after rollback and retains a recovery file.
- Native restore and restart update health/state through the existing polling/SSE reconciliation; no stale success state remains.
- `npm test`, root/native typecheck, Vite build, `cargo check`, and Tauri release build pass.
