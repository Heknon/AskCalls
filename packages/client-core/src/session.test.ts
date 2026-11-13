import { generateRootKey } from '@askcalls/crypto';
import { describe, expect, it } from 'vitest';
import type { Timers } from './ports/index';
import { KeySession, type SessionEvent } from './session';

function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    setTimeout: (fn, ms) => {
      const id = next++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (h) => {
      pending.delete(h as number);
    },
  };
  return {
    timers,
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...pending]) {
        if (t.at <= now) {
          pending.delete(id);
          t.fn();
        }
      }
    },
    get pending() {
      return pending.size;
    },
  };
}

describe('KeySession', () => {
  it('holds keys while unlocked and wipes them, the caller copy and caches on lock', async () => {
    const t = fakeTimers();
    const s = new KeySession({ timers: t.timers });
    const events: SessionEvent[] = [];
    s.subscribe((e) => events.push(e));
    const cache = new Map([['call', 'decrypted']]);
    s.onWipe(() => cache.clear());

    expect(s.isUnlocked).toBe(false);
    expect(() => s.keys).toThrow(/locked/);
    const rk = generateRootKey();
    await s.unlock({ userId: 'u1', rootKey: rk });
    expect(rk.every((b) => b === 0)).toBe(true);
    const keys = s.keys;
    expect(keys.rootKey).toHaveLength(32);
    expect(s.userId).toBe('u1');

    s.lock();
    expect(keys.locked).toBe(true);
    expect(cache.size).toBe(0);
    expect(() => s.userId).toThrow(/locked/);
    expect(events).toEqual([
      { type: 'unlocked', userId: 'u1' },
      { type: 'locked', reason: 'manual' },
    ]);
    s.lock();
    expect(events).toHaveLength(2);
  });

  it('auto-locks after the idle timeout, and activity restarts the timer', async () => {
    const t = fakeTimers();
    const s = new KeySession({ timers: t.timers, idleTimeoutMs: 1_000 });
    const events: SessionEvent[] = [];
    s.subscribe((e) => events.push(e));
    await s.unlock({ userId: 'u1', rootKey: generateRootKey() });
    t.advance(900);
    s.touch();
    t.advance(900);
    expect(s.isUnlocked).toBe(true);
    t.advance(100);
    expect(s.isUnlocked).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'locked', reason: 'idle' });
    expect(t.pending).toBe(0);
  });

  it('defaults to 15 minutes; 0 disables auto-lock', async () => {
    const t = fakeTimers();
    const s = new KeySession({ timers: t.timers });
    expect(s.idleTimeoutMs).toBe(15 * 60_000);
    await s.unlock({ userId: 'u1', rootKey: generateRootKey() });
    s.setIdleTimeout(0);
    t.advance(24 * 3_600_000);
    expect(s.isUnlocked).toBe(true);
    s.setIdleTimeout(10);
    t.advance(10);
    expect(s.isUnlocked).toBe(false);
    expect(() => s.setIdleTimeout(-1)).toThrow(RangeError);
  });

  it('re-unlocking replaces and wipes the previous keys', async () => {
    const s = new KeySession({ idleTimeoutMs: 0 });
    await s.unlock({ userId: 'u1', rootKey: generateRootKey() });
    const first = s.keys;
    await s.unlock({ userId: 'u2', rootKey: generateRootKey() });
    expect(first.locked).toBe(true);
    expect(s.userId).toBe('u2');
  });
});
