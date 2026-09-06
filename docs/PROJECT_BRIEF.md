# LocalBot Product Brief

Status: Current product direction.

## North star

LocalBot should feel like a dependable, premium Discord companion: fast in chat, pleasant in voice channels, easy to operate from a native Windows app, and modular enough to grow beyond YouTube.

## Primary users

- Discord server owners who want a controllable, self-hosted bot.
- Moderators who need visibility into guild state and bot health.
- Members who want frictionless music playback without memorizing many commands.

## Current release slice

Music playback through Discord slash commands:

- YouTube search/metadata/playback through `youtubei.js`.
- Optional SoundCloud official API search/resolve/playback when credentials are configured.
- Queue add/remove/move, previous/skip/pause/resume/stop, shuffle/repeat, local playlists, per-guild Music permissions, and Equalizer.
- One independent in-memory Discord player/queue per guild; playlists, permissions, Equalizer, Community XP, and bounded audit entries persist as local JSON.
- Native Windows app MVP is implemented with guild/voice management, bot runtime toggle, multi-source search/thumbnails, queue/player controls, Windows local output, live player events, Music permissions, and Community leaderboard.
- An opt-in loopback control API is available at `127.0.0.1:2901`; the native window itself does not need a port.

## Native Windows app MVP

The native app is an operational control surface and local music player, not a marketing site. It should let an authorized local operator:

- See bot health and connected guilds.
- Inspect the active track and queue.
- Search YouTube and enqueue a result.
- Control playback without switching to Discord.
- Play to a local Windows audio device without joining a Discord voice channel.
- Understand errors, connection state, and stale data.

The local Windows player queue is session-scoped; the Discord pending queue and playback preferences have a bounded local recovery snapshot that never auto-joins or auto-plays. The native app is the sole owner of the development and packaged bot runtime: native starts it, observes its ownership marker, and terminates its process tree on close. The packaged Node runtime bundle is implemented; clean-machine supervision acceptance remains a release gate.

## Product principles

1. Fast path first: search → preview → play.
2. State is visible: never hide queue, connection, or loading state.
3. Progressive disclosure: advanced settings stay out of the primary playback flow.
4. Trust over spectacle: restrained motion, clear errors, no fake real-time claims.
5. Modular by default: YouTube is a module, not the whole product architecture.
6. Self-hosting friendly: local setup must be explicit and secrets must stay server-side.
7. Provider-neutral media: YouTube is the first source, not a permanent architectural assumption.
8. Safety before automation: deterministic permissions and policy checks remain authoritative over AI suggestions.
9. Friendly by default: Vietnamese-friendly copy, clear recovery paths, and a calm monochrome interface.

## Long-term capability map

These are planned product pillars, not current release commitments. They become eligible only after the YouTube playback path is stable and observable.

### Media and intelligence

- Multi-provider playback: YouTube first, then a provider-neutral adapter boundary for Spotify and other legal/supported sources.
- Universal link handling: detect a pasted URL, identify its provider/content type, resolve it to a canonical track or collection, and explain unsupported links instead of failing silently.
- Optional local intelligence: integrate with a local Ollama API for summaries, natural-language help, moderation explanations, and intent suggestions. The feature must be opt-in, local-first, feature-flagged, and able to work without an AI server.

### Community

- Configurable XP, level, rank, and leaderboard per guild. The first cooldown-backed local implementation is already available.
- Configurable anti-abuse cooldowns and transparent XP event rules.

### Operations and onboarding

- Searchable operational/moderation logs with safe redaction and guild scoping. The first bounded native-control audit log is already available.
- Welcome and goodbye messages supporting text plus image templates, with preview and test-send flows.

### Safety

- AutoMod for spam, flood, malicious links, and scam patterns.
- Anti-raid and anti-nuke safeguards with explicit permission boundaries, dry-run/audit mode, rate limits, and emergency disable controls.

The dashboard should expose these as grouped modules rather than a crowded list of unrelated top-level pages.

## Out of scope for native app MVP

- Discord OAuth2 multi-user administration.
- Billing, public multi-tenant hosting, or cloud deployment.
- Recommendations, analytics, lyrics, downloads, automatic voice reconnect/resume, and arbitrary remote administration.
- Replacing Discord permissions with a second complex permission system.
- Autonomous AI moderation or permission-changing actions without deterministic policy checks and explicit operator controls.

Those are later roadmap candidates, not reasons to overbuild the first native app.
## Deployment choices

LocalBOT keeps one shared Discord/Music core and offers explicit runtime profiles. Windows users
should use the Tauri native app, which is the runtime owner and provides the full control surface.
Operators who only need Discord slash commands may prepare the `slash-only` Node profile for a
Linux VPS; it intentionally has no native UI, web dashboard, control API, SSE, or port `2901`.
This repository prepares the source/package contract and a systemd reference, but does not claim a
real VPS deployment or target-host QA.
