# LocalBOT Windows Headless / Slash Parity

Status: Current for Windows Headless bootstrap and bounded slash parity slices; environment and
release gates below remain explicit.

This matrix separates capabilities that naturally belong to the Native Windows surface from
shared capabilities that should remain usable through Discord slash commands. It is not a claim
that every Native control has to be duplicated as a slash command.

## Runtime surfaces

| Surface | Owner | Control | Port 2901 | Current evidence |
| --- | --- | --- | --- | --- |
| Windows Native Full | Tauri supervisor and owned Node child | Native UI plus Discord slash commands | Loopback only when enabled | Native build/smoke and Rust lifecycle checks |
| Windows Headless / CMD | Node process or external supervisor | Discord slash commands | Disabled by default | `npm start`, `npm run doctor`, credential-free headless smoke |
| Linux VPS slash-only | Node process/systemd | Discord slash commands | Must remain disabled | `npm run qa:headless`; real host validation is pending |

All three surfaces use the same Discord, provider, player, permission and persistence modules.
The Native UI is not a second implementation of those semantics.

## Capability matrix

| Capability | Native | Headless / slash-only | Native-only by nature | Gap / action |
| --- | --- | --- | --- | --- |
| YouTube search/play/queue/player | Available | Available through existing Music commands | No | Keep shared provider/player tests and add live command acceptance separately. |
| SoundCloud official adapter | Available when configured | Available when configured | No | Credential/vault/live stream acceptance remains pending. |
| Playlists, repeat, shuffle, volume, Equalizer | Available | Available through existing commands | No | Keep command contract backward compatible. |
| Music permission allow-list/all mode | Native picker plus route | `/music-access mode|add|remove|list` with manager checks | No | Current; member picker remains Native-only convenience. |
| Guild/voice readiness and join/move/leave | Direct native context and route | `/join` uses the invoking member's voice context | Guild picker is native UX | Preserve `LB-MUSIC-019`; add explicit slash diagnostics only where useful. |
| Discord audio output | Available | Available | No | Linux/Windows target-host playback remains an acceptance gate. |
| Windows local audio output/device selection | Available | Not applicable | Yes | Never make Discord playback depend on this sink. |
| Bot status/providers | Native Settings and UI | `/bot status`, `/bot providers` | No | Current. |
| Runtime readiness diagnostics | Native Settings route | `/bot diagnostics` for manager/operator | No | Implemented by `LB-RUNTIME-019`; output is bounded and secret-free. |
| Slash command registration | Native action and explicit CLI | `npm run register`, `/bot sync` | No | Slash-only does not silently register global commands on every boot. |
| Community rank/leaderboard | Native UI and commands | `/rank`, `/leaderboard` | No | Current. |
| Community configuration | Native picker/editor and `/community-config` | Bounded `/community-config` settings, exclusions, rewards, cooldown and confirmed reset | No | Current; native pickers remain a UX convenience. |
| Welcome/Goodbye configuration | Native editor/preview/test | `/bot greetings show|set|preview` with manager checks; no slash test-send | No | `LB-HEADLESS-001`; live delivery still needs Members Intent acceptance. |
| AutoMod policy/review | Native editor and route | Manager-only `/bot automod show|policy|rule|domain|exempt|review|decide|recover` | No | `LB-HEADLESS-002`; default-off, explicit confirmation, redacted review and safe recovery only. |
| Local/Discord audit viewing/export | Native UI and route | Bounded `/bot audit local|discord` read-only view; export remains Native/local | No | `LB-HEADLESS-001`; never include raw content or secrets. |
| Backup/restore | Native workflow | No slash restore by design | Native UX is safer | Keep filesystem/CLI backup path documented; do not add destructive slash restore casually. |
| Ollama settings/suggestions | Native settings | Shared optional core, no required slash setup | Native UX only | Keep suggestions non-authoritative and opt-in. |
| Windows autostart/Credential Manager | Native Settings | Not applicable | Yes | Native-only. |
| Native lifecycle/recovery/Job Object | Tauri-owned | External process/supervisor | Yes | Do not let Headless adopt or terminate Native-owned processes. |

## Headless bootstrap contract (`LB-RUNTIME-019`)

- `npm run build` produces the shared Node runtime.
- `npm start` runs `node dist/index.js`; it does not require Tauri or React.
- `npm run doctor` checks required configuration, profile boundaries, control binding, command
  registration policy and optional SoundCloud state without printing credential values.
- A headless profile can run with `LOCALBOT_CONTROL_ENABLED=false` and does not need port `2901`
  (the control bridge port 2901).
