# LocalBot Architecture Decisions

## ADR-001 — Use `youtubei.js` as the YouTube adapter

Status: Accepted.

The first YouTube slice uses `youtubei.js` from LuanRT's YouTube.js project. It provides metadata/search and stream access without an official API key. The adapter must remain isolated because it uses YouTube's unofficial internal API and can break when YouTube changes behavior.

## ADR-002 — Primary UI uses Tauri 2 for Windows

Status: Accepted; native shell implemented, Music integration pending.

LocalBot is Windows-only and local-first during this stage, so the primary UI should be a lightweight Tauri 2 native window with React + Vite + TypeScript. The native window does not require a web server. Next.js remains an optional future browser companion, not a prerequisite for the product.

## ADR-003 — Local control/runtime uses port 2901

Status: Accepted.

`127.0.0.1:2901` is the canonical local control/runtime bridge for the native app. The Tauri window itself has no required port. An optional web companion must use a separate port so a port collision does not hide an architecture problem.

## ADR-004 — Separate native app initially

Status: Superseded by ADR-018; the separate Tauri shell remains implemented in `native/`.

Historical boundary decision: create `native/` as a separate Tauri app rather than mixing native UI files into the bot package. The old “bot process remains separate” wording applied only before native ownership was specified; lifecycle ownership is now defined by ADR-018.

## ADR-005 — UI clients never receive bot credentials

Status: Accepted.

The native UI talks through Tauri IPC or the loopback control service; an optional browser UI talks through server-side Next.js routes. Tokens, cookies, provider credentials, and control-plane credentials remain server-side. The control plane starts local-only and unauthenticated only during a deliberate development phase; production or network exposure requires auth and origin protection.

## ADR-006 — Three-mode monochrome modern minimalist visual system

Status: Accepted.

The UI has three explicit modes: `Default` split-tone, `Dark`, and `Light`. `Dark` is the default first-launch mode; `Default` is an independent split-tone mode and is not an OS/system theme. The entire UI uses black, white, and neutral grayscale only. Motion is restrained and semantic. The canonical visual rules are in `docs/UI_UX_V1.md`, `docs/DASHBOARD_SPEC.md`, and `docs/DESIGN_SYSTEM.md`.

## ADR-007 — Generated design system plus human dashboard override

Status: Accepted.

UI/UX Pro Max generates the reusable base system in `design-system/localbot/MASTER.md`. Its dashboard page output is refined in `design-system/localbot/pages/dashboard.md` so generator defaults such as landing-page CTA sections, light-first colors, and code-editor typography cannot override the LocalBot product brief. The page override wins over the master; human-owned rationale and tokens remain in `docs/DESIGN_SYSTEM.md`.

## ADR-008 — Documentation is progressive disclosure

Status: Accepted.

`CLAUDE.md` stays short and routes Claude to task-specific docs. Detailed procedures live in `docs/`; reusable workflows live in `.claude/skills/`. This reduces repeated repository scans and keeps stale instructions easier to find.

## ADR-009 — Be Vietnam Pro is the native app font

Status: Accepted.

Be Vietnam Pro is used across the native app to support Vietnamese-friendly readability and a consistent, welcoming product voice. System sans-serif is only a loading/network fallback; decorative serif and monospace faces are not part of the UI language.

## ADR-010 — Provider-neutral media and policy-first local AI

Status: Accepted direction; implementation pending.

YouTube remains the first media provider, but playback state and queue models must not depend on YouTube-specific response shapes. Spotify and other sources are future adapters subject to their supported APIs and terms. Ollama is an optional local intelligence provider for suggestions and explanations; it cannot bypass deterministic permissions, safety policies, or confirmation for privileged actions.

## ADR-011 — Separate local and Discord playback targets

Status: Accepted direction; implementation pending.

The native app must be able to play supported media directly to the Windows audio device without requiring a Discord voice session, while retaining Discord voice playback. Both targets may share media resolution and canonical queue primitives, but their output sessions, state, errors, and permissions remain explicit and independently observable.

## ADR-012 — Use the official SoundCloud API as the optional second provider

Status: Accepted direction; implemented as optional server-side adapter.

SoundCloud search, URL resolution, and public playback use the official API with registered app credentials and OAuth Client Credentials token caching. The official API's Authorization Code/PKCE flow is reserved for future user-scoped features and is not needed for the current public-only Music scope. The adapter fails clearly when credentials are absent and does not use undocumented API-v2 scraping, harvested browser client IDs, or cookies. Private, blocked, paywalled, or geo-restricted tracks remain unavailable unless a future authorized-user flow is explicitly implemented. Provider terms and attribution requirements remain part of release review.

## ADR-013 — Persist playlists and Music permissions as local versioned JSON

Status: Accepted; implemented.

Guild-scoped playlists and Music command permissions use small versioned JSON files with atomic temporary-file replacement. This keeps the first local Windows slice database-free and easy to back up. Queue playback itself remains in memory until a deliberate queue-recovery design is added. Permission mode defaults to `allowlist`; server managers are exempt so they can configure the allow-list or switch to `all`.

## ADR-014 — Apply Equalizer settings at the FFmpeg boundary

Status: Accepted; implemented for Discord playback.

Bass, mid, and treble gains are constrained to `-12..+12 dB`, persisted per guild in a local versioned JSON file, and translated into an FFmpeg audio filter chain before raw PCM reaches the Discord voice player. Flat settings omit the filter. Native Windows output must reuse the settings contract when its audio engine is implemented; it must not invent a second EQ model.

## ADR-015 — Native dev toggle owns only its own bot process

Status: Superseded by ADR-018.

