# AskCalls screens (R1)

Every screen, with its purpose, layout, states, interactions, keyboard behaviour and exact copy. Screen codes (M1, C3, ...) match the component map in [`design-language.md`](design-language.md) section 5 and the mocks in [`mocks/`](mocks/index.html). Copy follows the voice rules in `design-language.md` 2.6: no restating subtitles, no in-app encryption advertising outside unlock, recovery, consent and data-flow lines.

Copy tables give English and Hebrew. All strings live in message files (`en.json`, `he.json`); keys are suggested in the first column. `{n}` marks interpolation; plural forms use ICU (`{n, plural, one {# call} other {# calls}}`).

Conventions used below

- **Layout** gives desktop (≥ 1024 px) then mobile (< 768 px); tablet (768 to 1023 px) uses the navigation rail and the mobile treatment of side panels unless stated.
- **States** always cover loading, empty and error. "Locked" means the keys are not in memory: every app route shows the unlock gate (G1) instead.
- Shortcuts are listed only where a screen adds to the global set in `design-system.md` section 11.

Contents

- Marketing: M1 Home · M2 Pricing · M3 Security · M5 MCP and self-host · M4 Sign in
- Onboarding: O1 Welcome · O2 Create passkey · O2b Passphrase · O3 Recovery code · O4 Confirm code · O5 Try it · O6 Connect your AI
- G1 Unlock gate
- Calls: C1 Calls list · C2 Search results · C3 Call view · C4 Ask consent
- Upload: U1 Single · U2 Bulk
- Organise: T1 Tags · T2 Intents · T3 Rules · T4 Synonyms · K1 Contacts
- Settings: S1 Security · D1 Device linking · S2 Recordings · S3 Retention · S4 API and MCP · S5 Providers · S6 Privacy · S7 Audit log · S8 Data
- Instance: A1 Admin instance · A2 Offline mode · W1 First-run wizard
- Global: X1 Keyboard shortcuts · X2 Toasts and banners · X3 Lock behaviour

---

## Marketing

Shared: `MarketingHeader` (logo, How it works, Security, Pricing, FAQ, Self-host, language switcher, Sign in, Start free) and `MarketingFooter`. Pages are statically rendered, cookieless analytics only, Google One Tap script only on `/` and `/login`. Mobile header: logo, Start free, menu button opening a Sheet with the links and the language switcher.

### M1 Home `/`

**Purpose:** explain the product in one screen, prove the privacy model once, get the visitor to Start free.

**Layout:** single column of eight sections in a 1120 px container, 96 px between sections (64 px mobile). Mock: [`home.html`](mocks/home.html).

1. **Hero**, centred: H1, subline, primary button, GitHub text link, fine print, then `DemoFrame` with the recorded product video (search "people interested in buying", open a result). The video has a pause button in the frame bar; under reduced motion it shows its poster and a play button.
2. **How it works:** three `StepList` cards.
3. **Privacy proof:** `TrustDiagram` (device → server → storage; the device column carries "Only your device sees plaintext"), "Where plaintext does go" with three `DataFlowNote`s, then four proof links. This is the only section that talks about encryption.
4. **Use cases:** four `UseCaseCard`s with read-only sample searches.
5. **Works with your AI:** text plus two `CopyableCode` blocks and the client list.
6. **Pricing teaser:** five limits.
7. **FAQ:** `FaqList`, the second item open.
8. **Footer.**

Mobile: grids stack to one column; the trust diagram stacks with down arrows; the demo frame keeps its aspect and shows two rows.

**States:** static page; the demo video lazy-loads with a poster. No empty or error states.

**Interactions:** Start free opens Google One Tap where available, otherwise `/login`. The language switcher sets the `locale` cookie and reloads in place (no locale in the URL).

| Key | English | Hebrew |
| --- | --- | --- |
| `home.hero.title` | Ask your calls anything. | לשאול את השיחות שלך כל דבר. |
| `home.hero.subtitle` | End-to-end encrypted. We can't read your calls. | מוצפן מקצה לקצה. אנחנו לא יכולים לקרוא את השיחות שלך. |
| `home.hero.cta` | Start free | להתחיל בחינם |
| `home.hero.source` | View the source on GitHub | לקוד המקור ב-GitHub |
| `home.hero.fine` | Free during beta. Open source under MIT. Self-host it if you prefer. | חינם בתקופת הבטא. קוד פתוח ברישיון MIT. אפשר גם לארח בעצמך. |
| `home.how.title` | Upload calls, find any of them in seconds, ask about the one you need. | מעלים שיחות, מוצאים כל אחת תוך שניות, ושואלים על זו שצריך. |
| `home.how.1.title` / body | Upload or import / Drop in audio, transcripts or a whole folder. Audio without a transcript is transcribed, and duplicates are skipped so nothing is transcribed twice. | העלאה או ייבוא / גוררים קובצי שמע, תמלולים או תיקייה שלמה. שמע בלי תמלול מתומלל, וכפילויות מדולגות כדי שלא יתומלל דבר פעמיים. |
| `home.how.2.title` / body | Search by who, what or intent / Find calls by contact, date, exact or fuzzy keyword, tag, or meaning: "people interested in buying" finds them even if nobody said "buy". | חיפוש לפי מי, מה או כוונה / מוצאים שיחות לפי איש קשר, תאריך, מילה מדויקת או דומה, תגית, או משמעות: „אנשים שמתעניינים לקנות" מוצא אותם גם אם אף אחד לא אמר „לקנות". |
| `home.how.3.title` / body | Ask about any call / Ask what was promised or what price you quoted, and get an answer that points to the moment in the call. | שאלות על כל שיחה / שואלים מה הובטח או איזה מחיר נאמר, ומקבלים תשובה שמפנה לרגע בשיחה. |
| `home.privacy.title` | Your device encrypts. Our server only stores what it can't read. | המכשיר שלך מצפין. השרת שלנו שומר רק מה שהוא לא יכול לקרוא. |
| `home.privacy.plaintextOnly` | Only your device sees plaintext | רק המכשיר שלך רואה טקסט גלוי |
| `home.privacy.exceptions` | Where plaintext does go, and only when you ask | לאן כן יוצא טקסט גלוי, ורק כשמבקשים |
| `home.privacy.links` | Read the security model · Read the source · See the leak test that runs on every change · Verify the code we serve | מודל האבטחה · קוד המקור · בדיקת הדליפה שרצה בכל שינוי · אימות הקוד שאנחנו מגישים |
| `home.uses.title` | For people whose work happens on the phone. | לאנשים שהעבודה שלהם קורית בטלפון. |
| `home.uses.sales` | Sales follow-up / Find everyone who asked for a quote this month and hasn't heard back. | מעקב מכירות / למצוא את כל מי שביקש הצעת מחיר החודש ועוד לא קיבל תשובה. |
| `home.uses.disputes` | Service disputes / See exactly what was agreed about the delivery date, in the customer's words. | מחלוקות שירות / לראות בדיוק מה סוכם על מועד ההובלה, במילים של הלקוח. |
| `home.uses.records` | Professional records / Lawyers, advisers and clinics keep a searchable record of client calls. | תיעוד מקצועי / עורכי דין, יועצים ומרפאות שומרים תיעוד של שיחות עם לקוחות שאפשר לחפש בו. |
| `home.uses.coaching` | Team coaching / Find calls where a price objection came up and review how it was handled. | הדרכת צוות / למצוא שיחות שבהן עלתה התנגדות למחיר ולבדוק איך טיפלו בה. |
| `home.ai.title` | Connect Claude or any MCP client. | חיבור ל-Claude או לכל לקוח MCP. |
| `home.ai.body` | The askcalls agent runs on your computer. Your AI assistant can search your calls, read them and import new ones through it. | הסוכן askcalls רץ במחשב שלך. דרכו עוזר ה-AI יכול לחפש שיחות, לקרוא אותן ולייבא חדשות. |
| `home.pricing.title` | Free during beta. | חינם בתקופת הבטא. |
| `home.pricing.body` | No card needed. These are the beta limits on askcalls.com. A self-hosted instance sets its own. | בלי כרטיס אשראי. אלה המגבלות של הבטא ב-askcalls.com. מופע באירוח עצמי קובע מגבלות משלו. |
| `home.faq.*` | See FAQ answers in the mock; the five questions are from spec 11.1 | |

### M2 Pricing `/pricing`

