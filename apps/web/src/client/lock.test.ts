import { KeySession } from '@askcalls/client-core/session';
import { randomBytes } from '@askcalls/crypto';
import { describe, expect, it } from 'vitest';
import { installLockRules } from './lock';

function fakeWindow() {
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  return Object.assign(new EventTarget(), { document }) as unknown as Window & {
    document: { visibilityState: string };
  };
}

const manualTimers = () => {
  const timers = new Set<unknown>();
  return {
    timers,
    setTimeout: (_fn: () => void, _ms: number) => {
      const h = {};
      timers.add(h);
      return h;
    },
    clearTimeout: (h: unknown) => void timers.delete(h),
  };
};

async function setup(idleMs = 60_000) {
  let now = 0;
  const win = fakeWindow();
  const session = new KeySession({ idleTimeoutMs: idleMs, timers: manualTimers() });
  const channel = new BroadcastChannel(`lock-test-${Math.random()}`);
  const off = installLockRules(session, { target: win, now: () => now, channel });
  await session.unlock({ userId: 'u', rootKey: randomBytes(32) });
  return { win, session, channel, off, advance: (ms: number) => (now += ms) };
}

describe('lock rules', () => {
  it('locks on pagehide', async () => {
    const { win, session, off } = await setup();
    win.dispatchEvent(new Event('pagehide'));
    expect(session.isUnlocked).toBe(false);
    off();
  });

  it('locks an overdue session when the tab becomes visible again', async () => {
    const { win, session, advance, off } = await setup(60_000);
    win.document.visibilityState = 'hidden';
    win.document.dispatchEvent(new Event('visibilitychange'));
    advance(30_000);
    win.document.visibilityState = 'visible';
    win.document.dispatchEvent(new Event('visibilitychange'));
    expect(session.isUnlocked).toBe(true);
    advance(31_000);
    win.document.dispatchEvent(new Event('visibilitychange'));
    expect(session.isUnlocked).toBe(false);
    off();
  });

  it('user input counts as activity', async () => {
    const { win, session, advance, off } = await setup(60_000);
    advance(50_000);
    win.dispatchEvent(new Event('keydown'));
    advance(50_000);
    win.document.dispatchEvent(new Event('visibilitychange'));
    expect(session.isUnlocked).toBe(true);
    off();
  });

  it('a manual lock is broadcast to other tabs, and received locks lock here', async () => {
    const a = await setup();
    const other = new BroadcastChannel(a.channel.name);
    const got = new Promise((r) =>
      other.addEventListener('message', (e) => r(e.data), { once: true }),
    );
    a.session.lock('manual');
    expect(await got).toEqual({ type: 'lock' });

    const b = await setup();
    const sender = new BroadcastChannel(b.channel.name);
    const locked = new Promise((r) => b.session.subscribe((e) => e.type === 'locked' && r(e)));
    sender.postMessage({ type: 'lock' });
    expect(await locked).toEqual({ type: 'locked', reason: 'manual' });
    for (const c of [other, sender, a.channel, b.channel]) c.close();
    a.off();
    b.off();
  });
});
