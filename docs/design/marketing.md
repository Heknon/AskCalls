# AskCalls marketing site: art direction

Covers `/` (home), `/pricing` and `/security`. Mocks: [`mocks/home.html`](mocks/home.html), [`mocks/pricing.html`](mocks/pricing.html), [`mocks/security.html`](mocks/security.html). Screenshots: `screenshots/{home,pricing,security}--*.png`.

This replaces the visual direction of the R1 home mock (centred hero, small framed demo, card grids, eyebrow labels). Copy keys and content requirements from spec 11.1 and [`screens.md`](screens.md) M1 to M3 still apply, except where section 3 below cuts or rewrites them.

## 1. What makes the reference sites feel premium

Studied on 13 November 2026 at 1440 × 900, scrolling one viewport at a time, with computed styles read from the live DOM (font size, weight, tracking, line height, rendered line width, and the number of visible words in the first viewport). Captures live in the session scratchpad (not committed, they are third-party material): `ref/` (apple, linear, rivian, signal, stripe, tesla) and `ref2/` plus contact sheets `ref2-sheet-<site>.jpg` and `heroes.jpg`. Nothing, Porsche, Rivian and 1Password were partly hidden by cookie walls; Tesla blocks headless browsers; Linear's WebGL hero does not render headless, so its hero numbers come from the DOM.

### 1.1 The numbers

| Site (file) | Hero type | Section heads | Body | Words in first viewport | Ground |
| --- | --- | --- | --- | --- | --- |
| Apple Privacy (`ref2-sheet-apple_com_privacy.jpg`, `heroes.jpg`) | ~80 px, 600, tight | 48 to 56 px, 600 | 17 / 25, 21 / 29 for intros | ~10 visible over the photo | Black, product photo |
| Apple iPhone / Mac (`ref2-sheet-apple_com_iphone-17-pro.jpg`) | 80 px wordmark-style title | 40 px, 600, "Explore the lineup." | 17 / 21, 14 for prices | ~60 (store nav inflates it) | `#F5F5F7` with white tiles |
| Linear (`ref2-sheet-linear_app.jpg`, `ref-sheet-linear_app.jpg`) | 64 px, 510, −1.4 px | 48 px, 510, −1.06 px; 72 px closer | 15 / 24 | ~100 (logos) | `#08090A` |
| Vercel (`ref2-sheet-vercel_com.jpg`) | 64 px, 400, −3.84 px (−6 %) | 56 px, 450, −3.36 px | 24 / 32 testimonials, 14 lists | 32 | `#FAFAFA` |
| 1Password (`ref2-sheet-1password_com.jpg`) | 88 px, 300, −1.76 px | 64 px, 300 | 20 / 30 | 58 | Near-black → blue |
| Stripe (`ref-sheet-stripe_com.jpg`) | 48 px, 300, two-tone sentence | 32 px, 300 two-tone; 56 px closer | 32 / 35 lead | 132 | White + one gradient |
| Raycast (`ref2-sheet-raycast_com.jpg`) | 64 px, 600 | 20 to 32 px, quiet | 18 lead, 16 / 25.6 | 45 | `#07080A` |
| Framer (`ref2-sheet-framer_com.jpg`) | 54 px, 500, −4 % | 44 px, 500, −4 % | 15 to 18 | 49 | Black |
| Arc (`ref2-sheet-arc_net.jpg`) | 76 px serif, 600 | 64 px, 20 px light subheads | 20 / 28.4, 615 px column | 22 | `#0B0B0B` then white |
| Signal (`ref-sheet-signal_org.jpg`) | 60 px, 800 | 40 px, 800 | 20 / 28, 432 to 523 px column | 37 | Flat pastel panels |
| Proton (`ref2-sheet-proton_me.jpg`) | 60 px, 400, −4 % | 36 px, 400 | 16 / 24, 592 px | 56 | White + violet haze |

### 1.2 What actually separates them from a template

