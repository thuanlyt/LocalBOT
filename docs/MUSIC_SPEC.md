# LocalBot Music Specification

Status: Current implementation + native dev integration complete for the approved YouTube/SoundCloud scope.

This is the low-token contract for the Music module. Read this file before inspecting Music source files. The approved UI states and interaction language remain in `docs/UI_UX_V1.md`.

## SDD requirements

These IDs are the acceptance contract for the current Music slice. A change that alters behavior must update the affected requirement before code is changed.

### LB-MUSIC-001 — Provider-neutral discovery

Status: Current · Owner decision: approved

Given the control bridge is online, when the user searches a query with YouTube, SoundCloud, or all configured sources, then the backend returns only normalized `MediaTrack` DTOs from available providers, with real title, channel, duration, URL, provider, and thumbnail metadata where supplied. Unconfigured providers are reported unavailable and do not appear ready in native UI.

Acceptance: provider readiness contract test; sanitized live YouTube search returns results with a provider URL and thumbnail when the source supplies one; unavailable SoundCloud is disabled with an actionable explanation.

### LB-MUSIC-002 — Honest discovery states and deduplication

Status: Current · Owner decision: approved

Given no result, a provider failure, an unsupported URL, or an offline bridge, when the user searches or resolves media, then the native app shows the corresponding empty/error/offline state and never inserts sample records. All-source discovery removes strong cross-provider duplicates using normalized title plus channel/duration evidence; provider IDs remain canonical for playback.

Acceptance: empty query, unsupported URL, provider error, cross-provider duplicate, and offline UI checks pass.

### LB-MUSIC-003 — Queue and player state

Status: Current · Owner decision: approved

Given a real resolved track and an active output, when the user adds, removes, moves, skips, pauses, resumes, stops, shuffles, repeats, or changes volume, then the operation returns the authoritative resulting state or a stable error and the UI only confirms success after that state is received. Queue positions are 1-based and source tags are visible.

Acceptance: queue/player unit tests; control contract tests for inactive player and invalid positions; native refresh/SSE reconciliation shows the returned state.

### LB-MUSIC-004 — Output selection

Status: Current · Owner decision: approved

Given Discord, Windows, or both outputs are selected, when the user plays a real track, then Discord requires a selected guild/voice context, Windows uses the loopback local-audio stream, and both outputs synchronize from the real track/action result. No output may be silently enabled after a failed prerequisite.

Acceptance: native output selection smoke; Discord permission failure and Windows stream failure show actionable errors; Windows-only discovery/play does not require a Discord voice channel.

### LB-MUSIC-005 — Local playlists and permissions

Status: Current · Owner decision: approved

Given a selected guild, when an authorized user creates/edits/deletes a playlist, adds/removes/reorders tracks, plays a playlist, or changes Music access, then versioned local persistence is updated atomically and native/slash-command views converge on the returned state. Default Music access is allow-list; managers may choose all-members mode.

Acceptance: playlist persistence CRUD test, permission test, route validation test, native empty/loading/error states, and slash-command registration check.

### LB-MUSIC-006 — Live synchronization and metadata truth

Status: Current · Owner decision: approved

Given Discord or voice state changes outside the native app, when SSE or polling reconciliation runs, then guild/channel/player state converges without fake progress, fake membership, or stale success feedback. The native app exposes the last successful sync time and a retry action for Guild, Voice, Player, and provider readiness surfaces; a stale or failed surface is visually distinct and never presented as current. Audio-quality claims are displayed only when returned by the backend contract.

Acceptance: player/guild SSE contract tests, live API smoke, native refresh/offline verification, and a manual native pass proving fresh/stale/error/retry states without layout shift.

### LB-MUSIC-007 — Provider credentials and future hardening

Status: Split: credential vault implemented by `LB-MUSIC-012`; persistent player hardening remains a separate decision. Discord seek policy is closed by `LB-MUSIC-014`.