**Purpose:** state the beta limits plainly. **Layout:** H1 "Free during beta.", `LimitsTable` (calls 500, transcription 300 min a month, recording backups 2 GB, questions 50 a day, access tokens 5, MCP fetches 60 per token per hour), a short "What counts" list (a call is one transcript; transcription minutes count audio length; own-key usage doesn't count), then `FaqList` with three pricing questions (What happens at the limit? What about my own keys? Is self-hosting free?). **States:** static.

| Key | English | Hebrew |
| --- | --- | --- |
| `pricing.limitReached` | At the limit, uploads pause until you delete calls or the month resets. Search and reading keep working. | כשמגיעים למגבלה, ההעלאות נעצרות עד שמוחקים שיחות או שהחודש מתחדש. חיפוש וקריאה ממשיכים לעבוד. |
| `pricing.ownKey` | Transcription and questions with your own key don't count toward the limits. | תמלול ושאלות עם מפתח משלך לא נספרים במגבלות. |

### M3 Security `/security`

**Purpose:** the full privacy model for people who want to check it. **Layout:** reading column (720 px): "What the server stores / never sees" table (from the README), `TrustDiagram`, "Where plaintext goes" (the three `DataFlowNote`s plus the provider retention terms: ElevenLabs may keep request logs under its standard policy until Zero Retention Mode is in place; Anthropic under zero retention), key hierarchy summary, unlock methods, device linking, "Verify what you run" (asset hashes, `CopyableCode` with the check command), leak test, threat model link, vulnerability reporting. **States:** static.

### M5 MCP `/mcp` and Self-host `/self-host`

Reading pages with `StepList` and `CopyableCode` blocks mirroring the README sections for each client and for Docker Compose, local mode and air-gapped compose. Copy is the README's.

### M4 Sign in `/login`

**Purpose:** sign in or create an account. Mock: [`login.html`](mocks/login.html).

**Layout:** centred 432 px column on the canvas: logo top start, language switcher top end, H1, one line, Continue with Google, Continue with GitHub, "or", email field and "Email me a sign-in link", legal line. Providers shown follow the instance config (`AUTH_PROVIDERS`, local accounts). Mobile: same column, full width.

**States:** sending link (button spinner), link sent (the form is replaced by "Check your email" with the address and "Use a different email"), error (inline under the field), provider error (callout at the top).

| Key | English | Hebrew |
| --- | --- | --- |
| `login.title` | Sign in to AskCalls | כניסה ל-AskCalls |
| `login.subtitle` | New here? Signing in creates your account. | חדשים כאן? הכניסה יוצרת חשבון. |
| `login.google` | Continue with Google | המשך עם Google |
| `login.github` | Continue with GitHub | המשך עם GitHub |
| `login.or` | or | או |
| `login.email` | Email | אימייל |
| `login.emailLink` | Email me a sign-in link | שליחת קישור כניסה במייל |
| `login.sent.title` | Check your email | הקישור נשלח |
| `login.sent.body` | We sent a link to {email}. It expires in 10 minutes. | שלחנו קישור אל {email}. הוא בתוקף ל-10 דקות. |
| `login.sent.change` | Use a different email | אימייל אחר |
| `login.error.email` | Enter an email address. | יש להזין כתובת אימייל. |
| `login.error.provider` | Google sign-in didn't complete. Try again. | הכניסה עם Google לא הושלמה. כדאי לנסות שוב. |
| `login.legal` | By continuing you agree to the Terms and Privacy policy. | בהמשך הכניסה מתקבלים תנאי השימוש ומדיניות הפרטיות. |

---

## Onboarding (first sign-in) `/app/welcome`

Shared layout: logo top start, step count top end on mobile, horizontal `Stepper` (Welcome, Passkey, Recovery code, Try it, Connect your AI), a 560 px content column. No app navigation until step 3 completes (spec 6.2: onboarding cannot finish without a confirmed recovery code). Steps 4 and 5 have "Skip". Back is allowed until keys are generated. Telemetry event "onboarding step reached" fires per step (content-free).

### O1 Welcome

**Purpose:** one sentence on how encryption works, then start. **Content:** H1, two short lines, primary "Set up encryption".

| Key | English | Hebrew |
| --- | --- | --- |
| `onb.welcome.title` | Welcome to AskCalls | ברוכים הבאים ל-AskCalls |
| `onb.welcome.body` | Your calls are encrypted on your devices before they're uploaded. We store them, but we can't read them. | השיחות מוצפנות במכשירים שלך לפני ההעלאה. אנחנו שומרים אותן, אבל לא יכולים לקרוא אותן. |
| `onb.welcome.body2` | Next: a passkey to unlock them, and a recovery code in case you lose it. | הצעד הבא: מפתח גישה לפתיחה, וקוד שחזור למקרה שהוא יאבד. |
| `onb.welcome.cta` | Set up encryption | הגדרת הצפנה |

### O2 Create passkey

**Purpose:** create the passkey that unlocks the root key (WebAuthn PRF). **Content:** H1, one line, primary "Create passkey", secondary "Use a passphrase instead". After the OS dialog: "Passkey created" with the provider name, auto-advance after 1 s.

**States:** waiting for the OS dialog (button spinner "Waiting for your device…"); cancelled (inline: "Passkey wasn't created. Try again or use a passphrase."); PRF unsupported (callout replaces the primary: "This browser can't unlock AskCalls with a passkey yet." with the passphrase path as primary and a link listing supported browsers).

| Key | English | Hebrew |
| --- | --- | --- |
| `onb.passkey.title` | Create a passkey | יצירת מפתח גישה |
| `onb.passkey.body` | You'll unlock AskCalls with your fingerprint, face or screen lock. | ביטול הנעילה של AskCalls ייעשה בטביעת אצבע, בזיהוי פנים או בנעילת המסך. |
| `onb.passkey.cta` | Create passkey | יצירת מפתח גישה |
| `onb.passkey.alt` | Use a passphrase instead | שימוש במשפט סיסמה במקום |
| `onb.passkey.waiting` | Waiting for your device… | ממתין למכשיר… |
| `onb.passkey.done` | Passkey created | מפתח הגישה נוצר |
| `onb.passkey.cancelled` | Passkey wasn't created. Try again or use a passphrase. | מפתח הגישה לא נוצר. אפשר לנסות שוב או להשתמש במשפט סיסמה. |
| `onb.passkey.noPrf` | This browser can't unlock AskCalls with a passkey yet. Use a passphrase on this device. | הדפדפן הזה עדיין לא יכול לפתוח את AskCalls עם מפתח גישה. במכשיר הזה יש להשתמש במשפט סיסמה. |

### O2b Passphrase fallback

**Content:** `PassphraseField` (create mode: passphrase, confirm, strength meter), minimum 12 characters. Argon2id runs on Continue (1 to 2 s; button shows "Creating keys…").

| Key | English | Hebrew |
| --- | --- | --- |
| `onb.pass.title` | Create a passphrase | יצירת משפט סיסמה |
| `onb.pass.hint` | At least 12 characters. A short sentence works well. | לפחות 12 תווים. משפט קצר מתאים. |
| `onb.pass.confirm` | Type it again | הקלדה חוזרת |
| `onb.pass.strength` | Weak · Fair · Strong | חלש · סביר · חזק |
| `onb.pass.mismatch` | The two passphrases don't match. | שני המשפטים לא תואמים. |
| `onb.pass.short` | Use at least 12 characters. | יש להשתמש בלפחות 12 תווים. |
| `onb.pass.creating` | Creating keys… | יוצר מפתחות… |

### O3 Recovery code (show)

Mock: [`onboarding-recovery.html`](mocks/onboarding-recovery.html), left state.

**Content:** H1, one line, `RecoveryCodeGrid` (8 groups of 4, numbered; 4 × 2 desktop, 2 × 4 mobile), Download / Print / Copy, one hint, required checkbox, Continue (disabled until checked). Download writes `AskCalls recovery code.txt` (code, account email, date, the URL to use it). Print opens a print stylesheet with the same content and blank lines for "Where I keep this". Copy shows "Copied" for 2 s.

**Keyboard:** the grid is a list; Download, Print, Copy are buttons in order; checkbox toggles with Space.

| Key | English | Hebrew |
| --- | --- | --- |
| `onb.rc.title` | Save your recovery code | שמירת קוד השחזור |
| `onb.rc.body` | It's the only way back in if you lose your passkey. We can't reset it. | זו הדרך היחידה לחזור אם מפתח הגישה אובד. אין לנו אפשרות לאפס אותו. |
| `onb.rc.download` / `print` / `copy` | Download / Print / Copy | הורדה / הדפסה / העתקה |
| `onb.rc.copied` | Copied | הועתק |
| `onb.rc.hint` | Print it or keep it in a password manager, not only on this device. | כדאי להדפיס או לשמור במנהל סיסמאות, לא רק במכשיר הזה. |
| `onb.rc.check` | I saved my recovery code somewhere safe | שמרתי את קוד השחזור במקום בטוח |
| `onb.rc.continue` | Continue | המשך |

### O4 Confirm recovery code

Mock: right state. **Content:** H1, one line naming two random groups, two `CodeGroupInput`s (auto-uppercase, ignore spaces and dashes, 4 characters each), primary "Confirm and finish setup", ghost "Back to the code". On success, keys are generated and uploaded (spinner "Finishing setup…").

**States:** incomplete group (inline "Group 6 needs 4 characters."), wrong group (inline "Group 6 doesn't match. Check your saved copy."), upload error (callout "Couldn't save your keys. Check your connection and try again." Nothing is lost; retry).

| Key | English | Hebrew |
| --- | --- | --- |
| `onb.confirm.title` | Check your saved code | בדיקת הקוד ששמרת |
| `onb.confirm.body` | Type group {a} and group {b} from your saved copy. | יש להקליד את קבוצה {a} ואת קבוצה {b} מהעותק השמור. |
| `onb.confirm.group` | Group {n} | קבוצה {n} |
| `onb.confirm.cta` | Confirm and finish setup | אישור וסיום ההגדרה |
| `onb.confirm.back` | Back to the code | חזרה לקוד |
| `onb.confirm.short` | Group {n} needs 4 characters. | בקבוצה {n} צריכים להיות 4 תווים. |
| `onb.confirm.wrong` | Group {n} doesn't match. Check your saved copy. | קבוצה {n} לא תואמת. כדאי לבדוק בעותק השמור. |
| `onb.confirm.finishing` | Finishing setup… | מסיים את ההגדרה… |

### O5 Try it with a sample call

**Purpose:** reach the activation event (first search with a result). **Content:** H1, "Import sample call" (Hebrew or English sample chosen by locale, the other offered as a link), then a guided `SearchBox` pre-filled with a word from the sample with a typo ("מחיק" / "pirce"), the resulting `CallRow` with "Also matched", and "Open the call" which lands in C3 with the hit highlighted. "Skip" goes to O6.

| Key | English | Hebrew |
| --- | --- | --- |
| `onb.try.title` | Try it with a sample call | ניסיון עם שיחה לדוגמה |
| `onb.try.import` | Import sample call | ייבוא שיחה לדוגמה |
| `onb.try.otherLang` | Use the English sample | שיחה לדוגמה באנגלית |
| `onb.try.searchHint` | Search for "pirce". The typo is on purpose. | חיפוש של „מחיק". שגיאת ההקלדה מכוונת. |
| `onb.try.open` | Open the call | פתיחת השיחה |
| `onb.skip` | Skip | דילוג |

### O6 Connect your AI (optional)

**Content:** H1, one line, three numbered steps with `CopyableCode` (install and login, link, add to client), a client picker (Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Codex CLI) that swaps the third snippet, primary "Go to my calls". Link to S4 for tokens.

| Key | English | Hebrew |
| --- | --- | --- |
| `onb.ai.title` | Connect your AI | חיבור ל-AI |
| `onb.ai.body` | The askcalls agent lets Claude or any MCP client search and read your calls on this computer. | הסוכן askcalls מאפשר ל-Claude או לכל לקוח MCP לחפש ולקרוא את השיחות שלך במחשב הזה. |
| `onb.ai.done` | Go to my calls | מעבר לשיחות |

---

## G1 Unlock gate `/app/**` while locked

Mock: [`unlock.html`](mocks/unlock.html).

**Purpose:** turn a user gesture into the root key. Shown after sign-in when this browser holds no unwrapped keys, after lock, and on any deep link while locked (returns to the requested route after unlock).

**Layout:** centred 432 px column: lock icon tile, H1, one line, "Unlock with passkey" (primary, focused on load), "Use recovery code", "Use passphrase" (only if one is set), account row with Sign out, footnote. Recovery code and passphrase replace the buttons in place with a back link ("Other ways to unlock"). Mobile: same column.

**States:** waiting for the OS dialog; passkey failed ("Couldn't unlock with this passkey. Try again or use your recovery code."); wrong recovery code; wrong passphrase; processing (spinner "Unlocking…"); offline (callout "You're offline. Unlocking needs a connection to fetch your keys." when the wrapped key isn't cached); inbox items found after unlock (toast X2).

**Keyboard:** Enter triggers the focused method; Esc in a sub-form goes back to the method list.

| Key | English | Hebrew |
| --- | --- | --- |
| `unlock.title` | Unlock your calls | ביטול נעילה של השיחות |
| `unlock.body` | Use the passkey you created for AskCalls. | עם מפתח הגישה שיצרת ל-AskCalls. |
| `unlock.passkey` | Unlock with passkey | ביטול נעילה עם מפתח גישה |
| `unlock.recovery` | Use recovery code | שימוש בקוד שחזור |
| `unlock.passphrase` | Use passphrase | שימוש במשפט סיסמה |
| `unlock.account` | Signed in as {email} | החשבון המחובר: {email} |
| `unlock.signOut` | Sign out | יציאה |
| `unlock.lost` | Without a passkey or recovery code, calls can't be recovered. Options | בלי מפתח גישה או קוד שחזור אי אפשר לשחזר את השיחות. אפשרויות |
| `unlock.back` | Other ways to unlock | דרכים אחרות לביטול נעילה |
| `unlock.rc.title` | Enter your recovery code | הזנת קוד השחזור |
| `unlock.rc.body` | 8 groups of 4 characters. | 8 קבוצות של 4 תווים. |
| `unlock.rc.wrong` | Wrong code. Check each group and try again. | קוד שגוי. כדאי לבדוק כל קבוצה ולנסות שוב. |
| `unlock.pass.wrong` | Wrong passphrase. Try again. | משפט סיסמה שגוי. כדאי לנסות שוב. |
| `unlock.passkey.failed` | Couldn't unlock with this passkey. Try again or use your recovery code. | לא ניתן לפתוח עם מפתח הגישה הזה. אפשר לנסות שוב או להשתמש בקוד השחזור. |
| `unlock.cta` | Unlock | ביטול נעילה |
| `unlock.busy` | Unlocking… | מבטל נעילה… |
| `unlock.signOut.confirm` | Signing out also removes this device's saved keys. You'll need your passkey or recovery code to unlock again. | היציאה מוחקת גם את המפתחות השמורים במכשיר הזה. כדי לפתוח שוב יידרשו מפתח גישה או קוד שחזור. |

---

## Calls

### C1 Calls list `/app`

Mock: [`calls.html`](mocks/calls.html) (shown with an active search; without a query it is the plain list).

**Purpose:** browse every call, newest first.

**Layout:** desktop: app shell, top bar (shortcut hints, Upload), page title "Calls", then the search block (C2: `SearchBox`, `FilterSentence`, `ResultLine`), then the virtualized list in one card (row height 72 px estimate, rows grow with tags). Mobile: top bar (title, Upload, Lock), the same search block full width (the sentence wraps over two or three lines), the list edge to edge, bottom navigation; once the search block scrolls away, `FoldedFilterSummary` pins one line to the top.

**Row (`CallRow` context="list"):** star toggle, contact name or number, direction icon, number under or beside the name, date and duration on one line at the end, tag chips (intent chips outlined, rule tags with the wand icon). Without a query, no snippet.

**States:**
- Loading: 6 skeleton rows. Rows with ciphertext still decrypting show the lock icon (`aria-label="Decrypting"`), no caption.
- Empty (first use): `EmptyState` "No calls yet." + Upload calls + Try a sample call.
- Filter empty: "No calls match." + Clear filters.
- Error: panel `ErrorState` "Couldn't load calls" / "The server didn't respond. Try again."
- Infinite scroll: a quiet "Loading more calls" row; at the end, nothing (no "you've reached the end").
- Over the limit: `StatusBanner` "You've reached 500 calls. Delete calls to upload more."

**Interactions:** row click or Enter opens C3; star toggles in place (optimistic, reverts with a toast on failure); right-click or the row menu offers Open, Star, Tags, Open in WhatsApp, Delete. Filter values persist in the URL as opaque ids (tag and intent ids, a contact token reference, date preset, direction, match); the typed text and contact names never go in the URL, because URLs reach history and logs.

**Keyboard:** `/` focuses search; `j`/`k` move the row cursor (scrolling the virtualizer); Enter opens; `s` stars; `t` opens the tag picker for the cursor row.

| Key | English | Hebrew |
| --- | --- | --- |
| `calls.title` | Calls | שיחות |
| `calls.upload` | Upload | העלאה |
| `calls.empty.title` | No calls yet | אין עדיין שיחות |
| `calls.empty.upload` | Upload calls | העלאת שיחות |
| `calls.empty.sample` | Try a sample call | שיחה לדוגמה |
| `calls.filtered.title` | No calls match | אין שיחות תואמות |
| `calls.filtered.clear` | Clear filters | ניקוי מסננים |
| `calls.error.title` | Couldn't load calls | לא ניתן לטעון שיחות |
| `calls.error.body` | The server didn't respond. Try again. | השרת לא הגיב. כדאי לנסות שוב. |
| `calls.loadingMore` | Loading more calls | טוען שיחות נוספות |
| `calls.limit` | You've reached {n} calls. Delete calls to upload more. | הגעת ל-{n} שיחות. כדי להעלות עוד יש למחוק שיחות. |
| `calls.row.a11y` | {contact}, {direction}, {when}, {duration} | {contact}, {direction}, {when}, {duration} |
| `calls.row.decrypting` | Decrypting | מפענח |
| `calls.today` / `yesterday` | Today, {time} / Yesterday, {time} | היום, {time} / אתמול, {time} |
| `calls.duration` | {n} min | {n} דק׳ |
| `common.incoming` / `outgoing` | Incoming / Outgoing | נכנסת / יוצאת |
| `common.star` / `unstar` | Star / Unstar | סימון בכוכב / הסרת כוכב |

### C2 Search and filters (same route)

Mocks: [`calls.html`](mocks/calls.html) (text and two filters set), [`calls-suggestions.html`](mocks/calls-suggestions.html) (suggestions open), [`calls-picker.html`](mocks/calls-picker.html) (tag picker: popover on desktop, bottom sheet on phones), [`calls-scrolled.html`](mocks/calls-scrolled.html) (phone, folded summary).

**Purpose:** find calls by who, what or intent, with one search box and every filter readable as a sentence. This is the owner's `ListFilters` pattern, adapted; there is no chip bar and no row of filter buttons.

**1. Search box (`SearchBox`).** Placeholder "Search names, numbers, tags or words". Typing does two things at once:
- the text runs as a keyword search 250 ms after the last keystroke (fuzzy, Hebrew prefixes, synonyms), keeping the previous results visible;
- a list of up to 6 `SearchSuggestion`s drops below the box, built on the device from the decrypted local catalogs:
  - contacts by name or number ("דנה לוי · Contact · show only this"),
  - calls with that contact ("Call with דנה לוי · Today, 14:32 · 8 min"; opens the call),
  - tags and intents ("Hot lead · Tag · show only this"; "Tag · add to the filter" when other tags are chosen; "Tag · chosen, tap to remove" when it is set),
  - "Starred" ("Starred calls · show only these"), date presets ("Last 7 days · Date"), directions,
  - group names: "tag", "intent", "contact", "date" (and Hebrew "תגית", "כוונה", "איש קשר", "תאריך") suggest "Tag · see all 9" and open that picker,
  - the word search itself, last ("Words: מחיר · Search the transcripts").
- Matching is by word start (case-insensitive, Hebrew normalized as in indexing: final letters, niqqud, one prefix letter), and the matched part is bold with an accent underline.
- Order: filter values first, then up to 2 calls (4 when no value matches). Text that looks like an identifier (contains a digit, or is 6+ characters) puts calls and contacts-by-number first: typing "0134" offers the calls with +972 52-555-0134 before anything else.
- ↑ ↓ move, Enter applies the highlighted suggestion (or runs the word search when none is highlighted), Esc closes the list, a second Esc clears the text. Choosing a filter suggestion applies it and clears the text.
- No counts appear in suggestions or pickers (see below).

**2. Filter sentence (`FilterSentence` + `FilterBlank`s).** Under the box, the filters read as one sentence. Each blank is a button: dashed underline when empty, accent tint with a solid underline when set, "A + 2" when several values are chosen. A "Clear" link ends the sentence when anything is set.

English, nothing set:

> Showing **[all calls]** · with **[anyone]** · tagged **[any tag]** · about **[any intent]** · from **[any time]** · **[in and out]** · matching **[exact words]**

English, filters set:

> Showing **[starred calls]** · with **[דנה לוי + 1]** · tagged **[Hot lead]** · about **[Purchase interest]** · from **[the last 30 days]** · **[incoming only]** · matching **[meaning]**  Clear

Hebrew, nothing set (reads right to left; prepositions written by the Hebrew message, some folded into the value):

> מציג **[כל השיחות]** · עם **[כל איש קשר]** · עם התגית **[כל תגית]** · בנושא **[כל כוונה]** · **[בכל זמן]** · **[נכנסות ויוצאות]** · לפי **[מילים מדויקות]**

Hebrew, filters set:

> מציג **[שיחות מסומנות בכוכב]** · עם **[דנה לוי + 1]** · עם התגית **[ליד חם]** · בנושא **[עניין ברכישה]** · **[ב-30 הימים האחרונים]** · **[נכנסות בלבד]** · לפי **[משמעות]**  ניקוי

Blanks and their pickers (`FilterPicker`):

| Blank | Picker title | Options | Choice |
| --- | --- | --- | --- |
| calls | Which calls? / אילו שיחות? | All calls · Starred calls | one |
| with | Which contacts? / אילו אנשי קשר? | contacts from the local catalog, searchable; numbers without a name as numbers | several |
| tagged | Which tag? / איזו תגית? | tags with their colour dot | several |
| about | Which intent? / איזו כוונה? | built-in and custom intents | several |
| from | When? / מתי? | Today · Last 7 days · Last 30 days · This year · Custom range (calendar) | one |
| direction | Which direction? / איזה כיוון? | In and out · Incoming only · Outgoing only | one |
| matching | Match by / התאמה לפי | Exact words · Meaning | one |

"Matching [meaning]" is the semantic search: the text is embedded on the device and results sort by best match. The first time it is chosen, the blank shows a spinner and the result line says "Loading the meaning model (34 MB, once)"; keyword results stay until it is ready. With no text typed, the blank has no effect and reads in muted style.

Pickers are a popover anchored to the blank on desktop and a bottom sheet on phones (80 % height, no automatic keyboard). Multi-choice pickers end with "{n} chosen" and "Show {total} calls"; single-choice pickers close on tap ("Tap one to show only that."). Over 8 options, or when opened from a group suggestion, the picker has a search field ("Search 23 contacts"). The order is fixed while open: chosen first, then by recent use.

**No per-option counts.** Neither suggestions nor pickers show how many calls a value would return. The server stores tag, intent and contact tokens and could count them, but counting every option of every picker per keystroke multiplies requests, and contact and tag names can only be listed by the device that decrypted them. The only count shown is the total for the current filters, from the search response. If a later version adds counts, they must come from already-loaded results or a token-based facets endpoint that never sees names.

**3. Result line (`ResultLine`).** "18 calls" (keeps the previous number while loading), then "also matched" with the fuzzy and synonym variants as dashed pills, each removable (removing excludes that variant from this search), then the sort menu at the end: Newest first · Oldest first · Longest first; "Best match" is added and selected when matching by meaning.

**4. Phones: folded summary (`FoldedFilterSummary`).** Once the search block scrolls out of view, one line pins to the top: search icon, the summary ("„מחיר” · Purchase interest · the last 30 days", or "All calls"), the count, and a filter icon. Tapping it scrolls back up and focuses the box.

**Rows (`CallRow` context="search"):** as C1, plus the two-line snippet with hits marked; snippets align to the UI direction with `dir="auto"`.

**States:**
- Typing: no spinner; suggestions update as you type.
- No suggestions: the list stays closed; Enter runs the word search.
- No results: `EmptyState` "No calls match all of these." with up to two ways out as buttons: "Clear the search “מחיר”", "Any intent", "Any time" (the most recently set filters first). No counts on these buttons.
- Picker search with no match: "No tag matches “xyz”".
- Empty catalog in a picker: "No tags yet. Tags you add appear here."
- Error: "Search failed. Try again."
- Offline: the box and blanks stay usable for already-loaded results; new searches show "Search needs a connection".

**Keyboard:** `/` focuses the box; ↑ ↓ Enter Esc in suggestions; Tab moves through the blanks in reading order; Enter or Space opens a blank's picker; Esc closes it and returns focus to the blank; ↓ from the box (with no suggestions open) moves into the list.

| Key | English | Hebrew |
| --- | --- | --- |
| `search.placeholder` | Search names, numbers, tags or words | חיפוש שמות, מספרים, תגיות או מילים |
| `search.label` | Search calls | חיפוש שיחות |
| `search.clear` | Clear search | ניקוי החיפוש |
| `search.s.contact` | Contact · show only this | איש קשר · להציג רק את זה |
| `search.s.add` | {kind} · add to the filter | {kind} · להוסיף למסנן |
| `search.s.chosen` | {kind} · chosen, tap to remove | {kind} · נבחר, הקשה מסירה |
| `search.s.only` | {kind} · show only this | {kind} · להציג רק את זה |
| `search.s.group` | {kind} · see all {n} | {kind} · כל ה-{n} |
| `search.s.callWith` | Call with {contact} | שיחה עם {contact} |
| `search.s.words` | Words: {q} | מילים: {q} |
| `search.s.wordsMeta` | Search the transcripts | חיפוש בתמלולים |
| `filters.showing` | Showing | מציג |
| `filters.calls.empty` / `starred` | all calls / starred calls | כל השיחות / שיחות מסומנות בכוכב |
| `filters.contact.before` / `empty` | with / anyone | עם / כל איש קשר |
| `filters.tag.before` / `empty` | tagged / any tag | עם התגית / כל תגית |
| `filters.intent.before` / `empty` | about / any intent | בנושא / כל כוונה |
| `filters.date.before` / `empty` | from / any time | (none) / בכל זמן |
| `filters.date.values` | today · the last 7 days · the last 30 days · this year · {from} to {to} | היום · ב-7 הימים האחרונים · ב-30 הימים האחרונים · השנה · בין {from} ל-{to} |
| `filters.dir.empty` / `in` / `out` | in and out / incoming only / outgoing only | נכנסות ויוצאות / נכנסות בלבד / יוצאות בלבד |
| `filters.match.before` / `words` / `meaning` | matching / exact words / meaning | לפי / מילים מדויקות / משמעות |
| `filters.more` | {first} + {n} | {first} + {n} |
| `filters.clear` | Clear | ניקוי |
| `picker.titles` | Which calls? · Which contacts? · Which tag? · Which intent? · When? · Which direction? · Match by | אילו שיחות? · אילו אנשי קשר? · איזו תגית? · איזו כוונה? · מתי? · איזה כיוון? · התאמה לפי |
| `picker.search` | Search {n} {kinds} | חיפוש ב-{n} {kinds} |
| `picker.chosen` / `pickMany` | {n} chosen / Pick as many as you like | {n} נבחרו / אפשר לבחור כמה שרוצים |
| `picker.show` | Show {n, plural, one {# call} other {# calls}} | הצגת {n, plural, one {שיחה אחת} other {# שיחות}} |
| `picker.tapOne` | Tap one to show only that. | הקשה על אחת מציגה רק אותה. |
| `picker.noMatch` | No {kind} matches “{q}” | אין {kind} שמתאימה ל„{q}” |
| `picker.noTags` | No tags yet. Tags you add appear here. | אין עדיין תגיות. תגיות שיתווספו יופיעו כאן. |
| `results.count` | {n, plural, one {# call} other {# calls}} | {n, plural, one {שיחה אחת} other {# שיחות}} |
| `results.alsoMatched` | also matched | נמצאו גם |
| `results.exclude` | Exclude {term} | החרגת {term} |
| `results.sort` | Newest first · Oldest first · Longest first · Best match | מהחדשה לישנה · מהישנה לחדשה · מהארוכה לקצרה · ההתאמה הטובה ביותר |
| `results.meaningLoading` | Loading the meaning model ({size}, once) | טוען את מודל המשמעות ({size}, פעם אחת) |
| `noMatches.title` | No calls match all of these. | אין שיחות שמתאימות לכל אלה. |
| `noMatches.clearSearch` | Clear the search “{q}” | ניקוי החיפוש „{q}” |
| `noMatches.any` | Any {kind} | {kind} כלשהי |
| `folded.all` | All calls | כל השיחות |
| `folded.show` | Show search and filters | הצגת החיפוש והמסננים |
| `search.error` | Search failed. Try again. | החיפוש נכשל. כדאי לנסות שוב. |
| `search.offline` | Search needs a connection | חיפוש דורש חיבור |

### C3 Call view `/app/calls/[id]`

Mock: [`call-view.html`](mocks/call-view.html).

**Purpose:** read, play and act on one call; ask about it.

**Layout, desktop:** top bar with the back link ("Results for "…"" or "Calls") and, when opened from a search, hit navigation ("Hit 2 of 5", ↑ ↓, `n`). Main column (transcript, 720 px reading width) and the side panel (380 px, end edge) with tabs Ask and Notes. `CallHeader`: contact name (24 px) and number, direction, date and time, duration, `SignatureBadge`, star; tags row (removable tags, intent chips, "+ Tag"); `CallActions`: Open in WhatsApp, Call back, Download (TXT, SRT), more (Delete). `RecordingPlayer` docks at the bottom of the main column when a recording backup exists.

**Layout, mobile:** top bar with back arrow, title "Call", lock; bottom navigation hidden; header stacks; action buttons become icons with labels in tooltips; an "Ask" button in the actions row opens the Ask/Notes drawer (bottom sheet, 88 % height); the player is fixed at the bottom.

**Transcript (`TranscriptSegment`):** one list item per turn: speaker name ("You" for the user, the contact name for the other party, "Speaker 1/2" when unknown) and the timestamp button on one line, text below at 16/28 px. Each turn takes its direction from its own text (first strong character), so a Hebrew turn and its speaker line align right even in the English UI. Search hits use `mark`. The playing turn has a primary-subtle background and a start-edge bar; playback auto-scrolls until the user scrolls manually, then a "Back to playback" pill appears above the player.

**Player:** −5 s, play/pause, +5 s, current time, timeline with hit ticks, duration, speed (0.75×, 1×, 1.25×, 1.5×, 2×). Always LTR. Clicking a timestamp seeks and plays. Recording decrypts by streaming into a Blob URL; before ready, the play button shows a spinner.

**Ask panel (`AskPanel`):** suggested questions as chips when empty ("Summarize this call", "What did I promise?", "Next steps"), conversation with questions as bubbles at the end edge and answers as plain text with timestamp citations (`TimestampLink`, seek and scroll), streaming caret, textarea "Ask about this call", send button, compact `DataFlowNote` under the input naming model and route. First use per unlocked session opens C4.

**Notes (`NotesEditor`):** autosizing textarea, autosaves 800 ms after typing stops, `SaveStatus` "Saving…" / "Saved" / "Couldn't save. Retry".

**States:**
- Loading: header and transcript as `DecryptingPlaceholder` (lock icon, no caption).
- Decrypt failure: page `ErrorState` "Can't open this call on this device" / "Its key doesn't match. Reference: {id8}." + Back to calls.
- Signature: verified (success badge), unknown device, invalid (destructive badge, plus a banner above the transcript "This transcript doesn't match its signature. It may have been changed."), missing (inbox imports).
- No recording: no player; timestamps still scroll and highlight but don't play (tooltip "No recording saved for this call").
- Number hidden or missing: WhatsApp and Call back disabled with tooltip "No phone number for this call".
- Ask off on this instance or for this user: Ask tab shows `EmptyState` "Ask is turned off." + "Settings → Providers" (link only for users who can change it).
- Ask quota: "You've used today's 50 questions. More at 00:00 UTC."
- Ask error: "Anthropic didn't respond. Try again." (provider name from config).
- Delete: `ConfirmDialog` "Delete this call?" / "The transcript, notes, tags and recording are deleted for good." / Cancel · Delete call; then navigate back with a toast with Undo (5 s; the delete request is sent when the toast closes).

**Keyboard:** Space play/pause, ←/→ ±5 s, `n` / Shift+N next/previous hit, `s` star, `t` tags, `a` focus Ask, ⌘/Ctrl+Enter send, `j`/`k` next/previous call in the result set, Esc back to results.

| Key | English | Hebrew |
| --- | --- | --- |
| `call.back.results` | Results for "{q}" | תוצאות עבור „{q}" |
| `call.back.calls` | Calls | שיחות |
| `call.hit` | Hit {i} of {n} | התאמה {i} מתוך {n} |
| `call.hit.prev` / `next` | Previous hit / Next hit | ההתאמה הקודמת / ההתאמה הבאה |
| `call.sig.verified` | Signed by {device} | נחתם על ידי {device} |
| `call.sig.unknown` | Signed by a device that is no longer linked | נחתם על ידי מכשיר שכבר לא מקושר |
| `call.sig.invalid` | Signature doesn't match | החתימה לא תואמת |
| `call.sig.invalid.banner` | This transcript doesn't match its signature. It may have been changed. | התמלול לא תואם לחתימה שלו. ייתכן שהוא שונה. |
| `call.sig.missing` | Not signed: imported through the inbox | לא נחתם: יובא דרך התיבה |
| `call.tag.add` | Tag | תגית |
| `call.whatsapp` | Open in WhatsApp | פתיחה בוואטסאפ |
| `call.callBack` | Call back | חיוג חוזר |
| `call.noNumber` | No phone number for this call | אין מספר טלפון לשיחה הזאת |
| `call.download` | Download | הורדה |
| `call.download.txt` / `srt` | Transcript (TXT) / Subtitles (SRT) | תמלול (TXT) / כתוביות (SRT) |
| `call.more` | More actions | פעולות נוספות |
| `call.delete` | Delete call | מחיקת השיחה |
| `call.delete.title` | Delete this call? | למחוק את השיחה? |
| `call.delete.body` | The transcript, notes, tags and recording are deleted for good. | התמלול, ההערות, התגיות וההקלטה יימחקו לצמיתות. |
| `call.deleted` | Call deleted | השיחה נמחקה |
| `common.undo` | Undo | ביטול |
| `call.you` | You | אני |
| `call.speaker` | Speaker {n} | דובר {n} |
| `call.play.from` | Play from {t} | ניגון מ-{t} |
| `call.noRecording` | No recording saved for this call | לא נשמרה הקלטה לשיחה הזאת |
| `call.backToPlayback` | Back to playback | חזרה לניגון |
| `call.player.*` | Play · Pause · Back 5 seconds · Forward 5 seconds · Speed | ניגון · השהיה · אחורה 5 שניות · קדימה 5 שניות · מהירות |
| `call.decryptFailed.title` | Can't open this call on this device | אי אפשר לפתוח את השיחה הזאת במכשיר הזה |
| `call.decryptFailed.body` | Its key doesn't match. Reference: {id}. | המפתח שלה לא תואם. מזהה: {id}. |
| `ask.tab` / `notes.tab` | Ask / Notes | שאלה / הערות |
| `ask.placeholder` | Ask about this call | שאלה על השיחה הזאת |
| `ask.send` | Send | שליחה |
| `ask.suggest` | Summarize this call · What did I promise? · Next steps | סיכום השיחה · מה הבטחתי? · הצעדים הבאים |
| `ask.route.managed` | {model} via AskCalls · sends this call to {provider} | {model} דרך AskCalls · השיחה נשלחת ל-{provider} |
| `ask.route.direct` | {model} with your key · sends this call to {provider} | {model} עם המפתח שלך · השיחה נשלחת ל-{provider} |
| `ask.off` | Ask is turned off. | שאלות כבויות. |
| `ask.quota` | You've used today's {n} questions. More at 00:00 UTC. | ניצלת את {n} השאלות של היום. עוד שאלות ב-00:00 UTC. |
| `ask.error` | {provider} didn't respond. Try again. | {provider} לא הגיבה. כדאי לנסות שוב. |
| `notes.placeholder` | Notes | הערות |
| `notes.saving` / `saved` / `error` | Saving… / Saved / Couldn't save. Retry | שומר… / נשמר / השמירה נכשלה. ניסיון חוזר |

### C4 Ask consent sheet

Mock: [`call-view-consent.html`](mocks/call-view-consent.html).

**Purpose:** consent before one call's plaintext goes to an LLM provider, naming who receives it. Shown on the first question per unlocked session, and again whenever the provider, model or route changes. Desktop: Dialog (544 px). Mobile: bottom sheet.

**Content:** title naming the provider, `DataFlowNote` (route diagram + one sentence, varies by route), three short facts, checkbox "Don't ask again until I lock AskCalls" (session scope only), "Change provider: Settings → Providers", Cancel and "Send and ask" (initial focus).

| Key | English | Hebrew |
| --- | --- | --- |
| `consent.title` | Send this call to {provider}? | לשלוח את השיחה הזאת ל-{provider}? |
| `dataFlow.ask.managed` | This call's transcript and your question go through AskCalls to {provider} ({model}). AskCalls doesn't store them. | התמלול של השיחה והשאלה שלך עוברים דרך AskCalls אל {provider} ‏({model}). AskCalls לא שומרת אותם. |
| `dataFlow.ask.direct` | This call's transcript and your question go from your device straight to {provider} under your account. AskCalls doesn't see them. | התמלול של השיחה והשאלה שלך יוצאים מהמכשיר שלך ישירות ל-{provider}, תחת החשבון שלך. AskCalls לא רואה אותם. |
| `dataFlow.ask.passthrough` | This call's transcript and your question pass through AskCalls with your key to {provider}. Nothing is stored or logged. | התמלול של השיחה והשאלה שלך עוברים דרך AskCalls עם המפתח שלך אל {provider}. דבר לא נשמר ולא נרשם. |
| `consent.fact.scope` | Only this call. Not your other calls, contacts or notes. | רק השיחה הזאת. לא שיחות אחרות, אנשי קשר או הערות. |
| `consent.fact.names` | Names and numbers in the transcript are included. | שמות ומספרים שבתמלול נכללים. |
| `consent.fact.retention.zero` | {provider} keeps nothing under its zero-retention terms. | {provider} לא שומרת דבר לפי תנאי אי-השמירה שלה. |
| `consent.fact.retention.standard` | {provider} may keep request logs under its standard policy. | {provider} עשויה לשמור יומני בקשות לפי המדיניות הרגילה שלה. |
| `consent.remember` | Don't ask again until I lock AskCalls | לא לשאול שוב עד שאנעל את AskCalls |
| `consent.change` | Change provider: Settings → Providers | החלפת ספק: הגדרות ← ספקים |
| `consent.cancel` / `send` | Cancel / Send and ask | ביטול / שליחה ושאלה |

---

## Upload `/app/upload`

Tabs: Single, Bulk. The active transcription provider and its `DataFlowNote` appear on both before anything is sent.

### U1 Single upload

**Layout:** `FileDropZone` (audio and/or transcript; "Choose files" button plus drop), then a form: phone number (parsed from metadata or file name, editable, `PhoneNumber` formatting, default region IL), date and time, direction (Incoming / Outgoing / Unknown segmented), contact name (autocomplete from contacts), "Back up recording" switch (default from S2), `DataFlowNote` for transcription when audio has no transcript, primary "Upload". Progress replaces the button with `QueueItemStatus` steps (Decoding, Transcribing, Indexing, Encrypting, Uploading) and ends with "Done" + "Open call" / "Upload another".

**States:** duplicate ("Already uploaded" + "Open the existing call"); transcription off and audio only ("Transcription is off. Add a transcript file to upload this call."); unsupported file ("This file type isn't supported. Use audio, or TXT, SRT, VTT or JSON transcripts."); quota ("Transcription limit reached for this month. Upload the transcript instead, or use your own key."); failure at a step (one line naming the step + Retry).

| Key | English | Hebrew |
| --- | --- | --- |
| `upload.title` | Upload | העלאה |
| `upload.tab.single` / `bulk` | Single / Bulk | שיחה אחת / ייבוא מרובה |
| `upload.drop` | Drop audio or a transcript here | אפשר לגרור לכאן שמע או תמלול |
| `upload.choose` | Choose files | בחירת קבצים |
| `upload.phone` / `date` / `direction` / `contact` | Phone number / Date and time / Direction / Contact name | מספר טלפון / תאריך ושעה / כיוון / שם איש קשר |
| `upload.direction.unknown` | Unknown | לא ידוע |
| `upload.backup` | Back up recording | גיבוי ההקלטה |
| `upload.cta` | Upload | העלאה |
| `upload.done` / `open` / `another` | Done / Open call / Upload another | הושלם / פתיחת השיחה / העלאה נוספת |
| `upload.dup` | Already uploaded | כבר הועלתה |
| `upload.dup.open` | Open the existing call | פתיחת השיחה הקיימת |
| `upload.txOff` | Transcription is off. Add a transcript file to upload this call. | התמלול כבוי. כדי להעלות את השיחה יש להוסיף קובץ תמלול. |
| `upload.unsupported` | This file type isn't supported. Use audio, or TXT, SRT, VTT or JSON transcripts. | סוג הקובץ לא נתמך. אפשר להעלות שמע, או תמלול בפורמט TXT, SRT, VTT או JSON. |
| `upload.quota` | Transcription limit reached for this month. Upload the transcript instead, or use your own key. | הגעת למגבלת התמלול של החודש. אפשר להעלות תמלול במקום, או להשתמש במפתח משלך. |
| `dataFlow.tx.managed` | Audio passes through AskCalls to {provider}, streamed and not stored. {provider} may keep request logs under its standard policy. | השמע עובר דרך AskCalls אל {provider}, בזרימה ובלי שמירה. {provider} עשויה לשמור יומני בקשות לפי המדיניות הרגילה שלה. |
| `dataFlow.tx.direct` | Audio goes from your device straight to {provider} under your account. AskCalls doesn't see it. | השמע יוצא מהמכשיר שלך ישירות ל-{provider}, תחת החשבון שלך. AskCalls לא רואה אותו. |

### U2 Bulk upload

Mock: [`upload-bulk.html`](mocks/upload-bulk.html) (queue in progress).

**Flow:** pick (folder picker, files, or ZIP; optional `manifest.csv`) → pre-flight summary → queue.

**Pre-flight (`PreflightSummary`):** four counts (audio only, will be transcribed; audio with transcript; transcript only; likely duplicates, skipped), estimated transcription minutes with `UsageMeter` showing the month after this import, manifest coverage ("manifest.csv set names and dates for {n} files"), `DataFlowNote`, "Back up recordings" switch, primary "Start import", secondary "Choose different files". If the import would exceed the minute quota: warning "This import needs about {n} minutes; you have {m} left. Files over the limit stay queued until next month or until you add your own key."

**Queue:** `JobProgress` ("{done} of {total} files done. {active} in progress, {failed} failed, {dup} duplicates skipped. About {t} left.") with Pause; hint "You can close this tab and resume later."; filter tabs All / In progress / Failed / Duplicates; table rows (`QueueRow`): file name (mono, LTR, truncates with the full name in a tooltip), kind badges, contact (from manifest, file name or metadata), `QueueItemStatus` with a thin progress bar for transcription, Retry for failed rows, a link to the existing call for duplicates. "Retry all failed". Desktop: the summary stays in a 320 px side column. Mobile: the table becomes stacked cards; the summary moves above the queue and collapses to one line.

**States:** pausing ("Pausing…" until the workers finish their current step), paused (banner X2), resumed after reload (banner "Import paused: {done} of {total} done." + Resume; if file handles were lost: "Pick the folder again to continue."), done ("{n} calls imported. {f} failed, {d} duplicates." + View calls + Retry failed), empty folder ("No audio or transcript files found in this folder."), ZIP error ("Couldn't open this ZIP.").

**Keyboard:** Space on the focused Pause/Resume; table rows are not focusable except their buttons.

| Key | English | Hebrew |
| --- | --- | --- |
| `bulk.pick` | Choose a folder · Choose files · Choose a ZIP | בחירת תיקייה · בחירת קבצים · בחירת ZIP |
| `bulk.manifest` | Add manifest.csv (optional) | הוספת manifest.csv (לא חובה) |
| `bulk.summary` | Import summary | סיכום הייבוא |
| `bulk.sum.audio` / `paired` / `tx` / `dup` | audio only, will be transcribed / audio with transcript / transcript only / likely duplicates, skipped | שמע בלבד, יתומללו / שמע עם תמלול / תמלול בלבד / כפילויות אפשריות, ידולגו |
| `bulk.minutes` | About {n} minutes of audio to transcribe. | כ-{n} דקות שמע לתמלול. |
| `bulk.usage` | Transcription this month, after this import | תמלול החודש, אחרי הייבוא |
| `bulk.manifestApplied` | manifest.csv set names and dates for {n} files. | manifest.csv קבע שמות ותאריכים ל-{n} קבצים. |
| `bulk.overQuota` | This import needs about {n} minutes; you have {m} left. Files over the limit stay queued until next month or until you add your own key. | הייבוא דורש כ-{n} דקות ונותרו {m}. קבצים מעבר למגבלה יחכו בתור עד החודש הבא או עד שיתווסף מפתח משלך. |
| `bulk.start` / `change` | Start import / Choose different files | התחלת ייבוא / בחירת קבצים אחרים |
| `bulk.progress` | {done} of {total} files done. {active} in progress, {failed} failed, {dup} duplicates skipped. About {t} left. | {done} מתוך {total} קבצים הושלמו. {active} בתהליך, {failed} נכשלו, {dup} כפילויות דולגו. נותרו כ-{t}. |
| `bulk.closeHint` | You can close this tab and resume later. | אפשר לסגור את הלשונית ולהמשיך אחר כך. |
| `bulk.pause` / `pausing` / `resume` | Pause / Pausing… / Resume | השהיה / משהה… / המשך |
| `bulk.tab.*` | All · In progress · Failed · Duplicates | הכול · בתהליך · נכשלו · כפילויות |
| `bulk.col.*` | File · Contact · Status | קובץ · איש קשר · סטטוס |
| `bulk.retry` / `retryAll` | Retry / Retry all failed | ניסיון חוזר / ניסיון חוזר לכל הכושלים |
| `queue.*` | Queued · Decoding · Transcribing · Indexing · Encrypting · Uploading · Done · Duplicate · Failed | בתור · מפענח שמע · מתמלל · מאנדקס · מצפין · מעלה · הושלם · כפילות · נכשל |
| `bulk.dupOf` | Same audio as the call on {when} | אותו שמע כמו השיחה מ-{when} |
| `bulk.err.decode` | Couldn't decode the audio. The file may be damaged or in an unsupported format. | לא ניתן לפענח את השמע. ייתכן שהקובץ פגום או בפורמט שלא נתמך. |
| `bulk.err.transcribe` | Transcription failed. Retry. | התמלול נכשל. ניסיון חוזר. |
| `bulk.err.upload` | Upload failed. Check your connection and retry. | ההעלאה נכשלה. כדאי לבדוק את החיבור ולנסות שוב. |
| `bulk.resumeBanner` | Import paused: {done} of {total} done. | הייבוא הושהה: {done} מתוך {total} הושלמו. |
| `bulk.repick` | Pick the folder again to continue. | כדי להמשיך יש לבחור שוב את התיקייה. |
| `bulk.done` | {n} calls imported. {f} failed, {d} duplicates. | {n} שיחות יובאו. {f} נכשלו, {d} כפילויות. |
| `bulk.viewCalls` | View calls | הצגת השיחות |
| `bulk.emptyFolder` | No audio or transcript files found in this folder. | לא נמצאו בתיקייה קובצי שמע או תמלול. |
| `bulk.zipError` | Couldn't open this ZIP. | לא ניתן לפתוח את קובץ ה-ZIP. |

---

## Organise `/app/tags`

Page title "Tags and rules"; tabs Tags, Intents, Rules, Synonyms (with icons). Every change saves on blur or explicit Save and shows `SaveStatus`.

### T1 Tags

**Layout:** "New tag" button; list of `TagManagerRow`s: colour dot (opens a popover of the eight colours), name (click to rename inline), call count, Delete. Sorted by name; a filter input appears at 20+ tags.

**States:** empty ("No tags yet." + New tag); delete confirm ("Delete the tag {name}?" / "It's removed from {n} calls. The calls stay." / Delete tag); rename conflict ("A tag with this name exists.").

| Key | English | Hebrew |
| --- | --- | --- |
| `tags.new` | New tag | תגית חדשה |
| `tags.empty` | No tags yet | אין עדיין תגיות |
| `tags.count` | {n, plural, one {# call} other {# calls}} | {n, plural, one {שיחה אחת} other {# שיחות}} |
| `tags.colour` | Colour | צבע |
| `tags.rename` / `delete` | Rename / Delete | שינוי שם / מחיקה |
| `tags.delete.title` | Delete the tag {name}? | למחוק את התגית {name}? |
| `tags.delete.body` | It's removed from {n} calls. The calls stay. | היא תוסר מ-{n} שיחות. השיחות נשארות. |
| `tags.exists` | A tag with this name exists. | כבר יש תגית בשם הזה. |

### T2 Intents

**Layout:** list of intents (built-ins first, badge "Built-in"), each an `IntentEditor` card: name (editable for custom only), example sentences (one per line, Hebrew and English mixed, `dir="auto"` per line), threshold slider (0.70 to 0.95, default 0.82) with "Matches {n} calls at this threshold" updating after release, Delete (custom only). "New intent" creates a card with three empty example lines. Needs at least 3 examples to save.

| Key | English | Hebrew |
| --- | --- | --- |
| `intents.new` | New intent | כוונה חדשה |
| `intents.builtin` | Built-in | מובנית |
| `intents.examples` | Example sentences | משפטים לדוגמה |
| `intents.examples.hint` | One per line. At least 3. | אחד בכל שורה. לפחות 3. |
| `intents.threshold` | Threshold | סף |
| `intents.matches` | Matches {n} calls at this threshold | מתאים ל-{n} שיחות בסף הזה |
| `intents.builtins` | Purchase interest · Price question · Complaint · Service request · Scheduling · Legal · Follow-up needed | עניין ברכישה · שאלת מחיר · תלונה · בקשת שירות · תיאום מועד · משפטי · נדרש מעקב |

### T3 Rules

Mock: [`tags-rules.html`](mocks/tags-rules.html).

**Layout:** desktop two columns: rule list (288 px: name, one-line summary, Off badge) and `RuleBuilder`. Builder: rule name, On switch; "When [all|any] of these match" with `RuleCondition` rows (field, operator, value, remove): Keyword contains any/all of (term chips, Fuzzy switch), Intent is / is not, Contact is / is not in (contacts or a contact list), Duration is at least / at most (buckets: 1, 5, 15, 60 min), Direction is, Regex matches (with a "Test" field). "Then" with `RuleAction` rows: Add tag (picker), Star the call. Live preview "Matches {n} calls." with Show them (opens C2 with the rule as filters where expressible). Footer: Save rule, Apply to existing calls, `SaveStatus`, Delete rule. Applying shows `JobProgress` "Applying to existing calls: {done} of {total}" with Stop; runs in batches on the device. Mobile: list above, builder below; condition rows stack.

**States:** empty ("No rules yet." + New rule); invalid regex (inline "This pattern isn't valid."); incomplete row (Save disabled, the row outlined with "Pick a value."); apply finished (toast "Rule applied to {n} calls.").

| Key | English | Hebrew |
| --- | --- | --- |
| `rules.title` | Rules | כללים |
| `rules.new` | New rule | כלל חדש |
| `rules.empty` | No rules yet | אין עדיין כללים |
| `rules.on` / `off` | On / Off | פעיל / כבוי |
| `rules.when` | When {all|any} of these match | כאשר {all|any} התנאים האלה מתקיימים |
| `rules.all` / `any` | all / any | כל / אחד מ |
| `rules.field.*` | Keyword · Intent · Contact · Duration · Direction · Regex | מילת מפתח · כוונה · איש קשר · משך · כיוון · ביטוי רגולרי |
| `rules.op.*` | contains any of · contains all of · is · is not · is in · is not in · is at least · is at most · matches | מכילה אחת מ · מכילה את כל · היא · אינה · נמצא ב · לא נמצא ב · לפחות · לכל היותר · תואם |
| `rules.fuzzy` | Fuzzy | גמיש |
| `rules.then` | Then | אז |
| `rules.action.*` | Add tag · Star the call | הוספת תגית · סימון בכוכב |
| `rules.addCondition` / `addAction` | Add condition / Add action | הוספת תנאי / הוספת פעולה |
| `rules.preview` | Matches {n} calls. | מתאים ל-{n} שיחות. |
| `rules.showThem` | Show them | הצגה |
| `rules.save` / `apply` / `delete` | Save rule / Apply to existing calls / Delete rule | שמירת הכלל / החלה על שיחות קיימות / מחיקת הכלל |
| `rules.applying` | Applying to existing calls: {done} of {total} | מחיל על שיחות קיימות: {done} מתוך {total} |
| `rules.stop` | Stop | עצירה |
| `rules.applied` | Rule applied to {n} calls. | הכלל הוחל על {n} שיחות. |
| `rules.regexInvalid` | This pattern isn't valid. | הביטוי הזה לא תקין. |
| `rules.pickValue` | Pick a value. | יש לבחור ערך. |

### T4 Synonyms

**Layout:** list of `SynonymRow`s: canonical term, "=" , variant chips (e.g. `iphone` = אייפון, ai phone), add-variant input, delete. "New synonym group". Note under the title: "Synonyms apply to new searches right away and to imported calls from now on. Re-index to apply them to existing calls." with "Re-index" (`JobProgress`).

| Key | English | Hebrew |
| --- | --- | --- |
| `syn.new` | New synonym group | קבוצת מילים נרדפות חדשה |
| `syn.canonical` | Main term | מונח ראשי |
| `syn.variants` | Also means | נחשב גם |
| `syn.note` | Applies to searches now and to calls imported from now on. Re-index to include existing calls. | חל על חיפושים מעכשיו ועל שיחות שיובאו מעכשיו. כדי לכלול שיחות קיימות יש לאנדקס מחדש. |
| `syn.reindex` | Re-index | אינדוקס מחדש |
| `syn.empty` | No synonyms yet | אין עדיין מילים נרדפות |

### K1 Contacts `/app/contacts`

**Purpose:** names for numbers. **Layout:** title "Contacts", "New contact" and "Import VCF" (optional in R1; `FileDropZone` for `.vcf`), filter input, list of `ContactRow`s (name, one or more numbers, call count); selecting a row opens a side panel (sheet on mobile) with editable name and numbers and the contact's calls as compact `CallRow`s. Names are used for redaction and display.

**States:** empty ("No contacts yet." + New contact · Import VCF); VCF imported (toast "{n} contacts imported, {d} already existed."); invalid number (inline "Enter a number with country code, like +972 52 555 0134.").

| Key | English | Hebrew |
| --- | --- | --- |
| `contacts.title` | Contacts | אנשי קשר |
| `contacts.new` / `import` | New contact / Import VCF | איש קשר חדש / ייבוא VCF |
| `contacts.empty` | No contacts yet | אין עדיין אנשי קשר |
| `contacts.name` / `numbers` / `addNumber` | Name / Numbers / Add number | שם / מספרים / הוספת מספר |
| `contacts.imported` | {n} contacts imported, {d} already existed. | {n} אנשי קשר יובאו, {d} כבר היו קיימים. |
| `contacts.badNumber` | Enter a number with country code, like +972 52 555 0134. | יש להזין מספר עם קידומת מדינה, למשל ‎+972 52 555 0134. |
| `contacts.calls` | Calls | שיחות |

---

## Settings `/app/settings/*`

Layout: desktop: a 208 px section list (Security, Recordings, Retention, API and MCP, Providers, Privacy, Audit log, Data) and a 768 px content column of `SettingsSection` cards. Tablet and mobile: the section list is the Settings index page; each section opens as its own page with a breadcrumb ("Settings › Providers") and a back arrow in the top bar. Hosted instance: per-user choices only; instance-level settings never appear here.

### S1 Security

Mock: [`settings-security.html`](mocks/settings-security.html).

**Content:** title "Security", one line "Keep at least two ways to unlock." Sections:
- **Passkeys:** `UnlockMethodRow` per passkey (device · provider, created, last used and OS, "This device" badge), Remove; "Add passkey".
- **Recovery code and passphrase:** recovery code (created date, Regenerate: requires an unlock, then shows O3/O4 again and revokes the old code on confirm), passphrase (Not set → Set passphrase; set → Change, Remove).
- **Linked devices:** browsers and agents (`UnlockMethodRow` kind="device") with Revoke; "Link a device" opens D1.
- **Auto-lock:** "Lock after idle for" select: 5, 15 (default), 30, 60 minutes, 4 hours.

**States:** removing the last passkey when no passphrase exists: allowed only with a confirmed recovery code ("Remove your only passkey? You'll need your recovery code to unlock on this device."); revoke confirm ("Revoke {device}? It loses access at its next request. Keys it already holds aren't rotated in this version."); passkey add cancelled (inline).

| Key | English | Hebrew |
| --- | --- | --- |
| `sec.title` | Security | אבטחה |
| `sec.subtitle` | Keep at least two ways to unlock. | כדאי לשמור לפחות שתי דרכים לביטול נעילה. |
| `sec.passkeys` / `add` | Passkeys / Add passkey | מפתחות גישה / הוספת מפתח גישה |
| `sec.thisDevice` | This device | המכשיר הזה |
| `sec.created` / `lastUsed` | Created {date} / Last used {when} on {os} | נוצר ב-{date} / שימוש אחרון {when} ב-{os} |
| `sec.remove` | Remove | הסרה |
| `sec.removeLast` | Remove your only passkey? You'll need your recovery code to unlock on this device. | להסיר את מפתח הגישה היחיד? כדי לפתוח במכשיר הזה יידרש קוד השחזור. |
| `sec.recovery` / `regenerate` | Recovery code / Regenerate | קוד שחזור / יצירה מחדש |
| `sec.regenerate.body` | The old code stops working once you confirm the new one. | הקוד הישן יפסיק לעבוד אחרי אישור הקוד החדש. |
| `sec.passphrase` / `set` / `change` / `notSet` | Passphrase / Set passphrase / Change / Not set | משפט סיסמה / הגדרת משפט סיסמה / שינוי / לא הוגדר |
| `sec.devices` / `link` / `revoke` | Linked devices / Link a device / Revoke | מכשירים מקושרים / קישור מכשיר / ביטול |
| `sec.revoke.title` | Revoke {device}? | לבטל את {device}? |
| `sec.revoke.body` | It loses access at its next request. Keys it already holds aren't rotated in this version. | הגישה שלו תיחסם בבקשה הבאה. מפתחות שכבר נמצאים אצלו לא מוחלפים בגרסה הזאת. |
| `sec.autolock` / `idleFor` | Auto-lock / Lock after idle for | נעילה אוטומטית / נעילה אחרי חוסר פעילות של |

### D1 Device linking dialog

Mock: dialog in `settings-security.html`.

**Steps (`Stepper`):** 1 Connect, 2 Compare, 3 Done.
1. **Connect:** `DeviceLinkCode`: QR (local SVG) and short code (`K7P-4QX`), countdown "Expires in 9:41", instructions for both device kinds: "On the new browser, open askcalls.com/link and enter the code." / "On a computer, run askcalls link and enter the code." Waiting state shows a spinner line "Waiting for the new device…".
2. **Compare:** the new device's name and kind, `FingerprintCode` (6 digits, 40 px mono), warning callout, "They don't match" / "They match, link this device" (primary).
3. **Done:** "{device} is linked." + Close; the device appears in the list; an audit event is written.

**States:** expired ("This code expired. Create a new one." + New code); mismatch (closes the session, toast "Linking cancelled. Nothing was shared."); error ("Couldn't reach the new device. Start again.").

**Mobile:** full-height bottom sheet; the QR is hidden behind "Show QR code" when the trusted device is a phone (scanning your own screen is impossible), short code first.

| Key | English | Hebrew |
| --- | --- | --- |
| `link.title` | Link a device | קישור מכשיר |
| `link.steps` | Connect · Compare · Done | חיבור · השוואה · סיום |
| `link.browser` | On the new browser, open askcalls.com/link and enter the code. | בדפדפן החדש יש לפתוח את askcalls.com/link ולהזין את הקוד. |
| `link.agent` | On a computer, run askcalls link and enter the code. | במחשב יש להריץ askcalls link ולהזין את הקוד. |
| `link.expires` | Expires in {t} | בתוקף עוד {t} |
| `link.waiting` | Waiting for the new device… | ממתין למכשיר החדש… |
| `link.connected` | A new device connected: {device}, {os} | מכשיר חדש התחבר: {device}, {os} |
| `link.question` | Does the new device show this code? | האם המכשיר החדש מציג את הקוד הזה? |
| `link.agentHint` | In the terminal, askcalls link prints the same 6 digits. | בטרמינל, askcalls link מדפיס את אותן 6 ספרות. |
| `link.warning` | Only link a device you are holding. AskCalls never asks for this code. | יש לקשר רק מכשיר שנמצא בידיים שלך. AskCalls אף פעם לא מבקשת את הקוד הזה. |
| `link.match` / `noMatch` | They match, link this device / They don't match | הקודים תואמים, לקשר את המכשיר / הקודים לא תואמים |
| `link.done` | {device} is linked. | {device} קושר. |
| `link.expired` | This code expired. Create a new one. | הקוד פג. יש ליצור קוד חדש. |
| `link.newCode` | New code | קוד חדש |
| `link.cancelled` | Linking cancelled. Nothing was shared. | הקישור בוטל. לא שותף דבר. |
| `link.showQr` | Show QR code | הצגת קוד QR |

### S2 Recordings

**Content:** "Back up recordings by default" switch (applies to new uploads), storage used `UsageMeter` ("{used} of 2 GB"), where recordings are kept (links to S5 Recording backups card), "Delete all recordings" (keeps transcripts; confirm dialog).

| Key | English | Hebrew |
| --- | --- | --- |
| `rec.title` | Recordings | הקלטות |
| `rec.default` | Back up recordings by default | גיבוי הקלטות כברירת מחדל |
| `rec.used` | Storage used | אחסון בשימוש |
| `rec.where` | Stored in: {place} · Change | נשמרות ב: {place} · שינוי |
| `rec.deleteAll` | Delete all recordings | מחיקת כל ההקלטות |
| `rec.deleteAll.body` | Transcripts, tags and notes stay. This can't be undone. | התמלולים, התגיות וההערות נשארים. אי אפשר לבטל את הפעולה. |

### S3 Retention

**Content:** two `ChoiceCard`s: "Keep calls until I delete them" and "Delete calls older than [N] days" (number input, 30 to 3650). Changing to a shorter period shows a confirm with the count that will be deleted at the next daily run. For own-bucket recordings: "Recordings in your bucket are deleted by your device at the next unlock."

| Key | English | Hebrew |
| --- | --- | --- |
| `ret.title` | Retention | שמירת נתונים |
| `ret.forever` | Keep calls until I delete them | לשמור שיחות עד שאמחק אותן |
| `ret.days` | Delete calls older than {n} days | למחוק שיחות ישנות מ-{n} ימים |
| `ret.confirm` | {n} calls are older than this and will be deleted tonight. | {n} שיחות ישנות מזה וימחקו הלילה. |
| `ret.bucket` | Recordings in your bucket are deleted by your device at the next unlock. | הקלטות בדלי שלך נמחקות על ידי המכשיר שלך בביטול הנעילה הבא. |

### S4 API and MCP

**Content:**
- **Personal access tokens** (`TokenRow`: name, scopes as badges, expiry, last used, fetches this hour `UsageMeter` 60/h, Revoke). "Create token" dialog: name, scopes (read, write, ask, keys; checkboxes with one-line meaning each), expiry (30 days, 90 days, 1 year, no expiry). After create: the token once in `CopyableCode` with "Copy it now. You won't see it again." 5 tokens max ("You have 5 tokens. Revoke one to create another.").
- **Local agent:** client picker and `CopyableCode` snippets (as README), "Restart Claude Desktop after saving." line for Desktop.
- **Remote MCP:** URL `CopyableCode`, the tool list, and the inbox `DataFlowNote`.

| Key | English | Hebrew |
| --- | --- | --- |
| `api.title` | API and MCP | API ו-MCP |
| `api.tokens` / `create` | Personal access tokens / Create token | אסימוני גישה אישיים / יצירת אסימון |
| `api.scope.read` | read: search and fetch calls | read: חיפוש ושליפת שיחות |
| `api.scope.write` | write: upload and edit calls | write: העלאה ועריכה של שיחות |
| `api.scope.ask` | ask: ask about a call | ask: שאלות על שיחה |
| `api.scope.keys` | keys: fetch wrapped keys to unlock the agent | keys: שליפת מפתחות עטופים לפתיחת הסוכן |
| `api.expiry` | Expires · 30 days · 90 days · 1 year · Never | תפוגה · 30 ימים · 90 ימים · שנה · אף פעם |
| `api.once` | Copy it now. You won't see it again. | יש להעתיק עכשיו. הוא לא יוצג שוב. |
| `api.max` | You have 5 tokens. Revoke one to create another. | יש לך 5 אסימונים. כדי ליצור חדש יש לבטל אחד. |
| `api.fetches` | Fetches this hour | שליפות בשעה האחרונה |
| `api.agent` | Local agent | סוכן מקומי |
| `api.remote` | Remote MCP | MCP מרוחק |
| `dataFlow.inbox` | Inbox uploads are visible to the AskCalls server in transit. They're encrypted to your key on arrival and added to your calls the next time you unlock. | העלאות לתיבה גלויות לשרת של AskCalls בזמן ההעברה. הן מוצפנות למפתח שלך מיד כשהן מגיעות ונוספות לשיחות בביטול הנעילה הבא. |

### S5 Providers

Mock: [`settings-providers.html`](mocks/settings-providers.html).

**Content:** title "Providers", one line "Managed by AskCalls unless you choose otherwise." Three `ProviderCard`s (Transcription, Ask about a call, Recording backups), each: icon, title, status badge (Working / Needs setup / Off), choice segmented control (AskCalls managed · Your own key/bucket · Off), `DataFlowNote` that changes with the choice, provider and model pickers, language default (transcription), key field (`MaskedSecret` after save: Replace, Remove; "Billed by {provider}"), `TestConnectionResult`, usage meter (managed). Own bucket adds endpoint, bucket, region, access key ID and secret, CORS check with the exact JSON to paste (`CopyableCode`), and "Move existing recordings" when switching. "Local (on-device)" is shown disabled with the badge "Planned" and "Not available in this version." Browser-incompatible providers show: "Works in the desktop agent. In the browser, requests pass through AskCalls without storing your key or audio."

**States:** testing, test failed (one line with status class: "Key rejected (401). Check the key." / "Upload blocked by CORS (403)." / "Couldn't reach {host}."), switching to Off (confirm "Audio uploads will be disabled. Transcript uploads still work."), env-locked on self-hosted (`EnvLockedField`, user choice hidden if the admin disallowed BYO).

| Key | English | Hebrew |
| --- | --- | --- |
| `prov.title` | Providers | ספקים |
| `prov.subtitle` | Managed by AskCalls unless you choose otherwise. | מנוהל על ידי AskCalls אלא אם בוחרים אחרת. |
| `prov.tx` / `ask` / `rec` | Transcription / Ask about a call / Recording backups | תמלול / שאלות על שיחה / גיבוי הקלטות |
| `prov.choice` | AskCalls managed · Your own key · Your own bucket · Off | מנוהל על ידי AskCalls · מפתח משלך · דלי משלך · כבוי |
| `prov.status` | Working · Needs setup · Off | פועל · דורש הגדרה · כבוי |
| `prov.model` / `language` / `provider` / `apiKey` | Model / Default language / Provider / API key | מודל / שפת ברירת מחדל / ספק / מפתח API |
| `prov.autoLang` | Detect automatically | זיהוי אוטומטי |
| `prov.billed` | Billed by {provider} | החיוב דרך {provider} |
| `prov.replace` / `remove` | Replace / Remove | החלפה / הסרה |
| `prov.test` / `testing` | Test connection / Testing… | בדיקת חיבור / בודק… |
| `prov.test.okTx` | Connected. A 3-second sample transcribed in {s} s. | מחובר. דגימה של 3 שניות תומללה ב-{s} שניות. |
| `prov.test.okAsk` | Connected. {model} answered in {s} s. | מחובר. {model} ענה ב-{s} שניות. |
| `prov.test.401` | Key rejected (401). Check the key. | המפתח נדחה (401). כדאי לבדוק אותו. |
| `prov.test.cors` | Upload blocked by CORS (403). | ההעלאה נחסמה על ידי CORS ‏(403). |
| `prov.test.unreachable` | Couldn't reach {host}. | לא ניתן להגיע אל {host}. |
| `prov.cors` | Add this CORS rule to your bucket, then test again. | יש להוסיף את כלל ה-CORS הזה לדלי ולבדוק שוב. |
| `prov.move` | Move existing recordings | העברת ההקלטות הקיימות |
| `prov.usage` | Managed transcription this month | תמלול מנוהל החודש |
| `prov.local` | Local (on-device) | מקומי (במכשיר) |
| `prov.planned` | Planned | מתוכנן |
| `prov.notAvailable` | Not available in this version. | לא זמין בגרסה הזאת. |
| `prov.agentOnly` | Works in the desktop agent. In the browser, requests pass through AskCalls without storing your key or audio. | עובד בסוכן במחשב. בדפדפן הבקשות עוברות דרך AskCalls בלי לשמור את המפתח או את השמע. |
| `prov.off.confirm` | Audio uploads will be disabled. Transcript uploads still work. | העלאת שמע תושבת. העלאת תמלולים תמשיך לעבוד. |
| `dataFlow.rec.own` | Recordings and bucket credentials go from your device to your bucket, not through AskCalls. | ההקלטות ופרטי הגישה לדלי עוברים מהמכשיר שלך לדלי שלך, לא דרך AskCalls. |

### S6 Privacy

**Content:** "Product analytics" switch (off by default; one line listing what is sent: "Page names, counts and timings. Never call content, names, numbers or file names."), "Error reports" switch (same rule), "Single-key shortcuts" switch (on by default), "Install app" (PWA prompt when available).

| Key | English | Hebrew |
| --- | --- | --- |
| `priv.title` | Privacy | פרטיות |
| `priv.analytics` | Product analytics | נתוני שימוש |
| `priv.errors` | Error reports | דיווחי שגיאות |
| `priv.whatIsSent` | Page names, counts and timings. Never call content, names, numbers or file names. | שמות עמודים, ספירות וזמנים. אף פעם לא תוכן שיחות, שמות, מספרים או שמות קבצים. |
| `priv.shortcuts` | Single-key shortcuts | קיצורים של מקש יחיד |
| `priv.install` | Install app | התקנת האפליקציה |

### S7 Audit log

**Content:** filters (actor: session, token, agent; action; date range) and a `Table` of `AuditEventRow`s (time, actor, action, call id prefix with a link, device). Infinite scroll. Content-free by construction.

**States:** loading (skeleton rows), empty ("No events for these filters."), error.

| Key | English | Hebrew |
| --- | --- | --- |
| `audit.title` | Audit log | יומן פעילות |
| `audit.col` | Time · Actor · Action · Call · Device | זמן · גורם · פעולה · שיחה · מכשיר |
| `audit.empty` | No events for these filters | אין אירועים למסננים האלה |
| `audit.actions` | Read call · Ingest · Update · Delete · Search · Link device · Revoke · Token created · Token revoked · Export | קריאת שיחה · ייבוא · עדכון · מחיקה · חיפוש · קישור מכשיר · ביטול · אסימון נוצר · אסימון בוטל · ייצוא |

### S8 Data

**Content:** "Export everything" (decrypted on this device into a ZIP: transcripts JSON and SRT, recordings, tags; `JobProgress`; "Keep this tab open until the download starts."), "Delete account" (`ConfirmDialog` requiring the account email typed; warns about own-bucket recordings: "Recordings in your own bucket are deleted from this device next; keep it open until it finishes.").

| Key | English | Hebrew |
| --- | --- | --- |
| `data.title` | Data | נתונים |
| `data.export` | Export everything | ייצוא של הכול |
| `data.export.hint` | Keep this tab open until the download starts. | יש להשאיר את הלשונית פתוחה עד שההורדה תתחיל. |
| `data.exporting` | Preparing export: {done} of {total} calls | מכין ייצוא: {done} מתוך {total} שיחות |
| `data.delete` | Delete account | מחיקת החשבון |
| `data.delete.title` | Delete your account and all calls? | למחוק את החשבון ואת כל השיחות? |
| `data.delete.body` | Every call, recording, key and setting is deleted. This can't be undone. | כל השיחות, ההקלטות, המפתחות וההגדרות נמחקים. אי אפשר לבטל את הפעולה. |
| `data.delete.type` | Type {email} to confirm | יש להקליד {email} לאישור |
| `data.delete.bucket` | Recordings in your own bucket are deleted from this device next. Keep it open until it finishes. | הקלטות בדלי שלך יימחקו מהמכשיר הזה בהמשך. יש להשאיר אותו פתוח עד הסיום. |

---

## Instance

### A1 Admin instance `/admin/instance`

Mock: [`admin-instance.html`](mocks/admin-instance.html).

**Purpose:** configure every port of a self-hosted or local instance. Not reachable on the official hosted site (`ASKCALLS_HOSTED=true`).

**Layout:** title "Instance" with the version badge; the Offline mode card first when offline mode is off and blockers exist (A2); then a two-column grid of `ProviderCard`s: Database, Blob storage, Sign-in methods, Transcription, Ask (LLM), Embeddings source, Telemetry, Limits and quotas, Users (promote to admin). Each card: adapter, settings, `HealthBadge` (Healthy / Slow / Down, with latency), Test connection, env locks as `EnvLockedField` ("Set by the server environment"). Changes that need a restart say so and offer "Restart now" where the runtime allows. Mobile: one column.

**States:** saving (button spinner), validation error (inline per field), restart required (banner "Restart AskCalls to apply the database change." + Restart now), database not empty (Change disabled: "Can't be changed while it holds data. Use askcalls backup and restore.").

| Key | English | Hebrew |
| --- | --- | --- |
| `admin.title` | Instance | מופע |
| `admin.version` | Version {v} | גרסה {v} |
| `admin.cards` | Database · Blob storage · Sign-in methods · Transcription · Ask (LLM) · Embeddings · Telemetry · Limits · Users | מסד נתונים · אחסון קבצים · שיטות כניסה · תמלול · שאלות (LLM) · הטמעות · טלמטריה · מגבלות · משתמשים |
| `admin.health` | Healthy · Slow · Down | תקין · איטי · לא זמין |
| `admin.envLocked` | Set by the server environment | נקבע על ידי סביבת השרת |
| `admin.dbLocked` | Can't be changed while it holds data. Use askcalls backup and restore. | אי אפשר לשנות כשיש בו נתונים. יש להשתמש ב-askcalls backup ו-restore. |
| `admin.restart` | Restart AskCalls to apply this change. | יש להפעיל מחדש את AskCalls כדי להחיל את השינוי. |
| `admin.restartNow` | Restart now | הפעלה מחדש |
| `admin.promote` | Make admin | הפיכה למנהל |

### A2 Offline mode (card on A1)

**Purpose:** turn on air-gapped operation only when nothing points outside the local network. Hidden when `OFFLINE_MODE` is set by env or on the hosted site.

**Content:** title, one line with the blocker count, switch (disabled while blockers exist), `OfflineBlockerList`: each setting with its host (mono) and one-click fixes (switch to the local option, or turn off). When the list is empty: "Nothing reaches the internet." and the switch enables; turning it on shows a confirm "Turn on offline mode? AskCalls will block every request to hosts outside your network."

| Key | English | Hebrew |
| --- | --- | --- |
| `offline.title` | Offline mode | מצב לא מקוון |
| `offline.blockers` | {n} settings reach the internet. Fix them to turn offline mode on. | {n} הגדרות פונות לאינטרנט. יש לתקן אותן כדי להפעיל מצב לא מקוון. |
| `offline.clear` | Nothing reaches the internet. | שום הגדרה לא פונה לאינטרנט. |
| `offline.fix.whisper` | Use local Whisper server | שרת Whisper מקומי |
| `offline.fix.ollama` | Use local Ollama | Ollama מקומי |
| `offline.fix.off` | Turn off | כיבוי |
| `offline.fix.google` | Turn off Google sign-in | כיבוי כניסה עם Google |
| `offline.confirm` | Turn on offline mode? AskCalls will block every request to hosts outside your network. | להפעיל מצב לא מקוון? AskCalls תחסום כל בקשה לשרתים מחוץ לרשת שלך. |

### W1 First-run wizard `/setup`

Mock: [`first-run-wizard.html`](mocks/first-run-wizard.html).

**Purpose:** configure a fresh self-hosted instance. Local mode skips it.

**Layout:** desktop: 288 px sidebar with logo and vertical `Stepper` (Database, Storage, Sign-in, Transcription and AI, Offline mode, Admin account); content column 704 px. Mobile: compact horizontal stepper (numbers, current label shown) above the content. Each step: H1, `ChoiceCard`s with fields revealed for the chosen option, `TestConnectionResult` where relevant (required to continue for external services), Back and Continue.

1. **Database:** Built-in (PGlite, stored in `/data`) or External Postgres (URL, tested).
2. **Storage:** Local folder (path) or S3-compatible bucket (endpoint, bucket, region, keys; tested; CORS JSON shown).
3. **Sign-in:** Local accounts, Google, GitHub, Email link (each with its fields; local accounts required when offline mode will be on).
4. **Transcription and AI:** for each: Off, a cloud provider with a key, or a local OpenAI-compatible server (base URL).
5. **Offline mode:** switch with the blocker list (A2) computed from steps 1 to 4.
6. **Admin account:** email and passkey (or password for local accounts); creating it finishes setup and opens onboarding (O1).

The first screen carries one callout: "This instance has no admin yet. The account you create in the last step becomes the admin." If the request isn't from loopback, the wizard first asks for the setup token printed in the server log (see README open questions).

| Key | English | Hebrew |
| --- | --- | --- |
| `setup.noAdmin` | This instance has no admin yet. The account you create in the last step becomes the admin. | למופע הזה עדיין אין מנהל. החשבון שייווצר בשלב האחרון יהיה המנהל. |
| `setup.token` | Enter the setup token from the server log | יש להזין את אסימון ההגדרה מיומן השרת |
| `setup.steps` | Database · Storage · Sign-in · Transcription and AI · Offline mode · Admin account | מסד נתונים · אחסון · כניסה · תמלול ו-AI · מצב לא מקוון · חשבון מנהל |
| `setup.db.title` | Choose a database | בחירת מסד נתונים |
| `setup.db.builtin` | Built-in / PGlite, stored in {path} on this machine. For one person or a small team. | מובנה / PGlite, נשמר ב-{path} במכונה הזאת. לאדם אחד או לצוות קטן. |
| `setup.db.external` | External Postgres / Postgres 16 or later with the pgvector extension. | Postgres חיצוני / Postgres 16 ומעלה עם ההרחבה pgvector. |
| `setup.db.url` | Postgres URL | כתובת Postgres |
| `setup.db.ok` | Connected to Postgres {v} with pgvector {pv}. | מחובר ל-Postgres {v} עם pgvector {pv}. |
| `setup.db.noVector` | Connected, but pgvector isn't installed. Run CREATE EXTENSION vector; and test again. | מחובר, אבל pgvector לא מותקן. יש להריץ CREATE EXTENSION vector; ולבדוק שוב. |
| `setup.changeLater` | Everything here can be changed later in Admin, except the database once it holds data. | אפשר לשנות הכול אחר כך בניהול, חוץ ממסד הנתונים אחרי שיש בו נתונים. |
| `setup.storage.title` | Choose storage | בחירת אחסון |
| `setup.signin.title` | Choose how people sign in | בחירת שיטות כניסה |
| `setup.ai.title` | Transcription and AI | תמלול ו-AI |
| `setup.offline.title` | Offline mode | מצב לא מקוון |
| `setup.admin.title` | Create the admin account | יצירת חשבון המנהל |
| `common.back` / `continue` | Back / Continue | חזרה / המשך |

---

## Global

### X1 Keyboard shortcuts dialog

Opened with `?` anywhere in the app. Two columns grouped Calls, Everywhere, Call view (`ShortcutsDialog`, `Kbd`); the last line points to S6 to turn off single-key shortcuts. Mock: [`states.html`](mocks/states.html). Copy keys `shortcuts.*` follow the labels in `design-system.md` section 11; Hebrew labels are in the mock.

| Key | English | Hebrew |
| --- | --- | --- |
| `shortcuts.title` | Keyboard shortcuts | קיצורי מקלדת |
| `shortcuts.off` | Single-key shortcuts can be turned off in Settings → Privacy. | אפשר לכבות קיצורים של מקש יחיד בהגדרות ← פרטיות. |

### X2 Toasts and banners

Toasts (`Notice`, Sonner) stack at the bottom end, above the bottom navigation on mobile, 5 s (8 s with an action), pause on hover and focus. Banners (`StatusBanner`) sit under the top bar.

| Key | English | Hebrew |
| --- | --- | --- |
| `toast.inbox.title` | {n, plural, one {1 inbox item added to your calls} other {# inbox items added to your calls}} | {n, plural, one {פריט אחד מהתיבה נוסף לשיחות} other {# פריטים מהתיבה נוספו לשיחות}} |
| `toast.inbox.body` | Sent from {client} through the remote MCP. | נשלחו מ-{client} דרך ה-MCP המרוחק. |
| `toast.inbox.view` | View | הצגה |
| `toast.locked.title` | AskCalls locked | AskCalls ננעלה |
| `toast.locked.body` | After {n} minutes idle. | אחרי {n} דקות ללא פעילות. |
| `toast.deleted` | Call deleted | השיחה נמחקה |
| `toast.starFailed` | Couldn't star the call. Try again. | לא ניתן לסמן בכוכב. כדאי לנסות שוב. |
| `banner.offline` | Offline. Changes are paused until you reconnect. | אין חיבור. שינויים מושהים עד שהחיבור יחזור. |
| `banner.importPaused` | Import paused: {done} of {total} done. | הייבוא הושהה: {done} מתוך {total} הושלמו. |
| `banner.resume` | Resume | המשך |
| `banner.limit` | You've reached {n} calls. Delete calls to upload more. | הגעת ל-{n} שיחות. כדי להעלות עוד יש למחוק שיחות. |

### X3 Lock behaviour

- Lock triggers: the Lock button or Shift+L, idle timeout (S1), tab close, sign-out.
- On lock: navigate to G1 immediately (no animation), wipe decrypted stores, revoke Blob URLs, cancel in-flight decrypts. The bulk import pauses and resumes after unlock.
- After an idle lock, G1 shows the "AskCalls locked" toast.
- Inbox processing runs after every unlock in the background; the toast in X2 reports the count; failures show "Couldn't add {n} inbox items. They'll be retried next time you unlock."

| Key | English | Hebrew |
| --- | --- | --- |
| `lock.button` | Lock | נעילה |
| `lock.tooltip` | Locks after {n} min idle | ננעל אחרי {n} דקות ללא פעילות |
| `inbox.failed` | Couldn't add {n} inbox items. They'll be retried next time you unlock. | לא ניתן להוסיף {n} פריטים מהתיבה. ננסה שוב בביטול הנעילה הבא. |
