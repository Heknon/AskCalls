import type { KeySession } from '@askcalls/client-core/session';

/**
 * Spec 6.8 in the browser, on top of KeySession's idle timer:
 * - user input (clicks, typing, pointer movement, scrolling) and a playing recording restart
 *   the idle timer, at most every few seconds; listeners capture, so a component that stops
 *   propagation still counts as activity;
 * - activity in one tab counts for every tab of this origin, so a tab in the background does
 *   not lock while the user works in another;
 * - background tabs get throttled or frozen timers, so on return the idle time is checked
 *   against the clock and an overdue session locks at once;
 * - closing the tab (`pagehide`, which also covers back/forward-cache entry) locks;
 * - a manual lock in one tab locks every tab of this origin (BroadcastChannel).
 */
export const LOCK_CHANNEL = 'askcalls-lock';
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
  'timeupdate',
] as const;
const TOUCH_THROTTLE_MS = 5_000;

type LockMessage = { type: 'lock' } | { type: 'activity' };

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
  const post = (m: LockMessage) => channel?.postMessage(m);

  const active = (local: boolean) => {
    lastActivity = now();
    if (!session.isUnlocked || lastActivity - lastTouch < TOUCH_THROTTLE_MS) return;
    lastTouch = lastActivity;
    session.touch();
    if (local) post({ type: 'activity' });
  };
  const onActivity = () => active(true);
  const onVisibility = () => {
    if (win.document.visibilityState !== 'visible' || !session.isUnlocked) return;
    const idle = session.idleTimeoutMs;
    const since = Math.max(lastActivity, session.lastActiveAt);
    if (idle > 0 && now() - since >= idle) session.lock('idle');
  };
  const onPageHide = () => session.lock('closed');
  const onMessage = (e: MessageEvent) => {
    const type = (e.data as { type?: string } | null)?.type;
    if (type === 'activity') {
      active(false);
      return;
    }
    if (type !== 'lock') return;
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
      post({ type: 'lock' });
    }
  });

  const listen = { capture: true, passive: true } as const;
  for (const ev of ACTIVITY_EVENTS) win.addEventListener(ev, onActivity, listen);
  win.document.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPageHide);
  channel?.addEventListener('message', onMessage);

  return () => {
    for (const ev of ACTIVITY_EVENTS) win.removeEventListener(ev, onActivity, listen);
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