1. **One idea per viewport, very few words.** The best first viewports carry 10 to 50 words (Apple Privacy, Arc, Vercel, Framer, Raycast). The R1 home mock carried about 70 words above the fold and about 900 on the page. Stripe is the exception at 132, and it is the one that reads as busiest.
2. **A large type contrast, then quiet.** Hero 64 to 88 px against 15 to 20 px body is a 4× to 5× ratio; section heads sit at 44 to 64 px. Nothing in between competes: there are almost no 20 to 28 px "card titles". The R1 mock had a 40 px hero over 18 px card titles over 14 px body, so everything looked the same weight.
3. **Negative tracking that scales with size.** Vercel −6 %, Framer and Proton −4 %, Linear −2.2 %, 1Password −2 %. At 88 px and above, untracked type looks like a default.
4. **Short measures.** Lead paragraphs run 430 to 620 px wide (Signal 432, Proton 592, Arc 615). Lines of 45 to 70 characters. Nothing spans the 1120 px container except the product.
5. **The product is shown big, real and cropped.** Linear and Framer show the actual app at 1200 px wide, bleeding past the fold or the viewport edge, dimmed at the edges with a gradient (`ref2-sheet-framer_com.jpg` rows 1 and 2, `ref2-sheet-linear_app.jpg` row 2). Apple crops the device so it runs off the frame. Nobody puts a 900 px screenshot in a rounded box with three grey dots in the middle of white space, which is what the R1 hero did.
6. **Restraint in colour.** Every site uses one accent at most, often only on the primary button (Vercel: none at all; Linear: none in the hero). Colour comes from the product UI or photography, not from tinted icon tiles. Proton's pastel tiles and Signal's flat lilac panels are the weakest pages in the set, and they look closest to the R1 mock.
7. **Structure by hairlines and grid, not boxes.** Linear separates its "FIG 0.1 / 0.2 / 0.3" columns with 1 px rules and no backgrounds. Vercel and Apple's comparison table use rules and alignment. Cards with borders, radius, shadow and an icon (Signal's feature tiles, Apple's store tiles) feel like retail, not product.
8. **Rhythm by ground changes.** Arc goes black → white; Apple Privacy stays black with full-bleed sections; Stripe uses white with one gradient moment. A change of ground marks a chapter, which removes the need for eyebrow labels.
9. **Motion is about the product, not decoration.** Linear's composer types `@Linear create issues and assign to me` with a live caret; Raycast's Quick AI lists suggestions as you watch; Framer's chat box glows. Motion shows the product working once, then rests.
10. **Privacy brands prove instead of promise.** Apple Privacy uses a hard comparison table (Safari vs Chrome, green checks and red crosses) and names mechanisms ("Private Cloud Compute", "On-device processing"). 1Password shows its admin console with real numbers. Signal and Proton mostly assert ("No ads. No trackers. No kidding.", "Securely.", "Privately.") and are less convincing for it. The convincing pattern is: name the mechanism, show the artefact, give the number.
11. **Navigation recedes.** 12 to 14 px links, no heavy bar, one filled button (Linear's white pill, Vercel's black "Sign Up").

## 2. The AskCalls direction

### 2.1 Idea

**The transcript is the hero and the encryption is visible.** The page shows the product doing the one thing nobody else can claim: you type a question, and real call text resolves out of ciphertext, on your device, in front of you. The same visual (scrambled bytes turning into a sentence) carries the privacy argument further down, where the sentence stops at a line and only bytes cross it.

### 2.2 Ground and colour

- **Dark hero, light body, dark privacy chapter, light again, dark footer.** The hero ground is `#070B0C` (the dark canvas `#0E1213` taken one step deeper, still teal-neutral) with a single soft teal radial light behind the product, 8 % opacity. In the dark theme the body uses the app's dark canvas `#0E1213`; the chapters are then marked by hairlines and the slightly deeper `#070B0C` band.
- **Harbor teal is used three times per screen at most:** the Start free button, the search caret and match underline, and the "boundary" line in the privacy diagram. No teal icon tiles, no teal section labels, no tinted cards.
- Search hits use the app's `mark` yellow at low opacity in dark (`#5B4A0E`) and `#FDE68A` in light, exactly as the app does, so the marketing UI is the real UI.

### 2.3 Type

IBM Plex Sans and Plex Sans Hebrew, Plex Mono for bytes and code. Weights stay within the shipped 400, 500 and 600.

