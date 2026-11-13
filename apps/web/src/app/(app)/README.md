# App routes: how a screen plugs in

Everything under `(app)` is `/app/**` or `/admin/**`. Middleware requires a session (and the
admin role for `/admin`), sets the per-request nonce CSP, and `no-store`.

```
(app)/layout.tsx              NoticesProvider → AppSessionProvider → SessionGate
(app)/_gate/                  SessionGate (loading / onboarding / unlock gate / route), UnlockGate
(app)/(gate)/app/welcome/     onboarding (no app navigation)
(app)/(gate)/app/link/        joining with a link code (G2), shown while locked
(app)/(shell)/layout.tsx      AppShell: sidebar or rail, phone tab bar, shortcuts, offline banner
(app)/(shell)/_shell/         Screen, states (useAsync, AsyncView, PanelSkeleton), shell context
(app)/(shell)/app/…           one folder per screen (stubs today)
```

A screen's `page.tsx` renders **only while unlocked**: the gate shows instead while locked, and
the URL stays, so a deep link opens after unlock. Replace the stub in place:

| Screen | File | Messages |
| --- | --- | --- |
| C1/C2 Calls | `(shell)/app/page.tsx` | `calls` |
| C3 Call view | `(shell)/app/calls/[id]/page.tsx` | `call` |
| U1/U2 Upload | `(shell)/app/upload/page.tsx` | `upload` |
| T1–T4 Tags and rules | `(shell)/app/tags/page.tsx` | `tags` |
| K1 Contacts | `(shell)/app/contacts/page.tsx` | `contacts` |
| S1–S8 Settings | `(shell)/app/settings/<section>/page.tsx` | `settings` |
| A1 Instance | `(shell)/admin/instance/page.tsx` | `admin` |

Put a screen's own components next to its page in a private folder (`_calls/`, `_upload/`).
Shared app pieces live in `(shell)/_shell/`; product components come only from `@askcalls/ui`
(see `docs/design/design-language.md`).

## 1. The page frame: `Screen`

```tsx
'use client';
import { useTranslations } from 'next-intl';
import { Screen } from '../_shell/screen';

export default function UploadPage() {
  const t = useTranslations('upload');
  return (
    <Screen title={t('title')} actions={…} mobileAction={…} hints={…}>
      …
    </Screen>
  );
}
```

`Screen` renders the `AppTopBar` (from 768 px, only with `actions` or `hints`), the `MobileTopBar`
(phones: title, `mobileAction`, the lock button, `back`), the `PageHeader` (`h1`) and the
`<main>` column. `width`: `wide` (1120 px), `reading` (720 px, transcript), `form` (640 px).
The call view also uses `topStart` (its back link in the desktop top bar), `aside` (the side
panel beside the column from 768 px) and `titleHidden` (the `h1` is for screen readers only).
Settings sections use `SectionScreen` from `settings/_settings/section-screen.tsx` instead.

## 2. Keys and the session: `useUnlocked()`

```tsx
import { useUnlocked, useLockWipe } from '@/client/session/session';

const { ctx, client, me } = useUnlocked();
// ctx:    client-core's ClientContext — pass it to every use case: listCalls(ctx, …), searchCalls(ctx, …)
// client: BrowserClient — passkeys, deviceKeys, embedder (+ embedderStatus()), blobUrls, audio, bulkState
// me:     GET /api/me — user, plan, limits, usage, keyring summary, features
```

`useAppSession()` gives the same in any state (`status`, `lock()`, `refreshMe()`,
`autoLockMinutes`, `signOut()`); call `refreshMe()` after a change that moves counts (upload,
delete). On lock the screen unmounts, so React state goes with it; anything kept outside React
(caches, object URLs from `client.blobUrls`, workers) is cleared in `useLockWipe(() => …)`.
Never persist decrypted data: no localStorage, IndexedDB or URL for content.

## 3. Copy: one message namespace per area

Messages are `src/i18n/messages/<locale>/<namespace>.json`, one file per namespace per locale
(`en` and `he` today; English is the type source and fills missing keys). Add your keys to your
area's file in **every** locale; `src/i18n/messages.test.ts` fails when keys or placeholders
differ. Keys follow `docs/design/screens.md` without the area prefix: `calls.empty.title` is
`t('empty.title')` with `useTranslations('calls')`. Shared words (Star, Incoming, Try again,
Copy) are in `common`; navigation, lock, toasts and shortcut labels in `shell`.

Locale resolution (account → `locale` cookie → Accept-Language → English) happens on the
server; `<html lang dir>` follows it. Dates and numbers use `intlLocale(useLocale())` from
`src/i18n/locales.ts` ("en-GB", "he-IL"). A new language is a new folder of message files plus
its code in `LOCALES`; direction and its name come from the code.

## 4. Keyboard shortcuts: `useShortcut`

```tsx
import { useShortcut } from '@/client/shortcuts/shortcuts';

const tk = useTranslations('shell.shortcuts.keys');
useShortcut({ keys: ['j'], displayKeys: ['j', 'k'], group: 'calls', label: tk('nextPrevious'), run: next });
useShortcut({ keys: ['k'], run: previous });
useShortcut({ keys: ['s'], group: 'calls', label: tk('star'), run: star, enabled: !!cursor });
useShortcut({ keys: ['Escape'], inTextFields: true, run: clearSearch });
useShortcut({ keys: ['Enter'], mod: true, inTextFields: true, group: 'callView', label: tk('send'), run: send });
```

The registry (`src/client/shortcuts/registry.ts`) matches letters by physical key (a Hebrew
layout works), ignores keys while typing unless `inTextFields`, ignores everything while a
dialog or menu is open, and supports sequences (`['g', 'c']`). Single-character shortcuts turn
off together with Settings → Privacy → Single-key shortcuts (WCAG 2.1.4). Labelled shortcuts
appear in the `?` dialog under their group (`calls`, `callView`, `everywhere`) while the screen
is mounted. The shell already owns `?`, Shift+L and `g` then `c` / `u` / `t` / `s`.

## 5. States: loading, empty, error

```tsx
import { AsyncView, useAsync } from '../_shell/states';

const calls = useAsync(() => listCalls(ctx, filter), [ctx, filterKey]);
<AsyncView
  state={calls}
  loading={<RowPlaceholders />}            // DecryptingPlaceholder rows when ciphertext is decrypting
  isEmpty={(page) => page.items.length === 0}
  empty={{ reason: 'first-use', icon: Phone, title: t('empty.title'), action: … }}
  error={{ title: t('error.title'), description: t('error.body') }}
>
  {(page) => …}
</AsyncView>
```

Skeletons appear after 150 ms and stay at least 300 ms; errors are a panel `ErrorState` with
Try again; a route that throws falls back to `(shell)/error.tsx` (page `ErrorState`, Try again,
Go to calls). Toasts: `const notify = useNotify()` from `@/client/notices/notices`, then
`notify({ kind: 'event' | 'undo' | 'error', title, icon, action })`. Messages and toasts never
include content.