Historical baseline: the Tauri Windows shell could start and stop a Node child with `npm run dev` from the LocalBot workspace, while health on `127.0.0.1:2901` was observed separately. The external-process safety rule remains, but a separate health signal is no longer sufficient for the product-root contract.

## ADR-016 — Use SSE for native Discord player updates

Status: Accepted; implemented.

The loopback control plane exposes a guild-scoped Server-Sent Events stream for player snapshots. Command requests remain ordinary HTTP and each event includes the existing `stateVersion`. Native polling remains enabled as a recovery path for a dropped stream; the stream is not exposed outside loopback.

## ADR-017 — Community and operations data stay local and bounded

Status: Accepted; implemented first slice.

Community XP/rank data and native control audit entries use versioned local JSON with atomic replacement writes. Message XP has a cooldown and ignores bot authors. Audit records store action metadata and safe detail only, retain a bounded number of entries, and never store tokens, cookies, OAuth credentials, or raw provider responses. A future multi-user/remote deployment must replace this with authenticated storage and a documented retention policy.

## ADR-018 — Native app is the sole LocalBot runtime owner

Status: Accepted; implemented and smoke-tested in native development mode.

LocalBot is a native-first local product. The Tauri app starts the workspace Node runtime in development and the bundled Node runtime in release, passes an ephemeral non-secret ownership marker, and is the only supported owner of the bot/control server. Native must not adopt or kill an external process occupying port `2901`; it reports that conflict as an unowned-runtime error and requires the operator to stop the external process before starting LocalBot from native. Native shutdown terminates the owned process tree so the Discord client and control server stop together. The release implementation is defined by ADR-022.

## ADR-019 — Discord and Windows playback use independent output sessions

Status: Accepted; implemented and live-smoke-tested at the control API boundary.

Discord voice playback remains authoritative for the guild player and runs in its own provider-download/FFmpeg/player pipeline. Windows playback uses a separate local-audio HTTP stream and native audio element. A multi-target user action aggregates independent outcomes; a failure, cancellation, or late response from Windows cannot mutate or cancel Discord playback, and vice versa. Shared track identity and explicit per-target status are used for synchronization. This does not imply two independent Discord queue models: the Discord guild queue remains authoritative for Discord, while Windows follows the selected local-session behavior in `docs/MUSIC_SPEC.md`.

## ADR-020 — Use Tauri autostart for Windows startup

Status: Accepted; implementation complete, manual installed-build QA pending.

LocalBot should register the native Tauri executable with Windows through the official Tauri autostart plugin. This keeps startup configuration in the native app, avoids creating a Task Scheduler/shell entry for `npm` or the bot, and preserves the rule that native is the sole owner of the bot runtime. The setting is opt-in, disabled by default, and must be reversible from native Settings. Production packaging must validate that the registered target is the installed executable rather than a development command.

## ADR-021 — Local JSON stores quarantine corrupted data instead of crashing

The shared opt-in multi-step migration runner is now defined separately by ADR-033; concrete store migrations remain schema-change scoped.

Status: Accepted; implemented.

Every local JSON store (`playlists.json`, `music-permissions.json`, `equalizer.json`, `community.json`, `audit-log.json`, `player-state.json`, `greetings.json`) previously threw during load when the file contained invalid JSON or an unsupported/missing `version`, which could take down the whole bot process on a damaged local store. Load now goes through a shared `src/persistence.ts` helper: a missing file still yields the store's empty default, but a file that fails to parse or fails its shape check is renamed in place to `<file>.corrupt-<timestamp>.json` (preserved for manual inspection/recovery) and the store continues with a fresh empty default instead of crashing. Genuine I/O errors other than "file missing" or "content invalid" still throw, since silently discarding data on a permissions/disk error would hide an operator-actionable problem. This ADR covers corruption recovery only; transactional restore is defined and implemented separately by `LB-RUNTIME-006`, while multi-version schema migration remains planned. Credential-free export is defined and implemented by `LB-RUNTIME-005`.

## ADR-022 — Bundle the production Node runtime inside the native installer

Status: Accepted; build pipeline implemented, installed-build acceptance pending.

The native Windows app is the product root, so a release installation must not depend on the repository, a shell command, npm, or a separately installed Node.js. The release pipeline compiles the root TypeScript runtime, copies a pinned Node executable and production dependencies into a generated Tauri resource, and launches that resource from Rust. Runtime data and an optional first-run `.env` live in the native app-local data directory, outside the installed binary tree. The generated resource is ignored by source control and rebuilt for each release.

This preserves the native ownership marker, readiness check, process-tree shutdown, and port `2901` contract from ADR-018. It does not claim the installer is distribution-ready until clean-machine launch, first-run configuration, upgrade persistence, uninstall, and Windows startup checks pass on an installed artifact.

## ADR-023 — Abort local Windows audio streams without affecting Discord playback

Status: Accepted; implemented and live-smoke-tested.

The Windows output is a request-scoped HTTP/FFmpeg stream, while Discord output is a guild-scoped voice player. When the native audio element is closed, switched, or fails, the local stream must cancel its media reader, destroy its own FFmpeg pipes, and terminate only its own process. Each pipe has an error listener and backpressure waits resolve on drain, close, or error so an aborted Windows socket cannot surface as an unhandled `write EOF` in the bot process. Discord player state is not touched by this cleanup.

The acceptance scenario is a real YouTube track sent to Discord in QA guild `1541307192534241318`, a concurrent local-audio request that reads data and closes, followed by Discord state and health checks. A failing local sink may still report a user-visible local error; it must not cancel, pause, stop, or falsely fail the Discord sink.

## ADR-024 — Export local configuration as a credential-free JSON backup

Status: Accepted; export and transactional restore are implemented, while multi-version migration remains pending.

