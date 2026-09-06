# Guild permission readiness — `LB-GUILD-003`

Status: Implemented read-only control/native slice; installed visual and live permission acceptance remain separate.

## Purpose

The native Community surface must explain which effective Discord permissions the bot currently
has in the selected guild. This is diagnostic information only: LocalBOT must not grant, remove,
or edit Discord permissions from this slice.

## Contract

`GET /api/v1/guilds/:guildId/permissions` returns a bounded `permissions` object containing
`botMemberPresent`, `botUserId`, an optional `highestRole`, and fixed boolean-or-null checks for
the capabilities used by Music, Community, onboarding, safety, audit, and slash commands.

When the bot member is absent from the Discord cache, `botMemberPresent` is `false` and every
permission value is `null`. `null` means unknown, not denied. The highest role is omitted when the
bot only has `@everyone`.

The native panel renders the server-confirmed response, distinguishes granted/missing/unknown,
shows the bot's highest role, and keeps per-channel checks authoritative for voice/text actions.

## Security and scope

- The route is available only through the existing loopback control server.
- It returns no token, permission overwrite payload, member directory, or raw Discord error.
- It does not mutate Discord, persist a new store, or change slash-command authorization.
- A role position is diagnostic only; role rewards still skip managed/unmanageable roles.

## Acceptance

- Unit coverage proves granted, denied, and unknown permission states plus highest-role metadata.
- Control coverage proves the guild-scoped DTO and unknown-cache behavior.
- Native typecheck/build covers the panel and selected-guild refresh path.
- `qa:live` validates the response envelope without printing permission payloads.
- Installed visual/accessibility and live Discord permission verification remain release gates.
