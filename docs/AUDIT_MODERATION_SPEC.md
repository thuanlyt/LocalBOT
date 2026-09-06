# LocalBot — Discord moderation event telemetry specification

Requirement: `LB-LOG-005`

Status: Current for passive event telemetry; actor attribution inside gateway events, remote import, and moderation enforcement remain planned/out of scope. The separate on-demand remote read is `LB-LOG-006`.

## Intent

The local operator needs enough operational context to understand why a server's activity changed. LocalBot records a minimal event when Discord reports message deletion, bulk message deletion, channel deletion, or role deletion. This is observation only: LocalBot does not delete, ban, timeout, lock down, change permissions, or fetch Discord's audit-log payload.

## Behavior

- Message deletion records the guild, channel, count, and `contentStored=false`.
- Bulk deletion records one bounded event with the collection count; counts above `100000` are normalized safely.
- Channel/role deletion records the target ID and `rawAuditPayloadStored=false`.
- Unknown or malformed IDs are represented as `unknown`; raw message content, usernames, member profile data, and actor guesses are never persisted.
- The event listeners use the existing `GuildMessages`/guild event subscriptions. No new privileged intent is required.
- The existing audit store applies its hard entry limit, retention, redaction, and atomic persistence.

## Contract

Records use the existing audit DTO and action namespaces:

- `moderation.message_delete`
- `moderation.message_bulk_delete`
- `moderation.channel_delete`
- `moderation.role_delete`

The actor is intentionally `discord:event` because the gateway event does not prove which human or integration caused the change. A future actor-attribution feature requires a separate permission, intent, privacy, rate-limit, and raw-payload review.

## Failure and safety

- A telemetry write failure is logged as a bounded error and never blocks Discord event processing, Music, Community, or the control server.
- No real destructive test is used in the authorized QA guild. Synthetic formatter fixtures prove shape and bounds.
- The native local audit viewer/export automatically receives only the existing redacted store output; the separate Discord source is on-demand and in-memory under `LB-LOG-006`.

## Acceptance

- Deterministic tests cover each supported event shape, bulk-count bounds, malformed-ID handling, and the absence of content fields.
- Root typecheck/build and `npm test` pass.
- Live QA observes only safe existing audit activity; no deletion or permission mutation is generated for the test.