LocalBot needs a portable backup for its local JSON stores without placing secrets in an archive. The control plane therefore exports a versioned envelope containing only the ten known credential-free stores: playlists, Music permissions, Equalizer, Community, bounded audit entries, safe Discord player-state recovery, Welcome/Goodbye settings, AutoMod settings, bounded AutoMod review metadata, and Ollama settings. It never reads or includes `.env`, tokens, cookies, OAuth credentials, runtime logs, generated runtime resources, or provider caches. The native Settings action downloads the response as a user-visible JSON file; the endpoint remains loopback-only under the existing control-plane boundary.

Restore is implemented separately as `LB-RUNTIME-006`: it requires explicit confirmation, validates the envelope and sensitive-key policy, creates a pre-restore recovery copy, stages all ten files, rolls back on installation failure, and returns `restartRequired`. The native app owns the stop/start operation and only clears the pending-apply state after the control bridge reports Ready. Multi-version schema migration and upgrade compatibility remain separate work.

## ADR-025 — Persist only safe Discord queue recovery state

Status: Accepted; implemented first slice, runtime restart acceptance pending.

The native app remains the sole owner of the Discord runtime, but an unexpected process restart should not silently discard every pending track. LocalBot therefore persists a version-one `player-state.json` store containing a bounded pending queue, bounded recent history, shuffle/repeat settings, and Discord volume per guild. The active track is deliberately written as `current: null`; the playback resource, position, voice connection, stream URL state, and credentials remain in memory only.

On startup the store is loaded and validated through the shared persistence layer. When a user later creates a player by selecting a voice channel, LocalBot hydrates the pending queue/settings but does not auto-join or auto-play. Explicit user playback controls remain the authority. Invalid state is quarantined and replaced with an empty default. Backup export and transactional restore include this safe store, while multi-version migration remains separate work.

## ADR-026 — Keep SoundCloud credentials Node/env-only while adding an explicit provider toggle

Status: Accepted; implementation complete for the first hardening slice.

SoundCloud is an optional official-API provider. The native app may show whether it is configured, allow the operator to disable or re-enable the provider, and request a redacted connection test, but it must never receive client secrets or OAuth tokens. The Node runtime reads `SOUNDCLOUD_CLIENT_ID` and `SOUNDCLOUD_CLIENT_SECRET` from its existing environment contract and stores only a versioned `enabled` flag in local provider settings. Enabling without credentials fails clearly; disabling isolates SoundCloud and leaves YouTube available.

The first slice deliberately did not invent file encryption. The native Windows credential UX is now defined by ADR-039 and `LB-MUSIC-012`; it uses the OS-backed Credential Manager with explicit clear-and-replace and restart semantics. Provider settings are not included in the credential-free backup, and the vault is never exported.

## ADR-027 — Keep Community progression guild-scoped with bounded cooldown overrides and pagination

Status: Accepted; implementation complete for `LB-COMMUNITY-003` deterministic/API/native slice; live and installed-build acceptance pending.

Community XP remains local and guild-scoped. A guild may override the global message XP cooldown with an integer from `0` to `86,400` seconds; `null` means use the global environment default. The setting is optional in the existing version-one JSON shape so old data continues to load. Leaderboards are read with bounded `limit`/`offset` values and retain absolute ranks; reads never create sample members or mutate XP. Native writes and slash-command writes share the same store validation and atomic persistence boundary.

This slice does not add reset, multipliers, role rewards, remote authentication, or moderation actions. Those require separate requirements and permission review.

## ADR-028 — Require explicit confirmation for guild-scoped Community progress reset

Status: Accepted; implemented for `LB-COMMUNITY-004` deterministic/API/native slice; live and installed-build acceptance pending.

Community progress reset is destructive local state, so it must not be triggered by an accidental page load or an ambiguous button click. The control API and slash command will require an explicit confirmation value, restrict the Discord command to guild managers, preserve ignored-channel/role and cooldown settings, and emit only a count in the audit detail. There is no restore/undo in this slice; restore requires a separate backup/recovery design.

## ADR-029 — Apply audit retention and redaction at the local store boundary

Status: Accepted for `LB-LOG-002` deterministic/control slice; native policy editor and live installed-build acceptance pending.

Audit data is local operational history, not a raw diagnostic dump. The store keeps its hard maximum of 2,000 entries and optionally applies `LOCALBOT_AUDIT_RETENTION_DAYS` (`1..3650`); unset preserves the existing bounded behavior. Every new actor/action/detail string is normalized, truncated, and scrubbed for credential-like key/value material before it is written. A secret-free metadata route reports the effective policy. This keeps retention and redaction independent of UI callers and avoids exposing provider payloads, while leaving arbitrary destructive log deletion and remote import/export out of scope. The separate read-only Discord view is defined by ADR-045.

## ADR-030 — Gate Welcome/Goodbye events behind an explicit Members Intent opt-in

Status: Accepted for `LB-ONBOARD-001` first slice.

Discord member join/remove events require the privileged Server Members Intent. LocalBot must not add that intent unconditionally because a user who has not enabled it in the Discord Developer Portal would lose bot startup. The runtime therefore includes the intent only when `LOCALBOT_GUILD_MEMBERS_INTENT=true`; settings, preview, and test-send remain available without the event listener. The native app never changes the portal setting or silently enables a privileged capability.

## ADR-031 — Stage AutoMod as a dry-run-only detector before enforcement

Status: Accepted for `LB-SAFETY-001` deterministic/control slice; native editor is implemented by `LB-SAFETY-002` and the bounded message enforcement slice is implemented by `LB-SAFETY-003`/ADR-042.