| Role | Desktop | Mobile | Weight / tracking |
| --- | --- | --- | --- |
| Hero H1 | 112 px / 0.95 | `clamp(3rem, 13vw, 7rem)`, 52 px at 390 | 500, −0.045 em (Hebrew 0) |
| Chapter title | 72 px / 1.0 | 40 px | 500, −0.035 em |
| Statement (two-tone) | 44 px / 1.15 | 28 px | 400, −0.02 em, second clause in muted |
| Big numeral | 96 px | 56 px | 400, −0.04 em, tabular |
| Lead | 21 px / 1.5, max 560 px | 18 px | 400 |
| Body | 16 px / 1.6, max 600 px | 16 px | 400 |
| Mono detail | 13 px / 1.5 | 12 px | 400, 0 |
| Nav and labels | 14 px | 15 px | 400 / 500 |

The ratio from hero to body is 7 : 1. There is no 18 to 24 px "card title" level on the home page.

### 2.4 Hero visual: a live encrypted search

- Under the headline sits a **monumental search field**, 1200 px wide and 88 px tall on desktop, the real `SearchBar` scaled up, cropped by the viewport bottom so the results run under the fold.
- The query types itself: `people interested in buying` (Hebrew: `מתעניינים לקנות`), with a teal caret. The Meaning toggle switches on.
- Three result rows appear. Each starts as a line of Plex Mono ciphertext (hex and base64 glyphs, dim) and **resolves left to right into the real snippet** (Hebrew rows resolve right to left), with the matched phrase highlighted. One row is Hebrew in the English page and vice versa, because the product is bilingual by nature.
- A small mono status at the row end: `decrypted on this device · 41 ms`.
- The row shows the contact, the date and duration, as in the app's `CallRow`. No browser chrome, no traffic-light dots.
- Loop: type (1.6 s), resolve (1.2 s), hold (4 s), clear and restart with a second query (`who asked about the delivery date`). CSS keyframes drive the reveal; a few lines of JS only swap the text between loops.
- `prefers-reduced-motion`: the final state is rendered statically, no typing, no scramble; the pause control is hidden.
- This stands in for the spec's recorded Playwright video in the mock. The production page can ship either this HTML/CSS demo (lighter, crisper, localised for free) or the recording. I recommend the HTML demo: it is 0 KB of video, sharp at any DPR, and translated by the message files.

### 2.5 Showing the product

- After the hero, a **call view crop at full container width** (1200 px), the real transcript column with speaker turns and an Ask panel answering "What price did I quote?" with a timestamp citation. It is cropped at the end edge so it reads as a window into a larger app, as Apple crops a device.
- The AI section shows a **terminal and an MCP conversation at large scale** (Plex Mono 15 px in a 680 px block), not two small code chips.
- No device mockups, no stock photography, no illustrations. The UI is the image.

### 2.6 Section rhythm (home)

One idea per viewport, 160 px between chapters on desktop (96 px mobile), each opening with a large title and no eyebrow label.

1. **Hero** (dark): wordmark nav, H1, subline, Start free + "Source on GitHub", the live search.
2. **How it works** as three lines of type on hairlines: "Upload a year of calls." / "Find one by who, what, or what they meant." / "Ask it what was promised." Each line has a one-sentence mono annotation on the end side. Then the call view crop.
3. **Privacy proof** (dark band): the boundary diagram (2.7), the three exceptions as a ruled table, the leak-test numeral, four proof links.
4. **Use cases** as four example searches set at 32 px in search-field style rows, with the role on the end side and the number of results. They read like things you would type, not marketing cards.
5. **Works with your AI**: title and two lines on the start side, the terminal/conversation block on the end side.
6. **Pricing**: "Free during beta." and five big numerals on one ruled line.
7. **FAQ**: title on the start side, accordion with hairlines on the end side (two-column on desktop).
8. **Closer + footer** (dark): "Ask your calls anything." at chapter size with the one button, then a compact four-column footer on hairlines.

### 2.7 Privacy proof as one diagram

A single wide figure with two zones split by a vertical teal line labelled **"Encrypted here"**:

