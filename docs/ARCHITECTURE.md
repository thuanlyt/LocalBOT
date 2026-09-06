# LocalBot Architecture

Status: Current + Proposed target boundaries.

## Current runtime

```text
Discord Gateway
      │
      ▼
src/index.ts ──► src/commands.ts ──► src/player.ts ──► Discord Voice
                         │                 │
                         └──────────────► media.ts ──► youtube.ts ──► YouTube InnerTube
                                           └───────► soundcloud.ts ──► Official SoundCloud API
```

- One Node process runs the Discord client.
- `src/commands.ts` is the command adapter; keep domain logic out of interaction handlers as new features grow.
- `src/player.ts` owns per-guild voice connections, queue state, and FFmpeg lifecycle.
- `src/youtube.ts` owns YouTube session/cache, URL parsing, search, metadata, and audio stream retrieval.
- `src/media-types.ts` owns provider-neutral track/error/audio-source types and cross-provider search deduplication. Audio sources may be a byte stream or a provider HTTPS URL so HLS manifests retain their base URL.
- `src/media.ts` resolves provider URLs, dispatches search/download operations, and keeps provider-specific code behind an adapter boundary.
- `src/soundcloud.ts` is an optional official SoundCloud API adapter. It uses server-side credentials, cached OAuth client tokens, current URN identity, `/tracks/{track_urn}/streams`, and HLS AAC URL selection; it does not scrape undocumented client IDs or rely on deprecated progressive streams.
- `src/provider-settings.ts` stores only the local SoundCloud enabled flag; it never stores credentials and is intentionally outside the credential-free backup envelope. On Windows, the native shell may source credentials from Windows Credential Manager at child-process start; see `docs/SOUNDCLOUD_CREDENTIALS_SPEC.md`.
- `src/ollama.ts` stores only bounded non-secret Ollama endpoint/model/timeout/enable settings and reports a minimal health state; it never stores an API key, prompt, raw model response, or private Discord data.
- `src/queue.ts` owns pure queue semantics: current track, pending items, history, shuffle, repeat, move, and remove.
- `src/playlists.ts` persists guild-scoped playlists as versioned local JSON with atomic replacement writes.
- `src/music-permissions.ts` persists guild-scoped Music command access as an allow-list or allow-all mode; server managers can configure it.
- `src/equalizer.ts` validates and persists per-guild EQ settings and produces the FFmpeg filter chain used by Discord playback.
- `src/community.ts` awards per-guild message XP with a cooldown and persists leaderboard/rank data as versioned local JSON.
- `src/audit-log.ts` persists a bounded, redacted local history of native control actions; it never stores tokens or provider credentials.
- `src/player-state.ts` persists only a validated, bounded pending Discord queue snapshot and playback preferences; it never persists an active resource, stream state, or credential.
- Discord playback resources remain in memory, while a safe pending-queue recovery snapshot persists locally; playlists, Music permissions, Community XP, and audit entries persist locally. Native Windows queue state is session-local. Ollama settings are local and non-secret; its optional health probe is independent from playback and Discord state.

## Proposed native Windows topology

```text
Tauri Windows app
  bundled React/Vite UI · no public listener
       │ Tauri IPC or loopback HTTP
       ▼
LocalBot control/runtime :2901
       ├── Discord Gateway / Voice
       ├── YouTube adapter
       └── future media/community/safety/AI modules

Optional future web companion
Browser → Next.js BFF → loopback control/runtime :2901
```

The primary UI is a separate Tauri app in `native/`, using React + Vite + TypeScript. `npm run native:dev` starts Vite HMR and Tauri dev mode; `npm run native:build` creates a production artifact. The native window itself does not need a port; `2901` is reserved for the local control/runtime bridge. A Next.js web companion is optional future work and must not become a prerequisite for the Windows app.

During native development, the Tauri shell is the only supported owner of the LocalBot Node runtime. The child runs `npm run dev` from the workspace root and inherits the root `.env`; the React layer receives only process status through Tauri IPC. Native passes an ephemeral ownership marker to the child and accepts `127.0.0.1:2901` as the LocalBot bridge only when the managed child and bridge identity agree. A process started outside the app is never adopted or treated as the active LocalBot runtime; the operator must stop it before starting LocalBot from native. On Windows, the owned child is attached to a Job Object with `KILL_ON_JOB_CLOSE` so a native crash/forced termination cannot leave the bot behind; graceful close still uses an explicit process-tree shutdown. Both paths take down the control server.