AutoMod can cause destructive or high-impact Discord changes, and heuristics such as scam detection have non-trivial false positives. The first slice therefore persists only an explicit per-guild policy, evaluates non-bot messages with bounded in-memory history, writes a minimal redacted audit match, and always returns `enforced:false`. Proposed actions are metadata for future review; no message deletion, timeout, ban, permission mutation, raid response, or nuke response is called. Any enforcement must be a separate SDD requirement with explicit confirmation, least-privilege checks, rate limits, rollback/recovery, and isolated QA fixtures.

## ADR-032 — Keep Windows output-device routing native and sink-local

Status: Accepted for `LB-MUSIC-011`.

Discord and Windows are independent output sinks. Device selection therefore belongs to the native HTML audio element and must not become a control-server or Discord player setting. The app feature-detects WebView media-device enumeration and `setSinkId`, offers only real devices plus the system-default option, persists the opaque selection in native local storage, and treats a failed/disconnected device as a Windows-only fallback. No Windows device ID, name, or permission is sent to Node or Discord, and a routing failure cannot mutate Discord playback state.
## ADR-033 — Use an opt-in deterministic migration runner for local JSON stores

Status: Accepted; shared runner implemented for `LB-RUNTIME-007`, concrete store migrations remain task-scoped.

Version fields without migration logic are not enough for an enterprise upgrade path: silently treating an old file as empty loses user data, while accepting a future file risks corrupting it. LocalBot therefore keeps the existing quarantine behavior by default and adds an opt-in runner in `src/persistence.ts`. Store owners provide one-step `N -> N+1` functions and the current type guard; a complete chain is cloned, validated, atomically persisted, and only then returned. Future versions, incomplete chains, invalid outputs, thrown steps, and failed writes are quarantined or surfaced as a read/write error. Migrations cannot use network state, provider credentials, UI state, or current time. The backup envelope version remains independent from individual store versions.

## ADR-034 — Bound Community XP multipliers and make role rewards additive-only

Status: Accepted for `LB-COMMUNITY-005`; deterministic/API/native implementation complete, live role-assignment acceptance pending.

Community progression must remain useful without becoming an unbounded XP or permission-escalation mechanism. LocalBot therefore limits the guild multiplier and each role multiplier to integer `1..5`, caps each rule family at 25 entries, and uses only the largest matching role multiplier once. Level rewards are explicit role IDs with levels `2..100`; they are additive-only and never remove roles. Runtime assignment requires the bot's `ManageRoles` permission, a non-managed role below the bot's highest role, and a real cached guild role. Missing permissions, hierarchy problems, and Discord failures are safe skips that cannot block message processing, playback, or control-plane health. Native and slash configuration share the same validation and atomic persistence boundary.

## ADR-035 — Keep Ollama optional, bounded, and non-authoritative

Status: Accepted for `LB-AI-001`; configuration and health implemented, AI-assisted actions remain planned.

Ollama is an optional local intelligence layer and must never become a startup dependency or an authority over Discord permissions, playback, moderation, or local data. LocalBot persists only a bounded endpoint/model/timeout/enable flag in `data/ollama.json`, probes the explicit endpoint through `GET /api/tags`, and exposes only a redacted status DTO. Endpoints cannot contain credentials, query strings, or fragments; no API key, cookie, prompt, private member data, raw model response, or provider payload is stored or sent by this slice. The settings are included in the credential-free backup because they are non-secret. Any future AI action requires its own privacy, prompt-injection, permission, confirmation, budget, and audit contract.

## ADR-036 — Keep anti-raid and anti-nuke as dry-run signals before enforcement

Status: Accepted for `LB-SAFETY-004`; deterministic/event telemetry implemented, enforcement remains planned.

Anti-raid and anti-nuke heuristics have high false-positive and operational-risk cost. LocalBot therefore stores bounded per-guild threshold rules but initially emits only redacted, `enforced:false` audit signals. Member-join telemetry is available only when the operator has already opted into Server Members Intent. Channel/role destructive events are counted as generic signals without fetching or exposing Discord audit-log payloads. No message, member, role, channel, permission, or guild state is mutated. Any future enforcement must use separate explicit mode/confirmation, permission and rate-limit checks, isolated disposable fixtures, kill switch, and recovery evidence.

## ADR-037 — Keep Ollama suggestions read-only and context-free

Status: Accepted for `LB-AI-002`; implemented with autonomous actions explicitly out of scope.

Ollama may provide a bounded explanation or next-step suggestion only after the operator explicitly enables it and configures a model. LocalBot sends no Discord, member, queue, provider, credential, or filesystem context; it sends only the short operator question and a fixed instruction that the text is untrusted. The response is length-limited, returned as plain text, and never interpreted as a command. Disabled/offline/invalid providers produce a safe error and do not affect the bot. Any future AI-assisted mutation requires a separate requirement, permission/confirmation flow, threat model, and audit contract.

## ADR-038 — Let native operators edit audit retention, never arbitrary entries

Status: Accepted for `LB-LOG-003`; implemented for the local/control/native slice.

Audit retention is an operational policy and may be changed from the native Community page without editing `.env` or exposing filesystem controls. The server accepts only `null` or an integer from `1..3650`, keeps the hard 2,000-entry cap, prunes through an atomic store replacement, and awaits the policy-update audit write before reporting success. Individual entries cannot be deleted from the UI, remote Discord audit-log data is not ingested, and a failed write must leave the previous policy/data intact.

## ADR-039 — Store optional SoundCloud credentials in the native Windows vault

Status: Accepted for `LB-MUSIC-012`; native implementation and deterministic validation are complete, installed/live acceptance remains pending.

