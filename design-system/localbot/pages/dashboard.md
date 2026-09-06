# LocalBot Dashboard Page Override

> **PROJECT:** LocalBot
> **BASE:** `design-system/localbot/MASTER.md`
> **STATUS:** Accepted monochrome refinement of the generated UI/UX Pro Max system

These rules override the generated master for the dashboard. The generator identified a real-time operations pattern; LocalBot adapts that pattern into an authenticated/local operations console, not a marketing landing page. This page override wins over any generated color, typography, landing-page, or motion suggestion that conflicts with it.

## Product interpretation

- Primary job: show bot health, selected guild, now-playing state, queue, and the next action.
- Do not use a video-first hero, marketing CTA sections, conversion copy, or trial/contact blocks.
- Use an app shell with a compact header, navigation, server selector, status indicator, now-playing panel, and queue.
- Keep the first viewport useful within two seconds; do not hide operational state below decorative content.
- Make the dashboard friendly to a first-time operator: plain Vietnamese copy, visible next actions, recoverable errors, and progressive disclosure for advanced settings.

## Theme override

- Implement exactly three explicit modes: `Default`, `Dark`, and `Light`.
- `Default` is the first-install selection and is a standalone split-tone theme, not a system/OS preference.
- In `Default`, the floating navigation and card headers are black with white labels; card bodies and the main workspace are white with black content.
- `Dark` uses dark surfaces throughout; `Light` uses light surfaces throughout.
- Persist the user's explicit three-state choice locally; do not reinterpret `Default` through `prefers-color-scheme`.
- Verify primary text, secondary text, borders, disabled states, focus rings, selected rows, and errors separately in all three themes.
- The compact selector is ordered SunMoon / Moon / Sun and must expose `Default` / `Dark` / `Light` accessible names.

## Typography override

- Use Be Vietnam Pro for all product UI: headings, body, labels, navigation, buttons, metadata, and notices.
- Use `system-ui`, `sans-serif` only as a loading/network fallback.
- Do not use Fira Code, Playfair Display, Source Serif, or another decorative/monospace face in the dashboard.
- Use compact hierarchy and readable body text; avoid oversized landing-page typography.

## Color override

Use the semantic tokens in `docs/DESIGN_SYSTEM.md` as the dashboard refinement. The palette is strictly monochrome; there are no hue-based accents:

| Role | Default | Dark | Light |
| --- | --- | --- | --- |
| Background | `#FFFFFF` | `#0A0A0A` | `#F7F7F7` |
| Surface | `#FFFFFF` | `#141414` | `#FFFFFF` |
| Inverse surface | `#0A0A0A` | `#202020` | `#111111` |
| Border | `#D2D2D2` | `#353535` | `#D2D2D2` |
| Text | `#111111` | `#FAFAFA` | `#111111` |
| Inverse text | `#FFFFFF` | `#FAFAFA` | `#FFFFFF` |
| Muted text | `#5C5C5C` | `#B5B5B5` | `#5C5C5C` |
| Action | `#111111` | `#FFFFFF` | `#111111` |
| Action text | `#FFFFFF` | `#0A0A0A` | `#FFFFFF` |
| Focus | `#111111` | `#FFFFFF` | `#111111` |
| Disabled | `#9A9A9A` | `#686868` | `#9A9A9A` |

State must combine an icon, text label, and structural treatment. Do not introduce green/amber/red, blue/purple/pink gradients, colored thumbnails, glow, or colored dots.

## Layout override

- Maximum content width: approximately `1200px`, with responsive gutters.
  - Wide native window: no persistent left sidebar; use a floating hamburger-triggered primary menu and a floating context bar for the active module.
  - When the primary menu opens, the active module context bar shifts below it with a short layout-safe motion transition.
  - Compact/narrow native window: reflow the floating controls and content into a single-column layout; keep Now Playing and Queue first-class.
- No horizontal scrolling in the primary flow.
- Use 4/8px spacing rhythm and restrained 10–14px panel radius.

## Component priorities

1. `AppShell`
2. `GuildSwitcher`
3. `HealthIndicator`
4. `NowPlayingCard`
5. `QueuePanel`
6. `YoutubeSearch` and result cards
7. `ThemeToggle`
8. `Toast/InlineNotice`

## Motion override

- Keep the master's standard motion tier, but use `150–300ms` for dashboard transitions.
- Use opacity/transform and layout-safe transitions; never animate width/height for routine state changes.
- The generated `back.out(1.4)` stagger may be used only for a small search-result or queue insertion group. Do not use overshoot in dense tables or status panels.
- Prefer one coordinated entrance sequence per view over animating every card.
- Use ease-out for entering and ease-in for leaving; avoid bounce, parallax, cursor-following, and looping decoration.
- Playback controls show immediate pending feedback and settle on server-confirmed state.
- Respect `prefers-reduced-motion` by disabling decorative movement while preserving feedback and final state.

## Accessibility override

- Use SVG icons from one family, preferably Lucide; never use emoji as structural icons.
- Icon-only controls require accessible names and tooltips.
- Keep interactive targets at least `44×44px` and expose visible keyboard focus.
- Status meaning must include text or an accessible label, not color alone.
- Provide live-region feedback for enqueue, playback action, failure, and reconnect.
- Test at `375px`, `768px`, `1024px`, and `1440px`.

## Required states

Every dashboard data panel needs loading, empty, error, offline/stale, permission-denied, long-content, and reduced-motion behavior. Stable layout reservation is required to avoid cumulative layout shift.

## Implementation order

1. Shell and theme without live data.
2. Mocked now-playing/queue states for visual review.
3. Health + player read API.
4. YouTube search and enqueue action.
5. Live updates and failure recovery.
