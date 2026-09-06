# LocalBot Demo

This folder contains visual and interactive product demos. It is not production runtime code.

## Current status

- `01-visual-directions/localbot-dashboard-concept-01.png` — superseded colored exploration; retained for history only.
- `02-visual-directions/localbot-dashboard-concept-02-monochrome.png` — superseded monochrome dashboard exploration.
- `03-visual-directions/localbot-native-hybrid-theme-concept-03.png` — historical native Windows direction.
- `04-visual-directions/localbot-floating-navigation-concept-04.png` — historical floating-navigation exploration.
- `uiux-prototype/` — interactive UI-only native-app-oriented prototype, approved as UI/UX v1.
- Status: UI/UX v1 is locked for implementation review; no production runtime is included here.
- Next step: Claude implements the native Tauri shell and backend contract from `docs/UI_UX_V1.md`.

## Concept 04 — floating navigation exploration

This is the approved structural direction implemented in `uiux-prototype/`:

- no permanent left sidebar;
- a floating top navigation pill for primary areas;
- a second floating context bar for the active module, such as Music;
- a spacious canvas with Now Playing, Queue, activity, and grouped future modules;
- responsive reflow when the native window is resized, without a ratio-switch button.

The three-theme model remains unchanged: `Default` split-tone, `Dark`, and `Light`. The current image uses `Default`.

## Concept 03 — native hybrid theme

The current direction is a friendly, quiet native Windows app for a self-hosted Discord assistant:

- strict black, white, and neutral grayscale only;
- Be Vietnam Pro for all product UI;
- clear Vietnamese-friendly navigation and short explanations;
- three explicit themes: `Default` split-tone, `Dark`, and `Light`;
- `Default` is not system/auto mode; it is an independent mixed theme selected explicitly by the user;
- `Dark` is the default first-launch theme;
- `Default` uses black floating-navigation/card headers with white card bodies and black content text;
- the theme selector is SunMoon / Moon / Sun from left to right;
- Music, XP & Rank, Logs, Welcome, AutoMod, and AI Ollama as grouped future modules;
- functional motion only: feedback, state transition, and queue interaction;
- no colored accents, colored status dots, gradients, glow, excessive glassmorphism, or emoji-based controls.

This image is a reference for layout and visual tone, not a pixel-perfect implementation brief. The implementation source of truth remains:

1. `design-system/localbot/pages/dashboard.md`
2. `docs/DASHBOARD_SPEC.md`
3. `docs/DESIGN_SYSTEM.md`

Claude may start native app implementation against the approved interaction and visual baseline. Any material deviation must be recorded as a new UI/UX version before implementation.