SoundCloud credential entry/masking/storage and clear behavior now have a separate native Windows contract in `docs/SOUNDCLOUD_CREDENTIALS_SPEC.md`. A persistent Windows player service and credential recovery/rotation UX beyond clear-and-replace remain separate decisions. Native Windows device selection is implemented by `LB-MUSIC-011`.

### LB-MUSIC-008 — Isolated Discord and Windows output sessions

Status: Current · Owner decision: approved

Implementation note: the backend boundary and live failure isolation are verified. Native visual/toggle acceptance still requires a manual native-window pass because automated computer-control capture is unavailable in this environment.

Given a track is sent to Discord, Windows, or both, when one output starts, fails, is toggled, or is controlled, then each target owns an independent stream/session and reports an independent result. Discord playback must not be cancelled, paused, stopped, or marked failed because a Windows stream fails; Windows playback must not be cancelled because Discord rejects a guild, voice, permission, or provider operation.

Failure states: a dual-target action may return partial success with per-target status; the UI must show which target is active, failed, or unavailable and must never claim both outputs succeeded when only one did. Disabling Windows stops only the local audio element/stream; disabling Discord stops only the guild player. A stale local sync result must not overwrite a newer Discord track.

Contract: Discord uses the guild player routes and state version; Windows uses an independent local-audio request/session. Multi-target play/control aggregates target results with `Promise.allSettled`-style semantics and a correlation token or track identity so late local responses cannot mutate Discord state. Shared user intent may be synchronized, but transport and failure boundaries remain separate.

Acceptance: play a real YouTube result to Discord; enable Windows and force/observe local stream failure while Discord continues; enable Windows first then Discord and reverse the order; toggle each target off independently; verify Discord state/version and voice playback remain correct after every Windows failure; verify both success and partial-failure UI states.

### LB-MUSIC-009 — Safe Discord queue recovery after restart

Status: Implemented first slice · Owner decision: approved

Given the native-owned bot runtime restarts after an unexpected stop, when it loads local state and the operator later joins a guild voice channel, then LocalBot restores that guild's pending queue, recent history, shuffle/repeat settings, and Discord volume without automatically joining voice or starting playback. The current track/resource, playback position, stream URL state, and voice connection are never persisted.

Out of scope: automatic voice reconnect, automatic resume, Windows local-session recovery, and advanced provider credential rotation/recovery beyond the native clear-and-replace path.

Contract: `data/player-state.json` is a version-one guild-scoped store. It contains only validated queue data and `volumePercent`; the persisted queue always has `current: null` so recovery cannot trigger unprompted playback. A malformed store is quarantined by the shared persistence layer. On player creation, pending queue/settings are hydrated; the next explicit play/enqueue action controls playback.

States: after recovery the player may be idle with a non-empty pending queue; native/slash-command responses must describe this as restored and wait for an explicit user action. If the store is missing or quarantined, the player starts with an empty queue and normal first-run behavior.

Acceptance: deterministic tests prove bounded validated persistence, current-track omission, restart hydration, corruption recovery, and no auto-play; root/native checks remain green; a live restart acceptance must verify the bot remains disconnected until the user selects a voice channel and starts playback.

### LB-MUSIC-010 — Explicit SoundCloud availability control

Status: Current provider slice · Owner decision: approved for official API plus native vault/env fallback

Given SoundCloud credentials are configured in the Node runtime, when the operator opens native Settings, then the operator can explicitly enable or disable the SoundCloud provider and request a credential/API connection test. The native app receives only redacted provider status; client ID, client secret, access token, refresh token, cookies, and raw provider payloads never cross the control API and are never included in backup/export.

If the operator enables SoundCloud without valid credentials, the operation fails with a clear configuration error and the provider remains unavailable. If the provider is disabled, search, resolve, and playback reject with a stable `SOUNDCLOUD_DISABLED` error while YouTube remains unaffected. The setting is versioned local JSON and survives a runtime restart.

Out of scope: user OAuth, cookies, and private content. Native credential entry/storage is covered by `LB-MUSIC-012` and does not change the official provider boundary.