- **Start zone, "Your device":** a real transcript line in 22 px text, a contact name, a phone number, a tag name, all readable.
- **The line.** Plaintext stops at it; the line is the only teal on the band.
- **End zone, "What our server stores":** the same items as they really exist on the server, in Plex Mono: the AES-GCM envelope as hex (`01 · 9f3c…`), the 64-bit HMAC tokens as signed integers (`-4417203365117839012`), the day and a duration bucket. Columns are labelled with the field names from the schema (`transcriptCt`, `tokens`, `day`, `durationBucket`).
- On mobile the line turns horizontal and the zones stack, so the line still separates them.

Under it, "Where plaintext does go, only when you ask" becomes a three-row table (route, what is sent, to whom, retention), set on hairlines. Then the leak test as a big numeral: **0** "seeded words and numbers found in a full dump of our database and bucket, on every change." Then the four proof links in one row. This is the only place on the home page that discusses encryption; `/security` expands it.

### 2.8 Motion plan

- The decrypt wipe, row entrances, caret and diagram shimmer are CSS (a registered `--p` custom property animated with keyframes). In the mock, a few lines of JS type the query, swap the two demo queries and rescramble the ciphertext glyphs every 70 ms during the wipe; production can keep that or move typing to CSS `steps()`.
- Hero: typing with `steps()`, scramble-to-text with a `clip-path` wipe over a mono ciphertext layer, 1.2 s, `cubic-bezier(.2,0,0,1)`.
- On scroll: none in the mock. In production, section titles may fade up 12 px once, 400 ms, via `animation-timeline: view()` where supported, never on body text.
- Privacy diagram: the ciphertext column has a slow, 8 s shimmer of one byte group at a time; static under reduced motion.
- `prefers-reduced-motion: reduce` removes all of it and shows end states.

### 2.9 Hebrew and RTL

- The layout mirrors with logical properties. Display sizes stay identical; Plex Sans Hebrew has no negative tracking and line height opens to 1.05 for the H1 so the ascenders of ל do not collide.
- Hebrew headline: "לשאול את השיחות שלך כל דבר." at the same 112 px. It is shorter than the English, so it wraps to two lines at the same width; this was checked.
- The demo types a Hebrew query and resolves Hebrew snippets right to left; the ciphertext, numbers, phone numbers and code stay LTR inside `<bdi>`.
- The privacy diagram mirrors: device on the right, server on the left, the line still in the middle.

### 2.10 Cut list (vs the R1 home mock)

- All eyebrow labels: "How it works", "Privacy you can check", "Use cases", "Works with your AI", "Pricing", "FAQ".
- The three numbered step cards and their 30-word bodies. Replaced by three lines of type. "Duplicates are skipped so nothing is transcribed twice" moves to the annotation.
- The three trust-diagram cards with icons and bullet lists, the arrow glyphs between them, and the three grey `DataFlowNote` boxes. Replaced by one diagram and one table.
- The four use-case cards with icon tiles and coloured token chips. Replaced by four typed searches.
- The client-name chip row (Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Codex CLI). Replaced by one line of text.
- The five bordered limit tiles. Replaced by five numerals on one rule.
- Fine print under the hero ("Free during beta. Open source under MIT. Self-host it if you prefer.") moves into the closer and the pricing chapter; the hero keeps only the subline.
- "View the source on GitHub" becomes "Source on GitHub".
- The framed browser demo with grey dots.
- Copy: "For people whose work happens on the phone." stays as the use-case title; "Upload calls, find any of them in seconds, ask about the one you need." is replaced by the three lines in 2.6.

## 3. Build notes and review

### 3.1 Mocks

| Mock | What it shows |
| --- | --- |
| [`home.html`](mocks/home.html) | Hero with the live encrypted search, three lines + call view crop, the boundary diagram with the exceptions table and the leak-test numeral, four typed searches, the agent screen, five limits, FAQ, closer, footer |
| [`pricing.html`](mocks/pricing.html) | "Free during beta." hero, the six limits as a spec sheet with 112 px numerals, What counts, the at-limit statement with a full meter, a self-host band with `docker compose up`, three pricing questions |
| [`security.html`](mocks/security.html) | "We can't read your calls." hero over the same boundary diagram, then a 760 px reading column with a sticky table of contents: stores / never sees, the three plaintext routes with provider retention terms, the key hierarchy as a diagram, unlock methods, device linking with the 6-digit fingerprint, verifying served assets, the leak test, threat model and reporting |

