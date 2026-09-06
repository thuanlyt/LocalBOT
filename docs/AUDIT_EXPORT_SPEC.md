# LocalBot — Scoped audit export specification

Requirement: `LB-LOG-004`

Status: Current for the local native/control slice; richer permission boundaries and Discord moderation-event ingestion remain planned.

## Intent

An operator may download the visible operational history for one selected guild for troubleshooting or local review. Export is deliberately scoped and bounded; it is not a raw diagnostic dump or a cross-guild archive tool.

## Contract

`GET /api/v1/audit-log/export` requires:

- `guildId`: non-empty string, maximum 64 characters. There is no all-guild export.
- `limit`: optional integer `1..100`; default `10`.
- `action`: optional same namespace filter as `GET /api/v1/audit-log`.
- `search`: optional case-insensitive search, maximum 100 characters.
- `format`: optional `json` (default) or `csv`.

Missing guild scope returns `400 GUILD_SCOPE_REQUIRED`. Invalid query values return the standard `400 INVALID_QUERY` response.

### JSON

The response is an attachment with `application/json` and this shape:

```json
{
  "format": "localbot-audit",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "guildId": "guild-id",
  "entries": []
}
```

### CSV

The response is an attachment with `text/csv` and the columns:

`id,timestamp,actor,action,guildId,detail`

Values are quoted and spreadsheet-formula prefixes are neutralized. Both formats contain only entries returned by the bounded `AuditLogStore`, which already applies write-time redaction and retention.

## Security and failure rules

- Export stays loopback-only and has no new authentication or remote exposure.
- No token, cookie, OAuth material, authorization header, raw provider response, or unredacted message content may be exported.
- The selected guild scope is preserved even when the filtered result is empty.
- The export audit event is recorded after the response body is prepared; failure to record it does not make the download contain secrets or fail the user action.
- Native disables export while offline, without a selected guild, or while another export is in progress.
- Export does not delete or mutate audit entries.

## Acceptance

- Deterministic control tests cover missing scope, JSON shape, guild isolation, redaction, CSV headers/content, and invalid format.
- Native Community offers JSON and CSV actions using the current search/action filters and reports download failure honestly.
- `npm test`, root typecheck, native typecheck, and release build pass.