Contract: `GET /api/v1/providers` reports `configured` and effective `enabled` state; `POST /api/v1/providers/soundcloud` accepts `{ "enabled": boolean }`; `POST /api/v1/providers/soundcloud/test` returns only redacted connection status. `data/provider-settings.json` is a version-one store and is excluded from credential-free backup until its inclusion contract is explicitly reviewed.

Acceptance: setting persistence and invalid-shape tests; disabled-provider search/resolve failure tests;
the disabled guard must win even when an access token is warm in memory; no-credential enable
rejection; connection-test route never returns secret fields; YouTube regression remains green;
native Settings exposes enable/disable/test states while keeping all credential values outside the
control API.

### LB-MUSIC-012 — Native SoundCloud credential vault

Status: Implemented native Windows slice · installed-build and live provider acceptance remain release gates.

See `docs/SOUNDCLOUD_CREDENTIALS_SPEC.md` for the command contract, Windows Credential Manager boundary, precedence rules, state matrix, and acceptance checks. This requirement covers only the native Windows vault path; `.env` remains a server-side fallback and the loopback control API never accepts credentials.

### LB-MUSIC-013 — Bounded provider metadata requests

Status: Current implementation · installed/live provider acceptance remains separate

Given the local control plane requests provider search or direct metadata resolve, when the same provider receives more than 30 metadata requests inside a rolling 60-second window, then LocalBot rejects the excess request with the retryable `MEDIA_RATE_LIMITED` error and HTTP 429 mapping. The budget is tracked independently for YouTube and SoundCloud and is process-local; it is not presented as a distributed provider quota.

All-source search may still use the other provider when one provider is locally rate-limited, but it must not claim a result from the limited provider. Stream lifetime/download sessions are intentionally outside this metadata budget so independent Discord and Windows outputs are not interrupted by a search quota.

Acceptance: deterministic fake-clock tests prove per-provider isolation, rolling-window expiry, reset behavior, and stable retryable error semantics; existing source-aware search/resolve, dual-output, and provider failure tests remain green. No credentials or provider payloads are included in rate-limit errors or logs.

### LB-MUSIC-014 — Discord seek policy for the stream-pipe architecture

Status: Accepted and implemented as an intentional read-only boundary.

The current Discord provider pipeline hands a non-seekable stream into the Discord voice player. The player exposes elapsed playback telemetry, but it does not expose a seek operation. LocalBot must not emulate Discord seek by restarting or offsetting a live pipe: that would create provider-dependent latency, duplicate streams, ambiguous queue state, and a false success result. The native Windows session may seek its own local media element independently.

The native UI and slash-command surface must therefore present Discord progress as read-only in the current release, with no draggable Discord seek affordance and no success state for an unsupported seek request. A future Discord seek feature requires an approved seekable/cache-aware media design, explicit buffering and cleanup rules, a versioned player contract, and new dual-output/live QA evidence; it is not a patch to the current pipe.

Acceptance: contract/UI tests assert that Discord progress is telemetry-only and Windows seek remains local; documentation and roadmap no longer treat the policy as an unresolved product decision.

### LB-MUSIC-015 — SoundCloud creator attribution metadata

Status: Current implementation · official API metadata normalization

SoundCloud may return a creator-facing `metadata_artist` that differs from the uploader profile name. The provider adapter uses `metadata_artist` when it is a non-empty string and falls back to `user.username` otherwise. The provider-neutral DTO continues to expose this value through `channel`; no raw provider object crosses the control boundary.

Acceptance: deterministic mapping tests cover preferred, blank, and missing `metadata_artist`; root typecheck/build and the provider/static/docs gates remain green. The native player must retain the track URL/source tag needed for SoundCloud attribution.

### LB-MUSIC-016 — SoundCloud current URN and HLS AAC playback contract

Status: Current implementation · configured live acceptance remains separate

