# LocalBot UI/UX v1

Status: Approved by owner.

Approved on: 2026-08-29

This is the canonical visual and interaction baseline for LocalBot's native Windows app. The interactive artifact is `DEMO/uiux-prototype/`. It is a UI-only prototype and does not represent the production control API.

## Authority and versioning

- Treat this document as the approved v1 baseline for implementation.
- Do not redesign, replace, or reinterpret the v1 composition while implementing backend or native integration.
- A behavior change that affects layout, theme semantics, navigation, or playback controls requires an explicit owner review and a new version such as `v1.1` or `v2`.
- Historical concept images are references only. When they conflict with this document, this document wins.

## Product and runtime direction

- Primary product surface: a native Windows app, preferably Tauri 2 with React + Vite + TypeScript.
- Local-first control/runtime bridge: `127.0.0.1:2901`.
- The native window itself does not need an HTTP port.
- Next.js is optional future web-companion work, not a prerequisite for the native app.
- The approved demo uses vanilla HTML/CSS/JS for review; the current native implementation is in `native/` and uses React/Vite/TypeScript.

## Visual language

- Style: modern, minimalist, friendly, calm, and operationally clear.
- Palette: strict black, white, and neutral grayscale only. No hue accents, colored status dots, colored thumbnails, gradients, glow, or decorative color.
- Font: Be Vietnam Pro for all product UI. `system-ui, sans-serif` is only a loading/network fallback.
- Icons: Lucide first; Iconify as fallback; inline SVG fallback for offline/native reliability. Do not use emoji as structural icons.
- Use semantic tokens rather than scattering raw colors through components.

## Three themes

The three modes are real product modes, not aliases:

1. `Default` — distinct split-tone composition: dark floating navigation and card headers, light workspace/card bodies, dark content text.
2. `Dark` — fully dark workspace and surfaces with white text and neutral borders.
3. `Light` — fully light workspace and surfaces with black text and neutral borders.

`Dark` is the default first-launch theme. Persist the user's explicit choice locally. The selector order is fixed: SunMoon (`Default`), Moon (`Dark`), Sun (`Light`). Every position needs an accessible name and tooltip. Do not reinterpret `Default` through `prefers-color-scheme`.

## Shell and navigation

- No permanent left sidebar.
- The title bar contains LocalBot branding and native window controls.
- A hamburger button reveals the floating primary navigation: Overview, Music, Community, Safety, and Settings as those modules become available.
- The active module's floating context navigation stays visible beside the hamburger when the primary menu is closed.
- The selected guild and voice channel are reachable from a compact global context control in a fixed bottom sticky footer; clicking it opens a modal picker without forcing the user into Community first.
- The sticky footer also contains the Bot runtime toggle. The top navigation remains reserved for page navigation, theme, and settings, so runtime/server context cannot collide with the floating bars.
- Hovering or activating the hamburger expands the primary menu and moves the active context navigation down with a coordinated layout-safe motion.
- Clicking the hamburger keeps the menu open; Escape, outside click, or selecting a destination closes it.
- Never let the expanded menu cover the hamburger or cause icon overlap.
- On narrow windows, floating bars reflow or collapse into a compact menu; the app must not require horizontal scrolling.

## Approved screens

### Overview

The home screen is a music-discovery-style dashboard, not a generic status page. It contains a compact search/discovery entry, recently played items, trending tracks, a featured track, and local playlist cards in a bento-like composition. It may also show concise bot/guild health, but operational status must not overpower discovery.

The featured/demo artist is Sơn Tùng M-TP. Do not use Jack's “Đom Đóm” in demo content.

### Music / Discover

Use a compact version of the Overview language: search first, source filters/tags, result rows with artwork/title/artist/duration, and an obvious add/play action. Keep supporting links to Now Playing, Queue, Playlists, and Equalizer compact and discoverable.

Supported product sources for this scope are YouTube first and SoundCloud second. Every result and queue item that has a known source displays a compact pill tag such as `YouTube` or `SoundCloud`.

