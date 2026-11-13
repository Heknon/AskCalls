# AskCalls design language

The single reference for keeping the UI consistent and for not building the same thing twice. Read this before adding or changing anything in `packages/ui` or a screen.

- **`design-system.md`** says what the tokens and visual rules are.
- **This file** says what each component *means*, when to use it, and which screens use it.
- **`screens.md`** says what each screen contains and its exact copy.

Contents

1. Layer model
2. Design language rules (spacing, type roles, colour roles, icon meanings, motion meanings, voice)
3. No-duplication rules and the new-component checklist
4. Component catalog
5. Screen → component map

---

## 1. Layer model

```
 Layer 3  Screens            apps/web/src/app/**           compose product components, own data loading and routing
              │  uses only
              ▼
 Layer 2  Product components packages/ui/src/product/*     one component per meaning (this catalog)
              │  composes
              ▼
 Layer 1  Primitives         packages/ui/src/primitives/*  shadcn/ui (Radix) components, styled only through tokens.css
              │  reads
              ▼
 Layer 0  Tokens             packages/ui/src/styles/tokens.css
```

Rules:

1. **Primitives are styled only through tokens.** A primitive file may use token utilities (`bg-primary`, `text-muted-foreground`, `rounded-md`) and its own variants. No hex values, no arbitrary values (`text-[13px]`), no product meaning.
2. **Product components add meaning.** They choose primitives, variants, icons and copy keys for one product concept (a call, a tag, a data flow). They accept meaning-based props (`direction="incoming"`, `route="direct"`), not style props (`color`, `className` for colours).
3. **Screens compose product components and never restyle primitives.** A screen may use layout utilities (`grid`, `gap-*`, `max-w-*`, responsive visibility) and primitives that carry no product meaning (`Tabs`, `Separator`, `ScrollArea`, plain `Button` for a page action). It may not pass colour, size or typography overrides to a primitive or product component. If a screen needs a different look, it needs a variant in layer 2, added through the checklist in section 3.
4. **`className` is for layout only** when crossing layers: margin, grid placement, width. A lint rule (`no-restricted-syntax` on `className` containing `bg-|text-(?!start|end)|border-|rounded-|shadow-|font-` in `apps/web/src/app/**`) enforces this.
5. **Copy comes from message files.** Product components receive message keys or already-translated strings from the screen; they never hard-code English.

---

## 2. Design language rules

### 2.1 Spacing rhythm

Spacing expresses relationship. Use these steps and nothing between them.

| Relationship | Space | Examples |
| --- | --- | --- |
| Inside a control | 4 to 8 px | Icon to label in a button or chip |
| Between items of one group | 8 px | Chips in a row, tags on a call, buttons in a footer |
| Between a label and its content | 6 px | Field label to input |
| Between groups in a card | 16 px | Fields in a provider card |
| Between cards or sections in a page | 24 px | Settings sections, wizard blocks |
| Between page header and content | 16 to 24 px | Calls title to search bar |
| Between marketing sections | 96 px (64 px mobile) | Home sections |

Density: lists use 14 px vertical padding per row; settings and forms use 20 px card padding; nothing uses less than 8 px between interactive targets.

### 2.2 Type roles

Name text by role. Each role maps to one token set; never pick sizes ad hoc.

| Role | Token | Weight | Colour | Used for |
| --- | --- | --- | --- | --- |
| Page title | `text-2xl` (`text-xl` mobile) | 600 | foreground | One per page: "Calls", "Settings" |
| Gate title | `text-3xl` | 600 | foreground | Unlock, onboarding, wizard headings |
| Section title | `text-lg` | 600 | foreground | Settings sections, card headings |
| Item title | `text-base` | 600 | foreground | Contact names in rows, provider names |
| Body | `text-base` | 400 | foreground | UI sentences, descriptions |
| Reading text | `text-md` | 400 | foreground | Transcript segments, notes, ask answers, marketing body |
| Metadata | `text-sm` | 400 | muted-foreground | Dates, durations, numbers under names, counts |
| Caption | `text-xs` | 400/500 | muted-foreground | Timestamps in transcript, hints under chips, footnotes |
| Label | `text-sm` | 500 | foreground | Form labels, chip labels, tab labels |
| Code value | `text-md` mono | 500 | foreground | Recovery code, fingerprint, short link code |
| Inline code | `text-sm` mono | 400 | foreground | Commands, file names, config keys |
| Marketing display | `text-5xl` / `text-4xl` | 600 | foreground | Hero and section headings only |

### 2.3 Colour roles

| Role | Token | Meaning | Never use for |
| --- | --- | --- | --- |
| **Accent** | `primary` | The one primary action in a view, focus rings, selected/active state (active chip, current nav item, selected choice card), links | Decoration, icons at rest, large backgrounds, status |
| **Encrypted / on device** | `muted-foreground` + the lock icon | Content exists but is not yet decrypted (placeholders) and the Lock control. Encryption is the normal state, so it is quiet and wordless | Errors or warnings; captions or badges that advertise encryption (2.6) |
| **Plaintext leaves the device** | neutral surface + route diagram (`DataFlowNote`) | A chosen path where content goes to a third party | Alarm colours; these paths are user choices, not dangers |
| **Attention** | `warning` / `warning-subtle` | Something needs the user's action soon: missing bucket CORS, quota near limit, signature not verified, offline mode blockers | Normal informational text |
| **Danger** | `destructive` / `destructive-subtle` | Irreversible actions (delete call, delete account, revoke) and failures | Anything reversible |
| **Success** | `success` / `success-subtle` | Healthy connection, verified signature, import done | Generic confirmation of a click (use a toast without colour) |
| **Search hit** | `mark` | A word that matched the current search | Anything else, including emphasis |
| **User data colour** | `tag-*` | A tag's colour, chosen by the user | Product meaning of any kind |
| **Star** | amber glyph | Starred call | Ratings, warnings |

### 2.4 Icon meanings

One icon per concept; one concept per icon. If a new concept needs an icon, add a row here first.

