# LocalBot — Safety / AutoMod Specification

Status: Current contract for `LB-SAFETY-001` through `LB-SAFETY-008`; enforcement and privileged content access are opt-in and disabled by default.

## Product intent

LocalBot should help an operator understand moderation risk without silently changing a real guild. The safety engine is deterministic and guild-scoped: dry-run evaluates and audits, while an explicitly enabled enforcement mode may apply only bounded, permission-checked message actions.

## LB-SAFETY-001 — AutoMod dry-run detection

Status: Implemented deterministic/control slice · owner decision: approved for local-only administration

Scope:

- Persist version-one AutoMod settings per guild in local JSON.
- Support `spam`, `flood`, `link`, and `scam` rules.
- Support per-rule enablement, proposed action, thresholds/windows, blocked domains, and user/role exemptions.
- Evaluate only non-bot guild messages when a guild policy is explicitly enabled.
- Record a redacted `automod.dry_run_match` audit event without message content.
- Expose validated GET/POST settings through the loopback control API.
- Keep the in-memory detector bounded and expire message history by the configured windows.

Out of scope:

- Deleting messages, timeout/ban/kick, quarantine, lockdown, role changes, permission changes, anti-raid, anti-nuke, appeals, remote administration, or AI decisions.
- Reading Discord's remote moderation/audit-log API.
- Treating a URL as malicious merely because it exists; link detection uses only the configured blocked-domain list.
- Testing destructive actions against guild `1541307192534241318`.

## Rules and defaults

The guild policy defaults to disabled, with every rule disabled. `mode` defaults to `dry-run`; changing it to `enforce` is an explicit operator action in the native UI. Enabling the policy and selecting enforcement are separate settings.

- `spam`: match when the same normalized message from one user in one channel reaches `threshold` occurrences within `windowSeconds` (defaults `3` and `30`).
- `flood`: match when one user reaches `threshold` messages in the guild within `windowSeconds` (defaults `6` and `10`).
- `link`: match only an HTTP(S) URL whose hostname equals or is a subdomain of a configured blocked domain. Domains are normalized and bounded.
- `scam`: match bounded, case-insensitive scam phrases such as free Nitro/reward claims, account verification bait, or crypto giveaway bait. This is heuristic and must remain dry-run until false-positive review exists.

Each rule carries `proposedAction` (`alert`, `delete`, `timeout`, or `quarantine`). In `dry-run` it is observability only. In `enforce`, only `delete` and `timeout` proposed by message rules (`spam`, `flood`, `link`, `scam`) can be applied; `alert`, `quarantine`, `antiRaid`, and `antiNuke` remain non-mutating and are recorded as unsupported/alert-only outcomes.

## LB-SAFETY-003 — Bounded message enforcement

Status: Implemented opt-in enforcement slice · owner decision: local operator only; live destructive QA remains prohibited.

Rules:

- Enforcement is active only when the persisted guild settings have both `enabled:true` and `mode:"enforce"`.
- A single message produces at most one Discord mutation. If several rules match, `timeout` has priority over `delete`; ties follow detector rule order.
- `delete` calls Discord only when the message is deletable. `timeout` calls Discord only when the target member is present and `moderatable`; the fixed timeout is 60 seconds.
- The bot never deletes or times out itself, never bulk-deletes, never bans/kicks, never changes roles/permissions, and never locks down a channel or guild.
- `antiRaid` and `antiNuke` are telemetry-only in this requirement, even when `mode` is `enforce`.
- A per-guild action limiter allows at most 20 enforcement mutations per rolling 60 seconds. Over-limit and missing-permission results are audited without mutation.
- Every match is recorded through the redacted audit boundary with `mode`, proposed action, outcome, and `enforced` state. Message content, usernames, raw Discord payloads, and cookies are never stored.
- The native UI must show the enforcement warning and require an explicit confirmation before saving `mode:"enforce"`. The master kill switch persists `enabled:false` and is available in both modes.

Supported outcomes are `deleted`, `timed_out`, `alerted`, `unsupported`, `permission_denied`, `rate_limited`, and `failed`. An enforcement operation is considered successful only for `deleted` or `timed_out`.

## Contract

`GET /api/v1/guilds/:guildId/automod`

Returns:

