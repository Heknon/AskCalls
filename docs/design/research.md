# AskCalls design research

What we studied, what we took from it, and the decision it drives. Research done in November 2026. Where a source is a vendor blog or forum rather than official documentation, it is marked as secondary. Decisions are numbered (D1, D2, ...) and referenced from `design-system.md` and `screens.md`.

Contents

1. Search with filter chips and tokenized query bars
2. Encrypted-app trust, lock and unlock
3. Passkeys, recovery codes and device linking
4. Transcript and call review
5. AI chat about one document, with consent
6. Bulk upload and job queues
7. Provider settings cards in AI tools
8. Self-host setup wizards and admin pages
9. RTL, bidi and fonts
10. Accessibility, virtualized lists and keyboard use
11. Privacy-first marketing sites
12. Implementation platform (Tailwind v4, shadcn/ui)

---

## 1. Search with filter chips and tokenized query bars

### Sources

- Linear filters: https://linear.app/docs/filters
- GitHub code search syntax: https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax and the new code search announcement https://github.blog/changelog/2022-11-09-introducing-an-all-new-code-search-and-code-browsing-experience
- Gmail search chips: https://techcrunch.com/2022/07/28/gmail-rolls-out-its-latest-material-you-redesign-and-search-improvements-to-all-users/ , https://betanews.com/2020/05/13/google-rolls-out-gmail-search-chips , Material 2 chips https://m2.material.io/components/chips
- Slack search filters and modifiers: https://slack.com/blog/productivity/shrinking-the-haystack-how-to-narrow-search-results-in-slack , https://zapier.com/blog/updates/1679/slack-new-search-ui
- Notion search filters: https://www.notion.com/help/search
- Raycast search bar: https://raycast.com/blog/a-fresh-look-and-feel , https://manual.raycast.com/search-bar
- Superhuman command palette and shortcuts: https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/ , https://help.superhuman.com/article/478-superhuman-command
- Algolia debouncing, highlighting and typo tolerance: https://www.algolia.com/doc/ui-libraries/autocomplete/guides/debouncing-sources , https://www.algolia.com/blog/ux/what-are-predictive-search-and-autocomplete , https://www.algolia.com/doc/guides/managing-results/optimize-search-results/typo-tolerance
- Filter chip guidance (eBay Playbook, Visa): https://playbook.ebay.com/design-system/components/filter-chip , https://design.visa.com/patterns/filters
- Material 3 search (secondary mirrors of the Android docs): https://github.com/material-components/material-components-android/blob/1.9.0/docs/components/Search.md

### Observations

- **Linear** treats each filter as a small formula: property, operator, value. Clicking the operator switches it ("is" / "is not"); clicking the value reopens the picker. `F` opens the filter menu and typing a property value (a label name, a team) jumps straight to it. Filters live in the URL so a filtered view is shareable.
- **GitHub** keeps a text-first query language (`repo:`, `language:`, `NOT`, `OR`) and adds autocomplete for qualifiers inside the input. Power users type; everyone else picks from suggestions. The text and the structured filter are the same thing.
- **Gmail** added chips under the search bar specifically so people would not need to learn operators ("From", "Any time", "Has attachment"), later turning each chip into a dropdown. Chips that hold a value show it ("From: Dana").
- **Slack** keeps typed modifiers (`from:`, `in:`, `before:`) and clickable filters that mirror them one to one. Both routes produce the same filter state.
- **Notion** offers a small, fixed set of filters (title only, created by, date with presets Today / Last 7 days / Last 30 days plus a calendar range). Date presets cover most needs.
- **Raycast** puts the search bar at the centre of everything, shows the shortcut next to every action, and lets the user type to filter inside every dropdown. The same pattern repeats everywhere, so it is learned once.
- **Superhuman**: every action is reachable three ways (UI element, shortcut, command) and the palette teaches the shortcut by showing it beside the command. `/` focuses search.
- **Algolia** recommends tuning the debounce to the audience's typing speed, always highlighting the attributes that matched, and ranking exact matches above one-typo matches above two-typo matches. Typo tolerance is up to two edits per word.
- **eBay / Visa** guidance: filter chips filter content, they are not text input; keep one row; always offer "clear all".
- **Material 3**: on compact screens search expands to a full-screen view with suggestions; on large screens a docked dropdown. Show results as soon as the user starts typing.

### Decisions

> **Revised (owner directive):** D1, D3 and D7 are replaced by the owner's `ListFilters` pattern from their other product: one search box that suggests filter values and records as you type (max 6, identifiers put records first, group names open pickers), the filters written as a sentence of underlined blanks that open short chip pickers (popover on desktop, bottom sheet on phones), a result line with the sort, and a folded one-line summary on phones. It keeps what the research valued (discoverable filters without operators, as in Gmail and Slack; type-to-filter pickers, as in Raycast and Linear; one row of state, as eBay advises) while reading as plain language in both directions. Per-option counts from the reference are dropped: the server can't count over encrypted names. D2, D4, D5 and D6 still apply. See `design-language.md` 4.3 and `screens.md` C2.