SoundCloud playback must follow the current official API contract: require the track `urn` as the canonical provider identity, request `/tracks/{track_urn}/streams`, and prefer the returned `hls_aac_160_url`, falling back to `hls_aac_96_url`. Numeric-only responses are rejected; the adapter must not depend on the deprecated numeric `id`, the removed singular `/stream` route, or progressive MP3 selection. Because an HLS manifest is not a media byte stream, the provider-neutral audio boundary must allow either a Web `ReadableStream` (YouTube) or an HTTPS media URL (SoundCloud); the FFmpeg owner consumes the correct source form for Discord and Windows independently.

Acceptance: deterministic tests prove URN-only identity, exact encoded `/streams` endpoint construction, AAC quality fallback, rejection of missing/non-HTTPS stream URLs, and no progressive fallback; provider/player/control-server typecheck and build remain green. A configured live SoundCloud search, resolve, thumbnail, HLS playback, attribution, and installed-build credential acceptance remain separate release evidence.

### LB-MUSIC-017 — SoundCloud single-use refresh recovery

Status: Current implementation · configured token-expiry acceptance remains separate

When a cached SoundCloud refresh token is rejected as invalid or expired, discard only the
in-memory token cache and obtain a fresh application token through the documented HTTP Basic
Client Credentials flow. Preserve transient network failures for retry; never loop on the same
single-use refresh token, persist tokens, or expose them through native/control surfaces.

Acceptance: deterministic tests distinguish invalid-auth fallback from transient network failure
and execute the rejected-refresh → fresh Client Credentials flow through a mocked HTTP boundary;
the provider rate budget and current URN/HLS stream contract remain unchanged. Configured live
token expiry/rotation and installed-vault playback remain release evidence.

### LB-MUSIC-011 — Native Windows output-device routing

Status: Current native slice · Owner decision: approved for local-only output routing

Given the native WebView exposes `navigator.mediaDevices.enumerateDevices()` and the local audio element exposes `setSinkId`, when the operator opens the Windows output controls, then LocalBot lists the real available `audiooutput` devices, allows selecting one, persists only the opaque device ID locally, and applies the selection to the Windows audio element without changing the Discord player or output state.

If device enumeration or sink routing is unavailable, the UI reports that limitation and keeps the system default device; it never fabricates device names or reports a selection as successful before `setSinkId` resolves. A device-disconnect event refreshes the list and falls back to the system default without interrupting Discord.

Out of scope: sending device IDs to Node/control API, changing Windows system defaults, microphone/input routing, Discord device selection, or a persistent Windows player service.

Contract: native-only state. `audiooutput` devices are read from the WebView media-device API; `default` is the explicit system-default option. The device ID is stored in native `localStorage` only and is reapplied to the local `<audio>` element after a successful feature check.

Acceptance: native typecheck/Vite build pass; supported WebView selects a real enumerated output and persists it across native UI reload; unsupported/permission/device-loss states show an honest fallback; toggling Windows output or forcing a local stream failure never changes Discord player state. Manual device and accessibility checks remain part of the release gate.

### LB-MUSIC-019 — Direct Guild / Voice Readiness Flow

Status: Current implementation · installed visual/accessibility and authorized live acceptance remain release gates

Intent: let an operator choose the Discord guild and voice channel directly inside Music, understand whether that exact channel is usable, and explicitly decide when playback or a voice join should occur. The Music flow must not redirect the operator to Community merely to inspect or choose playback context.

Scope:

- Show real guilds returned by the control API and real normal Voice/Stage channels returned for the selected guild.
- Reset the selected channel and readiness whenever the guild changes; reject late responses from the previous guild/channel.
- Evaluate the bot's effective permissions on the selected channel with `channel.permissionsFor(botMember)`. The minimum normal-voice set is `ViewChannel`, `Connect`, and `Speak`; guild-level summaries are diagnostic only and do not override channel overwrites.
- Expose a structured readiness DTO with `ready`, `missing_permission`, `unknown`, or `unsupported` state, effective permission values, missing permission names, and stable reason codes.
- Keep selection and readiness preflight-only. Selecting a guild, selecting a channel, opening the modal, or searching must not auto-join, move, or start playback. Join/play revalidates the same channel at operation time.
- Keep the selected channel, currently connected channel, and playing channel distinct in UI state. Discord and Windows output remain independent; Windows playback must not require a Discord context.

