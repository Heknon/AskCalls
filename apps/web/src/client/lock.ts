import type { KeySession } from '@askcalls/client-core/session';

/**
 * Spec 6.8 in the browser, on top of KeySession's idle timer:
 * - user input restarts the idle timer (at most every few seconds);
 * - background tabs get throttled or frozen timers, so on return the idle time is checked
 *   against the clock and an overdue session locks at once;
 * - closing the tab (`pagehide`, which also covers back/forward-cache entry) locks;
 * - a manual lock in one tab locks every tab of this origin (BroadcastChannel).
 */
export const LOCK_CHANNEL = 'askcalls-lock';
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
const TOUCH_THROTTLE_MS = 5_000;

export interface LockRulesOptions {
  target?: Window;
  now?: () => number;
  channel?: BroadcastChannel | null;
}

export function installLockRules(session: KeySession, opts: LockRulesOptions = {}): () => void {
  const win = opts.target ?? window;
  const now = opts.now ?? (() => Date.now());
  const channel =
    opts.channel !== undefined
      ? opts.channel
      : typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(LOCK_CHANNEL);
  let lastActivity = now();
  let lastTouch = 0;
  let remoteLock = false;

  const onActivity = () => {
    lastActivity = now();
    if (!session.isUnlocked || lastActivity - lastTouch < TOUCH_THROTTLE_MS) return;
    lastTouch = lastActivity;
    session.touch();
  };
  const onVisibility = () => {
    if (win.document.visibilityState !== 'visible' || !session.isUnlocked) return;
    const idle = session.idleTimeoutMs;
    if (idle > 0 && now() - lastActivity >= idle) session.lock('idle');
  };
  const onPageHide = () => session.lock('closed');
  const onMessage = (e: MessageEvent) => {
    if ((e.data as { type?: string })?.type !== 'lock') return;
    remoteLock = true;
    try {
      session.lock('manual');
    } finally {
      remoteLock = false;
    }
  };

  const unsubscribe = session.subscribe((e) => {
    if (e.type === 'unlocked') {
      lastActivity = now();
      lastTouch = lastActivity;
    } else if (e.reason === 'manual' && !remoteLock) {
      channel?.postMessage({ type: 'lock' });
    }
  });

  for (const ev of ACTIVITY_EVENTS) win.addEventListener(ev, onActivity, { passive: true });
  win.document.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPageHide);
  channel?.addEventListener('message', onMessage);

  return () => {
    for (const ev of ACTIVITY_EVENTS) win.removeEventListener(ev, onActivity);
    win.document.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', onPageHide);
    channel?.removeEventListener('message', onMessage);
    if (opts.channel === undefined) channel?.close();
    unsubscribe();
  };
}

/** Object URLs for decrypted media, all revoked when the session locks. */
export class BlobUrls {
  #urls = new Set<string>();

  create(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.#urls.add(url);
    return url;
  }

  revoke(url: string): void {
    if (this.#urls.delete(url)) URL.revokeObjectURL(url);
  }

  revokeAll(): void {
    for (const url of this.#urls) URL.revokeObjectURL(url);
    this.#urls.clear();
  }
}
