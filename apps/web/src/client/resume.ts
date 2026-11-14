import type { DeviceKeyStore } from '@askcalls/client-core/ports/index';
import type { KeySession } from '@askcalls/client-core/session';
import { aad, decrypt, encrypt, fromBase64Url, randomBytes, toBase64Url } from '@askcalls/crypto';
import { type DeviceDb, STORES } from './adapters/idb';
import { lockOnReload } from './lock-on-reload';

/** A reload must land within this long after the page went away to resume. */
export const RESUME_WINDOW_MS = 30_000;
export const RESUME_STORAGE_KEY = 'askcalls-resume';
export const RESUME_AAD_FIELD = 'local:resume';
const LOCK_PREFIX = 'askcalls-resume:';

interface ResumeRecord {
  v: 1;
  id: string;
  userId: string;
  ct: string;
  hiddenAt: number;
  /** When the idle timer would have locked; null when auto-lock is off. */
  idleDeadline: number | null;
}

interface Armed {
  id: string;
  userId: string;
  ct: Uint8Array;
  release: () => void;
}

export interface ReloadResumeOptions {
  session: KeySession;
  db: DeviceDb;
  deviceKeys: DeviceKeyStore;
  /** False when this browser locks on reload; read on every unlock and `refresh()`. */
  allowed?: () => boolean | Promise<boolean>;
  storage?: Storage | null;
  locks?: LockManager | null;
  now?: () => number;
  windowMs?: number;
}

/** Null where storage is missing or blocked (some sandboxed frames throw on access). */
function tabStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function parse(raw: string | null): ResumeRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<ResumeRecord>;
    if (
      r.v !== 1 ||
      typeof r.id !== 'string' ||
      typeof r.userId !== 'string' ||
      typeof r.ct !== 'string' ||
      typeof r.hiddenAt !== 'number' ||
      (r.idleDeadline !== null && typeof r.idleDeadline !== 'number')
    ) {
      return null;
    }
    return r as ResumeRecord;
  } catch {
    return null;
  }
}

/**
 * Keeps the session unlocked across a reload (threat model, Unlocking). While unlocked, the
 * root key is held encrypted under a fresh non-extractable AES key that lives in IndexedDB; only
 * when the page goes away (`locked` with reason `closed`) is the ciphertext written to this
 * tab's sessionStorage, stamped with the time. The next load of the same tab unlocks from it
 * if it comes within `RESUME_WINDOW_MS` and before the idle deadline; the record is read once.
 * Any other lock (manual, idle, another tab, sign-out) deletes the key and the record.
 *
 * Each armed key holds a Web Lock while its tab is alive, so keys left by closed tabs are
 * deleted at the next arm in any tab.
 */
export class ReloadResume {
  #o: ReloadResumeOptions;
  #storage: Storage | null;
  #locks: LockManager | null;
  #now: () => number;
  #windowMs: number;
  #allowed: () => boolean | Promise<boolean>;
  #armed: Armed | null = null;
  #generation = 0;
  #unsubscribe: () => void;

