# LocalBOT — Operations Specification

Status: Current source slice for `LB-OPS-001`.

## LB-OPS-001 — Operator Readiness & Diagnostics

Status: Current implementation · Owner decision: approved for the local native control surface; installed/live acceptance remains separate

### Intent

Give the operator one authoritative, secret-free view of whether the current LocalBOT runtime is
ready, still starting, or needs attention. The native Settings surface currently has separate
health/provider/intent indicators; this slice makes the operational boundary explicit without
inventing data or turning optional integrations into hard failures.

### Scope

- Add a read-only `GET /api/v1/diagnostics` control route.
- Return the selected runtime profile, loopback control boundary, native ownership presence,
  Discord gateway readiness, visible guild count, provider availability, and privileged-intent
  configuration state.
- Classify the core runtime as `ready`, `starting`, or `degraded` using deterministic domain
  logic below the UI layer.
- Include bounded checks with `pass`, `info`, or `attention` status and safe operator guidance.
- Show the DTO in native Settings with refresh, loading, offline, and failure states.
- Keep the existing `/health` and `/providers` routes stable; this is an additive diagnostic view.

### Out of scope

- No secrets, token state, OAuth headers, raw provider payloads, filesystem paths, or Discord
  mutation.
- No public/remote diagnostics endpoint, authentication, telemetry upload, or web dashboard.
- No automatic enabling of privileged intents, providers, or bot processes.
- No replacement of the native ownership contract or `LB-MUSIC-019` readiness flow.
- No claim that an optional SoundCloud/Ollama integration is broken merely because it is disabled
  or not configured.

### State contract

| State | Meaning | Native behavior |
| --- | --- | --- |
| `ready` | Discord runtime is ready and the local ownership/control boundary is valid for the profile | Show success status and checks |
| `starting` | Discord gateway is not ready yet | Show progress; do not claim provider/guild readiness |
| `degraded` | Core runtime is reachable but a required ownership/boundary invariant is not satisfied | Show attention and actionable reason |
| offline | Control bridge cannot be reached | Clear stale DTO and show offline state |
| error | Diagnostics request failed | Keep prior state only for the current render, show retry; never fabricate a new snapshot |

### Contract

`GET /api/v1/diagnostics` returns:

```ts
{
  status: 'ready' | 'starting' | 'degraded',
  generatedAt: string,
  profile: 'native' | 'headless' | 'slash-only',
  control: {
    enabled: boolean,
    host: string,
    port: number,
    loopbackOnly: boolean,
    ownerPresent: boolean
  },
  discord: { ready: boolean, botTag: string | null, guildCount: number },
  capabilities: { guildMembersIntent: boolean, messageContentIntent: boolean },
  providers: Array<{ id: string, label: string, enabled: boolean, configured: boolean, state: 'ready' | 'disabled' | 'not_configured' }>,
  checks: Array<{ id: string, status: 'pass' | 'info' | 'attention', label: string, detail: string }>
}
```

The DTO is bounded and contains no credential material. `ownerPresent` is a boolean; the
ephemeral ownership marker itself never leaves the runtime.

### Acceptance

Given a ready native-owned control runtime, when the operator opens Settings, then the diagnostics
panel reports `ready`, the canonical loopback boundary, ownership presence, gateway readiness,
provider states, and intent states from the live control API.

Given a client that has not reached Discord Ready, then the response reports `starting` and the
native panel does not present guild/provider readiness as complete.

Given a control boundary or ownership invariant is invalid in the domain input, then the response
reports `degraded` with an `attention` check and no secret data.

Given SoundCloud or a privileged intent is disabled/not configured, then the panel reports an
`info` check with safe guidance; it must not classify the core runtime as degraded.

Given the bridge is offline or the request fails, then the native panel clears stale diagnostics,
shows an explicit offline/error state, and provides a retry action.

### Tests and QA

- Unit tests cover ready, starting, degraded-boundary, optional-provider, and intent-state classification.
- Control-server test verifies the exact secret-free DTO shape.
- Native typecheck/build verifies the Settings integration.
- Root regression, headless verification, static audit, and docs audit remain required because the
  route is shared with all control-enabled profiles.

### Recovery / rollback

The route is additive and read-only. If diagnostics fails, existing health/provider routes and all
bot capabilities remain unchanged. Rollback consists of removing the route, domain helper, native
panel, and focused tests; no data migration or runtime cleanup is required.