Out of scope:

- Granting Discord permissions, moving users, auto-joining on selection, Stage speaker/request-to-speak semantics, public remote control, or a new WebSocket channel.
- Treating an uncached bot member as denied. Unknown cache state must stay unknown and provide a retry path.

Given a selected guild and a channel that belongs to it, when the native Music context modal opens, then the channel list shows real channel type and current bot presence, the readiness card reports the effective `ViewChannel`/`Connect`/`Speak` result, and disabled actions explain the exact reason.

Given a guild-level permission is granted but a channel overwrite removes `Connect` or `Speak`, when readiness is evaluated, then the state is `missing_permission` with structured missing permissions and the UI does not claim the channel is ready.

Given the guild changes while a readiness request is pending, when the old request resolves after the new selection, then its result is discarded and cannot replace the new guild/channel state.

Given readiness is not `ready`, when the operator requests Discord playback or join, then the control plane returns a typed safe error with the readiness DTO and performs no provider resolve, join, move, or enqueue mutation.

Contract:

```text
GET /api/v1/guilds/:guildId/channels/:channelId/music-readiness

200 { guildId, readiness: {
  channel: { id, name, type: "voice"|"stage", category, position },
  channelExists: true,
  botMemberKnown: boolean,
  effectivePermissions: { viewChannel: boolean|null, connect: boolean|null, speak: boolean|null },
  readiness: "ready"|"missing_permission"|"unknown"|"unsupported",
  missing: ("ViewChannel"|"Connect"|"Speak")[],
  reasons: string[]
} }
```

Invalid/missing channels return `VOICE_CHANNEL_NOT_FOUND`, `INVALID_VOICE_CHANNEL`, or `CHANNEL_NOT_IN_GUILD`. Operation-time failures use `VOICE_MUSIC_PERMISSION_MISSING`, `VOICE_READINESS_UNKNOWN`, or `VOICE_CHANNEL_UNSUPPORTED` and include the same structured readiness under `error.details.readiness`. No raw Discord object, token, or provider payload crosses the boundary.

Native UI contract: Music owns the direct context modal and a compact context bar; it exposes loading, ready, missing, unknown, unsupported, offline, and stale/retry states; uses semantic buttons/labels/focus order; disables unsupported Stage actions instead of letting them fail opaquely; and uses only the existing polling/SSE reconciliation boundary. Motion is limited to the existing 150–300ms modal/state transitions and respects reduced motion.

Acceptance: unit tests cover ready, channel overwrite, missing `ViewChannel`/`Connect`/`Speak`, multiple missing permissions, unknown bot-member cache, Stage unsupported, invalid/non-member channel, structured DTO/errors, stale operation-time rejection, guild-switch reset, channel readiness refresh, and no auto-join. Root/native typechecks and the relevant native build/QA gates remain green. Rollback is to remove the Music context surface and route while retaining the existing Community picker and guild-scoped operation guards.

## Product scope

Supported sources for the current scope:

1. YouTube — default source, powered by the existing `youtubei.js` adapter.
2. SoundCloud — optional second source, powered by the official SoundCloud API.

No Spotify or other provider is part of this scope unless the owner explicitly reopens the decision. The queue and player must still use provider-neutral `MediaTrack` values so a future adapter does not leak provider response shapes.

## Canonical track DTO

```ts
type MediaTrack = {
  provider: 'youtube' | 'soundcloud';
  id: string;
  title: string;
  url: string;
  duration: number | null;
  durationText: string;
  channel: string;
  channelId: string | null;
  thumbnail: string | null;
};
```