SoundCloud remains optional and official-API-only, but requiring operators to edit `.env` for a provider credential is not a complete native experience. On Windows, the native Tauri shell therefore stores the bounded official Client ID/Client secret as a generic Windows Credential Manager entry. Tauri exposes only status, set, and clear commands; the loopback API, local backup, React persistence, logs, and screenshots never receive the secret. When the native shell starts its owned Node child, the vault values override inherited environment values; `.env` remains a documented fallback when the vault is empty. Because Node configuration is loaded at process startup, saving or clearing requires an explicit native-owned bot restart. No user OAuth, cookies, private-content access, or unofficial scraping is added.

## ADR-040 — Keep audit export guild-scoped, bounded, and redacted

Status: Accepted for `LB-LOG-004`; implemented for the local/control/native slice.

Audit export is useful for local troubleshooting, but a one-click unbounded dump would weaken privacy and make accidental cross-guild disclosure easy. The control API therefore requires a single `guildId`, caps the result at the existing query limit of 100, reuses the searchable/action-filtered `AuditLogStore`, and emits either a minimal JSON envelope or quoted CSV. Write-time redaction and retention remain the security boundary; no export may contain credentials, raw provider payloads, or arbitrary deletion controls. The native Community page passes the current filters, offers JSON/CSV downloads, and never claims success before the file response is received.

## ADR-041 — Record passive moderation telemetry without actor or content attribution

Status: Accepted for `LB-LOG-005`; implemented for the existing Discord event boundary.

Operational logs benefit from knowing that messages, channels, or roles changed, but gateway events alone do not prove the responsible actor. LocalBot therefore records only bounded event metadata with actor `discord:event`; it never stores message content, usernames, member profile data, or raw Discord audit-log payloads. The listeners use existing non-privileged guild events, tolerate persistence failure without blocking the bot, and feed the same retention/redaction/export boundary as native actions. Human actor attribution or enforcement requires a new explicit SDD requirement and privacy/permission review.

## ADR-042 — Make AutoMod enforcement opt-in, bounded, and message-scoped

Status: Accepted for `LB-SAFETY-003`; implementation complete for the first enforcement slice.

Dry-run remains the default because heuristic scam/link detection and burst signals can produce false positives. LocalBot therefore adds a persisted `mode` with `dry-run` and `enforce`, but the native editor requires an explicit confirmation before saving enforcement. Enforcement can apply only one action to the triggering message: `delete` when Discord reports it deletable, or a fixed 60-second `timeout` when the member is moderatable. Timeout wins over delete when several rules match. Anti-raid and anti-nuke remain alert-only; quarantine, ban, kick, bulk deletion, permission changes, and lockdown are not implemented. A rolling per-guild limiter, Discord permission/hierarchy checks, redacted audit outcome, and the existing master kill switch are mandatory. Synthetic fixtures cover mutations; the authorized QA guild is never used for destructive moderation tests.

## ADR-043 — Preserve native ownership when an explicit bot stop fails

Status: Accepted; implemented in the native Tauri runtime.

The native window is the sole owner of the bot child. A failed stop must therefore be fail-closed: `stop_bot` keeps the owned child and its ownership marker in the runtime slot until process-tree termination and wait both succeed. If the operation fails, the UI may retry and the process is not silently reclassified as external or abandoned. A successful stop, or a child that has already exited, clears the slot and reports `managed:false`. This does not permit native to adopt or terminate an external listener on port `2901`.

## ADR-044 — Keep release resources runtime-only and reproducible

Status: Accepted; implemented for the current release pipeline.

The installed native resource must contain only files needed by the compiled bot and native UI. The staging pipeline therefore rebuilds from the current root `dist`, installs production dependencies from the lockfile, removes source maps and package test/spec files, and does not copy the repository's development output. Unused Vite/Tauri starter assets are not part of the native source tree after reference checks. Source, tests, SDD evidence, design references, `.env`, and local user data remain outside this cleanup boundary. Every later cleanup of generated `dist`, `target`, cache, or logs still requires the release gate and `docs/CLEANUP_CHECKLIST.md`.

## ADR-045 — Read Discord audit history on demand without importing it locally

Status: Accepted for `LB-LOG-006`; bounded control/native implementation complete, live permission and installed-build acceptance pending.

LocalBot needs an authoritative view of server changes, but importing Discord's audit history into the local store would mix retention, privacy, and ownership semantics. The native Community page therefore offers a separate on-demand Discord source. The control route requires the bot's `ViewAuditLog` permission, caps each request at 100 entries, returns only IDs/timestamps/action-target metadata and the executor identity Discord supplied, and keeps the result in memory. `reason`, `changes`, `extra`, raw REST payloads, message content, target/member profiles, remote export, and mutations remain excluded. Missing permission or Discord failure is a visible retryable state and never becomes a local success claim.

## ADR-046 — Make installer smoke prove non-interference with the real profile

Status: Accepted for `LB-RUNTIME-013`; implemented.

An isolated installer test is not sufficient if the native shell, bundled Node child, or WebView2 writes into the operator's real Windows profile. The smoke script therefore captures a metadata-plus-SHA-256 snapshot of the real native app-data directory before installation and after uninstall/temporary-directory removal. It emits only a boolean and file count, never file names, content, credentials, or raw paths, and fails closed when any entry is added, removed, or changed. The test refuses to start when the real app-local `.env` exists and routes all test-owned persistence surfaces to temporary directories. This is a reproducible non-interference gate, not a substitute for clean-machine, configured-bot, autostart, provider, playback, restore, accessibility, or visual acceptance.

## ADR-047 — Open the packaged app-data directory without handling secrets

Status: Accepted for `LB-RUNTIME-014`; implemented.

