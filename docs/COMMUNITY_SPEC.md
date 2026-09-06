# LocalBot Community Specification

Status: Current through `LB-COMMUNITY-006` deterministic/API/native slice.

## LB-COMMUNITY-006 — Native XP exclusion pickers

The native Community surface may manage the existing ignored channel and ignored role lists using
real text-channel and role metadata from the selected guild. The persisted contract remains the
same `ignoredChannelIds`/`ignoredRoleIds` arrays used by slash commands and message evaluation.

Contract:

- `POST /api/v1/guilds/:guildId/community/settings` accepts an all-or-nothing subset of
  `ignoredChannelIds` and `ignoredRoleIds`, each a deduplicated list of at most 50 bounded IDs.
- The native UI uses the existing guild-scoped text-channel and role discovery routes; it must
  display a missing-cache ID instead of inventing a name or silently removing stored entries.
- Adding or removing an exclusion updates only the selected guild and the server-confirmed
  settings response becomes the next UI state. Slash command operations remain supported.
- A message in an ignored channel or from a member holding an ignored role produces neither XP nor
  message-count progress, as defined by the existing Community runtime contract.

Failure/empty states: malformed lists, oversized lists, or non-string IDs are rejected without
partial mutation. Duplicate values are normalized away; an empty list clears only the corresponding
exclusion type.
Offline/loading states disable the controls and do not imply a successful save.

Out of scope: Discord permission mutation, role creation/removal, remote administration, arbitrary
channel/member fetching, and changes to the slash-command permission boundary.

Acceptance: store and control tests cover normalization, persistence, bounded validation, and
no-mutation on invalid writes; native typecheck/build verifies the real-data picker path; live
message behavior remains covered by the existing deterministic Community tests.

## LB-COMMUNITY-005 — XP multipliers and level role rewards

Community managers may configure a bounded guild-wide XP multiplier, bounded per-role XP multipliers, and level-based role rewards. The settings remain guild-scoped and backward-compatible with existing version-one files: old guilds read as `xpMultiplier: 1`, no role multipliers, and no role rewards. If a member has several configured multiplier roles, LocalBot uses the largest matching role multiplier once; it never multiplies them together. Role rewards are additive: reaching a level makes every configured reward at or below that level eligible, but LocalBot never removes roles automatically.

Contract:

- `GET /api/v1/guilds/:guildId/community/settings` returns `xpMultiplier`, `roleMultipliers`, and `roleRewards` alongside the existing ignored lists/cooldown.
- `POST /api/v1/guilds/:guildId/community/settings` accepts any non-empty subset of `cooldownSeconds`, `xpMultiplier` (`1..5`), `roleMultipliers` (at most 25 role IDs, each `1..5`), and `roleRewards` (at most 25 unique `{ roleId, level }` entries, level `2..100`). Validation is all-or-nothing; invalid input never partially mutates settings.
- `/community-config xp-multiplier`, `/community-config role-multiplier`, and `/community-config role-reward` provide the same bounded operations for guild managers. `show` reports the effective configuration without secrets.
- An eligible message awards `round(15 × guild multiplier × max(matching role multiplier, 1))` XP, with a minimum of one XP. Existing cooldown and ignored channel/role rules run first.
- `CommunityStore.roleRewardsForLevel(guildId, level)` is a read-only eligibility query. On a real Discord message, the runtime attempts only manageable, non-managed roles when the bot has `ManageRoles`; missing roles, hierarchy failures, and permission failures are skipped and cannot stop XP or Music.

Failure/empty states: invalid bounds, duplicate reward roles, unsupported shapes, or more than 25 rules return a stable `INVALID_COMMUNITY_SETTINGS` control error or a clear slash-command error without partial mutation. A guild with no rules uses x1 and awards no role. A role reward that the bot cannot safely grant is reported through a redacted operational error and is not retried in an unbounded loop.

Out of scope: role removal/demotion, automatic role creation, role hierarchy mutation, cross-guild rules, XP transfer, remote administration, and moderation actions.