Review convention as in the other mocks: toggles in the bottom corner, or `?theme=light|dark&lang=en|he&shot=1`. `home.html` also takes `&demo=mid` to freeze the hero mid-decrypt. Under `shot=1` and `prefers-reduced-motion` the demo renders its end state. The dark chapters (`.ink`) stay dark in both themes; the theme toggle changes the light chapters only.

`pricing.html` and `security.html` reuse the home page's tokens, header, footer, FAQ and diagram CSS verbatim; if those change in `home.html`, copy them across.

### 3.2 Screenshots

`screenshots/<page>--<desktop|mobile>-<light|dark>-<en|he>.png` is the first viewport at 2×. `…-full.png` is the full page at 1×. `…-NN.png` are the following viewports while scrolling (desktop light English for all three pages, plus desktop dark Hebrew for home). `home--desktop-dark-en-decrypting.png` and `home--mobile-dark-he-decrypting.png` freeze the hero mid-decrypt. All PNGs are palette-quantised to stay under 500 KB.

Unlike the R1 set, the `home--*.png` base files are now the first viewport, not the full page; the full page is the `-full` file. The index in `README.md` should say so when it is next edited.

The ones that best show the direction:

- `home--desktop-light-en.png`: the hero
- `home--desktop-dark-en-decrypting.png`: the decrypt wipe in progress
- `home--desktop-light-en-02.png`: the call view crop
- `home--desktop-light-en-03.png`: the boundary diagram
- `home--desktop-light-en-06.png`: the agent screen
- `home--desktop-dark-he.png`: the hero in Hebrew
- `home--mobile-light-en.png`, `home--mobile-dark-he-decrypting.png`: the phone hero
- `pricing--desktop-light-en-01.png`: the limits sheet
- `security--desktop-light-en-03.png`: the key hierarchy

### 3.3 What the review passes changed

Each pass was screenshotted and compared against the reference contact sheets.

1. **First build.** Hebrew result rows aligned to the end of a 1000 px box and floated mid-row: snippets now align to the UI direction, as in the app. The privacy title ran to three lines at 48 px: cut to "Your device encrypts. Our server keeps only what it can't read." Diagram rows were 132 px and spilled past one viewport: 112 px, with a node on the line for each row so the eye reads across.
2. **Phone.** The hidden `<br>` glued "callsanything." together; the H1 went from 52 to 64 px on a 390 px screen so it reads as a statement in three lines; status lines wrapped into four rows and now keep one ("decrypted on this device · 31 ms"); the diagram's line labels moved onto the horizontal line.
3. **Pricing and security.** "The limits." under "Free during beta." said the same thing twice: removed, the sheet now starts under a one-line caption. The security hero left the right half of the screen empty: the lead moved to the end column under the headline.
4. **Agent chapter.** Text-left / terminal-right looked like every developer-tool page. Rebuilt as one dark screen: the question at 34 px, the tool call in mono on hairlines, the answer at 21 px, setup commands in a side panel.
5. **Hebrew hero.** "לשאול את השיחות" is wider than "Ask your calls" and collided with the subline. The subline block now sits beside the second line only, which works in both languages. Headings use `text-wrap: balance` so the Hebrew closer no longer leaves "דבר." alone on a line.
6. **Decrypt frame.** The ciphertext layer spanned the full row while a Hebrew snippet in the English UI was shorter, so bytes showed next to text. The encrypted layer now hugs the text box.

### 3.4 Open points

- The waveform mark next to the wordmark is still a placeholder (README open question 3).
- Spec 11.1 asks for a recorded Playwright video in the hero. Section 2.4 recommends the HTML demo instead; the owner should confirm.
- The 9,400 call, the names, numbers and ciphertext are illustrative. The production diagram should be generated from a real seeded call by the leak-test fixture, so the bytes on the page are real bytes.