| Icon (lucide) | Means exactly | Not for |
| --- | --- | --- |
| `lock` | Encrypted on your device / locked keys / "Lock now" | Generic security, passwords, privacy marketing bullets |
| `lock-open` | Keys are unlocked in this tab's memory | Anything else |
| `shield-check` | Signature verified for this call | General "secure" claims |
| `shield-alert` | Signature missing or not verified | Generic warnings (use `triangle-alert`) |
| `key-round` | A passkey | API tokens (use `key`) |
| `key` | Personal access token / provider API key | Passkeys |
| `fingerprint` | Device fingerprint comparison (device linking) | Biometrics generally |
| `phone` | A call / the Calls section | Call back action (use `phone-outgoing`) |
| `phone-incoming` / `phone-outgoing` | Call direction | |
| `phone-outgoing` (action) | Call back via `tel:` | |
| `message-circle` | Open in WhatsApp | Notes, chat with AI |
| `message-square-text` | Ask about this call (AI chat) | WhatsApp |
| `notebook-pen` | Notes | |
| `star` | Starred | Favourites of anything else, ratings |
| `tag` / `tags` | A tag / tag management | Prices, labels in general |
| `lightbulb` | Intent | Tips, hints |
| `scan-search` | Meaning (semantic) search | Generic search (use `search`) |
| `search` | Keyword search | |
| `user` | Contact filter | Account menu (use avatar) |
| `book-user` | Contacts section | |
| `calendar` | Date filter | |
| `upload` | Upload / import | Share |
| `download` | Download transcript, export | |
| `inbox` | Inbox items (server-side encrypted uploads) | Notifications |
| `server` | The instance, admin pages, a value set by the server environment, and the AskCalls server in data-flow diagrams | Third-party providers (use `cloud`) |
| `cloud` | A third-party provider in a data-flow diagram | The AskCalls server |
| `laptop` / `smartphone` / `terminal` | Device kind (browser on desktop, browser on phone, agent CLI) | |
| `database`, `hard-drive` | Database, local file storage | |
| `wifi-off` | Offline mode / you are offline | |
| `triangle-alert` | Needs attention | Errors (use `circle-alert`) |
| `circle-alert` | An error happened | |
| `circle-check` | Done / healthy | Selected state (use the control's own checked state) |
| `trash-2` | Delete permanently | Revoke (use `x` or `unlink`) |
| `unlink` | Revoke a linked device or token | |
| `rotate-ccw` | Retry | Undo |
| `undo-2` | Undo | |
| `keyboard` | Keyboard shortcuts | |
| `wand-sparkles` | Added by an auto-tag rule | AI features (we do not decorate AI) |

### 2.5 Motion meanings

| Motion | Means |
| --- | --- |
| Fade in (180 ms) | New information appeared in place (results updated, toast) |
| Slide from end edge (280 ms) | A panel attached to the current object opened (side panel, sheet) |
| Scale + fade (240 ms) | A modal decision interrupts (dialog) |
| Shimmer | Work is happening on this device right now (decrypting, indexing). Never for network-only waits longer than a few seconds; those get a progress label |
| Spinner in a button | This button's action is running |
| No motion | Locking. The gate replaces content instantly |

### 2.6 Voice and copy

The product talks like a careful colleague: short, specific, and silent when there is nothing to say. These rules apply to every screen, mock and message file.

**No slop.**

1. **No restating.** A page title needs no subtitle unless the subtitle carries information the user acts on. "Calls" is the whole header of the calls page; the count lives in the navigation and the result line.
2. **Don't advertise encryption inside the app.** Mention encryption, keys or "your device" only where it changes a decision:
   - the unlock gate,
   - the recovery code (onboarding and regenerate),
   - consent before content goes to a provider (`ConsentSheet`),
   - the inbox in-transit notice,
   - the data-flow line on provider cards, the upload pre-flight and under the ask input (`DataFlowNote`).
   Everywhere else, encryption is the silent default. No "encrypted" badges, captions, toasts or save messages.
3. **Locked and decrypting state is an icon, not a sentence.** `DecryptingPlaceholder` is a skeleton plus a lock icon with an `aria-label` ("Decrypting"). No caption.
4. **The lock control is a control.** `LockStatus` is a compact "Lock" button with a tooltip ("Locks after 15 min idle") and the shortcut; no explanatory paragraph.
5. **Empty states:** one short line plus the action. "No calls yet." + "Upload calls". "No calls match." + "Clear filters".
6. **Labels are nouns or verbs, not sentences.** "Auto-lock", "Lock after idle for", "Billed by Anthropic", "Retry".
7. **Errors are one line: what happened, what to do.** "Wrong code. Check each group and try again." "Couldn't reach ElevenLabs. Try again." Never include content, stack traces or blame.
8. **Banned words:** seamless, secure, powerful, effortless, simply, just, easily, robust, magic. No exclamation marks, no emojis, no "coming soon" (use "Planned" or "Not available in this version").
9. **Name third parties and say what they get,** once, at the decision point: "This call's transcript and your question go through AskCalls to Anthropic."
10. **Marketing explains the privacy model once:** the trust diagram, the source link and the leak test, in one section. Other sections describe what the product does, without repeating privacy claims and without generic feature fluff.

**Shared phrasing.** `DataFlowNote` and `ConsentSheet` take their sentences from the `dataFlow.*` message namespace, so a path is always described in the same words. Full sentences per route are in `design-system.md` section 12.

**Review check.** Before merging UI copy, search the diff for the banned words and for "encrypt", "decrypt", "your device" outside the allowed components above.

---

## 3. No-duplication rules

1. **One component per meaning.** If two places show "a call in a list", they use `CallRow`, even if one is a search result and one is a recent-calls widget. Differences are variants (`CallRow` `context="search"` shows a snippet).
2. **Extend with a variant, never copy.** Need a different look for the same meaning? Add a variant with a meaning-based name (`size="compact"` because the context is dense, `source="rule"` because the tag came from a rule). Never `color="blue"` or `big`.
3. **Variants are named by meaning.** `TagChip source="intent"` exists because intents are system-derived and cannot be renamed, not because they are outlined. If a variant has no meaning to explain, it should not exist.
4. **Look-alikes that mean different things stay separate, and say why.** The catalog lists every such pair under "Not to be confused with". Examples:
   - `TagChip` vs the chips inside `FilterPicker`: a tag chip is data on a call; a picker chip is one choice in a filter. They share a shape only inside the picker, where the context is unambiguous.
   - `FilterBlank` vs `TagChip`: a blank is a filter's current value inside the filter sentence; it is never shaped like a chip, so filters and tags can't be confused on the calls page.
   - `SearchSuggestion kind="call"` vs `CallRow`: a suggestion is a shortcut to open one call from the search box; a row is a result in the list.
   - `QueueItemStatus` vs `HealthBadge`: one is the state of a job item that ends; the other is the ongoing state of a connection.
   - `DecryptingPlaceholder` vs `Skeleton` (primitive): the placeholder means "ciphertext is here, being decrypted on your device" and carries the lock; the bare skeleton means "waiting for the network".
   - `UnlockMethodRow` covers passkeys, recovery code, passphrase and linked devices because all four are keyring rows that wrap the same root key. There is no separate `DeviceRow` or `PasskeyRow`.
5. **Shared sub-parts are components too.** `PhoneNumber`, `TimestampLink`, `HitMark`, `Kbd` exist once and are reused inside larger components.
6. **Screens never re-implement catalog behaviour** (for example, a screen must not build its own masked key display; it uses `MaskedSecret`).

### Checklist for adding a component

Before writing code, answer in the PR description:

1. What product concept does it represent? One sentence. If it is purely visual, it belongs in primitives, not here.
2. Search this catalog for the concept and its synonyms. Can an existing component take a new meaning-based variant instead?
3. If it looks like an existing component, add a "Not to be confused with" line to both entries explaining the difference in meaning.
4. Which primitives does it compose? It must not introduce new colours, sizes or radii outside `tokens.css`.
5. Define all states: default, hover, focus, disabled, loading, empty, error, and locked if it shows user content.
6. Define a11y: role, accessible name, keyboard behaviour, live-region behaviour.
7. Define RTL: what mirrors, what stays LTR, where `dir="auto"` applies.
8. Add the entry to section 4 and the screens to section 5, in the same PR.
9. Add a story or mock state and a Playwright screenshot in both directions and both themes.

---

## 4. Component catalog

Format for each entry: **Purpose**, **Use / Don't use**, **Props and variants** (with meaning), **Composes** (shadcn/ui primitives), **Screens**, **States**, **A11y**, **RTL**. Screen codes refer to section 5.

### 4.1 App frame

#### AppSidebar
- **Purpose:** primary navigation and the always-visible lock status on large screens.
- **Use:** app routes at `lg` and above (collapses to a rail at `md`). **Don't use:** marketing, onboarding, unlock gate, wizard (they are focused flows without navigation).
- **Props:** `active` (route key), `isAdmin` (shows the Instance group), `callCount`.
- **Composes:** `Sidebar`, `Tooltip` (rail labels), `Button`, `Avatar`.
- **Screens:** all `/app/**` and `/admin/**`.
- **States:** expanded, rail; current item.
- **A11y:** `nav aria-label="Main"`; `aria-current="page"`; rail items have tooltips and names.
- **RTL:** sits at the start edge (right in Hebrew); shadcn Sidebar needs manual RTL migration.

#### MobileTabBar
- **Purpose:** primary navigation on small screens.
- **Use:** `< md` on app routes. **Don't use:** for actions (Upload in it is a destination page, not an action).
- **Props:** `active`. Five fixed destinations.
- **Composes:** custom `nav` + `Button` styles.
- **Screens:** all `/app/**` on mobile. **States:** current item. **A11y:** `nav aria-label="Main"`, labels always visible. **RTL:** order mirrors (Calls at the start edge).

#### MobileTopBar
- **Purpose:** page title, one page action and the lock button on small screens.
- **Props:** `title`, `action` (one icon button), `back` (shows a back arrow instead of the logo).
- **Composes:** `Button`. **Screens:** all `/app/**` on mobile. **RTL:** back arrow mirrors.

#### PageHeader
- **Purpose:** the title and page actions of a page.
- **Props:** `title`, `description?` (only when it carries information the user acts on; most pages have none), `actions`.
- **Composes:** layout only. **Screens:** C1, T1, P1, S1–S8, A1. **A11y:** title is the page's `h1`.

#### LockStatus
- **Purpose:** locks AskCalls now; its presence means keys are unlocked in this tab.
- **Use:** sidebar footer (variant `sidebar`: lock icon, "Lock", `⇧L`; icon only in the rail), mobile top bar (variant `icon`). **Don't use:** to describe encryption; no paragraph or status sentence (2.6).
- **Props:** `variant="sidebar" | "icon"`, `autoLockMinutes` (shown only in the tooltip: "Locks after 15 min idle").
- **Composes:** `Button`, `Tooltip`, `Kbd`.
- **Screens:** all app routes. **States:** default; locking (instant navigation to the gate).
- **A11y:** button "Lock now", shortcut Shift+L; locking announces "AskCalls locked" assertively on the gate.
- **RTL:** nothing special.

#### ShortcutsDialog
- **Purpose:** lists every keyboard shortcut available in the current context.
- **Composes:** `Dialog`, `Kbd`. **Screens:** global (`?`). **A11y:** grouped lists with headings; `Esc` closes. **RTL:** key glyphs stay as on the keyboard; arrow-key rows for the player are not mirrored.

### 4.2 Call identity

#### ContactLabel
- **Purpose:** how a caller is shown: the contact name, or the number if no name, or "Hidden number".
- **Use:** everywhere a call's other party is named (rows, call header, toasts, rule previews). **Don't use:** for the signed-in user ("You").
- **Props:** `name?`, `phone?` (E.164), `show="name+number" | "name" | "auto"` (`auto` = name if known else number), `hidden` (number withheld).
- **Composes:** `PhoneNumber`. **Screens:** C1, C2, C3, K1, T1.
- **States:** known contact, number only, hidden, locked (renders `DecryptingPlaceholder` until meta is decrypted).
- **A11y:** names read as text; a hidden number reads "Hidden number".
- **RTL:** name has `dir="auto"`; number is an LTR island.

#### PhoneNumber
- **Purpose:** one phone number, formatted for reading and dialling.
- **Props:** `e164`, `format="international" | "national"`, `copyable`.
- **Composes:** `bdi`, optional `Button` (copy). **Screens:** C1, C3, K1, U1, S1. **A11y:** reads digits; copy button "Copy number". **RTL:** always `.ltr-island`, never mirrored.
- **Not to be confused with:** `ContactLabel` (which decides whether to show a number at all).

#### CallDirection
- **Purpose:** whether a call was incoming, outgoing or unknown.
- **Props:** `direction="incoming" | "outgoing" | "unknown"`, `withLabel`.
- **Composes:** lucide icon + text. **Screens:** C1, C3, U1. **A11y:** icon has `aria-label` when no visible label. **RTL:** handset icons are not mirrored.

#### CallMeta
- **Purpose:** when a call happened and how long it lasted.
- **Props:** `startedAt`, `durationSec`, `layout="stacked" | "inline"`.
- **Composes:** `time` elements. **Screens:** C1, C3. **States:** locked (placeholder). **A11y:** `<time datetime>`; duration reads "8 minutes". **RTL:** uses `Intl` in the UI locale; tabular figures.

#### SignatureBadge
- **Purpose:** whether the transcript was signed by one of your devices and the signature verified (spec 6.6).
- **Use:** call header only. **Don't use:** for TLS, account security or marketing claims.
- **Props:** `status="verified" | "unknown-device" | "invalid" | "missing"`, `deviceLabel`.
- **Composes:** `Badge`, `Tooltip` (explains the check), `HoverCard` on desktop.
- **Screens:** C3. **States:** verified (success, `shield-check`, "Signed by MacBook Air"), unknown device (warning, "Signed by a device that is no longer linked"), invalid (destructive, "Signature doesn't match. This transcript may have been changed."), missing (warning, "Not signed: imported through the inbox").
- **A11y:** status text always visible, not icon-only. **RTL:** device label `dir="auto"`.

### 4.3 Call list and search

The calls list uses one search pattern, shared with the owner's other product (`ListFilters`): **one search box that suggests as you type, the filters written as a sentence under it, and a result line with the sort.** It replaces any chip bar or row of filter buttons. Every list page that gains filters later uses the same components; don't add filter popovers, sheets or sort selects of your own.

```
[ 🔍  מחיר                                            × ]          SearchBox (suggestions drop below while typing)
Showing [all calls] · with [anyone] · tagged [any tag] · about [Purchase interest] · from [the last 30 days] · [in and out] · matching [exact words]   Clear
18 calls   also matched  מחירים ×  המחיר ×  price ×                                  Newest first ▾                                                     ResultLine
```

#### SearchBox
- **Purpose:** the one text input for finding calls. Plain text is a keyword search (fuzzy, with synonyms); while typing it suggests filter values and calls.
- **Use:** above any filterable list (calls; contacts later). **Don't use:** for finding text inside one transcript (`TranscriptFind`), or as a second search on the same page.
- **Props:** `value`, `onChange` (results debounce 250 ms in the screen hook), `placeholder`, `suggestions` (built by the screen from the decrypted local catalogs), `records` (calls found by the text).
- **Composes:** `Input` with `role="combobox"`, a listbox of `SearchSuggestion`s, `Button` (clear).
- **Screens:** C1, C2, O5. **States:** empty (placeholder "Search names, numbers, tags or words"), typing with suggestions, typing with no suggestions (Enter runs the word search), searching (results dim after 400 ms; the box never spins).
- **Behaviour:** at most 6 suggestions; filter values first, then up to 2 calls (4 when no values match); identifier-looking text (any digit, or 6+ characters) puts calls first. Typing a group name ("intent", "כוונה", "tag") suggests opening that picker. Choosing a suggestion applies it and clears the text.
- **A11y:** `role="combobox"`, `aria-expanded`, `aria-autocomplete="list"`, `aria-activedescendant`; ↑ ↓ move, Enter applies the highlighted suggestion (or runs the word search when none is highlighted), Esc closes the list, a second Esc clears the text. `/` focuses the box.
- **RTL:** search icon at the start, clear at the end; the input is `dir="auto"` and aligns to the UI direction.

#### SearchSuggestion
- **Purpose:** one thing the typed text could mean: a filter value, a call, a picker, or the word search itself.
- **Props:** `kind` (meaning, not look: `contact`, `tag`, `intent`, `starred`, `direction`, `date-preset`, `group` = open that blank's picker, `call` = open the call, `words` = run the keyword search), `label` (the matched part bold with an accent underline), `meta` line, `chosen`.
- **Meta lines:** "Contact · show only this", "Tag · add to the filter" (when other tags are chosen), "Tag · chosen, tap to remove", "Intent · see all 9" (group), "Today, 14:32 · 8 min" (call), "Search the transcripts" (words).
- **Composes:** `Button` row (`role="option"`), lucide icon in a tile, `Kbd` (↵ on the highlighted row, desktop only).
- **Screens:** C1, C2. **Not to be confused with:** `CallRow` (a result in the list). A call suggestion is a shortcut to open one call, not a result.
- **No counts.** Suggestions never show how many calls a value would return: the server can't count over encrypted names, and counting locally would mean decrypting every call's metadata.
- **RTL:** labels `dir="auto"`; phone numbers are LTR islands; the ↵ hint sits at the end edge.

#### FilterSentence
- **Purpose:** shows every filter at once, as a sentence the user can read and edit: "Showing [all calls] · with [anyone] · tagged [any tag] · about [any intent] · from [any time] · [in and out] · matching [exact words]".
- **Props:** `blanks: FilterBlank[]`, `onClear` (the "Clear" link appears when any blank is set).
- **Composes:** text + `FilterBlank`s. **Screens:** C1, C2; M1 (read-only fragments in use-case samples).
- **Copy:** each blank is a message with its value interpolated, so each language places its own prepositions. Hebrew folds some prepositions into the value ("[בכל זמן]", "[ב-30 הימים האחרונים]") instead of a separate word. Full sentences in both languages are in `screens.md` C2.
- **A11y:** a `<p>`; each blank is a button named by its sentence fragment ("with anyone, change contact filter").
- **RTL:** reads right to left as a Hebrew sentence; the "·" separators and Clear follow the reading order.

#### FilterBlank
- **Purpose:** one filter inside the sentence: its current value, and the button that changes it.
- **Props:** `facet` (`starred`, `contact`, `tag`, `intent`, `date`, `direction`, `match`), `empty` text ("anyone"), `value` text ("דנה לוי", "Hot lead + 1" for several), `open`, `readOnly` (marketing samples).
- **Looks:** empty = bold text with a dashed underline; set = accent tint with a solid accent underline. Never a pill or a chip.
- **Match blank:** "matching [exact words | meaning]" is the semantic search switch. It is a single-choice blank because it is one concept: how the text is matched. Choosing "meaning" sorts by best match and loads the meaning model once.
- **Composes:** `Button`. Opens `FilterPicker`. **Screens:** C1, C2, M1.
- **A11y:** `aria-haspopup="dialog"`, `aria-expanded`. **RTL:** none beyond the sentence.

#### FilterPicker
- **Purpose:** the short list of values for one blank.
- **Props:** `title` ("Which tag?"), `options` (from decrypted local catalogs: contacts, tags, intents; fixed lists for starred, direction, match; presets plus a calendar range for date), `multiple` (contacts, tags, intents; others close on one tap), `searchable` (automatic over 8 options, and when opened from a group suggestion), `total` (calls matching now, from the server, for the "Show 18 calls" button).
- **Composes:** `Popover` (desktop, anchored to the blank) or `Sheet` side="bottom" (phones, 80 % height, no auto-focus so the keyboard doesn't cover the options), chips as `Toggle`s, `Input` (search), `Button`, `Calendar` (date range).
- **Order:** fixed when the picker opens (chosen first, then recent use), so a chip never moves under the next tap. Natural order for ordered values (date presets).
- **No per-option counts** (same reason as suggestions). A value with no calls stays visible; picking it gives an empty list with ways out.
- **Screens:** C1, C2. **States:** default, searched with no match ("No tag matches “xyz”"), empty catalog ("No tags yet. Tags you add appear here.").
- **A11y:** dialog with title; chips `aria-pressed`; Esc closes; focus returns to the blank. **RTL:** chips wrap from the start edge; tag names `dir="auto"`.

#### ResultLine
- **Purpose:** how many calls match, which word variants were also searched, and the sort.
- **Props:** `total` (keeps the last number while a new page loads, never blank), `variants` (fuzzy and synonym variants, each removable), `sort` (Newest first, Oldest first, Longest first; Best match when matching by meaning).
- **Composes:** text, dashed variant pills with remove buttons, `DropdownMenu` (sort). **Screens:** C1, C2.
- **A11y:** polite live region for the count; each variant's remove button "Exclude מחירים". **RTL:** sort menu at the end edge; variants `bdi`.

#### FoldedFilterSummary
- **Purpose:** on phones, once the search block scrolls away, one line at the top says what's filtered and brings the block back.
- **Props:** `summary` ("“מחיר” · Purchase interest · the last 30 days", or "All calls"), `total`.
- **Composes:** `Button` fixed under the safe area. **Screens:** C1, C2 (mobile only).
- **A11y:** "Show search and filters"; tapping scrolls to the top and focuses the search box. **RTL:** icons at both ends mirror positions; text `dir="auto"`.

#### CallRow
- **Purpose:** one call in any list.
- **Use:** calls list, search results, contact detail's call list, "duplicate of" links in the upload queue. **Don't use:** in the call view header (use `CallHeader`).
- **Props:** `context="list" | "search"` (search shows the snippet), `density="comfortable" | "compact"` (compact for the contact detail list), `selected` (keyboard cursor), `call` (decrypted meta or `locked`).
- **Composes:** `StarToggle`, `ContactLabel`, `CallDirection`, `CallMeta`, `TagChip`, `SearchSnippet`, `DropdownMenu` / `ContextMenu` (row actions).
- **Screens:** C1, C2, K1.
- **States:** locked (all text replaced by `DecryptingPlaceholder`), default, hover, selected (start-edge accent bar + accent background), focus ring, starred.
- **A11y:** row is a link to the call with an accessible name "Dana Levi, incoming, today 14:32, 8 minutes"; `aria-setsize`/`aria-posinset` in virtualized lists; `j`/`k` move the cursor.
- **RTL:** grid mirrors; the snippet aligns to the UI direction with `dir="auto"`.

#### SearchSnippet
- **Purpose:** the best-matching passage of a call, decrypted on the device, with hits marked.
- **Props:** `text`, `hits: string[]`, `lines=2`. **Composes:** `HitMark`. **Screens:** C1, C2.
- **A11y:** `mark` elements are announced by some screen readers as "highlight"; no extra text added. **RTL:** `dir="auto"`, UI-aligned, ellipsis via line clamp.

#### HitMark
- **Purpose:** marks a word that matched the current search.
- **Composes:** `mark`. **Screens:** C1, C2, C3. **Don't use:** for emphasis or for "new" items.

#### StarToggle
- **Purpose:** star or unstar a call (the reserved `__star` tag).
- **Props:** `starred`, `size="row" | "header"`.
- **Composes:** `Toggle`. **Screens:** C1, C2, C3.
- **Not to be confused with:** `TagChip`. Stars are stored as a tag but are a separate concept in the UI with their own toggle, filter (the first blank of `FilterSentence`, "[starred calls]") and shortcut `s`.
- **A11y:** `aria-pressed`, name "Star" / "Unstar". **RTL:** none.

#### TagChip
- **Purpose:** one tag attached to a call.
- **Use:** on rows, in the call header, in tag pickers and the tag manager. **Don't use:** for filters (`FilterBlank`, `FilterPicker`) or statuses (Badge).
- **Props:** `tag` (`name`, `colour`), `source="manual" | "rule" | "intent"` (meaning: who attached it. `rule` shows `wand-sparkles` and the rule name in a tooltip; `intent` shows `lightbulb` and is outlined because it is derived from the call's content and can be dismissed but not renamed), `removable` (in edit mode).
- **Composes:** `Badge`, `Tooltip`, `Button` (remove).
- **Screens:** C1, C2, C3, T1, T2.
- **States:** display, removable, focused, picker option (with check).
- **A11y:** name read as text; remove button "Remove tag Hot lead". **RTL:** tag names `dir="auto"`.

#### DecryptingPlaceholder
- **Purpose:** stands in for content that is present but not yet decrypted on this device.
- **Use:** call rows while metadata decrypts, the call view while the transcript decrypts, contact names, notes. **Don't use:** for network loading (use the `Skeleton` primitive alone), or for content that failed to decrypt (use `ErrorState`).
- **Props:** `shape="line" | "row" | "paragraph"`. No caption: the lock icon carries `aria-label="Decrypting"` (2.6).
- **Composes:** `Skeleton` + `lock` icon.
- **Screens:** C1, C2, C3, K1, T1.
- **States:** animated shimmer, static under reduced motion.
- **A11y:** container `aria-busy="true"`; the icon's label is read once per list, not per row.
- **Not to be confused with:** `Skeleton` (primitive, network wait).

### 4.4 Call view

#### CallHeader
- **Purpose:** identifies the open call and its trust status.
- **Composes:** `ContactLabel`, `CallDirection`, `CallMeta`, `SignatureBadge`, `StarToggle`, `TagChip`, `CallActions`. **Screens:** C3.
- **States:** locked (placeholder), loaded. **RTL:** back link arrow mirrors.

#### CallActions
- **Purpose:** the actions for one call: WhatsApp, call back, download, delete, plus hit navigation when opened from search.
- **Props:** `phone?` (disables WhatsApp and call back with a tooltip when missing), `hitCount`.
- **Composes:** `Button`, `Tooltip`, `DropdownMenu` (download format, delete), `AlertDialog` (delete).
- **Screens:** C3. **A11y:** disabled buttons keep focusability through `aria-disabled` so the tooltip explains why. **RTL:** order mirrors.

#### TranscriptSegment
- **Purpose:** one speaker turn of the transcript.
- **Props:** `speaker`, `start`, `text`, `hits`, `playing`, `groupedWithPrevious`.
- **Composes:** `TimestampLink`, `HitMark`.
- **Screens:** C3, O5 (sample call).
- **States:** default, playing (subtle accent background and start-edge bar), hit, focused.
- **A11y:** the segment is a list item; the timestamp is the button ("Play from 0:48"). **RTL:** speaker label at the UI start edge; text `dir="auto"` aligned to its own direction.

#### TimestampLink
- **Purpose:** jump to a moment in the call.
- **Use:** segment timestamps, citations in ask answers, hit list. **Props:** `seconds`, `label?`.
- **Composes:** `Button` (link variant, mono digits). **Screens:** C3. **A11y:** "Play from 0:48"; disabled with tooltip when there is no recording but still scrolls the transcript. **RTL:** LTR island.

#### RecordingPlayer
- **Purpose:** plays the decrypted recording backup of a call.
- **Use:** only when a recording backup exists. **Props:** `src` (Blob URL), `duration`, `hits: seconds[]`, `rate`.
- **Composes:** custom controls with `Button`, `Slider`, `Select` (speed).
- **Screens:** C3. **States:** decrypting (placeholder with progress), ready, playing, error ("Couldn't decrypt the recording").
- **A11y:** buttons named, slider with `aria-valuetext`, `Space` and arrow keys. **RTL:** never mirrored; the whole player has `dir="ltr"`.

#### AskPanel
- **Purpose:** ask the LLM questions about this one call.
- **Use:** call view side panel (desktop) or drawer (mobile). **Don't use:** for cross-call questions (not in R1).
- **Props:** `provider` (name, model, route), `enabled` (false when Ask is Off: shows `EmptyState`).
- **Composes:** `ScrollArea`, `Textarea`, `Button`, `AskMessage`, `DataFlowNote` (compact), `ConsentSheet`.
- **Screens:** C3, C4. **States:** empty (suggested questions), consent required, sending, streaming, answered, error ("Anthropic didn't respond. Try again."), quota reached ("50 questions a day. Resets at 00:00 UTC."), off.
- **A11y:** answer region `aria-live="polite"` with `aria-busy` while streaming. **RTL:** messages `dir="auto"`.

#### AskMessage
- **Purpose:** one question or answer in the ask conversation.
- **Props:** `role="question" | "answer"`, `text`, `citations`. **Composes:** `TimestampLink`. **Screens:** C3.

#### ConsentSheet
- **Purpose:** asks for consent before a call's plaintext is sent to an LLM provider, naming who receives it.
- **Use:** first ask per unlocked session, and again whenever the provider or route changes. **Don't use:** for transcription consent at upload (that is `DataFlowNote` in the upload flow, which the user reads before starting).
- **Props:** `provider`, `model`, `route="managed" | "direct" | "passthrough"`, `retention` text.
- **Composes:** `Dialog` (desktop) / `Drawer` (mobile), `DataFlowNote`, `Checkbox`, `Button`.
- **Screens:** C4. **A11y:** initial focus on "Send and ask"; Cancel returns focus to the input. **RTL:** route diagram mirrors its order (device at the start edge).

#### NotesEditor
- **Purpose:** private notes on a call, encrypted on save.
- **Composes:** `Textarea`, `SaveStatus`. **Screens:** C3.

#### SaveStatus
- **Purpose:** tells the user an edit was encrypted and saved, or failed.
- **Props:** `state="saving" | "saved" | "error"`. Text: "Saving…", "Saved" (check icon), "Couldn't save. Retry".
- **Screens:** C3, T1–T4, K1. **A11y:** polite live region.

### 4.5 Trust, keys and devices

#### DataFlowNote
- **Purpose:** states, in one sentence and a route diagram, where plaintext goes for a feature.
- **Use:** provider cards, the upload screen, the consent sheet, the inbox section, the marketing "Where plaintext goes" list. **Don't use:** for marketing slogans or generic reassurance.
- **Props:** `route` (meaning: `on-device` = nothing leaves; `direct` = device straight to provider under your account; `managed` = through AskCalls servers, streamed, not stored; `passthrough` = through AskCalls with your key, not stored; `inbox` = visible to the server in transit, then encrypted; `off`), `provider`, `size="full" | "compact"` (compact is the one-line version under the ask input).
- **Composes:** custom (icons `laptop`, `server`, `cloud`), text.
- **Screens:** C3, C4, U1, U2, S5, S4, A1, M1, M3, O6.
- **A11y:** the diagram is decorative (`aria-hidden`); the sentence carries the meaning. **RTL:** the route reads from the start edge.

#### TrustDiagram
- **Purpose:** the marketing and security-page picture of what each part of the system holds.
- **Composes:** `Card`, `DataFlowNote` (for the exceptions list). **Screens:** M1, M3.
- **Not to be confused with:** `DataFlowNote` (one feature's path) — the diagram shows the whole system.

#### UnlockMethodRow
- **Purpose:** one way of unlocking the root key on this account: a passkey, the recovery code, the passphrase or a linked device.
- **Props:** `kind="passkey" | "recovery" | "passphrase" | "device"`, `label`, `provider` (iCloud Keychain, Google Password Manager, OS keychain), `createdAt`, `lastUsedAt`, `current` (this device).
- **Composes:** `Button`, `AlertDialog` (remove / revoke), `Badge` ("This device").
- **Screens:** S1. **States:** active, last remaining method (remove disabled with explanation), revoked (removed from list; audit entry).
- **A11y:** actions named with the label ("Revoke Firefox on ThinkPad"). **RTL:** labels `dir="auto"`.

#### RecoveryCodeGrid
- **Purpose:** shows the recovery code once, for the user to save.
- **Props:** `groups: string[8]`, `actions` (download, print, copy).
- **Composes:** custom grid, `Button`, `Checkbox` ("I saved my recovery code somewhere safe").
- **Screens:** O3, S1 (regenerate). **States:** shown, copied ("Copied. Clear your clipboard after saving."), printed.
- **A11y:** each group is a list item "Group 3: K7QX"; characters are spelled when read with `aria-label` using spaced characters. **RTL:** grid order stays 1 to 8 reading from the UI start, each group LTR island.

#### CodeGroupInput
- **Purpose:** typing back a code: two recovery groups to confirm, the full recovery code to unlock, or a short link code.
- **Props:** `groups` (count), `groupLength`, `labels` ("Group 3", "Group 6"), `error`.
- **Composes:** `InputOTP` pattern / `Input`. **Screens:** O4, G1, S1.
- **A11y:** one input per group with labels; paste fills all. **RTL:** inputs LTR.

#### FingerprintCode
- **Purpose:** the 6-digit fingerprint both devices must show during linking.
- **Props:** `digits`, `size`. **Composes:** custom mono display. **Screens:** D1 (device linking), and the agent prints the same format.
- **A11y:** read as "four eight two, nine one three". **RTL:** LTR island.

#### DeviceLinkCode
- **Purpose:** the QR code and short code a new device uses to join, with its expiry.
- **Props:** `qr`, `shortCode`, `expiresAt`. **Composes:** custom (local QR SVG), `Button` (copy). **Screens:** D1.
- **States:** waiting, connected (moves to fingerprint step), expired ("This code expired. Create a new one.").

#### PassphraseField
- **Purpose:** create or enter the passphrase fallback, with a strength meter on creation.
- **Props:** `mode="create" | "enter"`. **Composes:** `Input`, `Progress`. **Screens:** O2b, G1, S1.

### 4.6 Upload and jobs

#### FileDropZone
- **Purpose:** where files, folders or a ZIP are dropped or picked.
- **Props:** `accept="audio+transcript" | "manifest"`, `multiple`, `directory`.
- **Composes:** custom + `Button`. **Screens:** U1, U2. **A11y:** a real button opens the picker; drop is an enhancement. **RTL:** none.

#### PreflightSummary
- **Purpose:** what an import will do before it starts: counts, transcription minutes and the data flow.
- **Composes:** `Card`, `DataFlowNote`, `UsageMeter`. **Screens:** U2.

#### QueueItemStatus
- **Purpose:** the state of one file in an import.
- **Props:** `state="queued" | "decoding" | "transcribing" | "indexing" | "encrypting" | "uploading" | "done" | "duplicate" | "failed"`, `progress?`, `reason?`.
- **Composes:** `Badge`, icons. **Screens:** U2, U1 (single upload progress).
- **A11y:** text label always present. **Not to be confused with:** `HealthBadge`.

#### QueueRow
- **Purpose:** one file (or audio + transcript pair) in the import queue.
- **Composes:** `QueueItemStatus`, `ContactLabel`, `Button` (retry), `CallRow` link for duplicates. **Screens:** U2.

#### JobProgress
- **Purpose:** progress of a long job running on this device (import, applying rules to existing calls, export, inbox processing).
- **Props:** `done`, `total`, `label`, `paused`, `onPause`, `onResume`.
- **Composes:** `Progress`, `Button`. **Screens:** U2, T3, S8, global toasts. **RTL:** bar fills from the UI start edge (mirrors).

### 4.7 Organising

#### TagManagerRow
- **Purpose:** one tag in the tag manager, with its colour, name, call count and actions.
- **Composes:** `TagChip`, `Popover` (colour picker of the eight tag colours), `Input` (rename), `AlertDialog`. **Screens:** T1.

#### IntentEditor
- **Purpose:** an intent with its example sentences and threshold.
- **Props:** `builtIn` (built-ins cannot be renamed or deleted, examples can be extended).
- **Composes:** `Card`, `Textarea`, `Slider`, `Badge`. **Screens:** T2.

#### RuleBuilder
- **Purpose:** defines when a rule fires and what it does.
- **Composes:** `RuleCondition`, `RuleAction`, `Select`, `Button`, `JobProgress` (apply to existing). **Screens:** T3.

#### RuleCondition / RuleAction
- **Purpose:** one condition row ("Keyword contains any of …") / one action row ("Add tag …", "Star").
- **Composes:** `Select`, `Command` (term input with chips), `Switch` (fuzzy). **Screens:** T3.

#### SynonymRow
- **Purpose:** one synonym group mapping several forms to one canonical term.
- **Composes:** `Input` with term chips, `Button`. **Screens:** T4. **RTL:** each term `dir="auto"`.

#### ContactRow
- **Purpose:** one saved contact name for one or more numbers.
- **Composes:** `ContactLabel`, `PhoneNumber`, `Button`. **Screens:** K1.

### 4.8 Settings, providers and admin

#### SettingsSection
- **Purpose:** a titled block of related settings with a description.
- **Composes:** `Card`, `Separator`. **Screens:** S1–S8, A1.

#### ProviderCard
- **Purpose:** one capability (transcription, ask, recording backups, or an instance port) and which provider serves it.
- **Props:** `capability`, `choice="managed" | "own" | "off" | "local"`, `locked` (instance-level env lock), `health`.
- **Composes:** `Card`, `ToggleGroup` (choice), `Select` (provider, model), `MaskedSecret`, `DataFlowNote`, `TestConnectionResult`, `UsageMeter`, `EnvLockedField`.
- **Screens:** S5, A1, W1 (wizard steps 2 and 4 reuse it).
- **States:** managed, own key (configured / not configured), off, testing, test failed, locked by env, "planned" option disabled (Local on-device).

#### MaskedSecret
- **Purpose:** shows that a secret is saved without revealing it.
- **Props:** `prefix`, `last4`, `onReplace`, `onRemove`. **Composes:** `Input` (read-only), `Button`. **Screens:** S4, S5, A1, W1.

#### TestConnectionResult
- **Purpose:** the outcome of a provider or port health check.
- **Props:** `state="idle" | "testing" | "ok" | "failed"`, `detail`. **Composes:** `Button`, text with icon. **Screens:** S5, A1, W1.

#### HealthBadge
- **Purpose:** ongoing health of an instance port (database, storage, providers).
- **Props:** `status="healthy" | "degraded" | "down" | "unknown"`, `latencyMs`. **Composes:** `Badge`. **Screens:** A1.
- **Not to be confused with:** `QueueItemStatus`, `TestConnectionResult` (a one-off check the user ran).

#### UsageMeter
- **Purpose:** use of a limited resource against its limit.
- **Props:** `used`, `limit`, `unit`. Turns warning at 80 %, destructive at 100 %. **Composes:** `Progress`. **Screens:** S2, S4, S5, U2, P1.

#### EnvLockedField
- **Purpose:** a setting whose value is fixed by a server environment variable.
- **Composes:** `Input` (read-only), `server` icon, caption "Set by the server environment". **Screens:** A1, S5 (a hosted instance shows its managed choices as fixed).
- **Note:** deliberately not the lock icon: `lock` always means "encrypted on your device" (2.4).

#### OfflineBlockerList
- **Purpose:** lists every configured setting that would reach the internet, each with its one-click fix.
- **Composes:** `Card`, `Button`. **Screens:** A1, W1 (step 5).

#### ChoiceCard
- **Purpose:** a large radio option with a title, description and optional details.
- **Composes:** `RadioGroup` item. **Screens:** W1, O2, S3.

#### Stepper
- **Purpose:** position in a fixed sequence of steps.
- **Props:** `orientation="horizontal" | "vertical"` (onboarding horizontal, wizard vertical), `steps`, `current`.
- **Screens:** O1–O6, W1, D1. **A11y:** `ol` with `aria-current="step"`. **RTL:** mirrors.

#### TokenRow
- **Purpose:** one personal access token with scopes, expiry and use.
- **Composes:** `Badge`, `Button`, `AlertDialog`. **Screens:** S4.

#### AuditEventRow
- **Purpose:** one audit log entry (actor, action, call id prefix, time).
- **Composes:** `Table` row. **Screens:** S7.

#### CopyableCode
- **Purpose:** a command or config snippet the user copies.
- **Props:** `language`, `code`. **Composes:** `Button`, `pre`. **Screens:** S4, O6, M1, M5. **RTL:** always LTR.

### 4.9 Feedback

#### EmptyState
- **Purpose:** explains why a view is empty and offers the next step.
- **Props:** `reason="first-use" | "no-results" | "filtered" | "feature-off"`, `action`.
- **Composes:** icon circle, text, `Button`. **Screens:** C1, C2, C3, U2, T1–T4, K1, S4, S7.

#### ErrorState
- **Purpose:** explains a failure and how to recover, without content.
- **Props:** `scope="inline" | "panel" | "page"`, `code`, `retry`.
- **Composes:** `Alert`, `Button`. **Screens:** all.

#### StatusBanner
- **Purpose:** a page-wide condition the user should know about while working (offline, import in progress, quota reached, inbox items waiting).
- **Composes:** `Alert`. **Screens:** app shell.

#### Notice (toast)
- **Purpose:** a short confirmation or event that needs no decision (inbox processed, locked, call deleted with undo).
- **Props:** `kind="event" | "undo" | "error"`. **Composes:** `Sonner`. **Screens:** global.

#### ConfirmDialog
- **Purpose:** confirms an irreversible action, naming exactly what will be lost.
- **Composes:** `AlertDialog`. **Screens:** C3, S1, S4, S8, T1.

#### Kbd
- **Purpose:** a keyboard key in hints and the shortcuts dialog. **Screens:** global.

### 4.10 Marketing

#### MarketingHeader / MarketingFooter
- **Purpose:** site navigation and the legal/trust links. **Composes:** `NavigationMenu`, `Button`, language switcher (`Select`). **Screens:** M1–M5.

#### DemoFrame
- **Purpose:** frames the looping product recording with a pause control and a static poster under reduced motion. **Screens:** M1.

#### StepList
- **Purpose:** a numbered sequence of how something works. **Screens:** M1, M5.

#### UseCaseCard
- **Purpose:** one use case with a sample search. **Composes:** `Card`, `FilterBlank` (read-only). **Screens:** M1.

#### LimitsTable
- **Purpose:** the free-tier limits. **Composes:** `Table`. **Screens:** M1, M2.

#### FaqList
- **Purpose:** questions and answers. **Composes:** `Accordion`. **Screens:** M1, M2, M3.

---

## 5. Screen → component map

Screen codes are used in the catalog above and in `screens.md`.

| Code | Screen | Product components |
| --- | --- | --- |
| M1 | Marketing home | MarketingHeader, DemoFrame, StepList, TrustDiagram, DataFlowNote, UseCaseCard, FilterBlank (read-only), CopyableCode, LimitsTable, FaqList, MarketingFooter |
| M2 | Pricing | MarketingHeader, LimitsTable, FaqList, MarketingFooter |
| M3 | Security | MarketingHeader, TrustDiagram, DataFlowNote, CopyableCode, FaqList, MarketingFooter |
| M4 | Login | ErrorState, Notice |
| M5 | MCP / self-host pages | MarketingHeader, StepList, CopyableCode, MarketingFooter |
| O1 | Onboarding: welcome | Stepper, TrustDiagram (compact) |
| O2 | Onboarding: create passkey | Stepper, ChoiceCard, ErrorState |
| O2b | Onboarding: passphrase fallback | Stepper, PassphraseField |
| O3 | Onboarding: recovery code | Stepper, RecoveryCodeGrid |
| O4 | Onboarding: confirm recovery code | Stepper, CodeGroupInput |
| O5 | Onboarding: try it with a sample call | Stepper, SearchBox, ResultLine, CallRow, TranscriptSegment |
| O6 | Onboarding: connect your AI | Stepper, CopyableCode, DataFlowNote |
| G1 | Unlock gate | CodeGroupInput, PassphraseField, ErrorState, Notice |
| C1 | Calls list | AppSidebar, MobileTabBar, MobileTopBar, PageHeader, SearchBox, FilterSentence, FilterBlank, FilterPicker, ResultLine, FoldedFilterSummary, CallRow, DecryptingPlaceholder, EmptyState, ErrorState, StatusBanner |
| C2 | Search results | SearchBox, SearchSuggestion, FilterSentence, FilterBlank, FilterPicker, ResultLine, FoldedFilterSummary, CallRow, SearchSnippet, HitMark, StarToggle, TagChip, EmptyState |
| C3 | Call view | CallHeader, ContactLabel, PhoneNumber, CallDirection, CallMeta, SignatureBadge, StarToggle, TagChip, CallActions, TranscriptSegment, TimestampLink, HitMark, RecordingPlayer, AskPanel, AskMessage, DataFlowNote, NotesEditor, SaveStatus, DecryptingPlaceholder, ConfirmDialog, ErrorState |
| C4 | Ask consent | ConsentSheet, DataFlowNote |
| U1 | Upload: single | FileDropZone, PhoneNumber, CallDirection, DataFlowNote, QueueItemStatus, ErrorState |
| U2 | Upload: bulk | FileDropZone, PreflightSummary, DataFlowNote, UsageMeter, JobProgress, QueueRow, QueueItemStatus, StatusBanner, EmptyState |
| T1 | Tags | TagManagerRow, TagChip, ConfirmDialog, SaveStatus, EmptyState |
| T2 | Intents | IntentEditor, SaveStatus |
| T3 | Rules | RuleBuilder, RuleCondition, RuleAction, TagChip, JobProgress, SaveStatus |
| T4 | Synonyms | SynonymRow, SaveStatus |
| K1 | Contacts | ContactRow, ContactLabel, PhoneNumber, CallRow (compact), FileDropZone (VCF), EmptyState |
| S1 | Settings: security | SettingsSection, UnlockMethodRow, RecoveryCodeGrid, CodeGroupInput, PassphraseField, ConfirmDialog |
| D1 | Device linking dialog | Stepper, DeviceLinkCode, FingerprintCode |
| S2 | Settings: recordings | SettingsSection, UsageMeter |
| S3 | Settings: retention | SettingsSection, ChoiceCard, ConfirmDialog |
| S4 | Settings: API and MCP | SettingsSection, TokenRow, MaskedSecret, CopyableCode, DataFlowNote (inbox), UsageMeter |
| S5 | Settings: providers | SettingsSection, ProviderCard, DataFlowNote, MaskedSecret, TestConnectionResult, UsageMeter |
| S6 | Settings: privacy | SettingsSection (telemetry opt-in, single-key shortcuts) |
| S7 | Settings: audit log | SettingsSection, AuditEventRow, EmptyState |
| S8 | Settings: data | SettingsSection, JobProgress, ConfirmDialog |
| A1 | Admin instance | PageHeader, ProviderCard, HealthBadge, EnvLockedField, MaskedSecret, TestConnectionResult, OfflineBlockerList, UsageMeter |
| A2 | Offline mode (card on A1) | OfflineBlockerList, ConfirmDialog |
| W1 | First-run wizard | Stepper, ChoiceCard, ProviderCard, TestConnectionResult, MaskedSecret, OfflineBlockerList |
| X1 | Keyboard shortcuts dialog | ShortcutsDialog, Kbd |
| X2 | Toasts | Notice |

### Mock coverage

Every mock in `mocks/` marks each product component it renders with a `data-component` attribute. `mocks/index.html` lists the components each mock uses, and the build checks that every `data-component` value is an entry in this catalog.