- **D1. One bar, two layers.** The query bar holds free text plus removable filter tokens ("Intent  Purchase interest ×"). Directly below it sits a single row of filter chips: Contact, Tag, Intent, Starred, Date, Direction, and a Meaning switch. A chip with a value is filled (primary-subtle) and its token appears in the bar; removing either removes both. This follows Gmail and Slack: chips for discovery, tokens for state.
- **D2. Typed qualifiers are optional accelerators.** Typing `contact:`, `tag:`, `intent:`, `date:` or `is:starred` opens the matching picker inline (GitHub, Slack). They are never required and are listed in the shortcuts dialog.
- **D3. Pickers use Command (cmdk).** Every chip opens a Popover containing a type-to-filter Command list (Raycast, Linear). Date offers presets (Today, Last 7 days, Last 30 days, This year) and a range calendar (Notion).
- **D4. 250 ms debounce, no spinner flash.** Results update 250 ms after the last keystroke (spec). The previous results stay visible, dimmed to 60 % opacity only if the new request takes longer than 400 ms. No layout shift.
- **D5. "Also matched" is visible and editable.** Under the bar: "18 calls · Also matched: מחירים, המחיר, price ×". Each variant is a dashed pill that can be excluded with one click. This makes fuzzy expansion honest and correctable, which matters more here than in Algolia because the user cannot see the server's view of the data.
- **D6. Highlight what matched, in place.** Matched words get the `mark` colour in snippets and in the transcript, including fuzzy variants. We use direct highlighting, not Algolia's inverted style, because users scan results for the word they searched.
- **D7. Mobile:** the bar holds only text; active filters show as filled chips at the front of a horizontally scrolling chip row, with their values ("Intent: Purchase interest"). Chips never wrap to a second row (eBay).

---

## 2. Encrypted-app trust, lock and unlock

### Sources

- 1Password lock screen engineering post: https://1password.com/blog/lock-screen-swiftui-ios-app ; unlock UX discussions: https://1password.community/discussion/comment/427848 (secondary, forum); 1Password security page: https://1password.com/security
- Bitwarden vault timeout (lock vs log out): https://bitwarden.com/help/vault-timeout ; locked-state discussion: https://community.bitwarden.com/t/still-confused-about-lock-vs-log-in-options-in-the-vault-timeout-action/64968 and https://community.bitwarden.com/t/simplify-clarify-the-browser-context-menu-in-locked-state/77107 (secondary)
- Proton login and mailbox passwords: https://proton.me/blog/login-mailbox-passwords-explained ; Proton Drive: https://proton.me/drive
- Standard Notes protections (app listing): https://apps.apple.com/us/app/standard-notes/id1285392450 and AppleVis accessibility report https://www.applevis.com/comment/208716 (secondary)
- Tuta zero-knowledge and recovery code: https://tuta.com/blog/zero-knowledge-architecture , https://tuta.com/encryption , https://tuta.com/blog/secure-password-reset
- Signal: https://signal.org/

### Observations

- **Bitwarden** separates three states clearly: logged out (data and keys purged), locked (encrypted data kept, keys gone), unlocked. Lock is the everyday state; unlock needs only the local method (password, PIN, biometrics, passkey). Users still get confused by the words, so the UI must say what each state means.
- **1Password** builds its lock screen from very little: logo, account, one field. Forum threads show the pain point is *partial* lock: people did not notice that some accounts were still locked until a green check per account was added. Lesson: show lock state explicitly and persistently, not only at the gate. 1Password also refuses inline unlock in spoofable surfaces; unlock happens only in its own UI.
- **Proton** explains its two-password model in a dedicated article: one password authenticates, the second "unlocks and decrypts your encrypted messages locally". The distinction between signing in and unlocking is the core concept users must grasp.
- **Standard Notes**: passcode and biometric protections exist; an accessibility report notes modals not getting focus. Focus management on lock and unlock is easy to get wrong.
- **Tuta** states plainly that it cannot access data because it never has the keys, and also documents the exceptions (calendar notifications by email are not zero-knowledge). Naming the exceptions is what makes the claim credible.
- **Bitwarden** forum: after lock, the extension icon shows a small padlock. Users asked for the same signal everywhere (tray icon, context menu). A lock state that only shows in one place is missed.

### Decisions