In a release build, the preparation script creates a generated `runtime/` resource containing the production Node executable, compiled `dist/`, and lockfile-installed production dependencies. It also clears the generated release staging runtime before Tauri copies resources, preventing stale source maps or removed modules from leaking into a later artifact. Tauri bundles that resource into MSI/NSIS. Native launches the bundled Node entrypoint with the app-local data directory as its working directory; an optional `.env` there is loaded without copying the repository secret. Packaged launch from the non-default `F:` workspace path has passed smoke testing, but clean-machine installation, first-run configuration, and reboot/startup acceptance are still required before calling distribution production-ready.

## SDD runtime requirement

### LB-RUNTIME-001 — Native-owned bot lifecycle

Status: Current · Owner decision: approved

Given the native app is the product root, when the operator starts or stops LocalBot, then Tauri is the sole process owner and the Node bot/control server lifecycle follows that owned process. The native app may remain open while the bot is stopped, but a loopback server started externally must not be adopted as a valid runtime.

Failure states: if an external process already occupies the control port, show an explicit unowned-runtime error and do not kill or adopt it; if the child exits or the ownership marker does not match, show stopped/failed and mark the bridge offline; if native exits, terminate the owned child process tree and release port `2901`.

Contract: Tauri `bot_status`, `start_bot`, and `stop_bot` return an ownership-aware status; the Node `/api/v1/health` response carries a non-secret runtime identity derived from the native launch marker; native considers the bridge usable only when managed process and health identity match.

Acceptance: start from native reaches managed + ready; an externally started bot is not reported as usable or owned; stopping from native makes health unavailable; closing the native window terminates the child tree and makes `2901` unavailable; child crash transitions to an honest failed/offline state without stale guild/player data.

### LB-RUNTIME-008 — Windows crash-safe process ownership

Status: Implemented native slice · forced-termination, controlled restart, and bounded child recovery smoke passed; remaining release gates are listed separately

Scope: attach every native-owned Windows bot child to a private Job Object configured with `KILL_ON_JOB_CLOSE`. Keep the existing task-tree termination for deliberate stop, and treat a failed Job Object attachment as a failed start that immediately cleans up the child.

Out of scope: adopting arbitrary external processes, killing a process that does not carry the current native ownership marker, or changing the loopback trust boundary.

Acceptance: graceful native stop and native close terminate the complete owned tree; an unexpected native termination cannot leave the owned Node runtime listening on `2901`; an external listener remains untouched and is reported as unowned. Rust compile checks and a dev forced-termination smoke test are required before release claims.

### LB-RUNTIME-016 — Bounded native-owned child recovery

Status: Implemented · current configured installed acceptance is green through `LB-QA-017`

The Tauri supervisor watches only the child process it spawned and only while the operator's
desired state is running. An unexpected child exit schedules at most three replacements with
1/2/4-second backoff; a 30-second stable child resets the attempt counter. `stop_bot`, native
shutdown, an external owner of `127.0.0.1:2901`, and repeated spawn/health failure disable or
exhaust recovery. The supervisor never adopts/kills an external process and never auto-joins,
auto-plays, or restores active player resources. The control health `ready` response is the
readiness authority, not child existence. `LB-QA-017` verifies the child-only failure path while
`LB-QA-015` separately verifies forced native-root orphan cleanup.

### LB-RUNTIME-002 — Native app starts with Windows

Status: Current · Owner decision: approved; manual Windows startup-toggle QA pending

Given the native app is the product root, when the user enables “Khởi động cùng Windows”, then Windows registers the native executable itself for user-session startup; the native app remains responsible for starting and owning the bot runtime after launch.

Failure states: if Windows registration is unavailable or denied, the setting remains unchanged and the native UI shows an actionable error; disabling the option removes only LocalBot’s own registration; startup must never register `npm`, a shell command, a Discord token, or a separate bot process.

Contract: use the Tauri autostart plugin with `enable`, `disable`, and `isEnabled`; expose only the boolean preference/state to React; default is disabled until the user explicitly enables it. Autostart does not change the existing native-owned bot lifecycle or port `2901` contract.

