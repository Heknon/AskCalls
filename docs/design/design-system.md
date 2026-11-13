# AskCalls design system (R1)

The rules engineers build from. Token values live in [`tokens.css`](tokens.css); this document explains them. Decision numbers (D1, D2, ...) refer to [`research.md`](research.md).

Contents

1. Principles
2. Layout and app shell
3. Colour
4. Typography
5. Spacing, radii, elevation
6. Motion
7. Iconography
8. RTL and bidirectional text
9. Focus, targets and accessibility
10. State patterns: loading, empty, error, locked
11. Keyboard shortcuts
12. Voice and copy
13. Component inventory (shadcn/ui mapping)

---

## 1. Principles

1. **Say where the plaintext is.** Every screen that touches content can answer "who can read this right now?" The lock status is always visible, every provider choice states its data flow in one sentence, and we never claim more privacy than the architecture gives (D12).
2. **Calm by default.** One accent colour, neutral surfaces, generous whitespace, sentence case, no decoration that carries no information. Colour signals state; it is not ornament.
3. **The transcript is the product.** Reading width, line height, speaker grouping and bidi correctness get more care than chrome.
4. **Keyboard and screen reader are first-class.** Every action has a visible control, a keyboard path and an accessible name (Superhuman's rule of three ways to every action).
5. **Two directions, one design.** Every layout is specified with start and end, never left and right. Hebrew is not a translation layer added later.
6. **Honest states.** Every async view has loading, empty and error designs; errors explain what happened and what to do, and never include content.

---

## 2. Layout and app shell

### Breakpoints

| Name | Min width | Shell |
| --- | --- | --- |
| base | 0 | Top app bar (52 px) + bottom navigation (64 px + safe area). Side panels become bottom sheets. |
| `sm` | 640 | Same as base, wider gutters. |
| `md` | 768 | Navigation rail (72 px, icons with tooltips) at the start edge. Top bar per page. |
| `lg` | 1024 | Full sidebar (240 px). Call view shows the side panel (380 px) at the end edge. |
| `xl` | 1280 | Content max width 1120 px, centred in the remaining space. |

### App shell (`/app/**`)

- **Sidebar (start edge, 240 px):** brand, primary navigation (Calls with count, Upload, Tags and rules, Contacts, Settings), an "Instance" group with Admin for admins only, then a footer with the **lock card** (state sentence, "Lock now" with `L`), and the account row (avatar, name, plan and call count, shortcuts button).
- **Top bar (56 px, per page):** page-level actions on the end side (Upload on Calls), shortcut hints on wide screens.
- **Content:** padding 24 px (16 px on mobile), max width 1120 px; reading surfaces (transcript, settings forms) use narrower measures: transcript 720 px (`max-w-transcript`), settings forms 640 px.
- **Mobile:** top bar shows the logo, page title, one page action and the lock button. Bottom navigation has five destinations: Calls, Upload, Tags, Contacts, Settings (the maximum Apple and Material recommend). Admin is reached from Settings.

### Marketing shell

- Header 64 px: logo, links (How it works, Security, Pricing, FAQ, Self-host), language switcher (English / עברית), "Sign in", and "Start free" (primary). Collapses to a menu button below 768 px; "Start free" stays visible.
- Sections use a 1120 px container, 96 px vertical rhythm on desktop, 64 px on mobile.

---

## 3. Colour

### The accent

**Harbor teal**, one hue used for primary actions, links, focus, selection and the active navigation item. Teal was chosen because it is calm, distinct from the blue, purple and red that Signal, Proton and Tuta use, and it reads as neither alarm nor money. Light `#0B7A71`, dark `#3BBFAE`. In shadcn terms it is `primary` (D54).

Status colours (destructive, success, warning) are **semantic only**: they appear on status badges, banners, destructive buttons and validation, never as decoration. The yellow `mark` colour is reserved for search hits. Tag colours are user data, not brand.

### Light palette

| Token | Hex | Use |
| --- | --- | --- |
| `background` | `#F7F8F8` | App canvas |
| `card`, `popover` | `#FFFFFF` | Surfaces, lists, panels, menus |
| `foreground` | `#131A1C` | Primary text |
| `muted-foreground` | `#566265` | Secondary text |
| `subtle-foreground` | `#677376` | Placeholders, disabled labels |
| `secondary`, `muted` | `#EFF2F2` | Secondary buttons, wells |
| `accent` (neutral) | `#EEF1F1` | Hover and highlighted menu items |
| `border` | `#E0E5E6` | Dividers, card outlines |
| `input` | `#838F92` | Form control borders (3:1) |
| `primary` / hover | `#0B7A71` / `#086A62` | Accent |
| `primary-foreground` | `#FFFFFF` | Text on accent |
| `primary-subtle` / fg | `#E5F3F1` / `#065A53` | Active chips, selected navigation |
| `destructive` / subtle / subtle fg | `#B83229` / `#FCEBE9` / `#9C2820` | Delete, errors |
| `success` / subtle / subtle fg | `#21773A` / `#E7F4EA` / `#1B6431` | Healthy, done |
| `warning` / subtle / subtle fg | `#8F5200` / `#FFF3DD` / `#7A4600` | Caution |
| `mark` / fg | `#FDE68A` / `#131A1C` | Search hits |
| `sidebar` | `#F1F3F3` | Sidebar surface |
| `ring` | `#0B7A71` | Focus |

### Dark palette

| Token | Hex | Use |
| --- | --- | --- |
| `background` | `#0E1213` | App canvas |
| `card` | `#151A1C` | Surfaces |
| `popover` | `#1B2124` | Menus, dialogs (one step lighter) |
| `foreground` | `#E7ECED` | Primary text |
| `muted-foreground` | `#9BA7AA` | Secondary text |
| `subtle-foreground` | `#8A969A` | Placeholders |
| `secondary` / `muted` | `#1F2629` / `#1B2124` | Secondary buttons, wells |
| `accent` (neutral) | `#20282B` | Hover |
| `border` | `#273033` | Dividers |
| `input` | `#5F6C71` | Form control borders (3:1) |
| `primary` / hover | `#3BBFAE` / `#5ACFC0` | Accent |
| `primary-foreground` | `#03201C` | Text on accent (dark text on light teal) |
| `primary-subtle` / fg | `#11302C` / `#7DD9CC` | Active chips, selected navigation |
| `destructive` / subtle / subtle fg | `#F0766C` / `#3A1714` / `#F49A92` | |
| `success` / subtle / subtle fg | `#5DC57B` / `#12301C` / `#7AD394` | |
| `warning` / subtle / subtle fg | `#E5AE4A` / `#33250B` / `#EDBF6A` | |
| `mark` / fg | `#5B4A0E` / `#FFF4CC` | Search hits |
| `sidebar` | `#121718` | Sidebar |

Dark surfaces step up in lightness (canvas → card → popover) and use 1 px borders; shadows add depth only.

### Contrast (WCAG 2.2 AA)

Computed with the WCAG relative-luminance formula (script kept with the design sources). Text needs 4.5:1; component boundaries and focus indicators need 3:1 (SC 1.4.11). Decorative dividers (`border`) are exempt and intentionally faint.

| Theme | Pair | Colours | Ratio | Needs | Result |
| --- | --- | --- | --- | --- | --- |
| light | body text on canvas | `fg` #131A1C on `bg` #F7F8F8 | 16.56:1 | 4.5:1 | Pass |
| light | body text on card | `fg` #131A1C on `card` #FFFFFF | 17.61:1 | 4.5:1 | Pass |
| light | nav text | `fg` #131A1C on `sidebar` #F1F3F3 | 15.81:1 | 4.5:1 | Pass |
| light | secondary text on canvas | `muted` #566265 on `bg` #F7F8F8 | 5.93:1 | 4.5:1 | Pass |
| light | secondary text on card | `muted` #566265 on `card` #FFFFFF | 6.31:1 | 4.5:1 | Pass |
| light | secondary text on sunken | `muted` #566265 on `sunken` #EFF2F2 | 5.60:1 | 4.5:1 | Pass |
| light | secondary nav text | `muted` #566265 on `sidebar` #F1F3F3 | 5.66:1 | 4.5:1 | Pass |
| light | placeholder text | `subtle` #677376 on `card` #FFFFFF | 4.89:1 | 4.5:1 | Pass |
| light | primary button label | `onAccent` #FFFFFF on `accent` #0B7A71 | 5.20:1 | 4.5:1 | Pass |
| light | primary button hover | `onAccent` #FFFFFF on `accentHover` #086A62 | 6.46:1 | 4.5:1 | Pass |
| light | link on card | `accent` #0B7A71 on `card` #FFFFFF | 5.20:1 | 4.5:1 | Pass |
| light | link on canvas | `accent` #0B7A71 on `bg` #F7F8F8 | 4.89:1 | 4.5:1 | Pass |
| light | active chip / selected nav | `accentSubtleFg` #065A53 on `accentSubtle` #E5F3F1 | 7.10:1 | 4.5:1 | Pass |
| light | error banner text | `dangerFg` #9C2820 on `dangerSubtle` #FCEBE9 | 6.65:1 | 4.5:1 | Pass |
| light | destructive button label | `onAccent` #FFFFFF on `danger` #B83229 | 5.96:1 | 4.5:1 | Pass |
| light | inline error text | `danger` #B83229 on `card` #FFFFFF | 5.96:1 | 4.5:1 | Pass |
| light | success banner text | `successFg` #1B6431 on `successSubtle` #E7F4EA | 6.36:1 | 4.5:1 | Pass |
| light | success text | `success` #21773A on `card` #FFFFFF | 5.58:1 | 4.5:1 | Pass |
| light | warning banner text | `warningFg` #7A4600 on `warningSubtle` #FFF3DD | 7.07:1 | 4.5:1 | Pass |
| light | warning text | `warning` #8F5200 on `card` #FFFFFF | 6.22:1 | 4.5:1 | Pass |
| light | search hit highlight | `markFg` #131A1C on `mark` #FDE68A | 14.14:1 | 4.5:1 | Pass |
| light | input border (1.4.11) | `input` #838F92 on `card` #FFFFFF | 3.33:1 | 3:1 | Pass |
| light | input border on canvas (1.4.11) | `input` #838F92 on `bg` #F7F8F8 | 3.13:1 | 3:1 | Pass |
| light | focus ring on card (1.4.11) | `accent` #0B7A71 on `card` #FFFFFF | 5.20:1 | 3:1 | Pass |
| light | focus ring on canvas | `accent` #0B7A71 on `bg` #F7F8F8 | 4.89:1 | 3:1 | Pass |
| light | focus ring on active chip | `accent` #0B7A71 on `accentSubtle` #E5F3F1 | 4.56:1 | 3:1 | Pass |
| dark | body text on canvas | `fg` #E7ECED on `bg` #0E1213 | 15.81:1 | 4.5:1 | Pass |
| dark | body text on card | `fg` #E7ECED on `card` #151A1C | 14.73:1 | 4.5:1 | Pass |
| dark | text on popover | `fg` #E7ECED on `elev` #1B2124 | 13.66:1 | 4.5:1 | Pass |
| dark | nav text | `fg` #E7ECED on `sidebar` #121718 | 15.17:1 | 4.5:1 | Pass |
| dark | secondary text on canvas | `muted` #9BA7AA on `bg` #0E1213 | 7.63:1 | 4.5:1 | Pass |
| dark | secondary text on card | `muted` #9BA7AA on `card` #151A1C | 7.11:1 | 4.5:1 | Pass |
| dark | secondary text on popover | `muted` #9BA7AA on `elev` #1B2124 | 6.59:1 | 4.5:1 | Pass |
| dark | secondary nav text | `muted` #9BA7AA on `sidebar` #121718 | 7.32:1 | 4.5:1 | Pass |
| dark | placeholder text | `subtle` #8A969A on `card` #151A1C | 5.78:1 | 4.5:1 | Pass |
| dark | primary button label | `onAccent` #03201C on `accent` #3BBFAE | 7.54:1 | 4.5:1 | Pass |
| dark | primary button hover | `onAccent` #03201C on `accentHover` #5ACFC0 | 9.06:1 | 4.5:1 | Pass |
| dark | link on card | `accent` #3BBFAE on `card` #151A1C | 7.73:1 | 4.5:1 | Pass |
| dark | link on canvas | `accent` #3BBFAE on `bg` #0E1213 | 8.30:1 | 4.5:1 | Pass |
| dark | active chip / selected nav | `accentSubtleFg` #7DD9CC on `accentSubtle` #11302C | 8.54:1 | 4.5:1 | Pass |
| dark | error banner text | `dangerFg` #F49A92 on `dangerSubtle` #3A1714 | 7.53:1 | 4.5:1 | Pass |
| dark | destructive button label | `onAccent` #03201C on `danger` #F0766C | 6.12:1 | 4.5:1 | Pass |
| dark | inline error text | `danger` #F0766C on `card` #151A1C | 6.28:1 | 4.5:1 | Pass |
| dark | success banner text | `successFg` #7AD394 on `successSubtle` #12301C | 7.90:1 | 4.5:1 | Pass |
| dark | success text | `success` #5DC57B on `card` #151A1C | 8.14:1 | 4.5:1 | Pass |
| dark | warning banner text | `warningFg` #EDBF6A on `warningSubtle` #33250B | 8.69:1 | 4.5:1 | Pass |
| dark | warning text | `warning` #E5AE4A on `card` #151A1C | 8.76:1 | 4.5:1 | Pass |
| dark | search hit highlight | `markFg` #FFF4CC on `mark` #5B4A0E | 7.84:1 | 4.5:1 | Pass |
| dark | input border (1.4.11) | `input` #5F6C71 on `card` #151A1C | 3.23:1 | 3:1 | Pass |
| dark | input border on canvas | `input` #5F6C71 on `bg` #0E1213 | 3.47:1 | 3:1 | Pass |
| dark | focus ring on card | `accent` #3BBFAE on `card` #151A1C | 7.73:1 | 3:1 | Pass |
| dark | focus ring on canvas | `accent` #3BBFAE on `bg` #0E1213 | 8.30:1 | 3:1 | Pass |
| dark | focus ring on active chip | `accent` #3BBFAE on `accentSubtle` #11302C | 6.24:1 | 3:1 | Pass |

### Tag colours

Eight user-selectable tag colours. A tag always shows its name as text, so the dot is decorative; the name meets 4.5:1 on its tinted background in both themes.

| Colour | Light bg / text | Ratio | Dark bg / text | Ratio | Dot (light on white / dark on card) |
| --- | --- | --- | --- | --- | --- |
| gray | #EEF1F2 / #3D4749 | 8.42:1 | #232A2D / #C6CED0 | 9.12:1 | dot #7A8689 3.75 / #8E9A9E 6.07 |
| blue | #E7EFFC / #1D4B9A | 7.19:1 | #14233D / #A8C4F5 | 8.88:1 | dot #3B72D9 4.57 / #6F9BEA 6.31 |
| violet | #F0EBFB / #55309B | 7.88:1 | #251B3B / #CDB8F4 | 9.05:1 | dot #7E57D1 5.03 / #A386E6 5.94 |
| rose | #FBE9EF / #97264D | 6.67:1 | #3A1622 / #F3AFC5 | 8.92:1 | dot #D14874 4.29 / #E27A9B 6.26 |
| amber | #FBF0D9 / #7A4A00 | 6.61:1 | #33260C / #EDCB86 | 9.48:1 | dot #B57A0A 3.65 / #D9A440 7.80 |
| green | #E6F3E8 / #22603A | 6.55:1 | #15291B / #A5DBB4 | 9.81:1 | dot #3E9A5C 3.51 / #62B57D 7.04 |
| orange | #FCEDE3 / #8A3B0F | 6.77:1 | #36200F / #F2BB97 | 9.00:1 | dot #D96A2B 3.47 / #E58B55 6.82 |
| cyan | #E3F2F7 / #14576C | 7.02:1 | #102A33 / #9DD3E4 | 9.19:1 | dot #2D8FB0 3.71 / #56AFCB 7.01 |

### Colour rules

- Never use the accent for large fills except the primary button and the selected state; one primary button per view.
- Never use colour alone: status badges carry an icon and a word; the star is filled and announced; tags carry names.
- Starred uses amber `#C98A12` (light) / `#E5AE4A` (dark) as a filled glyph, a convention users already know; it is an icon colour, not an accent.

---

## 4. Typography

### Families (D40, D41)

| Role | Family | Why |
| --- | --- | --- |
| UI and content (Latin, Cyrillic, Greek) | IBM Plex Sans | Neutral, highly legible at 13 to 16 px, open apertures, true tabular figures |
| Hebrew | IBM Plex Sans Hebrew | Designed with Plex Sans, matched metrics, so mixed Hebrew/English lines sit on one rhythm |
| Arabic (R2) | IBM Plex Sans Arabic | Same superfamily; declared now so Arabic in transcripts renders well |
| Codes, keys, fingerprints, config | IBM Plex Mono | Clear 0/O and 1/l/I distinctions, matching the sans |

All are SIL OFL 1.1, installed from IBM's npm packages and served from `/fonts` (never a CDN). Weights: 400, 500, 600. `font-display: swap`, `unicode-range` split, and preload only Plex Sans 400 and 600 on marketing pages and the user's locale family in the app.

### Scale

App UI runs at 14 px; reading text (transcripts, marketing body, notes) at 16 px. Note: `text-base` is redefined to 14 px in `tokens.css`; use `text-md` for 16 px.

| Token | Size / line height | Use |
| --- | --- | --- |
| `text-2xs` | 11 / 16 | Keyboard hints, counters |
| `text-xs` | 12 / 16 | Captions, timestamps in lists, badges |
| `text-sm` | 13 / 20 | Meta, chips, table cells, hints |
| `text-base` | 14 / 22 | Default UI text, buttons, inputs (desktop) |
| `text-md` | 16 / 26 | Transcript, notes, marketing body, all inputs on mobile (prevents iOS zoom) |
| `text-lg` | 18 / 28 | Card titles, lead text |
| `text-xl` | 20 / 28 | Section headings, mobile page titles |
| `text-2xl` | 24 / 32 | App page titles |
| `text-3xl` | 30 / 38 | Gate and onboarding headings |
| `text-4xl` | 40 / 48 | Marketing section headings |
| `text-5xl` | 56 / 64 | Marketing hero; `clamp(2.25rem, 6vw, 3.5rem)` below 768 px |

### Rules

- Weights: 400 body, 500 labels and buttons, 600 headings and names. Never 700 in the app.
- Latin headings use `tracking-tight` (−0.011 em) at 24 px and up, `tracking-tighter` at 40 px and up. Hebrew and Arabic always use 0 (tokens reset it on `:lang(he)`).
- Sentence case everywhere. No all-caps labels, since Hebrew has no case and an uppercase hierarchy would collapse in RTL.
- Tabular figures (`.tabular`) for times, durations, counts, phone numbers and table numbers.
- Measure: 60 to 80 characters for reading text (transcript column 720 px at 16 px).

---

## 5. Spacing, radii, elevation

**Spacing:** 4 px grid via Tailwind's `--spacing: 0.25rem`. Common steps: 4, 8, 12, 16, 20, 24, 32, 48, 64, 96. Inside components 8 to 12; between related groups 16 to 24; between sections 32 to 48 (app) and 96 (marketing).

**Radii:**

| Token | px | Use |
| --- | --- | --- |
| `rounded-xs` | 4 | Keyboard keys, mark highlight |
| `rounded-sm` | 6 | Tags, query tokens, small buttons |
| `rounded-md` | 8 | Buttons, inputs (default `--radius`) |
| `rounded-lg` | 12 | Cards, lists, popovers, query bar |
| `rounded-xl` | 16 | Dialogs, sheets |
| `rounded-2xl` | 24 | Marketing panels, demo frame |
| `rounded-full` | | Chips, avatars, switches, meters |

**Elevation:** four levels. Light theme uses soft shadows; dark theme relies on surface lightness plus a hairline.

| Token | Use |
| --- | --- |
| `shadow-xs` | Cards and outline buttons at rest |
| `shadow-sm` | Query bar, segmented control thumb |
| `shadow-md` | Popovers, dropdowns, command menus |
| `shadow-lg` | Dialogs, sheets, toasts |

---

## 6. Motion

| Token | Duration | Use |
| --- | --- | --- |
| `--duration-instant` | 80 ms | Hover colour, press |
| `--duration-fast` | 120 ms | Switches, chips, checkbox |
| `--duration-base` | 180 ms | Popovers, tooltips, fades |
| `--duration-slow` | 240 ms | Dialog enter, toast enter |
| `--duration-panel` | 280 ms | Side panel and sheet slide |

Easing: `--ease-standard` `cubic-bezier(0.2, 0, 0, 1)` for most; `--ease-out` for enters. Exits are 70 % of the enter duration.

Rules (D49):

- Animate opacity and small translations (at most 8 px) only. Panels slide from the end edge (logical: from the right in LTR, from the left in RTL; shadcn `slide-in-from-end`).
- Skeleton shimmer runs at 1.6 s per cycle (0.6 Hz).
- `prefers-reduced-motion: reduce`: durations drop to 1 ms, no shimmer (static block), no slides, auto-scroll during playback becomes a jump. The marketing demo video shows its poster and a play button instead of autoplaying.
- Nothing animates on lock: the gate replaces content instantly, so decrypted text never lingers during a fade.

---

## 7. Iconography

- **Library:** lucide, 1.5 to 2 px stroke at the default 2, sizes 14 (inline in chips and meta), 16 (buttons, list), 18 (navigation), 20 (mobile navigation, empty states use 24 inside a 48 px tinted circle).
- **Colour:** icons inherit `currentColor`; secondary icons use `muted-foreground`.
- **Icon-only buttons** always have an `aria-label` and a tooltip with the shortcut.
- **Core set:** `phone` (calls), `phone-incoming` / `phone-outgoing` (direction), `star`, `tag` / `tags`, `lightbulb` (intent), `calendar`, `user`, `scan-search` (meaning), `lock` / `lock-open`, `shield-check` (signature verified), `shield-alert` (signature warning), `key-round` (passkeys), `fingerprint` (device fingerprint), `qr-code`, `message-circle` (WhatsApp), `download`, `trash-2`, `upload`, `file-audio`, `file-text`, `server` (instance), `database`, `hard-drive`, `cloud`, `wifi-off` (offline), `keyboard`, `sparkles` is **not** used (we do not decorate AI features).
- **Mirroring:** directional icons get `.icon-directional` / `rtl:-scale-x-100` (arrow and chevron left/right, `undo-2`, `send`, `log-out`, `external-link`, `list-indent`). Never mirrored: media controls, `clock`, `history`, `refresh-*`, `check`, `search`, phone direction icons (they depict a handset, not reading order), `phone-incoming` / `phone-outgoing`.
- **Brand logos:** lucide has no brand icons. Provider names are text; client names (Claude, Cursor) are text, not logos, in R1.

---

## 8. RTL and bidirectional text

1. `<html dir lang>` is set on the server from the resolved locale; shadcn `DirectionProvider` receives the same direction. `PopoverContent` and `TooltipContent` get `dir` explicitly (shadcn known issue).
2. Use logical utilities only: `ms-* me-* ps-* pe-* start-* end-* text-start text-end border-s border-e rounded-s-* rounded-e-*`. Lint for `ml- mr- pl- pr- left- right- text-left text-right` in `packages/ui` and `apps/web`.
3. **Mirror:** sidebar side, navigation order, chevrons, back arrows, breadcrumbs, step indicators, progress bars for jobs (upload queue, apply-rules progress), sliders other than media, sheets (they open from the end edge).
4. **Do not mirror:** the media player (controls, timeline and hit ticks stay LTR in every locale), clocks, charts, phone numbers, codes, keys, fingerprints, file names, URLs, timestamps, numeric values.
5. **Bidi islands (D43):** wrap phone numbers, codes, tokens, file names, emails and URLs in `<bdi>` or `.ltr-island`. Format phone numbers with libphonenumber in international format inside the island: `+972 52-555-0134`.
6. **User content (D44):** names, snippets, notes, tag names, ask answers and transcript segments carry `dir="auto"`. Rows and snippets align to the UI direction; transcript segments align to their own direction.
7. **Numbers and dates** use `Intl` with the UI locale (`he-IL`: "היום, 14:32", "10 בנוב׳"). Durations: "8 min" / "8 דק׳". Western digits in Hebrew (standard in Israel).
8. **Mixed punctuation:** the ellipsis on truncated snippets is placed by the browser (`text-overflow` or `line-clamp`), never concatenated as a string, so it lands on the correct side.
9. **Icons inside inputs** (search) sit at the start edge; clear buttons at the end edge.
10. **Arabic (later):** add `ar.json`, the Arabic font is already declared; `:lang(ar)` raises line heights. **Russian (later):** add `ru.json`; Plex Sans includes Cyrillic. Neither needs layout changes. Budget 30 % text expansion for Russian.

---

## 9. Focus, targets and accessibility

- **Focus ring (D47):** `outline: 2px solid var(--ring); outline-offset: 2px` on `:focus-visible` for every interactive element, including list rows, chips and transcript timestamps. Inputs show the ring with 1 px offset and the border turns `--ring`. Ring contrast ≥ 3:1 against every surface (table above).
- **Not obscured (2.4.11):** sticky top bar, the docked player and the bottom navigation set `scroll-padding-top` / `scroll-padding-bottom` so focused items scroll into view clear of them. Toasts stack at the bottom end corner above the bottom navigation and never cover the focused element's row.
- **Targets (D48):** 32 px minimum for dense desktop controls with ≥ 8 px spacing; 44 px under `pointer: coarse` (`.tap-target`). Star toggles and chip remove buttons expand their hit area with padding, not with visual size.
- **Landmarks:** `header`, `nav` (Main), `main`, `aside` (call side panel, labelled "Ask and notes"), `search` role on the query bar.
- **Live regions:** result counts and "Also matched" (`polite`), upload queue summary (`polite`, throttled to once every 5 s), ask streaming (`aria-busy` on the answer, final text announced once), lock events (`assertive`: "AskCalls locked").
- **Dialogs:** Radix Dialog / AlertDialog: focus trap, `Esc` closes, focus returns to the trigger. Destructive dialogs place initial focus on Cancel.
- **Forms:** visible labels always (no placeholder-only fields); errors linked with `aria-describedby`; error summary at the top of long forms (wizard, admin cards).
- **Media:** player controls are buttons with labels and shortcuts; the timeline is a slider (`role="slider"`, `aria-valuetext="2 minutes 14 seconds of 8 minutes 12 seconds"`).
- **Contrast:** all text pairs ≥ 4.5:1, see section 3. No information conveyed by colour alone.
- **Zoom and reflow:** every screen works at 320 px CSS width and 200 % zoom without horizontal scrolling (except the upload queue table, which becomes cards).

---

## 10. State patterns

Every async surface defines four states. Copy is in `screens.md`.

### Loading

- **Lists:** skeleton rows at the real row height (72 px), 6 rows, with the static lock glyph and "Decrypting on this device" on rows whose ciphertext has arrived but is not yet decrypted. Network loading shows skeletons without the lock.
- **Panels:** skeleton lines at text sizes. Never a full-page spinner after the shell has rendered.
- **Buttons:** a 14 px spinner replaces the icon and the label changes to the progressive verb ("Testing…", "Unlocking…"); width does not change.
- **Threshold:** show skeletons only after 150 ms; keep them at least 300 ms once shown to avoid flicker.

### Empty

A 48 px tinted icon circle, a one-line heading, one sentence, one primary action. Variants: first use (no calls), no results (with "Clear filters" and the "Also matched" line explaining what was tried), filtered list empty, feature off (for example "Ask is turned off on this instance").

### Error

- **Inline** (field or row): icon + sentence in `destructive`, with the fix.
- **Panel** (a section failed to load): callout with "Try again".
- **Page** (route failed): heading, one sentence, "Try again" and "Go to calls".
- **Never include plaintext:** error messages use codes, counts and file names the user chose (file names are shown only locally, never sent to telemetry). A decrypt failure says "This call couldn't be decrypted on this device." with the call id prefix for support.
- **Offline:** a slim banner under the top bar: "You're offline. Decrypted calls stay readable until you lock. Changes will sync when you're back online." (Reads only; writes are disabled with a tooltip.)

### Locked

- When locking (manual, idle timeout, tab close), the app navigates to the unlock gate immediately, wipes decrypted stores and revokes Blob URLs. A toast on the gate: "AskCalls locked after 15 minutes idle."
- Any deep link while locked lands on the gate and returns to the requested route after unlock.
- Signed-out is different from locked: the sign-in page explains "Signing out also removes this device's saved keys. You'll need your passkey or recovery code to unlock again."

---

## 11. Keyboard shortcuts (D45)

Single-key shortcuts work only when focus is not in a text field, and can be turned off in Settings → Privacy (WCAG 2.1.4).

| Keys | Action | Scope |
| --- | --- | --- |
| `/` | Focus search | Calls |
| `j` / `k` | Next / previous call | Calls list, call view |
| `Enter` | Open selected call | Calls list |
| `s` | Star or unstar | Calls list, call view |
| `t` | Edit tags | Calls list, call view |
| `Esc` | Close dialog or panel; clear the search when the bar is focused; back to results from a call | Global |
| `?` | Keyboard shortcuts dialog | Global |
| `L` (Shift+L) | Lock now | App |
| `g` then `c` / `u` / `t` / `s` | Go to Calls / Upload / Tags / Settings | App |
| `Space` | Play or pause | Call view with recording |
| `←` / `→` | Back / forward 5 s (not mirrored in RTL: media) | Call view player |
| `n` / `Shift+n` | Next / previous search hit | Call view |
| `a` | Focus "Ask about this call" | Call view |
| `Ctrl/⌘ + Enter` | Send question; save rule | Ask panel, rules |

`L` is Shift+L to avoid accidental locks while typing elsewhere.

---

## 12. Voice and copy

**Voice:** plain, specific, honest. Write like a careful engineer explaining to a friend.

Rules:

1. Sentence case. No exclamation marks, no emojis, no "coming soon", no "magic", "seamless", "effortless", "AI-powered", "military-grade".
2. Say the verb on the button: "Unlock with passkey", "Start import", "Send and ask", "Delete call". Not "OK", "Submit", "Continue" when a specific verb exists.
3. Name third parties: "ElevenLabs", "Anthropic", not "our partners".
4. Never overclaim. Use "We can't read your calls" only where the data-flow exceptions are one click away. Required phrasing for the three plaintext paths:
   - Transcription (managed): "Audio passes through AskCalls servers to ElevenLabs, streamed and never stored. ElevenLabs may keep request logs under its standard policy."
   - Transcription (own key, direct): "Audio goes from your device straight to ElevenLabs under your account. AskCalls never sees it."
   - Ask (managed): "This call's transcript and your question go through AskCalls servers to Anthropic. AskCalls doesn't store them."
   - Inbox: "Inbox uploads are visible to the AskCalls server in transit. They're encrypted to your key on arrival and indexed next time you unlock."
5. Errors: what happened, then what to do. "Couldn't reach the server. Check your connection and try again." Never blame the user, never show stack traces or content.
6. Numbers: digits, with units: "8 min", "300 minutes a month", "2 GB". Dates via `Intl`.
7. "Call" not "recording" unless the audio file is meant. "Transcript" not "transcription" for the text. "Passkey" lowercase in running text.
8. Hebrew: gender-neutral where natural (infinitive buttons: "ביטול נעילה", "העלאת שיחות"), plural forms for instructions ("שמרו את הקוד") avoided in favour of infinitive or impersonal forms ("יש לשמור את הקוד"). Formal but warm; no slang.

Glossary (English → Hebrew):

| English | Hebrew |
| --- | --- |
| Call / calls | שיחה / שיחות |
| Transcript | תמלול |
| Recording | הקלטה |
| Unlock / Lock | ביטול נעילה / נעילה |
| Passkey | מפתח גישה (passkey) |
| Recovery code | קוד שחזור |
| Passphrase | משפט סיסמה |
| Tag / Tags | תגית / תגיות |
| Intent | כוונה |
| Rule | כלל |
| Synonym | מילה נרדפת |
| Starred | מסומנות בכוכב |
| Meaning (semantic search) | משמעות |
| Provider | ספק |
| Managed | מנוהל |
| Your own key | מפתח משלך |
| Linked device | מכשיר מקושר |
| Audit log | יומן פעילות |
| End-to-end encrypted | מוצפן מקצה לקצה |

---

## 13. Component inventory

shadcn/ui primitive (Radix underneath) or "custom" when composed. All live in `packages/ui`.

| Component | Built from | Notes |
| --- | --- | --- |
| Button (primary, secondary, outline, ghost, destructive, link; sm, default, lg, icon) | `Button` | Loading state with spinner; `asChild` for links |
| Input, Textarea, Label | `Input`, `Textarea`, `Label` | 16 px text on mobile |
| Select | `Select` | Model pickers, auto-lock timeout |
| Checkbox, Switch, Radio group | `Checkbox`, `Switch`, `RadioGroup` | |
| Choice card (radio card) | custom on `RadioGroup` | Wizard and provider choices |
| Segmented control | `ToggleGroup` (type single) | Managed / Own key / Off |
| Tabs | `Tabs` | Upload Single/Bulk, Tags and rules, side panel Ask/Notes |
| Card | `Card` | |
| Badge | `Badge` | Status badges with icon |
| Tag chip | custom on `Badge` | Colour dot + name, removable variant |
| Query bar with tokens | custom (input + token list) | `role="search"`, tokens are buttons |
| Filter chip | custom on `Toggle` + `Popover` + `Command` | Shows value when set |
| Command menu (pickers, `contact:` autocomplete) | `Command` (cmdk) in `Popover` | |
| Date range picker | `Calendar` (react-day-picker) in `Popover` | Manual RTL migration per shadcn docs |
| Dropdown menu (row and call actions) | `DropdownMenu` | |
| Context menu (row right-click) | `ContextMenu` | Same items as the row dropdown |
| Tooltip | `Tooltip` | Shows shortcut; `dir` passed explicitly |
| Dialog | `Dialog` | Device linking, shortcuts, confirm |
| Alert dialog | `AlertDialog` | Delete call, delete account, remove last passkey |
| Sheet | `Sheet` (side="end" via logical class) | Consent sheet on desktop is a Dialog; on mobile a Drawer |
| Drawer (mobile bottom sheet) | `Drawer` (vaul) | Ask/Notes on mobile, filter pickers on mobile |
| Toast | `Sonner` | Bottom end; inbox processed, locked, undo delete |
| Skeleton | `Skeleton` + lock glyph | Static under reduced motion |
| Progress / meter | `Progress` | Quota meters, import progress |
| Table | `Table` | Upload queue, audit log, tokens |
| Data table filters | custom on `Table` + `Select` + `Popover` | Audit log |
| Virtualized list | custom with `@tanstack/react-virtual` | Calls list, `aria-setsize` / `aria-posinset` |
| Call row | custom | Star toggle, names, snippet, tags, meta |
| Transcript segment | custom | Timestamp button, speaker, `dir="auto"` text, hit marks |
| Audio player | custom (native `<audio>` + controls) | LTR in all locales; hit ticks |
| Ask panel (chat) | custom on `ScrollArea` + `Textarea` | Streaming, citations as buttons |
| Notes editor | `Textarea` (autosize) | "Saved, encrypted" status |
| Stepper | custom | Onboarding (horizontal), wizard (vertical) |
| Recovery code grid | custom | Mono, numbered groups, print stylesheet |
| Code group input | custom on `InputOTP` pattern | Two-group confirm, 6-digit fingerprint |
| QR code | custom (`qrcode` lib, SVG, rendered locally) | Device linking |
| Data-flow line | custom | Route diagram + sentence; used in provider cards, upload, consent |
| Provider card | custom on `Card` | Segmented choice, fields, test, usage |
| Health indicator | custom on `Badge` | Healthy / Degraded / Down with icon |
| Env lock field | custom | Read-only input + lock icon + "Set by the server environment" |
| Rule builder | custom on `Select`, `Command`, `Input` | Condition rows and action rows |
| Kbd | custom | Keyboard hints |
| Avatar | `Avatar` | Initials only, no remote images in the app |
| Sidebar | `Sidebar` | Manual RTL migration per shadcn docs |
| Scroll area | `ScrollArea` | Side panel, popovers |
| Accordion | `Accordion` | Marketing FAQ |
| Navigation menu | `NavigationMenu` | Marketing header |
| Breadcrumb | `Breadcrumb` | Settings sections on mobile |
| Empty state | custom | Icon circle, heading, sentence, action |
| Error state | custom on `Alert` | Inline, panel, page variants |
| Banner | `Alert` | Offline, import in progress, quota warnings |