- Missing `DISCORD_TOKEN`/`BOT_TOKEN` or `DISCORD_CLIENT_ID` fails fast with key names only.
- `npm run qa:headless:smoke` proves the credential-free failure boundary, no Native import, signal
  cleanup markers and no listener on port `2901`. It is not a claim of real Discord login or VPS
  voice playback.

## Deliberate non-goals

- No Next.js or public dashboard requirement for headless operation.
- No shell execution, restart, systemd or arbitrary filesystem slash command.
- No second business-logic implementation for Windows Headless.
- No GitHub Release, stable tag or VPS deployment in this slice.

## Headless parity slice `LB-HEADLESS-001`

Status: Current for bounded operator audit and Welcome/Goodbye configuration; AutoMod and
destructive/test-send operations remain separate.

Owner decision: approved.

Scope:

- Add manager-only `/bot audit local` for the selected guild's redacted local audit entries with
  bounded limit/action/search filters.
- Add manager-only `/bot audit discord` for a bounded, read-only Discord audit-log DTO. Discord's
  `View Audit Log` permission remains authoritative and provider failures are actionable.
- Add manager-only `/bot greetings show`, `/bot greetings set`, and `/bot greetings preview`.
  Settings use the existing `GreetingStore`; preview renders only a local response and never sends
  a Discord message. The set surface supports enable/disable, text channel, template, HTTPS image,
  and explicit clear actions without exposing a new storage format.

Out of scope:

- Slash test-send, arbitrary remote administration, backup/restore, shell execution, raw Discord
  audit payloads, message content, credentials, or a second greeting implementation.
- Enabling Discord Members Intent or changing Developer Portal configuration.

Given: a Windows Headless or slash-only runtime is online in a guild and a manager invokes an
operator subcommand.

When: the operator reads audit data or updates/previews a greeting template.

Then: the command returns bounded, redacted, guild-scoped data only after the shared store/provider
operation succeeds; invalid or unavailable states return an actionable error and do not claim a
mutation.

Acceptance:

- Command-definition tests cover nested group names, bounded options, and Discord-safe ordering.
- Handler/contract tests cover manager denial, guild scope, local audit filtering, Discord audit
  permission failure, greeting validation, explicit clear behavior, preview no-send behavior, and
  Members Intent status.
- Root tests/typecheck/build, headless contract/smoke and static/docs audits pass.
- Native and slash-only profile boundaries remain unchanged; no control bridge is imported by the
  headless path.

## Headless parity slice `LB-HEADLESS-002`

Status: Current for bounded AutoMod administration; destructive moderation, portal setup and live
content acceptance remain release gates.

Owner decision: approved for manager-only, local configuration and redacted review operations.

Scope:

- Manager-only `/bot automod show` exposes normalized policy, rule state, exemptions and the
  Message Content Intent capability without raw content or credentials.
- `/bot automod policy` requires explicit `confirm: true`; `enforce` is persisted only after the
  store succeeds and reports the existing permission/limiter/anti-raid safety boundaries.
- `/bot automod rule`, `/bot automod domain`, and `/bot automod exempt` update one bounded part
  of the shared AutoMod store with normalized values and no partial mutation on validation error.
- `/bot automod review` lists bounded, guild-scoped metadata and `/bot automod decide` records a
  local confirm/dismiss decision only; neither command returns message content or mutates Discord.
- `/bot automod recover` requires explicit confirmation, atomically moves the guild to disabled
  dry-run mode, and resets the shared runtime detector memory for that guild.

Out of scope:

- Slash test fixtures, raw message/audit payloads, bulk moderation, lockdown, ban/kick, role or
  permission mutation, backup/restore, shell execution, and changing Developer Portal intents.
- Claiming content protection while `LOCALBOT_MESSAGE_CONTENT_INTENT=true` and the Discord Portal
  capability are not both enabled.

Given: a Windows Headless or slash-only runtime is online in a guild and a manager invokes an
AutoMod operator subcommand.

When: the operator reads, updates, reviews or recovers the guild policy.

Then: the shared store/runtime operation completes before a success response; invalid, denied,
unavailable and unsupported states fail closed with an actionable message.

Acceptance:

- Command-definition tests cover the nested group, explicit confirmations, bounded options and
  Discord-safe required-option ordering.
- Existing AutoMod store/engine/review/control tests remain green; no slash handler duplicates
  detector, persistence or enforcement logic.
- Root tests/typecheck/build, headless contract/smoke and static/docs audits pass.
- Native and slash-only profile boundaries remain unchanged; no control bridge is imported by the
  headless path and the QA guild stays dry-run/disabled for destructive safety.
