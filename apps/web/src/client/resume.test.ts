import 'fake-indexeddb/auto';
import { KeySession } from '@askcalls/client-core/session';
import { randomBytes } from '@askcalls/crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { DeviceDb, STORES } from './adapters/idb';
import { IdbDeviceKeyStore } from './adapters/stores';
import { RESUME_STORAGE_KEY, RESUME_WINDOW_MS, ReloadResume } from './resume';

class MemoryStorage implements Storage {
  #m = new Map<string, string>();
  get length() {
    return this.#m.size;
  }
  clear() {
    this.#m.clear();
  }
  getItem(k: string) {
    return this.#m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.#m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.#m.delete(k);
  }
  setItem(k: string, v: string) {
    this.#m.set(k, v);
  }
}

class FakeLocks {
  held = new Set<string>();
  async request(name: string, cb: () => Promise<void>) {
    this.held.add(name);
    try {
      await cb();
    } finally {
      this.held.delete(name);
    }
  }
  async query() {
    return { held: [...this.held].map((name) => ({ name })) };
  }
}

let n = 0;
const opened: DeviceDb[] = [];
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const d of disposers.splice(0)) d();
  for (const d of opened.splice(0)) d.close();
});

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 20; i++) await tick();
};

/** One browser profile: shared IndexedDB and locks, one sessionStorage per tab. */
function profile() {
  const db = new DeviceDb(`resume-test-${++n}`);
  opened.push(db);
  const locks = new FakeLocks();
  let now = 1_000_000;
  let allowed = true;
  const tab = (storage = new MemoryStorage()) => {
    const session = new KeySession({ idleTimeoutMs: 15 * 60_000, now: () => now });
    const resume = new ReloadResume({
      session,
      db,
      deviceKeys: new IdbDeviceKeyStore(db),
      allowed: async () => allowed,
      storage,
      locks: locks as unknown as LockManager,
      now: () => now,
    });
    disposers.push(() => resume.dispose());
    return { session, resume, storage };
  };
  return {
    db,
    locks,
    tab,
    advance: (ms: number) => (now += ms),
    setAllowed: (v: boolean) => (allowed = v),
  };
}

async function unlocked(t: ReturnType<ReturnType<typeof profile>['tab']>, userId = 'user-1') {
  const rootKey = randomBytes(32);
  const copy = new Uint8Array(rootKey);
  await t.session.unlock({ userId, rootKey });
  await settle();
  return copy;
}

/** A reload: the old page locks with `closed` and goes away; a new page opens in the same tab. */
function reload(p: ReturnType<typeof profile>, t: ReturnType<ReturnType<typeof profile>['tab']>) {
  t.session.lock('closed');
  t.resume.dispose();
  return p.tab(t.storage);
}

describe('ReloadResume', () => {
  it('unlocks the same key after a reload', async () => {
    const p = profile();
    const a = p.tab();
    const rk = await unlocked(a);
    const b = reload(p, a);
    p.advance(1_000);
    expect(await b.resume.resume('user-1')).toBe(true);
    expect(b.session.isUnlocked).toBe(true);
    expect([...b.session.keys.rootKey]).toEqual([...rk]);
  });

  it('reads the record once', async () => {
    const p = profile();
    const a = p.tab();
    await unlocked(a);
    const b = reload(p, a);
    expect(b.storage.getItem(RESUME_STORAGE_KEY)).not.toBeNull();
    await b.resume.resume('user-1');
    expect(b.storage.getItem(RESUME_STORAGE_KEY)).toBeNull();
    b.session.lock('closed');
    const c = p.tab(new MemoryStorage());
    expect(await c.resume.resume('user-1')).toBe(false);
  });

  it('never writes the root key in the clear', async () => {
    const p = profile();
    const a = p.tab();
    const rk = await unlocked(a);
    const b = reload(p, a);
    const raw = b.storage.getItem(RESUME_STORAGE_KEY) ?? '';
    const hex = Array.from(rk, (x) => x.toString(16).padStart(2, '0')).join('');
    expect(raw).not.toContain(hex);
    expect(raw).not.toContain(Buffer.from(rk).toString('base64url'));
    expect(raw).not.toContain(Buffer.from(rk).toString('base64'));
  });

  it('refuses a reload that comes after the window', async () => {
    const p = profile();
    const a = p.tab();
    await unlocked(a);
    const b = reload(p, a);
    p.advance(RESUME_WINDOW_MS + 1);
    expect(await b.resume.resume('user-1')).toBe(false);
    expect(b.session.isUnlocked).toBe(false);
    expect(await p.db.keys(STORES.resume)).toEqual([]);
  });

  it('refuses a reload past the idle deadline', async () => {
    const p = profile();
    const a = p.tab();
    await unlocked(a);
    p.advance(15 * 60_000 - 10_000);
    const b = reload(p, a);
    p.advance(10_000);
    expect(await b.resume.resume('user-1')).toBe(false);
  });

  it('refuses when the account could not be loaded, and leaves no key behind', async () => {
    const p = profile();
    const a = p.tab();
    await unlocked(a);
    const b = reload(p, a);
    expect(await b.resume.resume(Promise.reject(new Error('offline')))).toBe(false);
    expect(await p.db.keys(STORES.resume)).toEqual([]);
  });

  it('refuses another account', async () => {
    const p = profile();
    const a = p.tab();
    await unlocked(a);
    const b = reload(p, a);
    expect(await b.resume.resume('user-2')).toBe(false);
  });

  it('does nothing after a manual or idle lock', async () => {
    for (const reason of ['manual', 'idle'] as const) {
      const p = profile();
      const a = p.tab();
      await unlocked(a);
      a.session.lock(reason);
      await settle();
      expect(await p.db.keys(STORES.resume)).toEqual([]);
      a.session.lock('closed');
      const b = p.tab(a.storage);
      expect(await b.resume.resume('user-1')).toBe(false);
    }
  });

  it('does nothing when the user chose to lock on reload', async () => {
    const p = profile();
    p.setAllowed(false);
    const a = p.tab();
    await unlocked(a);
    expect(await p.db.keys(STORES.resume)).toEqual([]);
    const b = reload(p, a);
    expect(await b.resume.resume('user-1')).toBe(false);
  });

  it('disarms when the setting is turned on while unlocked', async () => {
    const p = profile();
    const a = p.tab();
    await unlocked(a);
    expect(await p.db.keys(STORES.resume)).toHaveLength(1);
    p.setAllowed(false);
    await a.resume.refresh();
    expect(await p.db.keys(STORES.resume)).toEqual([]);
    const b = reload(p, a);
    expect(await b.resume.resume('user-1')).toBe(false);
  });

  it('re-arms with a fresh key after resuming', async () => {
    const p = profile();
    const a = p.tab();
    await unlocked(a);
    const [first] = await p.db.keys(STORES.resume);
    const b = reload(p, a);
    await b.resume.resume('user-1');
    await settle();
    const keys = await p.db.keys(STORES.resume);
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toBe(first);
    const c = reload(p, b);
    expect(await c.resume.resume('user-1')).toBe(true);
  });

  it('sweeps keys left by closed tabs and keeps those of open ones', async () => {
    const p = profile();
    const open = p.tab();
    await unlocked(open);
    const closed = p.tab();
    await unlocked(closed);
    closed.session.lock('closed');
    closed.resume.dispose();
    expect(await p.db.keys(STORES.resume)).toHaveLength(2);
    const fresh = p.tab();
    await unlocked(fresh);
    expect(await p.db.keys(STORES.resume)).toHaveLength(2);
    const b = reload(p, open);
    expect(await b.resume.resume('user-1')).toBe(true);
  });
});
