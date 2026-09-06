# Native Full Gap Audit — post-alpha development

Date: 2026-09-07  
Branch: `dev/native-full-alpha2`  
Baseline: `89612d4`  
Release boundary: `v0.1.0-alpha.1` remains immutable; this audit covers development after that release.

## Method

This is an SDD gap audit, not a visual guess. The source of truth was read in the project
context, brief, roadmap, capability inventory, architecture, SDD, v1 UI contract, Music spec,
Community/Safety/Audit/Ops specs, and decisions. Baseline checks were rerun before selecting
work:

- shared core: 153/153 tests, typecheck, build, doctor
- Native TypeScript: 4/4 tests, typecheck
- Rust: 6/6 tests, `cargo check`, Clippy with warnings denied
- native/headless QA and static/docs audits: green

No deterministic backend defect was found by the baseline. Remaining work is classified below so
manual acceptance is not silently turned into speculative feature work.

## Capability matrix

| Capability | Backend/domain state | Native UI state | Slash/headless state | Product gap | UX gap | Acceptance-only? | Priority |
|---|---|---|---|---|---|---|---|
| Overview/discovery | Real current track, history, queue, playlists and provider state through Control API | Real data, dark-first v1 dashboard, empty/loading/error states | Shared core remains available without Tauri | None known in baseline | Shortcut help is not discoverable; output context copy can imply Discord for Windows-only | Clean-machine visual acceptance | UX1 |
| Music search/providers | YouTube core and SoundCloud official-credential path; duplicate filtering and provider DTOs exist | Discover, source tags, thumbnails and provider readiness render real state | Slash/music commands use shared core | Live provider credential/region behaviour is not proven locally | Context bar is Discord-first even for Windows-only output | Live YouTube/SoundCloud playback, device/Discord parallel output | UX1/RA |
| Playback/queue/output | Shared player/queue plus native Windows local session; Discord and Windows outputs are separate action paths | Now Playing, queue, output selector, local seek and volume controls exist | Slash player/queue commands exist | No new backend feature required by current evidence | Arrow seek shortcuts and help surface missing; modal focus lifecycle incomplete | Discord voice, Windows device loss, simultaneous output | UX1/RA |
| Playlists/equalizer | Local persistence and bounded routes exist | CRUD and preset/equalizer controls exist | Shared route/command contracts exist where applicable | None known | Accessibility/focus review remains manual | Cross-restart persistence and audio-device acceptance | RA |
| Community/guild/voice | Guild, channel, join/leave, roles, member picker and effective permissions are real and scoped | Native page plus global modal picker | Slash command parity exists for scoped operations | No known missing backend capability | Community page is dense; follow-up IA slice should be evidence-driven | Live guild membership/permission and reconnect behaviour | P1/RA |
| Welcome/Goodbye | Persisted guild settings, preview and test-send routes exist | Config panel with real channel discovery | Shared command/control contracts exist | None known | Form and image-delivery acceptance remains manual | Members Intent and real Discord delivery | RA |
| AutoMod/Safety | Dry-run and bounded enforce semantics are documented and guarded | Policy, review and recovery UI exists | Shared core route/command surface exists | Anti-raid/anti-nuke remain detection/audit, intentionally not automatic mutation | Review workflow and destructive-action acceptance need live guild evidence | Message Content Intent, permission/rate-limit matrix | RA |
| Logs/audit | Local retention/export and Discord read-only audit route exist | Filter, source switch and export controls exist | Shared audit contracts exist | None known | Large-data pagination/long-session review | Real Discord audit events and export inspection | RA |
| Settings/operations | Runtime, autostart, provider/vault/Ollama and diagnostics contracts exist | Settings surface exists and is native-owned | Headless doctor/bootstrap remains independent | Linux/VPS packaging is intentionally a separate product mode | Settings grouping can be refined later | clean machine, reboot/autostart, signing | RA/FUT |
| Lifecycle/ownership | Native owns Node child; loopback is `127.0.0.1:2901`; headless does not listen | Bot toggle and native lifecycle state are present | Slash-only profile avoids Tauri | No known ownership defect in deterministic tests | Runtime status is not fully tested against every external interruption | close app, crash, restart, orphan/port checks | RA |

## Classification

### C0 — deterministic blocker

None identified by the baseline suite and source audit. Any newly observed deterministic failure must
be promoted here with a reproducer before adding a feature.

### P1 — product/functional follow-up

- Keep the Community surface usable as capability grows; only split navigation after a concrete
  information-architecture acceptance problem is reproduced.
- Keep VPS/SSH as a separate headless packaging and operations scope; do not contaminate the
  Native owner contract or create a second Music implementation.

### UX1 — selected development slices

- Native keyboard shortcut parity and a discoverable `?` help surface.
- Shared modal focus lifecycle: initial focus, Tab trap, Escape, and focus return.
- Output-aware Music context bar so Windows-only does not falsely require Discord guild/voice context.

### RA — release/manual acceptance

Clean machine, autostart after reboot, provider credentials, Discord voice playback, Windows audio
device changes, simultaneous output, real guild commands, intents, visual responsive review, reduced
motion, accessibility, signing and packaging.

### FUT — intentionally out of this slice

Web/Next.js dashboard, remote/public control plane, extra providers beyond the approved YouTube +
SoundCloud scope, cloud database/auth, and Linux VPS packaging details.

## Selected slices

1. `LB-UI-004` — Native keyboard shortcuts + accessible shortcut help.
2. `LB-UI-005` — Reusable Native modal focus lifecycle.
3. `LB-UI-006` — Output-aware Music context bar.

Implementation status: source implementation and targeted tests are complete; Native typecheck and
packaged artifact verification are green. Installed-window visual and keyboard acceptance remains a
release gate. No schema, credential, release, or external Discord mutation is part of these slices.