Acceptance: setting can be enabled and read back as enabled; disabling removes the registration; a Windows startup entry targets the native app; a startup launch reaches the same managed + ready state as a manual launch; no secret or external bot process is registered.

### LB-RUNTIME-003 — Packaged native runtime independence

Status: Implemented in build pipeline · Owner decision: approved; clean-machine acceptance pending

Given a release build is installed without the LocalBot repository or a system Node/npm dependency, when the native app starts the owned runtime, then it launches the bundled Node executable and compiled LocalBot entrypoint from Tauri resources, using app-local configuration/data paths.

Failure states: if a resource is missing, show a clear packaged-runtime error and do not report the bot as ready; if app-local `.env` is missing required configuration, report the missing variable names without values; if the child exits, expose failed/offline state and release the owned process slot.

Contract: `scripts/prepare-native-runtime.mjs` produces `native/src-tauri/resources/runtime`; `scripts/verify-native-artifact.mjs` verifies the staged runtime and MSI/NSIS output; Tauri maps the runtime to the installed `runtime` resource directory; release Rust resolves `runtime/node(.exe)` and `runtime/dist/index.js`; `LOCALBOT_DATA_DIR` and optional `LOCALBOT_ENV_FILE` keep production config/data outside the installed binary tree.

Acceptance: MSI/NSIS includes the runtime resource; installed app launches without the repository, npm, or system Node; app-local data is created and persists; native close stops the bundled child; missing runtime/config produces an honest error; no credential is bundled or logged.

### LB-RUNTIME-011 — First-run packaged configuration guidance

Status: Current · Owner decision: approved

Given a packaged native app has no usable control bridge yet, when the operator opens Settings, then the native shell may show the app-local data directory and whether its `.env` file exists so the operator can complete first-run configuration without guessing where to put the file.

Failure states: if native IPC is unavailable, hide the packaged-only guidance; if the app-local path cannot be resolved, show a generic setup error without inventing a path; never read, return, validate, or display secret values. File presence must never be treated as readiness.

Contract: Tauri `native_runtime_info` returns only `{ packaged, dataDir, envFilePresent }`. The UI lists variable names only (`DISCORD_TOKEN` or `BOT_TOKEN`, `DISCORD_CLIENT_ID`, optional `DISCORD_GUILD_ID`, and `LOCALBOT_CONTROL_ENABLED=true`) and instructs the operator to restart/start the native-owned runtime after saving.

Acceptance: a packaged build with no `.env` shows the real app-local directory and an honest not-configured state; adding the file and restarting does not expose its contents; a debug build does not incorrectly instruct the operator to use the packaged app-local path; native typecheck/build and Rust checks remain green.

### LB-RUNTIME-004 — Local JSON store corruption recovery

Status: Current · Owner decision: approved

Scope: a shared load/save helper (`src/persistence.ts`) used by every local JSON store (`playlists.json`, `music-permissions.json`, `equalizer.json`, `community.json`, `audit-log.json`, `player-state.json`, `greetings.json`, `automod.json`, `automod-review.json`, `ollama.json`), with an opt-in multi-step migration runner.

Out of scope: inventing migrations for schemas that have not changed. All current stores remain schema version `1`; concrete legacy fixtures and migration functions are separate store-specific work. Backup restore is defined separately by `LB-RUNTIME-006` so it can coordinate file transaction and runtime restart semantics.

Given a local JSON store file is missing, well-formed, or damaged, when the bot loads that store at startup or first use, then a missing file yields the store's empty default, a well-formed file loads normally, and a file that fails to parse as JSON or fails its shape/version check is renamed to `<file>.corrupt-<timestamp>.json` next to the original before the store continues with a fresh empty default.

Failure states: an I/O error other than "file missing" (for example a permissions error) still throws the store's existing safe error message instead of silently discarding data; a quarantine rename that itself fails (for example a locked file) is swallowed and the store still continues with the in-memory default so startup is never blocked by a damaged file.

Contract: `loadJsonStore(filePath, isValid, createDefault, readErrorMessage, options?)` and `saveJsonStoreAtomic(filePath, data)` in `src/persistence.ts`; every store passes its own `isValid` type guard and default-value factory and keeps its existing public API and file format unchanged. When `options.currentVersion` and one-step `options.migrations` are provided, a complete valid chain is validated and atomically persisted before returning with `migrated: true`; future or incomplete versions are quarantined.