Missing configuration must be actionable, but sending `.env` contents through the React/control boundary would violate the native secret boundary. The packaged Settings panel therefore receives only `dataDir`, `packaged`, and `envFilePresent` from `native_runtime_info`; when the operator chooses the action, it calls `prepare_native_data_dir` (which creates only the app-data directory) and then passes the returned directory path to the official Tauri opener plugin. It does not create, copy, parse, or display `.env`; opener failure is rendered as a retryable inline message. The operator remains responsible for creating the app-local `.env`, and file presence never asserts bot readiness.

## ADR-048 — Bound provider metadata requests without throttling streams

Status: Accepted for `LB-MUSIC-013`; implemented.

The native UI can accidentally issue repeated searches or resolves through retries, double submits, or a render loop. LocalBot therefore applies a process-local rolling budget of 30 search/direct-resolve requests per provider per 60 seconds and returns a typed retryable 429 when the budget is exhausted. YouTube and SoundCloud are isolated, all-source search may keep results from the provider that remains available, and long-lived download/stream sessions are excluded so a Windows sink cannot affect Discord playback. This is an abuse/accident guard for one runtime, not a claim about a provider's distributed quota.

## ADR-049 — Clear per-guild AutoMod detector state on disable

Status: Accepted for `LB-SAFETY-005`; implemented.

AutoMod threshold detection is process-local and keeps bounded histories for spam, flood, anti-raid, and anti-nuke signals. If a guild is disabled and later re-enabled, retaining those entries would make the disabled interval count toward a new policy window and could create a false positive. The engine therefore clears only the target guild's volatile histories and cooldown markers whenever a disabled policy is evaluated. Persisted policy, redacted audit history, and other guilds remain untouched; no Discord API or destructive action is added.

## ADR-050 — Emergency AutoMod recovery always returns to disabled dry-run

Status: Accepted for `LB-SAFETY-006`; implemented.

The existing kill switch disables a policy, but a policy saved in `enforce` mode could become dangerous if re-enabled without an explicit mode decision. LocalBot therefore provides a separate confirmed recovery route that sets `enabled:false` and `mode:"dry-run"`, invokes the native-owned engine reset callback for the selected guild, and preserves rules, exemptions, audit entries, and other guilds. The route performs no Discord mutation; the native UI shows recovery only after the authoritative response.

## ADR-051 — Keep AutoMod review records redacted, bounded, and non-mutating

Status: Accepted and implemented for `LB-SAFETY-007`.

AutoMod heuristics need an operator review path, but retaining message content or exposing a
one-click reversal/punishment control would increase privacy and operational risk. LocalBot
therefore stores only bounded match metadata (guild/channel/user IDs, rule, reason, proposed
action, observed outcome, and review status) in a separate local store. Native operators may
mark a record confirmed or dismissed with a short note; a decision is a local annotation and
never changes Discord state. The store is guild-scoped, capped at 1,000 records, included in
the credential-free backup, and uses the shared corruption/migration boundary. Public appeals,
content recovery, automatic reversal, AI decisions, and remote access require separate
requirements and permission/privacy review.

## ADR-052 — Keep Windows playback state native-session local

Status: Accepted for the current dual-output architecture.

Discord playback is a server-side voice session and therefore exposes authoritative player snapshots through the loopback control API and SSE. Windows playback is a separate browser audio session owned by the Tauri native window. Its queue, position, sink selection, and transport actions stay in the native session and are not mirrored into a second `/local-player` REST resource. This prevents two competing authorities and guarantees that a Windows stream failure can disable only the Windows sink while Discord continues independently. A future cross-device controller would require a new versioned contract, explicit authority rules, and a separate SDD/QA gate.

## ADR-053 — Keep Discord seek read-only until a seekable media design exists

Status: Accepted for `LB-MUSIC-014`; implemented.

The Discord voice player currently consumes provider output through a non-seekable stream pipe. Restarting that pipe or applying an offset is not a reliable seek implementation: it can duplicate provider sessions, create provider-specific latency, desynchronize progress, and report success before the voice stream reaches the requested position. LocalBot therefore exposes Discord progress as telemetry-only and keeps seek available only in the independent native Windows media session.

A future Discord seek implementation must be based on an explicitly approved seekable/cache-aware media architecture with buffering, cancellation, retention, cleanup, versioned player semantics, and dual-output/live QA. This ADR prevents a later agent from treating a UI slider or `ffmpeg -ss` on the current pipe as a completed feature.

## ADR-054 — Use SoundCloud URN + HLS AAC URLs at the provider boundary

Status: Accepted and implemented for `LB-MUSIC-016`.

SoundCloud's current official API identifies tracks with string URNs and exposes stream choices through `/tracks/{track_urn}/streams`. The current response provides signed HLS AAC URLs, with 160 kbps preferred and 96 kbps as fallback. The former numeric-first identity, singular `/stream` route, and progressive-MP3 preference are not a durable implementation for the current API contract.

The provider adapter therefore requires and maps `urn` to the existing provider-neutral `MediaTrack.id`, rejects numeric-only track records, selects only an HTTPS HLS AAC URL, and returns that URL as a typed media source. YouTube may continue returning a Web byte stream. The Discord player and native local-audio route each pass the typed source to their own FFmpeg process; no stream session, cancellation, or error from one sink is shared with the other. Missing or unsafe stream URLs fail closed with a typed provider error. This keeps provider credentials server-side and avoids unofficial scraping.

## ADR-055 — Gate content-based AutoMod behind explicit Message Content Intent

Status: Accepted and implemented for `LB-SAFETY-008`.

Discord may deliver a `MessageCreate` event without a usable message body when the privileged
Message Content Intent is not enabled in both the Developer Portal and the gateway client. An
empty body must not be interpreted as a clean or matching message: doing so would make AutoMod
silently ineffective or create false review/enforcement records. LocalBot therefore adds the
intent only when `LOCALBOT_MESSAGE_CONTENT_INTENT=true`, defaults it off, and exposes the
effective capability in the guild AutoMod control response. The native UI explains the two-step
portal plus environment setup. With the flag off, content-based rules are a no-op while
Community XP and independent security-event telemetry retain their own intent boundaries.

