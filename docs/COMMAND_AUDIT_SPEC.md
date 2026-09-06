# LocalBot Discord command audit specification

Requirement: `LB-LOG-007`

Status: Current for slash-command accountability; argument-level content logging remains out of scope.

## Intent

LocalBot must make Discord command execution attributable without storing the command's search text,
URLs, playlist names, provider payloads, or credential-like arguments. The local operator can therefore
distinguish a successful, denied, or failed command from native/control activity without turning the
audit log into a content archive.

## Contract

After each `ChatInputCommandInteraction`, the runtime records one local audit entry using the existing
bounded/redacted `AuditLogStore`:

| Field | Contract |
| --- | --- |
| `actor` | `user:<Discord user id>` when Discord supplies an ID; otherwise `discord:unknown` |
| `action` | `discord.command.<command-name>` with a bounded command name |
| `guildId` | The interaction guild ID, or `null` for a rejected DM/non-guild attempt |
| `detail` | Only `outcome=success\|denied\|error;subcommand=<name\|none>` |

The event is written for successful commands, Music permission denials, and handled command errors.
Arguments are never copied into the detail field. The existing audit store applies the 2,000-entry
bound, retention policy, atomic persistence, redaction, and scoped native/API filtering.

## Failure and privacy behavior

- A failed local audit write must not change the Discord reply outcome or crash the bot.
- Missing actor/subcommand metadata is represented by the documented bounded fallback values.
- No command query, URL, provider response, token, cookie, OAuth material, message content, username,
  or private member data is recorded by this contract.
- The event is local operational telemetry; it is not imported into Discord's remote audit log.

## Acceptance

- `src/command-audit.test.ts` proves success/denied/error shapes and argument exclusion.
- `handleCommand` invokes the helper in a `finally` path so early returns and handled failures are
  covered without duplicating audit logic in every command branch.
- Root tests, typecheck/build, static/docs audits, and native release checks remain green.
- Live command round-trip remains a separate acceptance gate; no destructive command is required for
  this telemetry check.