Acceptance: unit tests per store (playlists, music-permissions, equalizer, community, audit-log, player-state, greetings, automod, automod-review, ollama) prove that invalid JSON and an unsupported/missing `version` both recover to a usable empty store, leave a `.corrupt-*.json` file on disk with the original bytes, and that a subsequent write succeeds normally; a missing file still yields the default without creating a quarantine file; root `npm test`, `npm run typecheck`, and `npm run build` stay green.

### LB-RUNTIME-005 — Credential-free local backup export

Status: Implemented for export and restore transaction; the shared migration runner is implemented and concrete schema migrations remain task-scoped.

Given the loopback control bridge is online, when the operator requests a backup, then LocalBot returns a versioned JSON envelope containing only the ten known credential-free local stores (including Welcome/Goodbye, AutoMod, bounded AutoMod review metadata, and Ollama settings) and no credentials, caches, logs, or runtime binaries. Missing stores are represented by their empty version-1 default; malformed store files fail safely instead of being silently copied into a backup.

Contract: `GET /api/v1/data/export` returns `application/json` with a download disposition. The native Settings screen exposes download and restore actions and reports errors without claiming success. Restore is explicit-confirmation-only, validates the known envelope, stages all ten stores, retains a pre-restore recovery copy, and requires a native-owned runtime restart before in-memory state is considered current. Concrete store migrations follow `docs/PERSISTENCE_SPEC.md`.

### LB-RUNTIME-006 — Transactional local backup restore

Status: Implemented in the loopback control plane and native Settings · installed-build and failure-injection acceptance remain release gates

Given the operator selects a credential-free LocalBot backup, when they explicitly confirm restore, then the control plane validates the complete version-one envelope and sensitive-key policy, creates a pre-restore recovery copy, stages all ten known stores, and atomically replaces the live files. A failed installation attempts rollback and returns `409 RESTORE_FAILED`; it never claims a mixed or partial success. The native app presents an explicit restart action, then waits for the normal readiness reconciliation before clearing the pending-apply state.

Contract: `POST /api/v1/data/restore` accepts `{ confirm: true, backup }` within the local 8 MiB body limit. It returns `restoredAt`, fixed store names, `restartRequired: true`, and a recovery filename. It never accepts paths, credentials, runtime resources, or provider caches. See `docs/RECOVERY_SPEC.md` for the full request, failure, transaction, and acceptance contract.

Acceptance: unit tests cover missing/default stores, valid stores, malformed-store rejection, envelope version/format, and absence of credential fields; a native action downloads the JSON without layout disruption; `.env`, OAuth material, provider caches, and logs are absent from the payload.

## Integration rules

1. Native UI talks through Tauri IPC or `127.0.0.1:2901`; an optional browser UI talks through a server-side BFF, never directly to Discord/YouTube/private services.
2. The native bridge/control service validates every guild/action input and keeps credentials server-side.
3. The control plane returns domain state, not Discord.js objects or raw provider responses.
4. Queue/playback commands must be idempotent where practical and return the resulting state/version.
5. Live updates should carry a guild-scoped state version so the client can detect stale events.
6. Native guild-scoped reads use a last-write-wins request revision per surface and selected-guild scope. A response, error, or loading transition from an older guild/request is discarded; the control API and Discord state remain authoritative.
7. External URLs are treated as untrusted data. Validate provider URLs and never pass unsanitized URLs to navigation APIs.
8. Keep provider-specific behavior behind adapters so another source can be added later.

## Future provider and intelligence boundaries

These boundaries are planned; they are not part of the current YouTube MVP:

- `MediaProvider` adapters expose normalized metadata and supported actions. YouTube and optional SoundCloud are the approved current providers; any future provider requires a new owner-approved requirement and API/licensing/terms review.
- A link resolver classifies pasted URLs and maps them to a canonical track, playlist, album, or unsupported-link result. The queue consumes canonical media objects rather than provider-specific response shapes.
- An optional `LocalAiProvider` can call an Ollama-compatible local endpoint for suggestions, explanations, and intent parsing. AI output is untrusted input: deterministic permission checks, moderation policy, validation, and confirmation remain authoritative.
- The AI integration must fail closed for privileged actions, be disabled without changing the core bot, and never send secrets or private guild data to a remote service by default.