This decision keeps startup safe for existing operators, avoids silently requesting a privileged
intent, and makes the missing capability observable. Any future intent or privileged Discord
surface requires a separate SDD requirement and portal/permission review.

## ADR-060 — Enforce the canonical native loopback endpoint

Status: Accepted and implemented for `LB-SECURITY-001`.

The control API is intentionally unauthenticated because it is an internal boundary owned by the
native window. The native client, ownership marker, and lifecycle contract all assume one fixed
endpoint: `127.0.0.1:2901`. Allowing `.env` to change the host or port would either expose control
operations to the LAN or make the native client and managed bot disagree about where the bridge
lives. Configuration validation therefore accepts only that canonical runtime binding and the
control server fails closed before listening for any other host or port. Port `0` is retained only
for deterministic in-process tests.

Remote exposure is not a configuration tweak. It requires a new SDD requirement covering
authentication, authorization, transport security, threat modeling, and native UX, followed by a
new ADR. This decision does not grant remote access or weaken the native ownership boundary.

## ADR-056 — Drop stale native guild responses

Status: Accepted and implemented for `LB-UI-002`.

Guild selection and recovery polling can overlap: a slow response for guild A may arrive after
the operator has selected guild B, or an older refresh for the same surface may finish after a
newer one. Treating arrival order as truth makes the native UI show the wrong player, channels,
settings, or audit records even when the backend and Discord state are correct. Native refreshes
therefore carry a monotonically increasing revision per surface and guild. Only the newest
revision whose selected guild still matches and whose bridge is online may commit success,
error, or loading state. Selection also clears the prior player snapshot and requests the new
guild's player immediately. SSE remains the preferred live path; polling is only recovery.

This is a client reconciliation rule, not a second authority: it does not cancel an operation
already accepted by Discord, invent data, or change API semantics. Offline, empty, stale, and
retryable states remain explicit. Any future optimistic mutation needs its own requirement and
rollback contract.

## ADR-057 — Guard guild-scoped action responses in the native client

Status: Accepted and implemented for `LB-UI-003`.

The native client can start a guild-scoped action and then change the selected guild before the
response arrives. Treating that response as current can make a Join/Leave, player action, playlist
save, Equalizer update, permission update, or moderation decision appear in the wrong guild and
can clear the new guild's loading state. Each action therefore captures its originating guild and
a monotonic guild-selection revision, and may commit state, loading cleanup, or a success/error
toast only while that guild is still selected and the bridge remains online. The revision also
rejects a late response when the operator changes guilds and returns to the original guild before
that response arrives. A stale action is not cancelled or reported as failed; the next
current-guild read/SSE refresh remains authoritative.

This is a native presentation/reconciliation boundary and does not weaken backend permission,
confirmation, audit, or Discord operation semantics. Future optimistic writes still require an
explicit rollback contract.

## ADR-061 — Bound and classify Discord slash-registration failures

Status: Accepted and implemented for `LB-COMMANDS-002`.

The native registration action calls Discord REST through the native-owned control runtime. A raw
Discord/HTTP exception is not a safe UI contract: it may contain provider response text, request
context, or implementation details, while a transient timeout/rate limit should be retryable and a
permission/configuration failure should not be retried blindly. The registration module therefore
maps the upstream HTTP status to a bounded `CommandRegistrationError`; the control server returns
only the stable code/message and a boolean `retryable` field. Unknown failures are treated as
retryable upstream failures, while 4xx failures remain non-retryable. The idempotent Discord PUT,
guild scope, schema validation, audit metadata, and secret boundary are unchanged.

This decision does not add automatic retry loops or expose remote control. A future background retry
policy needs its own rate-limit/backoff requirement and UI confirmation.

## ADR-062 — Recover only the native-owned bot child with a bounded supervisor

Status: Accepted and implemented for `LB-RUNTIME-016`.

The native window is the sole owner of the bot runtime, so an unexpected exit of its owned child
should not require the operator to notice and manually recover every transient process failure.
Native therefore supervises only the exact child it spawned. It retries with 1/2/4-second
backoff, stops after three consecutive attempts, resets the counter after a stable 30-second
run, and exposes a redacted recovery state through the existing native status command.

This policy is deliberately narrower than a session manager: it never adopts a process occupying
`127.0.0.1:2901`, never kills an external listener, never auto-joins a Discord voice channel,
never auto-plays persisted tracks, and never restores an active resource or stream. Explicit
`stop_bot` and native shutdown clear the desired-running flag before terminating the owned tree,
so user intent always wins over recovery. Health `ready`, not child existence, remains the
authoritative runtime readiness signal.

The installed crash-recovery smoke kills only the exact bundled Node child and verifies that the
same native root remains alive while a new owned child reaches sanitized control health. The
existing forced-root smoke remains separate evidence for Job Object orphan cleanup.

## ADR-058 — Recover SoundCloud public access after a rejected refresh token

Status: Accepted and implemented for `LB-MUSIC-017`.

SoundCloud refresh tokens are single-use. A cached refresh token can therefore become invalid
after a restart, a concurrent refresh, revocation, or provider-side expiry. Retrying that same
value forever would make public search, resolve, and playback appear permanently offline even
when the configured app credentials are valid. When the refresh request returns an authentication
or invalid-grant response, LocalBot clears only the in-memory token cache and requests a new
application token using the documented HTTP Basic Client Credentials flow. Network/timeouts and
other transient failures do not clear the cache, so normal retry behavior and provider token
budgets are preserved.