Acceptance: deterministic tests prove backward-compatible defaults, guild isolation, max-only role stacking, bounded validation, idempotent reward updates, level eligibility, route all-or-nothing behavior, and reset preservation. Native Community exposes server-confirmed multiplier/reward controls with offline/loading/error states. Live role assignment requires a dedicated opt-in fixture and must verify Manage Roles/hierarchy without destructive changes to the QA guild.

## LB-COMMUNITY-004 — Member detail and confirmed progress reset

Community managers may inspect one member's current rank through the existing member route and may reset only that guild's XP/member progress after an explicit confirmation. Reset removes stored member progress but preserves ignored channels, ignored roles, and the guild cooldown override. A missing guild or an already-empty guild is a successful no-op with `removedMembers: 0`.

Contract:

- `GET /api/v1/guilds/:guildId/community/member/:userId` returns `{ member: CommunityRank | null }` and never creates data.
- `POST /api/v1/guilds/:guildId/community/reset` accepts `{ confirm: true }` only and returns `{ removedMembers: number, settings: CommunityGuildSettings }`.
- `/community-config reset confirm:true` is restricted to `ManageGuild`/`Administrator`; a false confirmation is rejected without mutation.
- Native Community may expose the reset action only when the bridge is online and must request explicit confirmation before calling the route.

Failure/empty states: invalid confirmation returns a stable validation error; an absent member returns `member: null`; reset errors do not clear UI state or show success. The reset is guild-scoped and must produce a redacted audit event.

Out of scope: XP restoration, cross-guild reset, role rewards, multipliers, moderation, and remote administration.

Acceptance: deterministic tests prove member reads are non-mutating, reset removes members while preserving guild settings, false confirmation does not mutate, and the control/slash contracts enforce the confirmation and manager boundary.

This is the compact contract for Community. Read it before inspecting Community source files.

## LB-COMMUNITY-003 — Per-guild cooldown and paginated leaderboard

Given a guild has no override, when a message is recorded, then XP uses the global `LOCALBOT_XP_COOLDOWN_SECONDS` default. Given a manager sets a guild override, then that guild alone uses the configured cooldown from `0..86400` seconds; `0` means every eligible message may award XP and `null` resets to the global default. Existing ignored-channel/ignored-role behavior remains authoritative.

Given a native or slash-command leaderboard request includes a page/offset, then the backend returns a bounded slice sorted by XP, messages, and username with the absolute 1-based rank preserved. Invalid limits, offsets, and cooldown values fail without mutating data.

Contract:

- `GET /api/v1/guilds/:guildId/community/settings` returns `{ settings: { cooldownSeconds: number | null, ignoredChannelIds: string[], ignoredRoleIds: string[] } }`.
- `POST /api/v1/guilds/:guildId/community/settings` accepts `{ cooldownSeconds: number | null }` and is intended for the native local operator surface.
- `GET /api/v1/guilds/:guildId/community/leaderboard?limit=10&offset=0` returns `{ leaderboard: CommunityRank[], hasMore: boolean }`; `limit` is `1..100`, `offset` is `0..10000`.
- `/leaderboard [page]` uses ten entries per page; `/community-config cooldown seconds` changes the guild override, where `0` disables the cooldown and `-1` resets to the global default.
- `data/community.json` remains version `1`; the optional `settings.cooldownSeconds` field is backward-compatible and normalized when read.

Failure/empty states: an invalid manager update returns a safe validation error and preserves the previous setting; a page beyond the end returns an empty leaderboard without an error; no member, XP, or synthetic sample data is created by a read request.

Out of scope: reset, XP multipliers, role rewards, member profile editing, remote authentication, and moderation/AutoMod behavior. Reset/member detail is specified separately in `LB-COMMUNITY-004` below.

Acceptance: deterministic store tests cover global fallback, per-guild override isolation, reset, zero cooldown, persistence, and pagination/rank continuity. Control route tests cover validation and no mutation on invalid input. Native UI exposes cooldown save/reset and previous/next page without placeholder data. Slash registration and handler tests remain green.
