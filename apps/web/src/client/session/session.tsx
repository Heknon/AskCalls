'use client';

import { ApiError, createApiClient } from '@askcalls/api-contract';
import type { ResponseFor } from '@askcalls/api-contract/client';
import { getMe } from '@askcalls/api-contract/routes/account';
import type { ClientContext } from '@askcalls/client-core/context';
import type { LockReason } from '@askcalls/client-core/session';
import { DEFAULT_IDLE_TIMEOUT_MS } from '@askcalls/client-core/session';
import { Inbox, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signOut as authSignOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { BrowserClient } from '../browser-client';
import { useNotify } from '../notices/notices';
import { adoptStyleNonce } from '../style-nonce';

export type Me = ResponseFor<typeof getMe>;

/**
 * - `loading`: fetching the account and loading the browser client.
 * - `error`: the account couldn't be loaded (offline, server down).
 * - `onboarding`: no unlock method yet; the user belongs in /app/welcome.
 * - `locked`: keys are not in this tab's memory; the unlock gate shows.
 * - `unlocked`: `ctx` is usable.
 */
export type SessionStatus = 'loading' | 'error' | 'onboarding' | 'locked' | 'unlocked';

export interface AppSession {
  status: SessionStatus;
  me: Me | null;
  /** The browser client (adapters, KeySession). Null while loading. */
  client: BrowserClient | null;
  /** From settings after unlock; 0 means auto-lock is off. */
  autoLockMinutes: number;
  /** Why the session last locked, for the gate's toast. */
  lastLock: LockReason | null;
  /** `offline` or `server` when status is `error`. */
  error: 'offline' | 'server' | null;
  refreshMe(): Promise<void>;
  retry(): void;
  /** Rereads `autoLockMinutes` from the session after the setting changed. */
  refreshAutoLock(): void;
  /** Locks this tab and every other tab of AskCalls. */
  lock(): void;
  /** Removes this device's saved keys and the direct-access cookie, then signs out. */
  signOut(): Promise<void>;
}

const SessionContext = createContext<AppSession | null>(null);

const UNLOCK_KINDS = new Set(['passkey', 'recovery', 'passphrase']);

/**
 * App routes need their own CSP (wasm, no Google), which only a document load brings. A client
 * navigation from a public page (sign-in, home) keeps that page's CSP, so reload once.
 */
function loadedAsAppDocument(): boolean {
  const nav = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  const path = nav ? new URL(nav.name).pathname : location.pathname;
  return /^\/(app|admin)(\/|$)/.test(path);
}

/** True until the account has an active passkey, recovery code or passphrase. */
export function needsOnboarding(me: Me): boolean {
  return !me.keyring.entries.some((e) => e.revokedAt === null && UNLOCK_KINDS.has(e.kind));
}

export function AppSessionProvider({
  testEmbedder = false,
  children,
}: {
  /** The server allows the e2e stand-in embedder (NODE_ENV=test only). */
  testEmbedder?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('shell');
  const notify = useNotify();
  const router = useRouter();
  const api = useMemo(() => createApiClient(), []);
  const [client, setClient] = useState<BrowserClient | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<AppSession['error']>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(DEFAULT_IDLE_TIMEOUT_MS / 60_000);
  const [lastLock, setLastLock] = useState<LockReason | null>(null);
  const [attempt, setAttempt] = useState(0);
  const minutesRef = useRef(autoLockMinutes);
  minutesRef.current = autoLockMinutes;
  const tRef = useRef(t);
  tRef.current = t;

  const refreshMe = useCallback(async () => {
    setMe(await api.request(getMe, {}));
  }, [api]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on retry
  useEffect(() => {
    if (!loadedAsAppDocument()) {
      window.location.reload();
      return;
    }
    adoptStyleNonce();
    let cancelled = false;
    let created: BrowserClient | null = null;
    setError(null);
    api
      .request(getMe, {})
      .then((m) => !cancelled && setMe(m))
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(!navigator.onLine || !(e instanceof ApiError) ? 'offline' : 'server');
      });
    (async () => {
      const [{ createBrowserClient }, stand] = await Promise.all([
        import('../browser-client'),
        testEmbedder ? import('../adapters/embedder/test-embedder') : Promise.resolve(null),
      ]);
      if (cancelled) return;
      created = createBrowserClient({
        ...(stand && { embedder: new stand.TestEmbedder() }),
        // The new own-key origins reach the CSP on the next page load.
        onDirectAccessChange: () => window.location.reload(),
      });
      setClient(created);
    })().catch(() => !cancelled && setError('offline'));
    return () => {
      cancelled = true;
      created?.dispose();
      setClient(null);
      setUnlocked(false);
    };
  }, [api, testEmbedder, attempt]);

  useEffect(() => {
    if (!client) return;
    const { session, ctx } = client;
    setUnlocked(session.isUnlocked);
    const unsubscribe = session.subscribe((e) => {
      if (e.type === 'unlocked') {
        setUnlocked(true);
        import('@askcalls/client-core/context')
          .then(({ applyAutoLockSetting }) => applyAutoLockSetting(ctx))
          .then(() => setAutoLockMinutes(Math.round(session.idleTimeoutMs / 60_000)))
          .catch(() => {});
        refreshMe().catch(() => {});
        return;
      }
      setUnlocked(false);
      setLastLock(e.reason);
      if (e.reason === 'idle') {
        notify({
          kind: 'event',
          icon: Lock,
          title: tRef.current('toast.locked.title'),
          description: tRef.current('toast.locked.body', { n: minutesRef.current }),
        });
      }
    });
    // Ingest code (and its phone and transcript-format parsers) stays out of the layout's
    // first load: browser-client has already loaded it by now, so this resolves at once.
    let stopInbox: (() => void) | null = null;
    let stopped = false;
    const watchInbox = ({ processInboxOnUnlock }: typeof import('@askcalls/client-core/inbox')) => {
      if (stopped) return;
      stopInbox = processInboxOnUnlock(
        ctx,
        (report) => {
          const added = report.processed;
          if (added > 0) {
            refreshMe().catch(() => {});
            notify({
              kind: 'event',
              icon: Inbox,
              title: tRef.current('toast.inbox.title', { n: added }),
              action: {
                label: tRef.current('toast.inbox.view'),
                altText: tRef.current('toast.inbox.view'),
                onAction: () => router.push('/app'),
              },
            });
          }
          if (report.failed.length > 0) {
            notify({
              kind: 'error',
              title: tRef.current('toast.inbox.failed', { n: report.failed.length }),
            });
          }
        },
        () => notify({ kind: 'error', title: tRef.current('toast.inbox.unreachable') }),
      );
    };
    import('@askcalls/client-core/inbox').then(watchInbox).catch(() => {});
    return () => {
      stopped = true;
      unsubscribe();
      stopInbox?.();
    };
  }, [client, notify, refreshMe, router]);

  const lock = useCallback(() => client?.session.lock('manual'), [client]);
  const refreshAutoLock = useCallback(() => {
    if (client) setAutoLockMinutes(Math.round(client.session.idleTimeoutMs / 60_000));
  }, [client]);

  const signOut = useCallback(async () => {
    if (client) {
      await client.deviceKeys.clear().catch(() => {});
      await client.bulkState.clear().catch(() => {});
      await client.clearDirectAccess().catch(() => {});
      client.session.lock('manual');
    }
    await authSignOut({ redirectTo: '/login' });
  }, [client]);

  const status: SessionStatus = error
    ? 'error'
    : !me || !client
      ? 'loading'
      : unlocked
        ? 'unlocked'
        : needsOnboarding(me)
          ? 'onboarding'
          : 'locked';

  const value = useMemo<AppSession>(
    () => ({
      status,
      me,
      client,
      autoLockMinutes,
      lastLock,
      error,
      refreshMe,
      retry: () => setAttempt((a) => a + 1),
      refreshAutoLock,
      lock,
      signOut,
    }),
    [
      status,
      me,
      client,
      autoLockMinutes,
      lastLock,
      error,
      refreshMe,
      refreshAutoLock,
      lock,
      signOut,
    ],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The session in any state: the gate, onboarding and the shell use it. */
export function useAppSession(): AppSession {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useAppSession needs AppSessionProvider');
  return s;
}

export interface Unlocked {
  /** client-core's context: pass it to every use case (`listCalls(ctx, …)`). */
  ctx: ClientContext;
  client: BrowserClient;
  me: Me;
}

/**
 * For screens inside the app shell, which only render while unlocked (the gate guarantees it).
 * Throws when called outside an unlocked session.
 */
export function useUnlocked(): Unlocked {
  const { status, client, me } = useAppSession();
  if (status !== 'unlocked' || !client || !me) {
    throw new Error('useUnlocked is only available while the session is unlocked');
  }
  return { ctx: client.ctx, client, me };
}

/**
 * Runs `wipe` when the session locks: clear decrypted state the screen holds outside React
 * (caches, object URLs, workers). React state goes with the unmounted screen.
 */
export function useLockWipe(wipe: () => void): void {
  const { client } = useAppSession();
  const ref = useRef(wipe);
  ref.current = wipe;
  useEffect(() => client?.session.onWipe(() => ref.current()), [client]);
}