```json
{
  "settings": {
    "enabled": false,
    "mode": "dry-run",
    "rules": {
      "spam": { "enabled": false, "proposedAction": "alert", "threshold": 3, "windowSeconds": 30 },
      "flood": { "enabled": false, "proposedAction": "alert", "threshold": 6, "windowSeconds": 10 },
      "link": { "enabled": false, "proposedAction": "alert", "blockedDomains": [] },
      "scam": { "enabled": false, "proposedAction": "alert" }
    },
    "exemptUserIds": [],
    "exemptRoleIds": []
  }
}
```

`POST /api/v1/guilds/:guildId/automod`

Accepts the same `settings` object, validates all bounds, persists atomically, and returns the normalized settings. Invalid writes return the standard `INVALID_INPUT` error and do not mutate local state.

## State and failure contract

- Disabled/offline: no detector state is created and the native/control surface reports the policy as unavailable/offline rather than implying protection.
- Enabled/dry-run: a match produces an audit event and a result with `enforced:false`; the message remains untouched.
- Enabled/enforce: a message match is evaluated by the bounded action policy; at most one permission-checked mutation is attempted, and failure or unsupported actions leave the message/member untouched.
- Exempt: no match and no audit event for the exempt user/role.
- Invalid settings: reject with a stable validation error and preserve the previous settings.
- Persistence corruption: quarantine the file and use safe disabled defaults through the shared persistence boundary.
- Detector memory: bounded per-guild history is pruned by time and maximum entries; it is not exported as user data.

## Acceptance

- Unit tests prove normalization, domain-boundary matching, scam patterns, spam/flood thresholds, exemptions, bounded history, and dry-run-only results.
- Store tests prove defaults, validation non-mutation, atomic persistence, and corruption quarantine.
- Control tests prove guild scoping, GET/POST shape, invalid-write rejection, and no secret/message content in the response.
- Runtime integration calls the evaluator only for non-bot guild messages and records a redacted audit event. Enforcement tests use synthetic Discord-shaped fixtures; live QA never enables enforcement or sends destructive fixtures to guild `1541307192534241318`.
- Root test/typecheck/build and native typecheck remain green.
- Live QA is limited to reading/setting this dry-run policy and observing sanitized audit entries; no destructive moderation is performed.

## Follow-up requirements

- `LB-SAFETY-002`: native Safety editor, rule preview, audit review, and operator kill switch.
- `LB-SAFETY-003`: explicit enforcement behind separate confirmation, permission checks, rate limits, reversible actions, and isolated fixtures.
- `LB-SAFETY-004`: anti-raid and anti-nuke detection/recovery using synthetic or disposable resources only.

## LB-SAFETY-004 — Anti-raid and anti-nuke dry-run telemetry

Status: Implemented deterministic/event telemetry, bounded message enforcement, per-guild memory reset, and emergency safe-mode recovery; anti-raid/anti-nuke enforcement, lockdown, broader recovery, review, and appeals remain explicitly planned.

Scope:

- Add bounded per-guild `antiRaid` and `antiNuke` threshold rules to the existing version-one AutoMod settings. Legacy settings normalize to both rules disabled.
- Observe real member-join events when the already opt-in Members Intent is enabled, and observe channel/role deletion events as destructive-change telemetry.
- Report only a redacted dry-run match with rule, event kind, threshold, proposed action, and `enforced:false`; do not include message content, raw audit-log payloads, or private member data.
- Keep event history in memory only, bounded and time-pruned. A bot restart clears detector history safely.

Out of scope:

- Message deletion, timeout, ban, kick, role/permission mutation, quarantine, lockdown, audit-log actor lookup, or automatic recovery.
- Treating every channel/role event as proof of malicious intent. These are signals for operator review only.
- Testing destructive behavior against guild `1541307192534241318`.

Contract:

- `antiRaid` and `antiNuke` each use `enabled`, `proposedAction`, `threshold`, `windowSeconds`, and `cooldownSeconds` with the same bounds as other threshold rules.
- `antiRaid` counts member joins per guild inside its configured window.
- `antiNuke` counts observed channel/role destructive-change signals per guild inside its configured window.
- Native AutoMod presents both rules as dry-run-only controls and persists only after a normalized API response.

Acceptance:

- Unit tests cover legacy normalization, bounded threshold validation, join/destructive event thresholds, cooldowns, history bounds, and `enforced:false` results.
- Runtime tests prove member-join handling is still gated by Members Intent and destructive telemetry never calls Discord mutation APIs.
- Native typecheck/build and control persistence tests remain green.
- Live QA may enable/read the rules and inspect sanitized audit entries; no destructive response is activated.

## LB-SAFETY-002 — Native dry-run policy editor

Status: Implemented native editor/kill-switch slice · owner decision: approved for local-only administration

