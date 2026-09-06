# LocalBot — Spec-Driven Development

Status: Current project operating rule.

## Principle

LocalBot is developed from an explicit, reviewable specification. Code is an implementation of a spec, not the place where product behavior is invented. Every user-visible behavior must have a requirement, a state contract, an acceptance check, and an owner-approved scope.

The canonical order is:

```text
Intent → requirement → behavior/state contract → API/DTO or UI contract
      → acceptance tests → implementation → QA evidence → documentation
```

## Source-of-truth hierarchy

1. `docs/SDD.md` — this process and quality gate.
2. `CLAUDE.md` — short agent rules and routing.
3. `docs/PROJECT_BRIEF.md` — product intent and boundaries.
4. `docs/ROADMAP.md` — phase order and delivery gates.
5. `docs/ARCHITECTURE.md` — runtime boundaries, routes, DTOs, and security.
6. Feature specs such as `docs/MUSIC_SPEC.md` and `docs/UI_UX_V1.md`.
7. `docs/DECISIONS.md` — ADRs for material technical choices.
8. Source code and tests — implementation evidence, never an undocumented product decision.

When documents disagree, stop implementation, record the conflict, and resolve the higher-level spec first. Mark statements as `Current`, `Proposed`, or `Planned`; never present a planned behavior as implemented.

## Requirement format

Each phase-sized change uses a stable ID and the following minimum record:

```md
### LB-<AREA>-<NUMBER> — Short requirement name

Status: Proposed | Current | Planned
Owner decision: approved | pending
Scope: what is included
Out of scope: what must not be implemented in this change

Given: starting context
When: user/system action
Then: observable result
Failure states: safe error, offline, empty, loading, stale behavior
Contract: route/command/DTO or UI interaction
Acceptance: test or manual check that proves the requirement
```

IDs must remain stable when wording is clarified. Create a new ID when behavior changes materially.

## Change protocol

### 1. Specify before editing

Identify the roadmap phase and requirement IDs. Write or update the relevant spec first, including scope, out-of-scope behavior, states, and acceptance criteria. If the change affects ports, auth, storage, providers, or dependencies, add an ADR before implementation.

### 2. Define the contract

For backend work, define method/path, input validation, response DTO, stable error codes, permission boundary, persistence, and event/reconciliation behavior. For native UI work, define layout intent, loading/empty/error/offline/stale states, keyboard/focus behavior, motion, and responsive constraints. Never invent sample records to fill an undefined state.

### 3. Implement one coherent slice

Inspect only the files routed by the spec. Keep provider, Discord, control-plane, and UI boundaries intact. Do not broaden the task because an adjacent feature is interesting. Credentials, cookies, raw provider responses, and fake production records never cross the boundary.

### 4. Prove the behavior

Add or update deterministic tests for validation, success, failure, and state transitions. Run a sanitized live smoke test only when network/provider access is available. UI work must include typecheck/build plus native visual and accessibility checks appropriate to the change.

### 5. Reconcile and document

Compare implementation against every acceptance item. Update route/command/env/ADR/spec docs in the same change. Report exact checks, known limitations, and one next phase-sized task. A feature is not complete because it compiles or looks populated.

## Non-negotiable quality rules

- Production runtime never uses fake guilds, tracks, queues, playlists, rankings, thumbnails, provider readiness, or playback progress.
- Missing backend data renders an explicit loading, empty, offline, unavailable, or error state.
- A success toast or UI state is emitted only after the authoritative operation succeeds, unless the spec explicitly defines rollback-safe optimism.
- API responses contain stable, minimal DTOs; secrets and raw provider payloads stay server-side.
- Every external provider has an availability contract and a typed failure path.
- Every new route, command, environment key, external integration, or persistent file is documented.
- A phase gate cannot be marked complete while a required acceptance check is missing; unresolved limitations must be marked `Planned`.

## Deployment profile rule

The native Windows product and a lightweight VPS process are deployment variants of one shared
core, not separate products. Any runtime change must state its profile impact:

- `native`: Tauri-owned child, loopback control bridge, native UI, Windows output/autostart.
- `headless`: Node-only shared core; loopback control is optional and remains local-only.
- `slash-only`: Discord gateway, slash commands, providers, persistence, and logs only; no native
  UI, no control/SSE listener, no port `2901`, and no implicit command registration on every boot.

Local source checks may prove profile boundaries, but they cannot prove Linux/VPS readiness. Target
host systemd, Node/FFmpeg, permissions, network, provider credentials, upgrade/rollback, and real
voice playback must be labelled `Blocked` until executed on that host.

## Definition of ready

- Requirement ID exists and status/owner decision are clear.
- Scope and out-of-scope behavior are explicit.
- State matrix covers loading, success, empty, offline/error, and stale behavior where applicable.
- Contract and acceptance checks are written.
- Relevant ADR/security implications are resolved.

## Definition of done

- All acceptance checks pass.
- Runtime behavior matches the spec and uses real state or honest empty/unavailable state.
- Tests/typecheck/build and required manual checks are recorded.
- Docs are synchronized with the implementation.
- No secrets, unrelated refactors, generated output, or undocumented assumptions were introduced.

## Compact change record template

```md
## SDD change record

Requirement IDs: LB-...
Phase: Roadmap Phase ...
Scope: ...
Out of scope: ...
Files likely to change: ...
Acceptance checks: ...

Implementation evidence:
- ...

QA evidence:
- ...

Known limitations / next task: ...
```

## LB-RUNTIME-019 — Windows Headless Operator Bootstrap

Status: Current for the bootstrap contract; broader slash parity remains Planned.

Owner decision: approved.

Scope: provide a conventional compiled Node entrypoint, a credential-safe configuration doctor,
an operator-facing `/bot diagnostics` snapshot, and a deterministic headless smoke boundary. The
same shared core must work without Tauri, React, browser UI, or the loopback control bridge.

Out of scope: Linux VPS deployment, public control APIs, a new CLI framework, a music-only fork,
Native lifecycle changes, and configuration commands that expose secrets or execute shell actions.

Given: a Windows operator wants to run LocalBOT from CMD/PowerShell and use Discord slash commands.

When: the operator builds the project, runs `npm start`, or invokes `npm run doctor`.

Then: the Node runtime starts without a Native dependency, required Discord configuration is
validated without printing values, optional SoundCloud absence is informational, and the control
bridge remains disabled unless explicitly configured for a compatible profile.

Failure states: missing required keys fail fast with key names; invalid profile/control binding
fails closed; optional provider credentials do not make the Discord core fail; a credential-free
smoke never binds port `2901` and records no real app-data mutation.

Contract: `npm start`, `npm run doctor`, `npm run qa:headless:smoke`, `/bot diagnostics`, and
`docs/HEADLESS_PARITY.md`. Diagnostics exposes only profile, gateway readiness, guild count,
control enabled/boundary, provider state, and privileged-intent state.

Acceptance: runtime doctor tests cover valid headless, missing required config, slash-only boundary,
and loopback rejection; command contract tests cover the diagnostics subcommand; build plus the
credential-free headless smoke pass; port `2901` is free before and after the smoke; `qa:headless`
still proves the slash-only dynamic-import boundary; Native and Rust tests remain green.