  constructor(opts: ReloadResumeOptions) {
    this.#o = opts;
    this.#storage = opts.storage !== undefined ? opts.storage : tabStorage();
    this.#locks =
      opts.locks !== undefined
        ? opts.locks
        : typeof navigator === 'undefined'
          ? null
          : (navigator.locks ?? null);
    this.#now = opts.now ?? (() => Date.now());
    this.#windowMs = opts.windowMs ?? RESUME_WINDOW_MS;
    this.#allowed = opts.allowed ?? (() => !lockOnReload());
    this.#unsubscribe = opts.session.subscribe((e) => {
      if (e.type === 'unlocked') void this.refresh().catch(() => {});
      else if (e.reason === 'closed') this.#persist();
      else void this.#disarm(true).catch(() => {});
    });
  }

  /** Arms or disarms after the setting changed. Called on every unlock. */
  async refresh(): Promise<void> {
    const gen = ++this.#generation;
    const { session } = this.#o;
    if (!session.isUnlocked || !this.#storage || !(await this.#allowed())) {
      if (gen === this.#generation) await this.#disarm(true);
      return;
    }
    if (gen !== this.#generation || !session.isUnlocked) return;
    const userId = session.userId;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const ct = await encrypt(key, session.keys.rootKey, this.#aad(userId));
    const id = toHex(randomBytes(16));
    await this.#o.db.put(STORES.resume, id, key);
    if (gen !== this.#generation || !session.isUnlocked || session.userId !== userId) {
      await this.#o.db.delete(STORES.resume, id);
      return;
    }
    await this.#disarm(false);
    this.#armed = { id, userId, ct, release: this.#hold(id) };
    await this.#sweep(id);
  }

  /**
   * On load, before the unlock gate: unlocks the signed-in account's session from the record a
   * reload left. True when it did; false (and nothing left behind) otherwise, including when
   * `account` rejects.
   */
  async resume(account: string | Promise<string>): Promise<boolean> {
    const signedIn = Promise.resolve(account).catch(() => null);
    let record: ResumeRecord | null = null;
    try {
      record = parse(this.#storage?.getItem(RESUME_STORAGE_KEY) ?? null);
      this.#storage?.removeItem(RESUME_STORAGE_KEY);
    } catch {
      return false;
    }
    if (!record) return false;
    const { db, session, deviceKeys } = this.#o;
    try {
      const key = await db.get<CryptoKey>(STORES.resume, record.id);
      await db.delete(STORES.resume, record.id);
      const userId = await signedIn;
      const age = this.#now() - record.hiddenAt;
      const fresh =
        record.userId === userId &&
        age >= 0 &&
        age <= this.#windowMs &&
        (record.idleDeadline === null || this.#now() < record.idleDeadline);
      if (!key || !userId || !fresh || session.isUnlocked) return false;
      const rootKey = await decrypt(key, fromBase64Url(record.ct), this.#aad(userId));
      const device = await deviceKeys.load();
      await session.unlock({ userId, rootKey, device });
      return true;
    } catch {
      return false;
    }
  }

  dispose(): void {
    this.#unsubscribe();
    this.#armed?.release();
    this.#armed = null;
  }

  #persist(): void {
    const a = this.#armed;
    if (!a || !this.#storage) return;
    const { session } = this.#o;
    const idle = session.idleTimeoutMs;
    const record: ResumeRecord = {
      v: 1,
      id: a.id,
      userId: a.userId,
      ct: toBase64Url(a.ct),
      hiddenAt: this.#now(),
      idleDeadline: idle > 0 ? session.lastActiveAt + idle : null,
    };
    try {
      this.#storage.setItem(RESUME_STORAGE_KEY, JSON.stringify(record));
    } catch {}
  }

  async #disarm(clearRecord: boolean): Promise<void> {
    const a = this.#armed;
    this.#armed = null;
    if (clearRecord) {
      try {
        this.#storage?.removeItem(RESUME_STORAGE_KEY);
      } catch {}
    }
    if (!a) return;
    a.ct.fill(0);
    a.release();
    await this.#o.db.delete(STORES.resume, a.id);
  }

  #hold(id: string): () => void {
    if (!this.#locks) return () => {};
    let release = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    void this.#locks.request(`${LOCK_PREFIX}${id}`, () => held).catch(() => {});
    return release;
  }

  /** Deletes keys no live tab holds. Without Web Locks nothing can tell, so nothing is swept. */
  async #sweep(own: string): Promise<void> {
    if (!this.#locks) return;
    const { held = [] } = await this.#locks.query();
    const live = new Set(held.map((l) => l.name));
    for (const id of await this.#o.db.keys(STORES.resume)) {
      if (id !== own && !live.has(`${LOCK_PREFIX}${id}`)) {
        await this.#o.db.delete(STORES.resume, id);
      }
    }
  }

  #aad(userId: string) {
    return aad({ userId, field: RESUME_AAD_FIELD });
  }
}
