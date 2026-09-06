# LocalBot Dashboard Design System

Status: Human-owned refinement layer for the generated UI/UX Pro Max system. For native app implementation, read `design-system/localbot/MASTER.md` first and then `design-system/localbot/pages/dashboard.md`; this document resolves product-specific token and quality decisions. The page override is authoritative when generated output conflicts with this file.

## Design intent

Friendly command center; modern minimalist; dark-first; precise, calm, and easy for a first-time server owner to understand. Density is moderate: enough information for an operator without turning every panel into a card wall.

The visual palette is strictly monochrome. Use black, white, and neutral grayscale only. Do not introduce hue-based accents, colored thumbnails, gradients, glow, or colored status dots.

## Semantic color tokens

Use semantic names in components. Do not scatter raw hex values through page code.

### Default theme (explicit split-tone mode)

`Default` is a distinct split-tone theme, not an OS/system preference and not a fallback alias:

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#FFFFFF` | Main application workspace |
| `--color-surface` | `#FFFFFF` | Card bodies and content areas |
| `--color-surface-inverse` | `#0A0A0A` | Sidebar and card headers |
| `--color-border` | `#D2D2D2` | Dividers and panel borders |
| `--color-text` | `#111111` | Content text |
| `--color-text-inverse` | `#FFFFFF` | Text on black surfaces |
| `--color-action` | `#111111` | Primary action and selected control |
| `--color-action-text` | `#FFFFFF` | Text on primary action |
| `--color-focus` | `#111111` | Keyboard focus ring |

Card rule: header uses `--color-surface-inverse` with `--color-text-inverse`; body uses `--color-surface` with `--color-text`.

### Dark theme

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#0A0A0A` | Application background |
| `--color-surface` | `#141414` | Primary panels |
| `--color-surface-raised` | `#202020` | Menus, focused/raised panels |
| `--color-border` | `#353535` | Dividers and panel borders |
| `--color-text` | `#FAFAFA` | Primary text |
| `--color-text-muted` | `#B5B5B5` | Secondary text |
| `--color-action` | `#FFFFFF` | Primary action and selected control |
| `--color-action-text` | `#0A0A0A` | Text on primary action |
| `--color-focus` | `#FFFFFF` | Keyboard focus ring |
| `--color-disabled` | `#686868` | Disabled text and controls |

### Light theme

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#F7F7F7` | Application background |
| `--color-surface` | `#FFFFFF` | Primary panels |
| `--color-surface-raised` | `#EEEEEE` | Menus, focused/raised panels |
| `--color-border` | `#D2D2D2` | Dividers and panel borders |
| `--color-text` | `#111111` | Primary text |
| `--color-text-muted` | `#5C5C5C` | Secondary text |
| `--color-action` | `#111111` | Primary action and selected control |
| `--color-action-text` | `#FFFFFF` | Text on primary action |
| `--color-focus` | `#111111` | Keyboard focus ring |
| `--color-disabled` | `#9A9A9A` | Disabled text and controls |

### State treatment without color

State meaning must never depend on hue. Use a text label, an accessible icon, and a structural treatment together:

| State | Treatment |
| --- | --- |
| Connected / success | `✓` or Lucide check icon, “Đã kết nối”, solid neutral indicator |
| Pending / degraded | clock icon, “Đang xử lý”, dashed or lighter neutral border |
| Error / destructive | alert icon, explicit error copy, stronger neutral border and confirmation step |

Do not create `success`, `warning`, or `danger` colors. The terms may remain as semantic state names in domain logic, but their visual output is monochrome.

## Typography

- Primary: Be Vietnam Pro for headings, body, labels, navigation, and controls. Use the framework's font loading instead of a blocking CSS import.
- Fallback: `system-ui`, `sans-serif`; do not substitute a decorative, serif, or monospace face in the product UI.
- Base body size: `16px`; minimum body text `14px` for secondary UI, never tiny dense labels.
- Use a friendly, compact type scale with clear hierarchy: page title, section title, body, metadata, label.
- Line-height should favor scanning: approximately `1.4–1.6` for body content.

## Spacing and shape

- Base spacing unit: `4px`; most layout gaps use multiples of `8px`.
- Page padding: responsive `20–32px`; panel padding: `16–24px`.
- Border radius: restrained `8–12px` for panels, `8px` for controls, pill only for compact status.
- Shadows are subtle and reserved for raised surfaces; do not use a shadow on every card.
- Use a 1px border to establish structure in dark mode instead of heavy glow.

## Motion tokens

| Token | Value | Use |
| --- | --- | --- |
| `--motion-fast` | `150ms` | Hover/focus/pressed feedback |
| `--motion-standard` | `220ms` | Panel/control transitions |
| `--motion-slow` | `280ms` | Page/section entrance |
| `--ease-standard` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Most transitions |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Dismissal/removal |

Motion must convey spatial continuity or state. Prefer ease-out for entering and ease-in for leaving. Never require animation to understand a control. Do not use bounce, parallax, cursor-following effects, scroll hijacking, or looping decoration.

## Iconography

Use one consistent SVG icon set, preferably Lucide or an equivalent outline set. Icons need labels when interactive. Avoid emoji, mixed icon families, and filled/outline inconsistency.

## Friendly UX rules

- Use plain Vietnamese copy and sentence case; explain what happened and what the user can do next.
- Prefer one clear primary action per panel; keep destructive actions secondary and confirmable.
- Show pending, success, and failure feedback close to the action; provide undo where safe.
- Keep advanced moderation and AI settings behind progressive disclosure.
- Preserve the last known state during reconnects and explain when it may be stale.

## UI anti-patterns

- Any hue-based accent, colored media artwork, or status color.
- Using the generated Fira/Playfair/serif direction as the dashboard font.
- Glassmorphism blur everywhere.
- Unreadable gray-on-gray secondary text.
- Card grid with no primary/secondary hierarchy.
- Hover-only affordances.
- Animated width/height causing layout jank.
- Theme toggle that changes colors but not disabled, focus, error, or selected states.
- Loading spinners with no reserved layout or feedback.
