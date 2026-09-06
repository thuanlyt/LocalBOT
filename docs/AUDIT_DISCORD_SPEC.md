# LocalBot — Discord remote audit-log read specification

Requirement: `LB-LOG-006`

Status: Current for bounded native read; remote writes, moderation enforcement, and arbitrary Discord mutation remain out of scope.

## Intent

The native operator needs to distinguish LocalBot's own operational history from the authoritative audit history stored by Discord. LocalBot therefore offers an on-demand, guild-scoped read of Discord's official audit-log endpoint.

## Scope

- Read at most the existing control query limit (`1..100`, default `10`) for one guild.
- Require the bot's current `ViewAuditLog` permission before making the remote request.
- Return only stable metadata: event ID, ISO timestamp, action/target type, target ID, executor ID, and executor tag when Discord provides it.
- Keep the result in memory only; do not write remote entries into `audit-log.json`.
- Expose an explicit Local/Discord source choice in native Community with loading, empty, permission, offline, and retryable error states.

## Out of scope

- Fetching or returning `reason`, `changes`, `extra`, raw REST payloads, message content, or target/member profile data.
- Remote audit-log export, arbitrary deletion, Discord permission mutation, moderation enforcement, or actor inference when Discord did not provide an executor.
- Polling Discord audit logs automatically; the native view is on-demand to avoid unnecessary API traffic.

## Contract

`GET /api/v1/guilds/:guildId/audit-log/discord?limit=...` returns:

```json
{
  "guildId": "...",
  "source": "discord",
  "fetchedAt": "2026-09-03T10:00:00.000Z",
  "entries": [
    {
      "id": "...",
      "createdAt": "2026-09-03T10:00:00.000Z",
      "actionType": "Update",
      "targetType": "Channel",
      "targetId": "...",
      "actorId": "...",
      "actorTag": "..."
    }
  ]
}
```

The response is newest-first and contains no raw Discord entry fields. `targetId`, `actorId`, and `actorTag` may be `null` when Discord does not provide them.

Stable failures:

- `409 BOT_NOT_READY`: the Discord client is not ready.
- `403 DISCORD_AUDIT_PERMISSION_DENIED`: the bot cannot read the guild audit log.
- `502 DISCORD_AUDIT_FETCH_FAILED`: Discord read failed; the response is retryable and does not expose provider details.
- Existing guild and query validation errors remain in force.

## State matrix

- Offline: native disables the Discord source and does not claim that a remote read occurred.
- Loading: native shows a skeleton and disables duplicate refresh actions.
- Success with entries: native shows the bounded metadata and the selected guild.
- Success empty: native explains that Discord returned no entries in the requested window.
- Permission/error: native shows the server-confirmed error and a retry action; the prior remote result is not presented as fresh.
- Switching back to Local never mixes remote entries into the local retention/export view.

## Privacy and safety

The control service remains loopback-only and the route is guild-scoped. Remote entries are not included in local backup/export, retention, or local audit history. The implementation must not log the raw Discord response or error object.

## Acceptance

- Deterministic reader tests cover minimal DTO mapping, newest-first ordering, omitted reason/changes, permission denial, and normalized fetch failure.
- Control tests cover guild-scoped response shape, bounded limit forwarding, and secret/raw-payload exclusion.
- Native typecheck/build pass and the Community UI exposes Local/Discord state separation.
- Live QA, when performed, is a read-only request against guild `1541307192534241318`; missing `ViewAuditLog` is accepted as a safe, visible failure.