Provider IDs are opaque strings. Use `provider + id` as the playback identity. For search/discover deduplication, keep provider IDs canonical but merge only strong cross-provider matches: normalized titles must match and known durations must be within a small tolerance, or the normalized title/channel/duration key must match. Never silently merge two queue items solely because their titles look similar.

## Current Discord commands

| Command | Behavior |
| --- | --- |
| `/play query [source]` | Auto-resolve a pasted YouTube/SoundCloud URL; otherwise search the selected source and enqueue the first result. |
| `/search query [source]` | Search YouTube, SoundCloud, or all configured sources; all-source results are deduplicated. |
| `/info url` | Resolve a supported provider URL or YouTube video ID and show safe metadata. |
| `/join` | Join the invoking member's voice channel, or move there while preserving the current queue. |
| `/queue` | Show current track, source tags, pending tracks, shuffle, and repeat mode. |
| `/now-playing` | Show the current track, player status, volume, and voice channel. |
| `/clear` | Clear pending queue items while keeping the current track. |
| `/remove position` | Remove a pending queue item using 1-based position. |
| `/move from to` | Move a pending queue item using 1-based positions. |
| `/shuffle` | Toggle shuffle for the guild player. |
| `/repeat mode` | Set `off`, `all`, or `one`. |
| `/equalizer show|preset|set` | Inspect or persist bass/mid/treble settings; non-flat settings are applied by FFmpeg. |
| `/skip` | Stop current track and advance to the next pending track. |
| `/previous` | Replay the latest track in playback history when available. |
| `/pause`, `/resume` | Pause/resume the Discord audio player. |
| `/volume percent` | Set Discord output volume from 0 to 100%; applies immediately to the active resource. |
| `/stop` | Stop playback and clear current/pending/history state. |
| `/leave` | Stop and destroy the guild voice player. |
| `/playlist ...` | Local guild-scoped playlist CRUD and enqueue. |
| `/music-access ...` | Server-manager-only permission mode and user allow-list management. |

All Music commands require a guild. Server managers (`ManageGuild` or `Administrator`) are always allowed. Other users follow the guild's local permission setting.

## Queue semantics

- One independent player per guild.
- Queue positions shown to users are 1-based and exclude the currently playing track.
- `shuffle` changes selection when advancing; it does not unexpectedly reorder the visible pending list.
- `repeat=one` replays the same current track after completion.
- `repeat=all` sends the completed track to the end of the pending list.
- `repeat=off` records history and advances normally.
- `skip` records the skipped current track in history and advances.
- Playlist track ordering is 1-based and can be changed through the native control API or `/playlist move`; invalid positions fail without mutating the playlist.
- A provider/FFmpeg failure skips the failed item and tries the next item; it must not loop forever on one failed track.
- Player snapshots include a guild-scoped `stateVersion`, active Discord `volumePercent`, `positionSeconds`, and `durationSeconds`; position is derived from the Discord audio resource playback clock.

## Persistence

- `data/playlists.json`: versioned, guild-scoped playlists; native detail UI and slash commands can create/update/delete playlists, add/remove tracks, reorder tracks, and enqueue a playlist; writes use a temporary file followed by atomic rename.
- `data/music-permissions.json`: versioned, guild-scoped `allowlist`/`all` mode and user IDs; default mode is `allowlist`.
- `data/player-state.json`: version-one, guild-scoped recovery snapshot for pending Discord queue, bounded history, shuffle/repeat settings, and volume. It never stores the current active resource, playback position, voice connection, stream URL state, or credentials. Recovery hydrates only after the bot joins a selected voice channel and does not auto-play.
- Native Windows queue and playback position are held in the current app session; the native window uses the loopback `local-audio` stream, advances local tracks automatically, and applies local previous/skip, shuffle, and repeat semantics.
- Equalizer settings persist locally and are applied to the Discord FFmpeg pipeline; native Windows device routing is sink-local and shares the selected guild's Equalizer settings.
- Discord output volume is currently held per active guild player (default `100%`); native output volume is held by the current session. The Windows-only path does not require a guild voice session; it uses the global local-audio route and applies guild Equalizer settings only when a guild is selected.
- Do not store tokens, OAuth secrets, cookies, or raw provider responses in either file.