- **D8. Sign in and unlock are two named steps.** Copy always says "Sign in" for the account and "Unlock" for the keys. The unlock gate states who is signed in and offers "Sign out" separately (Proton, Bitwarden).
- **D9. Persistent lock control.** The sidebar footer always has a compact "Lock" button (tooltip "Locks after 15 min idle", shortcut Shift+L); its presence is the unlocked signal. On mobile the lock button sits in the top bar. Locking is one click, never buried in a menu.
- **D10. Locked placeholders, never fake content.** Rows whose metadata is still being decrypted show a skeleton plus a small lock icon labelled "Decrypting" for screen readers, with no visible caption (owner copy rule, design-language 2.6). After lock, the app replaces every decrypted view with the gate; nothing decrypted stays in the DOM (spec 6.8).
- **D11. Unlock happens only on the gate screen,** never in a popover or inline field (1Password anti-spoofing). The gate is a full page with focus placed on the primary button.
- **D12. Name the exceptions.** Wherever we say "we can't read your calls", the next sentence (or the linked page) lists where plaintext does go: the transcription provider for audio, the LLM provider when you ask, and the server in transit for inbox uploads (Tuta's honesty pattern).

---

## 3. Passkeys, recovery codes and device linking

### Sources

- passkeys.dev bootstrapping and UX: https://passkeys.dev/docs/use-cases/bootstrapping/
- FIDO Alliance UX guidelines: https://fidoalliance.org/ux-guidelines-for-passkey-creation-and-sign-ins/ and passkey management patterns https://fidoalliance.org/design-guidelines/patterns/passkey-management-ui-best-practices-for-combining-all-passkey-types/
- Google: Communicating passkeys https://developers.google.com/identity/passkeys/ux/communicating-passkeys , User journeys https://developers.google.com/identity/passkeys/ux/user-journeys , UI design https://developers.google.com/identity/passkeys/ux/user-interface-design , Google account case study https://web.dev/articles/passkey-google-ux , management https://web.dev/articles/passkey-management
- Apple HIG managing accounts: https://developer.apple.com/design/human-interface-guidelines/managing-accounts and WWDC22 "Meet passkeys" https://developer.apple.com/videos/play/wwdc2022/10092/
- PRF support status (secondary, vendor): https://www.corbado.com/blog/passkeys-prf-webauthn ; risk of using PRF as the only encryption root: https://lilting.ch/en/articles/passkeys-prf-extension-encryption-risk
- Recovery-phrase verification (secondary): https://bitcoin.design/guide/daily-spending-wallet/first-use/ , https://www.chainscorelabs.com/guides/web3-ux-account-abstraction-on-off-ramps-etc/key-management-ux/how-to-design-a-user-centric-seed-phrase-backup-experience
- 1Password Emergency Kit: https://support.1password.com/emergency-kit/ , Secret Key: https://support.1password.com/secret-key/
- Tuta recovery code: https://tuta.com/blog/secure-password-reset
- Signal safety numbers: https://support.signal.org/hc/articles/360007060632 ; WhatsApp linked devices and companion verification (secondary press): https://wabetainfo.com/whatsapp-protects-users-from-a-common-device-linking-scam/ ; device-linking protocol research: https://spies.engr.tamu.edu/wp-content/uploads/sites/239/2025/04/On-the-Security-of-E2EE-Device-Linking-Protocols.pdf

### Observations

- **Google and FIDO** recommend a full explanatory step (a "hero" screen) before the OS dialog rather than a bare "Create passkey" button, a status message after it closes, and keeping explanation visible rather than in tooltips. Use the word "passkey", lowercase in running text, and connect it to familiar things: "your fingerprint, face or screen lock".
- **Apple** calls "passkey" a generic lowercase noun and warns that people may confuse it with their device passcode, so copy should say what it is.
- **Google's passkey list** shows the provider (iCloud Keychain, Google Password Manager, Windows Hello), created date, last used and the OS it was last used on. Revoking uses an "×", not a trash icon, because it does not delete the credential from the user's password manager.
- **PRF** is broadly available in 2026 for platform passkeys (iCloud Keychain, Google Password Manager, Windows Hello in recent browsers) but third-party password-manager extensions are inconsistent. Experts warn that a deleted passkey can take the data with it if PRF is the only root. This confirms the spec's insistence on a mandatory recovery code and a passphrase fallback.
- **Recovery codes**: Tuta shows a code that is "like your password" and lets you view it again only after re-authenticating; most failed recoveries are mistyped codes. 1Password's Emergency Kit is a printable PDF with a fill-in area, stored offline. Wallet onboarding guidance converges on: show the code in a numbered grid, offer save/print, then verify a random subset (two or three groups), and block completion until verified.
- **Device linking**: Signal reduces verification to one comparison of a number or one QR scan. WhatsApp's linking is the target of "GhostPairing" scams where victims type a code that authorises an attacker; the defence is that the trusted device must initiate, show what is being linked, and require an explicit comparison. Research recommends a short authentication string shown on both devices.

### Decisions

- **D13. Passkey step is an explanation screen first.** Heading "Create a passkey to protect your calls", two short lines on what a passkey is ("your fingerprint, face or screen lock") and why ("it unlocks your encryption keys on this device"), primary "Create passkey", secondary "Use a passphrase instead". A success state "Passkey created" follows the OS dialog. If PRF is not available, the screen says so in plain words and offers the passphrase path.
- **D14. Recovery code display.** 8 groups of 4 characters in Plex Mono, numbered 1 to 8 in a 4 × 2 grid (2 × 4 on mobile), each group an LTR island. Actions: Download (.txt named `AskCalls recovery code.txt`), Print (a print stylesheet with the code, the account email, the date and blank lines to note where it is kept), Copy. A required checkbox "I saved my recovery code somewhere safe" enables Continue.
- **D15. Confirm by retyping two random groups** (spec 6.2): "Type group 3 and group 6". Inputs auto-uppercase, ignore spaces and dashes, and accept the confusable pairs O/0 and I/1 only in the sense of showing "Check this character" inline, never silently. "Back to the code" is always available.
- **D16. Passkey list follows Google's pattern:** provider and device name, created date, last used, and a "Remove" action with a confirm dialog that warns when removing the last passkey.
- **D17. Device linking is initiated on the trusted device and verified by a 6-digit fingerprint shown on both sides** (spec 6.5). Copy on the trusted device: "Does the new device show 482 913?" with "They match, link this device" and "They don't match". The QR and short code expire in 10 minutes with a visible countdown. A warning line: "Only link a device you are holding. AskCalls will never ask you for this code."

---

## 4. Transcript and call review

### Sources

- Otter (secondary, app listing and guides): https://apps.apple.com/us/app/otter-ai-voice-notes/id1276437113 , https://zapier.com/blog/otter-ai/
- Descript speaker labels: https://medium.com/descript/speaker-detective-ai-powered-speaker-labels-6427e159724f , changelog https://feedback.descript.com/changelog/release-round-upjune-11th-2026
- Gong call page: https://help.gong.io/docs/review-what-happened-in-a-call , https://help.gong.io/docs/explore-call-content
- Fireflies Notepad and AskFred: https://guide.fireflies.ai/articles/6653885315-learn-about-the-fireflies-notepad , https://guide.fireflies.ai/articles/6556345325
- Grain clips and timeline: https://support.grain.com/en/articles/5729145-create-highlights , https://grain.com/blog/grain-meetings
- Apple Live Voicemail (secondary reviews): https://appleinsider.com/inside/ios-17/tips/how-to-use-live-voicemail-in-ios-17
- Rev transcript editor: https://support.rev.com/hc/en-us/articles/29824992702989-Transcription-Editor

### Observations

- **Otter** highlights each word as it plays and lets you tap any word to seek; speakers are paragraphs with renameable labels, and renaming relabels the whole transcript.
- **Descript** asks for the number of speakers up front to improve labels and lets you drag a label boundary.
- **Gong** puts a search box at the top of the transcript panel and highlights matching lines; a timeline below the player marks topics and "points of interest" so you can jump. An AI panel answers questions about the call with citations.
- **Fireflies** uses two panels: summary and notes on one side, transcript on the other; AskFred opens next to the transcript and the panel can collapse.
- **Grain** lets you click the timeline to auto-scroll the transcript, and draws markers on the timeline where highlights are.
- **Apple voicemail** shows the transcript and the audio together with a single play control; the transcript is the primary object, audio secondary.
- **Rev** lets users turn word-click seeking and word highlighting on and off.

### Decisions

- **D18. Transcript is the primary object, the player is secondary** (Apple). The call view leads with the transcript in a 720 px reading column. The player docks at the bottom of that column and only appears when a recording backup exists.
- **D19. Segment-level click-to-seek** (Otter, Rev). Each segment's timestamp is a button; clicking it seeks and plays. The playing segment gets a subtle background and a start-edge bar; auto-scroll follows playback until the user scrolls by hand, then a "Back to playback" pill appears. Word-level highlighting is out of R1 because our providers return segment timing reliably and word timing inconsistently.
- **D20. Speaker labels as a column, not inline.** Speaker name sits at the start edge above or beside each turn ("Dana Levi", "You"), consecutive segments from the same speaker are grouped. Speaker names come from the contact name and "You" by default; renaming a speaker applies to the call.
- **D21. Search hits mark the timeline.** When the call is opened from a search, hits are highlighted in the text and drawn as ticks on the player's progress bar (Gong, Grain). `n` / `Shift+n` jump to the next or previous hit, with "Hit 2 of 5" shown in the call toolbar.
- **D22. Side panel with Ask and Notes tabs** (Fireflies) at 380 px on the end side, collapsible. On mobile it becomes a bottom sheet (Drawer).

---

## 5. AI chat about one document, with consent

### Sources

- Granola chat and privacy: https://docs.granola.ai/help-center/getting-more-from-your-notes/chatting-with-your-meetings , https://granola.ai/security , teardown https://aiuxplayground.com/teardowns/granola/meeting-notes (secondary)
- Notion AI security practices: https://www.notion.com/help/notion-ai-security-practices
- Gong "Ask anything about a call": https://help.gong.io/docs/guide-review-a-call-with-gong-ai
- Arc "Ask on Page" (secondary): https://allthings.how/arcs-ai-search-ask-on-page-lets-you-ask-questions-to-any-pages-content/ , removal noted at https://www.issoh.co.jp/md/column/2265
- ChatGPT Atlas sidebar: https://help.openai.com/en/articles/12628199-chatgpt-atlas
- Fireflies AskFred: https://guide.fireflies.ai/articles/6556345325

### Observations

- **Granola** scopes chat explicitly (one meeting, all notes, a folder) and answers link back to the transcript so every claim can be checked. The panel is restrained.
- **Notion** discloses its AI subprocessors on a separate page and states retention per plan (zero retention on Enterprise, up to 30 days otherwise). The disclosure exists but is not shown at the moment of use.
- **Arc's Ask on Page** sent page content to Anthropic while other features used OpenAI, and few users knew which. A per-feature provider name at the point of use was missing.
- **Gong** answers with citations into the call.

### Decisions

- **D23. Consent sheet names the provider, the model, what is sent and the retention terms, at the moment of first use per session** (spec). Title "Send this call to Anthropic?". Body: "To answer, AskCalls sends this call's transcript and your question to Anthropic (Claude Sonnet) through AskCalls servers. It is not stored by AskCalls. Anthropic processes it under a zero-retention agreement." Buttons "Send and ask" / "Cancel". A checkbox "Don't ask again until I lock" (session scope, never permanent). Wording changes per provider choice (own key: "from your device straight to Anthropic under your account").
- **D24. Provider line stays visible under the Ask input** ("Claude Sonnet via AskCalls · sends this call when you ask"), so consent is not a one-time event users forget.
- **D25. Answers cite timestamps** (Granola, Gong): `[00:48]` renders as a chip that seeks the player and scrolls the transcript.
- **D26. The scope is always one call.** Placeholder: "Ask about this call". No cross-call chat in R1, which also keeps the plaintext sent to the LLM to one call per request (security rule 2).

---

## 6. Bulk upload and job queues

### Sources

- Upload UI patterns (secondary, Filestack): https://blog.filestack.com/bulk-upload-ui-queues-partial-success/ , https://blog.filestack.com/upload-file-ui-design-components-states-and-errors/
- Uppy dashboard pause/resume per file: https://uppy.io/blog/2016/08/0.9.0/
- OCLC Upload Manager queue states: https://help.oclc.org/Metadata_Services/CONTENTdm/Project_Client/Upload_items_to_a_collection/Use_the_Upload_Manager
- Frame.io upload pause semantics: https://next.developer.frame.io/camera-to-cloud/how-to-advanced-uploads
- Linear Jira importer and migration guide: https://linear.app/docs/jira-to-linear , https://linear.app/switch/migration-guide
- Google Drive Android upload pause (secondary, old): https://kiwix.lema.org/wikihow_en_maxi_2023-03/Pause-a-Google-Drive-Upload-on-Android

### Observations

- Per-file state beats one global bar; weight overall progress by work, not file count; retry only failures; show errors next to the file in plain language with a retry button.
- Pause should change state to "Pausing" until in-flight work settles (OCLC).
- Importers (Linear, Plane) show a mapping and confirmation step before work starts.

### Decisions

- **D27. Pre-flight summary before anything runs** (spec 8): counts of audio-only (will be transcribed, estimated minutes and quota impact), paired, transcript-only and likely duplicates, plus the active transcription provider and its data-flow line. One primary button "Start import".
- **D28. Queue table with per-file status** using the spec's states (Queued, Decoding, Transcribing, Indexing, Encrypting, Uploading, Done, Duplicate, Failed). Overall progress counts finished files and shows remaining transcription minutes. Filter tabs: All, In progress, Failed, Duplicates.
- **D29. Pause is global; retry is per file and "Retry all failed".** Pause shows "Pausing" until the two transcription and four indexing workers finish their current step. Failed reasons are content-free ("Couldn't decode audio. The file may be damaged."), never quoting transcript text.
- **D30. Resumable after reload.** A banner on return: "You have an import in progress: 38 of 138 done. Resume". File handles that the browser no longer allows show "Pick the folder again to continue".

---

## 7. Provider settings cards in AI tools

### Sources

- Zed LLM providers: https://zed.dev/docs/ai/llm-providers (mirror: https://git.secluded.site/zed/blob/main/docs/src/ai/llm-providers.md)
- Cursor API keys and base URL override (vendor guides, secondary): https://openrouter.ai/docs/cookbook/coding-agents/cursor-integration , https://vercel.com/docs/ai-gateway/coding-agents/cursor , forum https://forum.cursor.com/t/custom-openai-override-and-cursor-models-cannot-both-stay-enabled/172795
- Raycast BYOK and privacy: https://manual.raycast.com/ai/bring-your-own-keys , https://manual.raycast.com/ai/raycast-ai-privacy-security
- LM Studio and Continue (OpenAI-compatible local servers) are referenced through the Zed and Raycast docs on custom and local providers.

### Observations

- **Zed** lists one section per provider, keys are pasted inline and stored in the OS keychain, never in `settings.json`; custom OpenAI-compatible providers are added with a base URL.
- **Cursor** hides the consequence of a base-URL override: it silently disables built-in models. Users discover it by failure. Verification is "send a message and check the gateway logs".
- **Raycast** marks models using your own key with a key icon and states that BYOK requests go straight to the provider while local models (Ollama) never leave the machine.

### Decisions

- **D31. One card per capability, not per provider** (spec 11.2a): Transcription, Ask about a call, Recording backups. Each card has a three-way segmented choice (Managed / Your own key or bucket / Off), then the provider fields.
- **D32. Every card leads with a data-flow sentence and a tiny route diagram** (Device → AskCalls → ElevenLabs, or Device → ElevenLabs). The sentence changes with the choice. This is the information Cursor and Arc failed to show.
- **D33. Test connection is explicit and reports a concrete result** ("Connected. A 3-second sample transcribed in 1.2 s."). Failures name the HTTP status class and the fix, never the response body.
- **D34. Keys are masked with the last 4 characters** (`sk-ant-…4f2Q`), with Replace and Remove. A note under the field: "Encrypted with your keys and stored only on your devices." After saving, the full key is never shown again (Zed).
- **D35. Changing the choice never hides the consequence.** Switching Transcription to Off shows "Audio uploads will be disabled. Transcript uploads still work." before saving.

---

## 8. Self-host setup wizards and admin pages

### Sources

- Plausible CE first launch: https://github.com/plausible/community-edition and release notes https://newreleases.io/project/github/plausible/analytics/release/v1.5.0-rc.1 ; first-launch race warning (secondary): https://railway.com/deploy/plausible-ce-or-just-updated-google-anal
- Immich post-install: https://docs.immich.app/install/post-install
- Nextcloud installation wizard: https://docs.nextcloud.com/server/stable/admin_manual/installation/installation_wizard.html
- Ghost setup: https://docs.ghost.org/install/ubuntu
- Umami: no first-run wizard (default admin credentials documented in its repository); noted as a pattern to avoid.

### Observations

- **Plausible, Immich, Ghost**: the first account registered becomes the owner. Plausible's registration page is open to whoever arrives first, so an instance on a public URL can be claimed by a stranger.
- **Nextcloud** shows an inline performance warning when SQLite is chosen and reveals extra fields only for the chosen database. Users were confused when a dashboard warning persisted.
- **Immich** keeps the first run short and puts everything else in Administration later.

### Decisions

- **D36. Wizard = vertical stepper with six steps** (spec 11.2b), each step one decision, each with "Test connection" where relevant. Fields appear only for the chosen option (Nextcloud).
- **D37. Built-in database choice carries an honest note**, like Nextcloud's: "Good for one person or a small team on one machine. You can move to Postgres later with askcalls backup and restore." The database step warns that it cannot be changed in the UI once data exists.
- **D38. Claim protection.** The wizard's first screen shows "This instance has no admin yet. The first account created here becomes the admin." and, when the request comes from a non-loopback address, offers a setup token printed in the server log (`Setup token: XXXX-XXXX`), which must be entered to continue. This avoids Plausible's first-visitor race. (Open question for the owner: listed in README.)
- **D39. Admin instance page reuses the provider card layout** (spec) with live health and "Set by the server environment" locks shown as a lock icon plus label, read-only fields.

---

## 9. RTL, bidi and fonts

### Sources

- Material Design bidirectionality: https://m1.material.io/usability/bidirectionality.html , https://m2.material.io/design/usability/bidirectionality.html
- Wikimedia Codex bidirectionality: https://doc.wikimedia.org/codex/main/style-guide/bidirectionality.html
- Mozilla RTL guidelines: https://firefox-source-docs.mozilla.org/code-quality/coding-style/rtl_guidelines.html
- Adobe Spectrum bi-directionality: https://spectrum.adobe.com/page/bi-directionality
- Pinterest Gestalt RTL iconography: https://gestalt.pinterest.systems/foundations/international_design/rtl_guidelines/iconography
- shadcn/ui RTL: https://ui.shadcn.com/docs/rtl and changelog https://ui.shadcn.com/docs/changelog/2026-01-rtl
- IBM Plex: https://github.com/ibm/plex , Wikipedia https://en.wikipedia.org/wiki/IBM_Plex , npm packages `@ibm/plex-sans`, `@ibm/plex-sans-hebrew`, `@ibm/plex-sans-arabic`, `@ibm/plex-mono` (SIL OFL 1.1, verified in the package LICENSE files)
- Hebrew font options: Noto Sans Hebrew https://fonts.google.com/specimen/Noto+Sans+Hebrew/about , Heebo https://github.com/meirsadan/heebo , Assistant https://fonts.google.com/specimen/Assistant/about , list https://github.com/danielrosehill/Awesome-Hebrew-Fonts
- Hebrew sizing against Latin (Ubuntu font): https://canonical.com/blog/intial-hebrew-trials

### Observations

- **Mirror:** layout, navigation order, back/forward arrows and chevrons, progress bars and sliders (0 % on the right), step sequences, list and indent icons, checkboxes beside labels.
- **Do not mirror:** media playback controls and the media timeline, clocks and refresh/history icons, search (hand-held), checkmarks, slashed "off" icons, phone numbers, numbers in general, charts, untranslated LTR text such as URLs and code.
- **Wikimedia:** align list rows to the UI direction and set each item's language and direction; never mix alignments within one paragraph; numbers and phone numbers stay LTR.
- **Material:** in an LTR UI, an RTL paragraph keeps its own direction; LTR words inside RTL text (URLs) stay LTR.
- **shadcn/ui** (2026) converts components to logical classes (`ms-`, `me-`, `start-`, `end-`, `text-start`) with a CLI transform and provides a `DirectionProvider`; directional icons need `rtl:rotate-180` (we use `rtl:-scale-x-100`); Popover and Tooltip need `dir` passed because of a tw-animate-css issue; Calendar, Pagination and Sidebar need manual migration. shadcn suggests Noto for RTL.
- **Fonts:** Noto Sans Hebrew is Hebrew-only and needs a separate Latin; Heebo and Assistant cover Latin + Hebrew but not Arabic or Cyrillic; Rubik covers Latin, Hebrew and Cyrillic but not Arabic. IBM Plex is the one open superfamily designed together across Latin, Cyrillic, Greek (Plex Sans), Hebrew (Plex Sans Hebrew) and Arabic (Plex Sans Arabic), with a matching monospace, all under the OFL and published on npm by IBM.
- **Hebrew sizing:** Dalton Maag's work on Ubuntu set Hebrew letter height near 90 % of Latin cap height to sit well beside Latin. Plex Sans Hebrew is designed to the same principle, so no size compensation is needed.

### Decisions

- **D40. Typeface: IBM Plex.** Plex Sans (Latin, Cyrillic, Greek) + Plex Sans Hebrew + Plex Sans Arabic for UI and content; Plex Mono for recovery codes, fingerprints, tokens, timestamps in tables and config snippets. Self-hosted woff2 from the `@ibm/plex-*` npm packages, split by `unicode-range` so Hebrew and Arabic files load only when needed. Three weights (400, 500, 600). Reasons: one design voice across all four R1/R2 languages, a mono sibling for codes, OFL, no Google Fonts CDN. Russian is covered by Plex Sans Cyrillic, Arabic by Plex Sans Arabic.
- **D41. Hebrew-first font order on `lang="he"`** so digits and punctuation in Hebrew text come from the Hebrew design. No letter-spacing and no uppercase transforms for Hebrew or Arabic; hierarchy uses weight and colour only.
- **D42. Logical properties only** (`ms-`, `pe-`, `start-`, `text-start`, `border-s`). The one physical exception: the media timeline and player controls stay LTR in RTL (Material, Codex).
- **D43. Bidi islands.** Phone numbers, recovery codes, fingerprints, tokens, file names, URLs and timestamps render inside `<bdi>` or `.ltr-island` (`direction: ltr; unicode-bidi: isolate`).
- **D44. User content uses `dir="auto"`, aligned to the UI.** Names, snippets, notes and transcript segments get `dir="auto"` so character order is correct. Snippets and list rows align to the UI direction (Wikimedia). Transcript segments, which are multi-line reading text, align to their own direction (`text-align: start` resolved against the segment's `dir`) so long Hebrew paragraphs never rag on their starting edge.

---

## 10. Accessibility, virtualized lists and keyboard use

### Sources

- WCAG 2.2 what's new: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ ; Deque summary https://dequeuniversity.com/resources/wcag-2.2
- WCAG 2.1.4 Character key shortcuts: https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts
- W3C APG listbox pattern: https://w3c.github.io/wai-website/ARIA/apg/patterns/listbox/
- Virtualized list accessibility (secondary): https://accessible-data-interfaces.pages.dev/virtualization-charts-dynamic-data-displays/accessible-virtualized-list-patterns/
- Reduced motion and skeletons: https://web.dev/articles/prefers-reduced-motion (goo.gle/prefers-reduced-motion), https://smashingmagazine.com/2023/11/creating-accessible-ui-animations
- Superhuman and Raycast keyboard models (section 1 sources)

### Observations

- WCAG 2.2 AA adds **2.4.11 Focus Not Obscured (Minimum)**: a focused element must not be fully hidden by sticky headers, players or toasts; and **2.5.8 Target Size (Minimum)**: 24 × 24 CSS px or enough spacing. Focus Appearance (2.4.13) is AAA but a good target.
- **2.1.4**: single-character shortcuts (`j`, `k`, `s`, `t`, `/`) must be possible to turn off or remap, or be active only when a component has focus. Gmail and WordPress let users turn them off.
- Virtualized lists must expose the full set size (`aria-setsize`, `aria-posinset`) and keep keyboard navigation working onto unrendered rows (`scrollToIndex`). `aria-activedescendant` avoids moving DOM focus onto rows that unmount.
- Skeleton shimmer should stop under `prefers-reduced-motion` and fall back to a static block; keep pulses at or below 1 Hz.

### Decisions

- **D45. Shortcuts** per spec plus a few: `/` focus search, `j`/`k` next/previous, `Enter` open, `s` star, `t` tags, `Esc` close or clear, `?` shortcuts dialog, `L` lock, `n`/`N` next/previous hit in a call, `Space` play/pause in a call, `g c` / `g u` / `g s` go to Calls / Upload / Settings. Single-key shortcuts are active only when focus is not in a text field, and Settings → Privacy (Accessibility group) has "Single-key shortcuts" on by default with a switch to turn them off (2.1.4).
- **D46. Calls list = `role="listbox"`-free feed.** We use a `<ul role="list">` of rows with real links, `aria-setsize` and `aria-posinset` on each row, and roving focus driven by `j`/`k` that calls the virtualizer's `scrollToIndex` before focusing. Screen readers announce "Dana Levi, incoming call, today 14:32, 8 minutes, 3 of 18".
- **D47. Focus ring:** 2 px `--ring` outline with 2 px offset, never removed; sticky header, player and toasts reserve space (`scroll-padding`) so focus is never hidden (2.4.11).
- **D48. Targets:** minimum 32 px for dense desktop controls (with spacing to satisfy 2.5.8), 44 px on coarse pointers.
- **D49. Motion:** 120 to 280 ms, opacity and small translate only; shimmer at 1.6 s per cycle (0.6 Hz); under reduced motion, no shimmer, no slide, instant panels.

---

## 11. Privacy-first marketing sites

### Sources

- Signal: https://signal.org/
- Mullvad: https://mullvad.net/en
- Proton Drive: https://proton.me/drive
- 1Password security: https://1password.com/security
- Tuta encryption: https://tuta.com/encryption
- Linear: https://linear.app/
- Vercel Geist colours: https://vercel.com/geist/colors
- Raycast: https://raycast.com/

### Observations

- **Signal**: two-word hero ("Speak Freely."), one primary button, then a short security block: "We can't read your messages or listen to your calls." Plain, friendly, no jargon. Claims are self-stated; proof is the open-source protocol.
- **Mullvad**: mission-first, short declarative claims ("No logging. Anonymous accounts."), links to tools that let you check (leak checker, GPG key, onion address).
- **Proton Drive**: hero promise plus "Not even Proton can access your files", then pricing early, then privacy pillars (end-to-end encryption, Swiss jurisdiction, open source). Encryption is explained in words only; there is no diagram.
- **1Password**: a security page with principles, then mechanisms, then "Security with the proof to back it up" (audits, white paper, bug bounty). Again no technical diagram on the page; the white paper carries the depth.
- **Tuta** is the only one that names the exceptions to its zero-knowledge claim.
- **Linear**: product screenshots dense with realistic data carry the page; sentence-case headings; one pair of CTAs at the end; restrained colour.
- **Vercel Geist**: a 10-step scale with defined roles per step (backgrounds 1 to 3, borders 4 to 6, text 9 to 10) keeps contrast predictable.

### Decisions

- **D50. Hero:** "Ask your calls anything." / "End-to-end encrypted. We can't read your calls." One primary button "Start free", a quiet text link "View the source on GitHub". The demo is a real product recording (spec), framed like Linear's product shots, with a pause button and a static poster under reduced motion.
- **D51. A real trust diagram,** which none of the studied sites have: three columns (Your device, AskCalls server, Storage) listing exactly what each holds, with "Only your device sees plaintext" on the device column. Directly under it, "Where plaintext does go", listing transcription, ask and inbox in one line each (D12, Tuta).
- **D52. Proof over adjectives:** link to the source, the threat model, the leak test in CI and the published asset hashes ("Verify what you run"), in the style of Mullvad's verification links and 1Password's proof section.
- **D53. Calm landing structure** (Linear, Signal): eight sections in spec order, generous whitespace, one accent, sentence case, no stock imagery, no testimonials or logo walls in R1.

---

## 12. Implementation platform

### Sources

- Tailwind CSS v4 theme variables: https://tailwindcss.com/docs/theme
- shadcn/ui theming: https://ui.shadcn.com/docs/theming ; RTL: https://ui.shadcn.com/docs/rtl
- lucide icons: https://lucide.dev (icons used in the mocks are inlined from `lucide-static`)

### Observations

- Tailwind v4 generates utilities from `@theme` namespaces (`--color-*`, `--font-*`, `--text-*` with `--text-*--line-height`, `--radius-*`, `--shadow-*`, `--ease-*`, `--animate-*`, `--breakpoint-*`, `--container-*`). Variables that reference other variables belong in `@theme inline`.
- shadcn/ui expects `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--sidebar-*` and `--radius`, mapped to `--color-*` in `@theme inline`, with a `.dark` override and `@custom-variant dark`.
- shadcn's `accent` is a neutral hover colour, not a brand accent.

### Decisions

- **D54. Our one accent is shadcn `primary`.** `accent` stays neutral. Extra semantic tokens (`primary-subtle`, `success`, `warning`, `mark`, `skeleton`, tag colours) are added in the same pattern. `tokens.css` was compiled with Tailwind v4.3.5 to confirm it is valid and generates the expected utilities.
