# LocalBot — Audit log policy specification

Requirements: `LB-LOG-003`, `LB-LOG-008`

Status: Current for local policy editing; the separate read-only Discord view is defined by `LB-LOG-006` in `docs/AUDIT_DISCORD_SPEC.md`.

## Intent

The native operator should be able to inspect and tune local operational-log retention without editing `.env` or restarting blindly. Retention is a safety policy, not a delete tool: LocalBot keeps the hard 2,000-entry limit, redacts credential-like text before writing, and never exposes raw provider payloads.

## Scope

- Store the effective `retentionDays` (`null` or `1..3650`) in the version-one `audit-log.json` metadata.
- Preserve compatibility with existing version-one files that contain only `version` and `entries`; those use the environment default until a native save occurs.
- Expose validated native/control update routes and return normalized server-confirmed values. Every
  successful control-plane mutation, including Equalizer preset/band updates, emits a metadata-only
  local audit event before its success response; read-only search/preview routes do not create
  mutation events.
- Prune expired entries atomically when the policy changes.
- Include the policy in the existing credential-free audit backup store.

## Out of scope

- Arbitrary entry deletion, importing remote Discord audit entries into this store, unredacted diagnostics, remote access, or changing who owns an event.
- Disabling the hard 2,000-entry bound.
- Persisting tokens, cookies, authorization headers, provider payloads, message content, or private member data.

## Contract

`GET /api/v1/audit-log/settings` returns:

```json
{ "retentionDays": null, "maxEntries": 2000 }
```

`POST /api/v1/audit-log/settings` accepts `{ "retentionDays": null | integer }`. Integer values must be `1..3650`; `null` means no time-based pruning beyond the hard cap. The response is the normalized effective settings. Invalid input returns `400 INVALID_AUDIT_SETTINGS` and leaves both file and in-memory policy unchanged.

The version-one audit store may contain:

```json
{
  "version": 1,
  "entries": [],
  "settings": { "retentionDays": null }
}
```

## LB-LOG-008 — Mutation audit sequencing

Successful state-changing Control API operations must attempt their metadata-only local audit
write before the HTTP success response is committed. This includes provider settings, Ollama
settings/actions, backup export/restore, slash registration, AutoMod and greeting mutations,
Community settings/reset, playlist CRUD/play, Equalizer, Music permissions, voice join/leave,
player actions, and queue mutations. Read-only queries, search, preview, health, and stream
requests do not create mutation events.

The audit store is injected through the same request boundary used by the operation; a route must
never silently fall back to a process-global audit store when an isolated store is supplied for a
runtime or test. Audit persistence failure remains isolated: the route may complete its primary
operation and return its normal success response, but it must await the audit attempt and emit only
a redacted operational error. It must not expose the failed payload, credentials, or provider data.

Acceptance requires deterministic control tests that prove an injected audit store receives the
event before a mutation response resolves, and that every mutation call site awaits the common
audit boundary. A failure-injected audit store must not turn an otherwise completed primary
operation into a false rollback or an unhandled rejection.

## State and acceptance

- Native offline/loading/error states never claim a policy was saved.
- A successful update prunes old entries, writes atomically, and returns the new effective value.
- A failed write leaves the previous policy and entries intact in memory and on disk.
- Deterministic tests cover legacy files, bounds, null reset, pruning, persistence, and failed-update non-mutation; control tests cover route validation and response shape.
