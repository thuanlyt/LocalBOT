# LocalBot Native App UI Specification

Status: Approved MVP specification for the primary Windows app. The filename is retained for compatibility with existing Claude workflows. `docs/UI_UX_V1.md` is the canonical owner-approved visual baseline; this file provides the product and accessibility specification.

## Product role

The primary UI is a friendly native Windows console for LocalBot. It should make the important state obvious within two seconds: whether the bot is healthy, which guild is selected, what is playing, and what happens next. It must also support direct local listening without requiring the user to join a Discord voice channel.

## Stack and runtime

- Tauri 2 native Windows shell with a React + Vite + TypeScript frontend.
- The native window itself does not need an HTTP port; the LocalBot loopback control service uses port `2901`.
- The UI talks through Tauri IPC or the loopback control service; no browser-to-Discord or browser-to-provider credentials.
- A Next.js web companion is optional future work, not part of the native MVP.
- Tailwind, semantic HTML, and an accessible icon library such as Lucide.

## Information architecture

### MVP screens

- `Tổng quan` — Overview and current player state.
- `Âm nhạc` — YouTube search, result actions, queue, and local/Discord output target.
- `Máy chủ` — Guild list and connection summaries.
- `Cài đặt` — Non-secret local preferences, native app behavior, and theme.

### Primary navigation

- Tổng quan
- Âm nhạc
- Máy chủ
- Cài đặt

Keep the primary nav short. Future modules are grouped and feature-flagged; do not expose every planned capability as a top-level item before it is usable.

## Theme model

LocalBot has three explicit visual modes. `Default` is a standalone split-tone theme, not an OS/system preference:

1. `Default` — mixed light/dark: black floating navigation/card headers with white content surfaces and black content text.
2. `Dark` — dark surfaces throughout; white text and neutral gray elevation/borders.
3. `Light` — light surfaces throughout; black text and neutral gray borders.

The compact toggle uses exactly three positions from left to right: combined half-sun/half-moon (`Default`), moon (`Dark`), sun (`Light`). `Dark` is selected on a new installation. Persist the user's explicit choice locally; the control must expose accessible names and a tooltip/label for every position. Do not use `prefers-color-scheme` to reinterpret `Default`.

## Overview layout

```text
┌────────────────────────────────────────────────────────────┐
│ Title bar: brand · native controls                         │
├──────┬─────────────────────────────────────────────────────┤
│ Menu │ Floating context nav · guild · health · theme        │
│      ├───────────────────────┬─────────────────────────────┤
│      │ Now Playing            │ Bot / Voice status          │
│      ├───────────────────────┴─────────────────────────────┤
│      │ Queue preview + quick actions                        │
└──────┴─────────────────────────────────────────────────────┘
```

The layout is a responsive guide, not a fixed pixel contract. There is no persistent sidebar: the hamburger reveals the floating primary nav, while the active module's context nav remains visible beside/below it. On small windows the floating bars reflow and the status cards stack.

## Visual direction

Use a friendly monochrome command center: modern, minimalist, calm, and easy to understand for a new server owner. The dashboard is an approachable product UI, not an intimidating enterprise console and not a marketing landing page. Use only black, white, and neutral grayscale. This rule also applies to controls, icons, status indicators, media thumbnails, charts, and notices.

The approved interactive visual candidate is `DEMO/uiux-prototype/`. Historical concept images are composition references only. The semantic rules in `docs/UI_UX_V1.md`, `docs/DESIGN_SYSTEM.md`, and the page override remain authoritative.

### Dark mode

- Background: near-black neutral, with charcoal surfaces and subtle neutral borders.
- Surfaces: two elevation levels only; borders are subtle and useful.
- Primary text: white/high contrast; secondary text: readable neutral gray.
- Primary actions: white surface with black text, or black surface with white text depending on theme.
- State: labels, icons, border treatment, and copy; never hue or color-only indicators.
- Dark mode is the default on first launch and remains selectable explicitly thereafter.

### Light mode

Light mode must be designed as a first-class theme, not a color inversion. Preserve the same semantic token names and hierarchy. Check borders, disabled controls, selected rows, focus rings, and error states separately in all three themes. `Default` must remain visibly different from both `Dark` and `Light`.

## Friendly UX requirements

- Use Vietnamese-friendly copy, sentence case, and short explanations beside unfamiliar controls.
- Make the next action obvious in empty, error, disconnected, and permission-denied states.
- Prefer undo or recovery over irreversible actions where technically safe.
- Use progressive disclosure for advanced AutoMod, anti-raid, anti-nuke, and AI settings.
- Keep the primary path visible: select server → search/play music → observe state → take action.

## Core components

- `AppShell`: native frame, floating navigation, and page frame.
- `GuildSwitcher`: selected guild, connection state, keyboard searchable when the list grows.
- `HealthIndicator`: bot/control-plane state with text, not color alone.
- `NowPlayingCard`: artwork, title, channel, progress, playback controls.
- `QueuePanel`: ordered list, current item, remove/reorder affordances, empty state.
- `YoutubeSearch`: explicit submit/debounce, result loading, result cards, error recovery.
- `ActionButton`: consistent pending, success, disabled, and failure feedback.
- `ThemeToggle`: accessible label, persisted preference, no flash on reload.
- `Toast/InlineNotice`: command result and actionable error feedback.
- `FeatureOverview`: approachable entry points for Music, XP & Rank, Logs, AutoMod, Welcome, and AI Ollama as those modules become available.
- `ThemeModeToggle`: three explicit states, `Default` / `Dark` / `Light`, with SunMoon / Moon / Sun icons in that order.
- `PlaybackTarget`: local Windows output or Discord voice output, with the active destination visible before playback.