## Planned module boundaries

| Module | Responsibility | First safe slice |
| --- | --- | --- |
| `media` | provider adapters, URL resolver, canonical track/collection | YouTube adapter remains stable; add resolver contract |
| `community` | XP events, levels, ranks, leaderboards | per-guild XP rules with cooldown |
| `activity` | structured operational and moderation logs | redacted, guild-scoped event records |
| `onboarding` | welcome/goodbye text and image templates | preview + explicit send |
| `safety` | AutoMod, anti-raid, anti-nuke policy engine | audit/dry-run before enforcement |
| `intelligence` | optional Ollama prompts and explanations | read-only suggestions with feature flag |

Each module must declare its configuration, permissions, event inputs, commands/routes, and failure behavior. Feature flags prevent incomplete modules from affecting YouTube playback.

## Local control API surface

The following routes are implemented when `LOCALBOT_CONTROL_ENABLED=true`; routes marked planned remain future work:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | Implemented: bot/control-plane readiness |
| GET | `/api/v1/diagnostics` | Implemented (`LB-OPS-001`): bounded secret-free runtime/profile/ownership/provider/intent readiness diagnostics for the native operator surface |
| GET | `/api/v1/guilds` | Implemented: guilds visible to the local bot |
| GET | `/api/v1/providers` | Implemented: secret-free readiness and effective enable state for YouTube and optional SoundCloud |
| POST | `/api/v1/providers/soundcloud` | Implemented: enable/disable SoundCloud without accepting credentials |
| POST | `/api/v1/providers/soundcloud/test` | Implemented: redacted official connection test without accepting credentials |
| GET | `/api/v1/audit-log?limit=...&guildId=...&action=...&search=...` | Implemented: bounded redacted audit entries, optionally scoped by guild, action namespace, or case-insensitive search |
| GET | `/api/v1/audit-log/export?guildId=...&format=json/csv&limit=...&action=...&search=...` | Implemented: required single-guild, bounded JSON/CSV attachment using the same redacted store; no all-guild export |
| GET | `/api/v1/audit-log/settings` | Implemented: secret-free effective retention metadata and hard entry limit |
| POST | `/api/v1/audit-log/settings` | Implemented: native-owned validated retention update with atomic pruning; no arbitrary deletion |
| GET | `/api/v1/guilds/:guildId/audit-log/discord?limit=...` | Implemented: on-demand Discord audit-log read requiring `ViewAuditLog`, returning minimal in-memory metadata only |
| GET | `/api/v1/ollama` | Implemented: non-secret Ollama settings plus minimal health state |
| POST | `/api/v1/ollama/settings` | Implemented: validated endpoint/model/timeout/enable update |
| POST | `/api/v1/ollama/health` | Implemented: bounded `/api/tags` health probe without raw provider payload |
| POST | `/api/v1/ollama/suggest` | Implemented: bounded read-only help/music/community suggestion; no action execution |
| GET | `/api/v1/data/export` | Implemented: credential-free versioned JSON backup of the ten local stores, including bounded AutoMod review metadata |
| POST | `/api/v1/data/restore` | Implemented: explicit-confirmation transactional restore with recovery copy; native restart required before in-memory state is current |
| POST | `/api/v1/commands/register` | Implemented: register the current slash-command contract globally or for a selected guild; token remains server-side |
| GET | `/api/v1/guilds/:guildId/channels` | Implemented: voice/stage channels, bot presence, and Connect/Speak capability |
| GET | `/api/v1/guilds/:guildId/channels/:channelId/music-readiness` | Implemented: channel-effective ViewChannel/Connect/Speak readiness with structured unknown/missing/unsupported states |
| POST | `/api/v1/guilds/:guildId/voice/join` | Implemented: join or move to a selected voice channel while preserving the guild player |
| POST | `/api/v1/guilds/:guildId/voice/leave` | Implemented: leave the selected guild's voice channel |
| GET | `/api/v1/guilds/:guildId/player` | Implemented: current track, queue, voice state, status, volume, duration and best-effort playback position |
| POST | `/api/v1/guilds/:guildId/media/search` | Implemented: search the selected media provider |
| POST | `/api/v1/guilds/:guildId/player/play` | Implemented: resolve and enqueue/play via a selected Discord voice channel |
| POST | `/api/v1/guilds/:guildId/player/action` | Implemented: pause, resume, previous, skip, stop, volume, shuffle, repeat |
| POST | `/api/v1/guilds/:guildId/player/queue/remove` | Implemented: remove a pending queue item |
| POST | `/api/v1/guilds/:guildId/player/queue/move` | Implemented: move a pending queue item |
| POST | `/api/v1/guilds/:guildId/player/queue/clear` | Implemented: clear pending items while keeping the current track |
| GET | `/api/v1/guilds/:guildId/queue` | Implemented: queue snapshot |
| GET | `/api/v1/guilds/:guildId/local-audio?url=...` | Implemented: stream a resolved track as browser-playable MP3 for the native Windows output, with the guild EQ filter |
| GET | `/api/v1/guilds/:guildId/playlists` | Implemented: list guild-scoped local playlists |
| POST | `/api/v1/guilds/:guildId/playlists/{create,update,delete,add,remove,move,play}` | Implemented: native playlist CRUD, track management, reorder, and enqueue |
| GET | `/api/v1/guilds/:guildId/equalizer` | Implemented: read persisted guild EQ settings |
| POST | `/api/v1/guilds/:guildId/equalizer` | Implemented: save EQ gains or a named preset |
| GET | `/api/v1/guilds/:guildId/music-access` | Implemented: read guild Music permission mode and allow-list |
| POST | `/api/v1/guilds/:guildId/music-access` | Implemented: update Music permission mode or user allow-list |
| POST | `/api/v1/media/resolve` | Implemented: standalone provider-neutral resolver route |
| POST | `/api/v1/media/search` | Implemented: provider search without a guild context, used by Windows-only discovery |
| GET | `/api/v1/local-audio?url=...&guildId=...` | Implemented: Windows-only MP3 stream; optional guildId applies that guild's Equalizer without requiring a Discord voice session |
| GET | `/api/v1/guilds/:guildId/player/events` | Implemented: SSE player snapshots with state version and polling fallback |
| GET | `/api/v1/guilds/:guildId/events` | Implemented: SSE guild/voice summaries driven by bot voice-state changes, with polling fallback in the native client |
| GET | `/api/v1/local-player` | Not exposed by design: Windows playback state is native-session local and lives in the Tauri WebView |
| POST | `/api/v1/local-player/action` | Not exposed by design: Windows playback actions stay in the native session so a local sink failure cannot mutate Discord state |
| GET | `/api/v1/guilds/:guildId/community/leaderboard?limit=...&offset=...` | Implemented: bounded guild-scoped XP leaderboard page with absolute ranks and `hasMore` |
| GET | `/api/v1/guilds/:guildId/community/member/:userId` | Implemented: guild-scoped member rank/progress |
| GET/POST | `/api/v1/guilds/:guildId/community/settings` | Implemented: guild-scoped cooldown, XP multipliers/rewards, and bounded ignored channel/role lists; invalid writes are all-or-nothing |
| POST | `/api/v1/guilds/:guildId/community/reset` | Implemented: explicitly confirmed guild-scoped Community progress reset; preserves Community settings |
| GET/POST | `/api/v1/guilds/:guildId/greetings` | Implemented: validated per-guild Welcome/Goodbye settings; returns explicit Members Intent status |
| POST | `/api/v1/guilds/:guildId/greetings/preview` | Implemented: render a template without Discord delivery |
| POST | `/api/v1/guilds/:guildId/greetings/test-send` | Implemented: send only the selected enabled template to its configured channel |
| GET | `/api/v1/guilds/:guildId/text-channels` | Implemented: real text/announcement channels with bounded position and bot send/embed permission state |
| GET | `/api/v1/guilds/:guildId/roles` | Implemented (`LB-GUILD-001`): real non-managed, non-@everyone role summaries for native configuration pickers; no Discord role mutation |
| GET | `/api/v1/guilds/:guildId/permissions` | Implemented (`LB-GUILD-003`): bounded effective bot permission diagnostics and highest-role metadata; read-only and unknown-cache safe |
| GET | `/api/v1/guilds/:guildId/members?query=...&limit=...` | Implemented (`LB-GUILD-002`): bounded user directory for native Music allow-list; uses Discord search only when Members Intent is explicitly enabled, otherwise reports cache-only/incomplete state |
| GET/POST | `/api/v1/guilds/:guildId/automod` | Implemented policy contract: validated per-guild spam/flood/link/scam settings, exemptions, `dry-run`/`enforce` mode, kill switch, and `capabilities.messageContentIntentEnabled`; content rules are a safe no-op until the explicit privileged intent is enabled |
| GET | `/api/v1/guilds/:guildId/automod/review?status=...&limit=...` | Implemented: bounded, guild-scoped redacted AutoMod review records |
| POST | `/api/v1/guilds/:guildId/automod/review/:reviewId` | Implemented: idempotent local confirm/dismiss annotation; never mutates Discord state |