## Provider rules

### YouTube

- Keep `youtubei.js` isolated in `src/youtube.ts`.
- It is an unofficial InnerTube client; metadata/stream behavior can change when YouTube changes clients.
- Keep its cache under `YOUTUBE_CACHE_DIR` and never expose raw InnerTube responses.

### SoundCloud

- Use `https://api.soundcloud.com` and `https://secure.soundcloud.com/oauth/token` with registered app credentials.
- Follow the current [official API Guide](https://developers.soundcloud.com/docs/api/guide): client credentials are for public search, URL resolution, and playback; cache/reuse tokens and send `Authorization: OAuth ACCESS_TOKEN` on API requests. Treat the official OpenAPI specification as the schema source when endpoint behavior changes.
- Use the current track identity and stream contract from the [official OpenAPI specification](https://raw.githubusercontent.com/soundcloud/api/master/openapi/api.yaml): prefer `urn`, request `/tracks/{track_urn}/streams`, and prefer `hls_aac_160_url` with `hls_aac_96_url` fallback. Do not add a progressive-stream fallback after the official migration deadline.
- Client credentials are optional and server-side: native Windows Credential Manager is the preferred Settings path; `SOUNDCLOUD_CLIENT_ID`, `SOUNDCLOUD_CLIENT_SECRET` remain the env fallback.
- Cache/reuse access tokens; do not obtain a new client token for every request.
- Search only playable public content by default. Blocked, private, paywalled, or geo-restricted tracks may fail safely.
- Prefer SoundCloud `metadata_artist` for the normalized artist/channel label when supplied; fall back to the uploader profile name for older responses.
- Preserve SoundCloud attribution/link requirements in the native player when SoundCloud playback is exposed.
- Do not use undocumented API-v2 scraping, harvested browser client IDs, or user cookies as a default implementation.

## Native/control-plane gaps

The following are not falsely marked complete by the Discord core:

- Tauri 2 shell and approved native UI are implemented in `native/`; native search, real thumbnails, queue controls, player actions, output selection, and slash-command registration are wired through the loopback API. Offline mode renders explicit empty/offline states and never supplies sample guild, track, queue, playlist, ranking, or progress data. Visual-only concepts remain isolated under `DEMO/`.
- Native guild/channel control is implemented: the app can list bot guilds, inspect voice channels, check Connect/Speak permissions, and join/move/leave through the loopback API.
- Direct Windows audio output can stream the selected track alongside Discord output through the loopback `local-audio` route. The native app owns a session-local queue, real media progress/seek, volume, repeat-one behavior, and automatic advance. Discovery and the global local-audio route work without joining Discord voice; a persistent local-player service remains future work.
- When enabling the second output for an already-playing session, native first validates the required Discord guild/voice context and synchronizes the current track through the real player route; a failed synchronization does not silently enable the output.
- The bot auto-registers the command contract on Discord `ClientReady`; the native Community page can explicitly re-register commands for the selected guild at any time. Guild registration is preferred for immediate visibility; global propagation can take time.
- Native Settings reports provider readiness, supports SoundCloud enable/disable and a redacted connection test, and can write/clear credentials through the native Windows vault. The UI never reads the secret back; save/clear applies on the next native-owned bot restart. User OAuth, cookies, private-content access, and remote secret management remain out of scope.
- Native device-specific output selection (`LB-MUSIC-011`) and independent local-player state; the current Windows sink falls back to the browser/system audio device when the WebView does not support routing, and shares guild EQ.
- Discord player live state events are available at `GET /api/v1/guilds/:guildId/player/events` using SSE, including a one-second playback-clock update while playing. Guild/voice presence events are available at `GET /api/v1/guilds/:guildId/events` and are driven by Discord voice-state changes. Native polling remains as a fallback for both streams.

Implement these in separate phase-sized tasks. Preserve the DTO and queue semantics above.