## Interaction and motion rules

- Use motion to explain state changes: queue insertion, selected guild change, panel reveal, play/pause transition, and successful configuration saves.
- Standard duration: `150–300ms`; enter can be slightly slower than exit.
- Prefer opacity/transform/layout-friendly properties; do not animate `width` or `height` when a transform or grid transition can communicate the change.
- Use one entrance choreography per view, not every card independently.
- Motion should feel soft and responsive, never bouncy, noisy, or decorative.
- Controls must show immediate pending feedback and settle on the server-confirmed state.
- Respect `prefers-reduced-motion`; reduce to instant or near-instant transitions while keeping state semantics.
- Avoid looping decoration, cursor-following effects, parallax, and scroll hijacking.

## Accessibility requirements

- Semantic landmarks: header, nav, main, complementary status where appropriate.
- Keyboard reachable controls with visible focus states.
- Icon-only buttons require accessible names and tooltips; do not use emoji as UI icons.
- Minimum touch target: 44×44px on compact controls.
- Contrast target: at least 4.5:1 for normal text and clear selected/disabled states.
- Status meaning must not rely on color alone.
- Announce successful actions and important playback errors through an accessible live region.
- Never trap focus in a modal without Escape and a clear return target.

## States that must be designed

Every data surface needs:

- Loading: stable skeleton/layout reservation; no content jump.
- Empty: explain why it is empty and provide the next action.
- Error: safe message, action to retry, and whether retry may help.
- Offline/disconnected: preserve last known state with a clear stale marker.
- Permission denied: explain required Discord permission without leaking internal details.
- Long content: titles, URLs, channel names, and queue labels wrap or truncate with an accessible full value.

## Native window behavior

- Open as a real Windows app window without browser chrome or an address bar.
- Keep the first window launch fast and preserve the last selected screen and theme locally.
- Use native window controls and system conventions where they improve discoverability; do not imitate a browser tab bar.
- The approved navigation removes the permanent left sidebar: use a floating primary navigation bar revealed by the hamburger and a floating contextual bar beside/below it for the active module. The interaction is prototyped in `DEMO/uiux-prototype/` and specified in `docs/UI_UX_V1.md`.
- A future web companion must not change the native app's primary information architecture or theme semantics.

## Responsive breakpoints

The app is fluid and resizable; it is not locked to one ratio and the MVP does not need a ratio-switch button. The native window may enforce a practical minimum size, but content must reflow instead of being clipped:

- Wide (`≥1200px`): floating primary nav with labels, full Music context bar, two-column Now Playing/Queue canvas.
- Compact desktop (`900–1199px`): floating bars remain, secondary labels collapse or move into a menu, content can use a narrower two-column layout.
- Narrow (`<900px`): context bar becomes compact, primary content becomes one column, Now Playing stays before Queue, and secondary modules move below.
- Very narrow (`<640px`): use a compact menu/popover for primary navigation and keep the Music actions discoverable without horizontal scrolling.

Use `Focus mode` as a possible future product mode for a player-only view; do not confuse it with responsive sizing and do not add it to the MVP just to compensate for a rigid layout.

## Performance budget

- Keep the initial shell light; lazy-load non-critical panels and heavy animation code.
- Reserve image space and use optimized thumbnails.
- Avoid polling faster than the product needs; prefer event updates for playback state.
- Keep queue updates keyed and localized so one changed item does not re-render the entire page.
- Show a skeleton/spinner for operations that take longer than roughly `300ms`; never leave a control visually frozen.
- Disable a command button while its request is pending to prevent duplicate playback actions.
- Test at `375px`, `768px`, `1024px`, and `1440px`; include an additional narrow `320px` smoke check when practical.

## Acceptance checklist

- `Dark` is the first-launch theme with no visible theme flash; `Default` split-tone and `Light` are explicit alternatives.
- Light mode is complete and contrast-checked.
- Search → result → enqueue/play is obvious and works with keyboard.
- Now Playing and queue state remain understandable while data is loading or stale.
- Motion is restrained, purposeful, interruptible, and reduced-motion aware.
- No emoji replaces an icon; no raw YouTube/Discord error is shown to users.
- UI works at narrow mobile width, desktop width, browser zoom, and keyboard-only navigation.

## Future module navigation

The MVP keeps the primary navigation short. After the YouTube path is stable, add modules in this order and only expose a module when its feature flag is enabled:

1. Music — YouTube first, then provider-neutral playback and future Spotify support.
2. Community — XP, level, rank, and leaderboard.
3. Activity — operational and moderation logs.
4. Welcome — text/image welcome and goodbye configuration.
5. Safety — AutoMod, anti-spam/flood/link/scam, anti-raid, and anti-nuke.
6. AI — optional local Ollama assistant and explanations.

Avoid turning every future feature into a top-level nav item on day one. Group related capabilities and use progressive disclosure.
