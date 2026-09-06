# LocalBot — Agent Coordination Protocol

Status: Current project rule.

This file prevents Codex and Claude Code from silently overwriting each other while both agents work from the same LocalBot workspace.

## Ownership

- Codex is the integration owner for this repository. Codex owns the final cross-phase decision, release gate, live-guild QA evidence, and cleanup gate.
- Claude Code is the implementation partner. Claude works from `CLAUDE-ROADMAP/`, completes claimed phase-sized slices, and reports evidence back to the user or the coordinating Codex session.
- Neither agent may claim a phase complete from compilation alone. The SDD gate in `docs/SDD.md` is authoritative.

## Claim protocol

Before editing a phase-sized slice:

1. Read `docs/SDD.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, and the relevant feature spec.
2. Check both roadmap folders for an active claim or an in-progress change.
3. Add a short claim to the roadmap owned by the agent, including phase, requirement IDs, files, and timestamp.
4. Keep the claim narrow. Do not edit a file owned by the other agent unless the owner explicitly releases it.
5. Release the claim only after tests, docs, and QA evidence are updated.

If the two agents are running concurrently and no claim can be safely recorded, stop code edits and work only on an independent documentation or test task.

## Change boundaries

- One coherent slice per change. Avoid unrelated refactors, dependency churn, generated output, and visual rewrites during backend work.
- Specs, contracts, migrations, and tests belong in the same change as the implementation they govern.
- A material change to runtime ownership, ports, persistence, provider access, auth, permissions, or dependencies requires an ADR in `docs/DECISIONS.md` before implementation.
- Never print `.env`, tokens, cookies, provider credentials, raw OAuth responses, or private user data in logs, terminal output, reports, screenshots, or commits.
- Never introduce fake guilds, tracks, thumbnails, queues, rankings, progress, provider readiness, or successful toasts to hide an unavailable backend.

## Live QA safety

The owner-approved QA guild is `1541307192534241318`. It may be used for controlled integration tests because the user granted the bot administrator access, but that does not authorize spam, mass deletion, unsolicited messages, destructive moderation, or changes outside test fixtures.

- Discover the guild and voice channels from the real Discord state; do not assume a hard-coded channel exists.
- Use an explicitly identified test channel or test fixture when available.
- Keep live tests short, attributable, and reversible.
- Do not test anti-nuke or destructive AutoMod by damaging real configuration. Use dry-run, synthetic fixtures, or isolated test resources.
- Record the exact test scope and sanitized evidence; redact tokens, cookies, member data, and raw provider payloads.

## Handoff format

Every handoff must include:

```md
## Agent handoff

Agent: Codex | Claude
Phase: ...
Requirement IDs: LB-...
Files changed: ...
Checks run: ...
Live QA: ...
Known limitations: ...
Next unblocked slice: ...
```

The phrase “complete” is reserved for a slice whose acceptance checks pass and whose docs accurately say `Current`. Otherwise use `Implemented`, `Partially implemented`, `Blocked`, or `Planned`.