This recovery never persists tokens, does not broaden SoundCloud access, and does not retry a
provider request with user cookies or undocumented endpoints. Live expiry/rotation observation
remains a configured-provider acceptance check.

## ADR-059 — Await mutation audit before committing success

Status: Accepted and implemented for `LB-LOG-008`.

Control-plane mutations are operator actions whose audit trail must be ordered with the state
change. Fire-and-forget audit calls can let a success response reach the native client before the
event is persisted, create unhandled rejections, or accidentally use the process-global store when
an isolated runtime/test store was supplied. LocalBot therefore awaits one shared audit boundary
before committing each mutation response and passes the request-scoped `AuditLogStore` explicitly.

Audit persistence remains telemetry, not a transaction coordinator: a write failure is caught and
redacted, the primary operation is not falsely reported as rolled back, and no credential/provider
payload crosses the error boundary. Read-only routes remain audit-free. Turning the audit event
into a distributed transaction or exposing the control API remotely would require a new security
and durability requirement.

## ADR-063 — One shared core with explicit runtime profiles

Status: Accepted and implemented for `LB-RUNTIME-017`.

LocalBOT must support the native Windows product and a future Linux VPS slash-command-only
installation without maintaining divergent bot implementations. The runtime therefore exposes
`native`, `headless`, and `slash-only` profiles through one small policy module. Native requires
Tauri ownership and loopback control; headless is Node-only and may opt into the loopback bridge;
slash-only rejects both the bridge and ownership marker, dynamically avoids loading the control
server, and defaults command registration to explicit operator action. The default remains
`headless` for backwards compatibility with existing `npm run dev` and `npm start` workflows.

This is a source/deployment boundary, not proof of Linux support. A real VPS, systemd, FFmpeg,
network, permissions, and provider acceptance must be verified on the target host and are marked
Blocked when unavailable.

## ADR-064 — Graceful process lifecycle is shared and bounded

Status: Accepted and implemented for `LB-RUNTIME-018`.

`SIGINT` and `SIGTERM` are first-class shutdown inputs. The runtime stops every Discord player,
closes the optional loopback server, and destroys the Discord client once, without remote restart,
shell execution, or implicit voice rejoin. The systemd reference uses the same contract with a
non-root user, journald, bounded stop timeout, and restart-on-failure. A supervisor may restart a
failed service, but LocalBOT itself does not expose that power through Discord or an unauthenticated
public API.

## ADR-065 — Use cached Discord role metadata for safe native configuration pickers

Status: Accepted and implemented for `LB-GUILD-001`.

Community XP multiplier and level-reward settings store Discord role IDs, but asking an
operator to copy IDs by hand is error-prone and makes the native app feel disconnected from
the selected guild. The existing loopback control boundary now exposes a minimal list of
non-managed roles from the selected guild's Discord cache. The native Community surface uses
that list to select and display roles while continuing to persist only the existing role IDs.

The `@everyone` role and integration-managed roles are omitted because they are not valid
targets for these settings. This is read-only discovery: LocalBot does not grant roles, change
role permissions, fetch an unbounded member list, or add a remote-control surface. If the cache
is empty or stale, the UI shows a loading/empty state and the operator may retry; it never
invents role names. A role that disappears after configuration remains visible as its ID with an
explicit missing-cache label so the stored setting is not silently rewritten.

## ADR-066 — Make native Music member selection capability-gated and bounded

Status: Accepted and implemented for `LB-GUILD-002`.

The native Music allow-list previously required copying a Discord user ID by hand. LocalBot now
offers a bounded, read-only member directory route for the selected guild. When
`LOCALBOT_GUILD_MEMBERS_INTENT=true` is enabled, a non-empty search query may use Discord's
bounded member search. Without that privileged intent, the route searches only the members
already present in the local cache and marks the result `complete:false` with `source:"cache"`.

The route never performs permission mutation, fetches an unbounded member list, returns message
content, or exposes raw Discord errors. Bot accounts are omitted from the picker because they
are not useful Music allow-list targets. The existing user-ID persistence and slash-command
permission checks remain authoritative; the picker is only a safer input mechanism.

## ADR-067 — Reuse Community settings for native XP exclusion pickers

Status: Accepted and implemented for `LB-COMMUNITY-006`.

The Community store and slash command already supported ignored channel/role IDs, but native
operators could not manage those settings without switching to Discord. The existing guild-scoped
`community/settings` control route now accepts bounded `ignoredChannelIds` and `ignoredRoleIds`
lists, so native can use the real text-channel and role discovery data already loaded for the
selected guild.

Each list is capped at 50 unique bounded string IDs and is normalized before any atomic store
mutation. The native surface only performs local configuration writes; it never changes Discord
permissions, creates/removes roles, fetches arbitrary members, or bypasses slash authorization.
Missing cached entries remain visible by ID, and invalid writes preserve the previous settings.

## ADR-068 — Expose effective guild permissions as read-only diagnostics

Status: Accepted and implemented for `LB-GUILD-003`.

Operators need to understand why a voice join, greeting, audit read, AutoMod action, slash
registration, or Community role reward is unavailable. Existing per-channel summaries are useful
but do not explain the guild-level permission baseline. LocalBOT therefore exposes a bounded
guild-scoped permission summary through the existing loopback boundary and renders it in native
Community.

The summary reads the bot member's effective Discord permissions and highest role only. Missing
member cache is represented as unknown (`null`) rather than denied. The route is strictly
read-only: it cannot grant permissions, edit overwrites, create roles, or change command
authorization. Channel-specific checks remain authoritative for an actual action, and managed
or hierarchy-ineligible roles remain non-actionable for Community rewards.