The control server is loopback-only by configuration and intentionally has no remote auth yet. Before exposing it beyond the local machine, add authentication, origin protection, rate limiting, and an explicit threat model.

### Gateway capability gating

Discord privileged intents are opt-in capabilities, not assumptions. Server Members Intent is
controlled by `LOCALBOT_GUILD_MEMBERS_INTENT` for Welcome/Goodbye and member-join telemetry.
Message Content Intent is controlled independently by `LOCALBOT_MESSAGE_CONTENT_INTENT` for
content-based AutoMod. Both flags default to `false`, both require the matching Discord
Developer Portal setting, and the native control surface receives explicit capability metadata.
The runtime must not infer a match from missing content or claim that a disabled capability is
protecting the guild.

## Data boundaries

- Discord identifiers are opaque strings; do not assume numeric types in UI state.
- Canonical media DTOs should contain only the fields the UI needs: `provider`, `id`, `title`, `url`, `duration`, `durationText`, `channel`, `channelId`, and `thumbnail`. Player snapshots additionally expose `volumePercent`, `positionSeconds`, and `durationSeconds` for the active Discord output. Ollama DTOs contain only bounded settings and health enums; raw model/provider payloads never cross the boundary.
- Discord voice playback and direct Windows playback use separate output sinks. The native app can stream the same resolved track to Windows alongside the Discord player; Windows queue/progress/actions are session-local in the Tauri WebView while Discord player state is authoritative for the Discord sink. A control-API `/local-player` mirror is intentionally not provided, because duplicating the local session state would create a second authority and make sink isolation less reliable.
- Raw cookies, access tokens, InnerTube responses, and FFmpeg process details never cross the control-plane boundary.
- Errors should expose stable `code`, safe `message`, and optional `retryable`; logs may contain diagnostic details server-side.