Scope: expose the `LB-SAFETY-001` settings in the native Community/Safety surface using the selected real guild; allow the operator to enable/disable the policy, select dry-run or the separately gated bounded enforcement mode, enable/disable each rule, choose its action, edit bounded thresholds/windows/cooldowns, and edit bounded blocked-domain/user/role lists. Every save must go through the control API and show the returned normalized state. The editor includes a mode-specific safety warning and an immediate disable/kill-switch action that persists `enabled:false`.

Out of scope for this requirement: executing Discord message mutation, timeout/ban/kick, role/permission mutation, anti-raid, anti-nuke, arbitrary message replay, and AI-generated policy changes. Execution is defined separately by `LB-SAFETY-003`.

States: no selected guild or offline shows an honest disabled editor; loading shows skeleton/disabled controls; invalid save preserves the last server-confirmed draft and shows the API error; successful save replaces the draft with the normalized API response; the kill switch is a normal validated save and reports success only after the response returns.

Acceptance: native typecheck/build pass; the editor loads only from `GET /api/v1/guilds/:guildId/automod`, saves only through `POST`, visibly identifies the current mode, gates enforce-mode save with confirmation, and does not invent guild/rule data. The kill switch persists `enabled:false` only after a successful normalized API response. Manual keyboard/focus/reduced-motion review remains part of the native QA gate.

## LB-SAFETY-003 — Native enforcement gate and runtime actions

Status: Implemented bounded message enforcement; isolated-fixture and manual installed-build acceptance remain release gates.

The control API accepts `mode:"dry-run"` or `mode:"enforce"` through the same atomic, guild-scoped settings boundary. The native editor displays the current mode, warns that enforcement can delete a triggering message or timeout its author for 60 seconds, and requires a confirmation before an enforce-mode save. Runtime actions are limited to one message mutation per match cycle, use Discord's `deletable`/`moderatable` checks, enforce a 20-per-guild rolling-minute limiter, and audit every result. Anti-raid/anti-nuke remain alert-only until a separate recovery/lockdown contract exists.

Acceptance evidence requires deterministic policy/limiter tests, invalid-write non-mutation, root/native checks, and a review that the QA guild remains in disabled/dry-run mode. No real message deletion, timeout, raid, nuke, or lockdown is part of live acceptance.

## LB-SAFETY-005 — Clear detector memory when a guild policy is disabled

Status: Current implementation slice · owner decision: approved for local-only safety hardening

When a guild AutoMod policy is disabled, the in-memory message/security history and cooldown markers for that guild must be cleared. Re-enabling the policy must start from a clean observation window; a disabled interval must not contribute old messages or events to a later threshold match. Clearing one guild must not affect detector state for another guild, and it must not touch persisted settings or audit history.

Contract: `AutoModEngine.evaluate` and `evaluateSecurityEvent` clear the target guild's volatile state before returning no matches for `enabled:false`. `resetGuild(guildId)` is a bounded local operation; the existing `reset()` remains available for process shutdown/tests. No API route, Discord mutation, or data export is introduced.

Acceptance: deterministic tests prove message history, security history, and cooldown markers do not cross a disabled interval; state for another guild remains intact; existing AutoMod detection/enforcement tests remain green. No secrets, message content, member data, or raw Discord payloads are involved.

## LB-SAFETY-006 — Emergency safe-mode recovery

Status: Current implementation slice · owner decision: approved for local-only safety hardening

When an operator confirms an emergency recovery for a selected guild, LocalBot must atomically set that guild's AutoMod policy to `enabled:false` and `mode:"dry-run"`, clear its volatile detector state immediately, and return the server-confirmed normalized settings. The operation must not delete messages, timeout members, change Discord permissions, alter another guild, or remove persisted audit history and rule configuration.

Contract: `POST /api/v1/guilds/:guildId/automod/recover` accepts only `{ "confirm": true }` and returns `{ "recovered": true, "settings": AutoModSettings }`. Missing/false confirmation returns `400 AUTOMOD_RECOVERY_CONFIRMATION_REQUIRED`; a persistence failure returns the existing generic safe error and does not claim recovery. A successful recovery records only a bounded redacted `automod.safe_recovery` audit event. Native shows an explicit confirmation dialog and updates its draft only after the response succeeds.

Acceptance: control tests prove confirmation, safe-mode normalization, guild scoping, and response shape; the native typecheck/build remains green; the runtime callback clears volatile state immediately. No live destructive or moderation action is part of this requirement.