### Now Playing and Queue

- Show the current track, progress, playback controls, queue, source, and output target clearly.
- Keep the five transport controls in an independent centered cluster; the icon-only volume control is positioned separately and must never shift that cluster.
- The progress track and thumb must share the monochrome semantic tokens and remain visually aligned in all themes.
- Volume is icon-only in its resting state; hovering/focusing it reveals the compact volume slider without shifting the player layout.
- Output targets are multiple-choice, not mutually exclusive: Discord and Windows local playback may be enabled simultaneously. The active destination and its role (`chính` / `phụ`) must be visible.
- Queue items expose source tags as pills, not raw long bordered bars.

### Playlists and Equalizer

- Playlists are local-first and show compact source-aware track metadata.
- Equalizer sliders, labels, thumbs, and preset rows use black/white/neutral grayscale only.
- Preserve stable spacing, aligned icon boxes, and equal control heights.

## Playback control behavior

The five transport controls intentionally have no decorative hover animation and no continuous animation. They animate only after the user activates them, as feedback for the resulting state/action:

- Shuffle: toggle state with a short wiggle after click.
- Previous: short nudge toward the left after click.
- Play/Pause: fade/transition between play and pause icons after click.
- Next: short nudge toward the right after click.
- Repeat: cycle through `off` → `all` → `one`; transition the icon/state after click.
- Volume: short pulse after click or confirmed volume change; hover/focus reveals the slider.

Repeat states must be represented by both icon and accessible label:

- `off`: repeat-off icon, `Lặp tắt`.
- `all`: repeat-2 icon, `Lặp hàng đợi`.
- `one`: repeat-1 icon, `Lặp một bài`.

Other interface actions may use purposeful motion for tab changes, menu reveal, queue insertion/removal, toast appearance, save confirmation, and icon feedback. Standard duration is 150–300ms using opacity/transform/layout-safe properties. Respect `prefers-reduced-motion`.

### Guild and voice picker

- The global picker is the fastest path for selecting a guild and voice channel from Overview, Music, or Now Playing.
- Guild selection updates the channel list in place with a stable loading skeleton; joining/leaving reports pending and confirmed states without closing the modal unexpectedly.
- Native guild/voice state is updated immediately from join/leave responses, then reconciled through the guild voice SSE stream and silent polling fallback when Discord state changes outside the app.
- When the selected guild changes, late responses from the previous guild must be ignored; the new guild's player and settings remain authoritative while loading/stale/offline states are shown honestly.
- Selecting a Discord output or starting a Discord playback action without a channel opens the picker automatically and explains the next action.

## Keyboard shortcuts

The player should support familiar shortcuts when focus is not inside a text field:

- `Space` or `K`: pause/resume.
- `N`: next; `P`: previous.
- `S`: shuffle; `R`: cycle repeat mode.
- `M`: mute/unmute.
- `ArrowLeft` / `ArrowRight`: seek backward/forward.
- `[` / `]`: lower/raise volume.
- `?`: show shortcut help.

Shortcuts need an accessible help surface and must never intercept typing in inputs or textareas.

## Quality gates

- Verify at 320px, 375px, 768px, 1024px, and 1440px widths.
- No clipped content, horizontal scroll, layout jump, or menu/icon overlap.
- Every icon-only control has an accessible name, tooltip, and visible keyboard focus.
- Loading, empty, error, offline/stale, permission-denied, long-title, and reduced-motion states exist for each data surface.
- Toast icons keep a fixed square box and cannot be compressed by flex layout.
- Theme changes do not introduce non-monochrome slider tracks, focus rings, badges, or status indicators.
- Do not show raw provider errors, cookies, tokens, or internal response objects in the UI.

## Implementation boundary

Claude should implement the data/control behavior behind this baseline. The UI contract is the set of visible states and interactions above, not the exact DOM structure of the demo. Any required deviation must be reported with the reason, affected screens, and proposed version before being treated as a new baseline.