## Native app recommendation

Use Tauri 2 with React + Vite + TypeScript for the primary Windows app. Keep the frontend presentation-focused and use Tauri commands/IPC or the loopback control service for privileged operations. The first implementation should not embed a Next.js server. If a browser companion is needed later, use Next.js App Router and Route Handlers as a separate BFF with Server Components by default.

## Observability to plan for

- Correlation ID per dashboard command.
- Guild ID and action type in structured logs; never tokens or cookies.
- YouTube request failure category and retryability.
- Voice connection state transitions.
- Queue state version and action latency.
## Shared runtime profiles for non-native execution (`LB-RUNTIME-017`, `LB-RUNTIME-018`)

The Node/Discord/Music core is shared across three explicit profiles rather than forked into
separate applications:

```text
                 +-----------------------------+
                 | shared Discord/Music core   |
                 | stores, providers, commands |
                 +-------------+---------------+
                               |
        +----------------------+----------------------+
        |                      |                      |
   native (Tauri)        headless (Node)       slash-only (Node)
   control=on             control=optional      control=off
   owner marker           local-only            no listener / no UI
```

`src/runtime-profile.ts` is the fail-closed policy boundary. Native injects its profile and
canonical `127.0.0.1:2901` values into the child, so a stale `.env` cannot turn the native shell
into an unowned runtime. Slash-only loads `control-server.ts` dynamically only when control is
enabled, keeps command registration explicit, and has no public dashboard/API contract. All
profiles retain the same Discord command, provider, persistence, and graceful shutdown code.

`SIGINT` and `SIGTERM` stop all guild players, close the optional loopback server, and destroy the
Discord client exactly once. This is the lifecycle contract consumed by local development and the
systemd reference; Discord commands never expose arbitrary process restart or shell execution.