## LB-SAFETY-007 — Bounded AutoMod review queue

Status: Implemented local store/control/native slice · owner decision: approved for local native administration

Product intent: an operator needs to review heuristic matches and distinguish a confirmed
signal from a false positive without re-reading message content or silently applying another
Discord mutation. The queue is a local, guild-scoped review record; it is not a message archive.

Scope:

- Persist at most 1,000 redacted AutoMod review records with the rule, deterministic reason,
  proposed action, observed outcome, enforcement flag, guild/channel/user IDs, timestamp, and
  review status (`open`, `confirmed`, or `dismissed`). Message content, usernames, raw Discord
  payloads, provider data, and credentials are never stored.
- Create one record for every detector match, including coalesced/unsupported/permission-denied
  outcomes, so the operator can see what the engine observed even when no mutation occurred.
- Expose a bounded read route and a confirmation-gated decision route through the loopback
  control plane. Decisions are local annotations and do not delete, restore, timeout, ban,
  quarantine, or change Discord state.
- Show the queue in the native Community/Safety surface with honest loading, empty, offline,
  stale/error, and server-confirmed decision states. The native UI must never invent a review
  record or claim that a Discord action was reversed.

Out of scope: public user appeal intake, message-content recovery, automatic reversal or
punishment, anti-raid/anti-nuke enforcement, remote administration, and AI-generated decisions.

Contract:

- `GET /api/v1/guilds/:guildId/automod/review?status=open&limit=50` returns
  `{ guildId, entries }`; `status` is optional (`open|confirmed|dismissed`) and `limit` is
  bounded to `1..100`.
- `POST /api/v1/guilds/:guildId/automod/review/:reviewId` accepts
  `{ decision: "confirm"|"dismiss", note?: string }`. Notes are optional, trimmed, and capped
  at 240 characters. The server returns `{ entry }` only after atomic persistence. An already
  reviewed entry rejects an opposite decision with `409 REVIEW_ALREADY_DECIDED` and is
  idempotent for the same decision.
- The persisted store is `data/automod-review.json`, version `1`, and is included in the
  credential-free backup/restore envelope. Corruption is quarantined by the shared persistence
  helper; a future or invalid version never becomes current data.

Failure states: missing/invalid guild or review ID, invalid status/decision/note, persistence
failure, and offline native bridge are explicit errors with no partial decision. An empty queue
is a valid state. Review decisions are auditable but do not become Discord moderation actions.

Acceptance: deterministic store tests cover bounds, guild isolation, empty state, persistence,
same-decision idempotency, opposite-decision rejection, note limits, and corruption recovery;
control tests cover query/body validation, route scope, response shape, and non-mutation of
Discord fixtures; native typecheck/build and backup/restore tests remain green. Live QA is
read-only and must not create destructive AutoMod matches in the authorized guild.

## LB-SAFETY-008 — Explicit Message Content Intent capability

Status: Current implementation slice · owner decision: explicit operator opt-in

Product intent: content-based rules must never appear operational when the Discord gateway is
not allowed to deliver message content. LocalBot must make the privileged capability visible and
must fail safely when the operator has not enabled it.

Contract:

- `LOCALBOT_MESSAGE_CONTENT_INTENT` defaults to `false`.
- `GatewayIntentBits.MessageContent` is added only when the environment flag is exactly `true`.
- The operator must also enable Message Content Intent in the Discord Developer Portal before
  setting the flag. LocalBot cannot change that portal setting.
- When the flag is disabled, content-based AutoMod evaluation (`spam`, `flood`, `link`, and
  `scam`) is a safe no-op: it creates no false match, review entry, enforcement attempt, or
  content-derived audit event from an empty/unavailable message body. Community XP and the
  independent anti-raid/anti-nuke event telemetry remain available under their own contracts.
- `GET` and `POST /api/v1/guilds/:guildId/automod` return
  `capabilities.messageContentIntentEnabled` alongside server-confirmed settings. Native must
  display the disabled capability and the exact portal/env action instead of implying coverage.
- Enabling the flag without enabling the Discord portal capability may cause Discord login to
  fail; the error remains a visible startup/readiness failure and is never treated as protected
  operation.

Acceptance: pure intent-builder tests prove independent member/content gating; runtime tests
prove content inspection is skipped when disabled; control/native tests prove the capability is
returned and rendered; docs and environment contract mention both the portal switch and
`LOCALBOT_MESSAGE_CONTENT_INTENT=true`. Live QA must not enable enforcement or send destructive
fixtures to guild `1541307192534241318`.
