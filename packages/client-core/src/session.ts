import { CryptoError, UnlockedKeys } from '@askcalls/crypto';
import { systemTimers, type Timers } from './ports/index';

/** Spec 6.8: auto-lock after 15 minutes idle by default. */
export const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60_000;

export type LockReason = 'manual' | 'idle' | 'closed';

export type SessionEvent =
  | { type: 'unlocked'; userId: string }
  | { type: 'locked'; reason: LockReason };

export interface DeviceIdentity {
  /** `DeviceKey.id` on the server, written into call signatures. */
  deviceKeyId: string;
  privateKey: CryptoKey;
}

interface Unlocked {
  userId: string;
  keys: UnlockedKeys;
  device: DeviceIdentity | null;
}

/**
 * The in-memory keyring of an unlocked device (spec 6.8). Holds `UnlockedKeys` and the device
 * signing key; `lock()` wipes them, runs every registered wipe hook (decrypted caches, Blob
 * URLs) and notifies subscribers. Any activity calls `touch()` to restart the idle timer.
 */
export class KeySession {
  #state: Unlocked | null = null;
  #listeners = new Set<(e: SessionEvent) => void>();
  #wipers = new Set<() => void>();
  #idleMs: number;
  #timers: Timers;
  #timer: unknown = null;

  constructor(opts: { idleTimeoutMs?: number | null; timers?: Timers } = {}) {
    this.#idleMs =
      opts.idleTimeoutMs === undefined ? DEFAULT_IDLE_TIMEOUT_MS : (opts.idleTimeoutMs ?? 0);
    this.#timers = opts.timers ?? systemTimers;
  }

  get isUnlocked(): boolean {
    return this.#state !== null;
  }

  get userId(): string {
    return this.#require().userId;
  }

  get keys(): UnlockedKeys {
    return this.#require().keys;
  }

  get device(): DeviceIdentity | null {
    return this.#require().device;
  }

  /** Idle timeout in ms; 0 disables auto-lock (the agent). Takes effect on the next touch. */
  get idleTimeoutMs(): number {
    return this.#idleMs;
  }

  setIdleTimeout(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) throw new RangeError('idle timeout must be >= 0');
    this.#idleMs = ms;
    if (this.#state) this.touch();
  }

  /** Takes ownership of `rootKey`: it is wiped on lock. */
  async unlock(input: {
    userId: string;
    rootKey: Uint8Array;
    device?: DeviceIdentity | null;
  }): Promise<void> {
    const keys = await UnlockedKeys.fromRootKey(input.rootKey).finally(() => input.rootKey.fill(0));
    if (this.#state) this.#wipe();
    this.#state = { userId: input.userId, keys, device: input.device ?? null };
    this.touch();
    this.#emit({ type: 'unlocked', userId: input.userId });
  }

  setDevice(device: DeviceIdentity): void {
    this.#require().device = device;
  }

  /** Records user activity: restarts the idle timer. */
  touch(): void {
    if (!this.#state) return;
    if (this.#timer !== null) this.#timers.clearTimeout(this.#timer);
    this.#timer =
      this.#idleMs > 0 ? this.#timers.setTimeout(() => this.lock('idle'), this.#idleMs) : null;
  }

  lock(reason: LockReason = 'manual'): void {
    if (!this.#state) return;
    this.#wipe();
    this.#emit({ type: 'locked', reason });
  }

  subscribe(listener: (e: SessionEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Registers a hook that clears decrypted state on lock. Returns an unregister function. */
  onWipe(wipe: () => void): () => void {
    this.#wipers.add(wipe);
    return () => this.#wipers.delete(wipe);
  }

  #require(): Unlocked {
    if (!this.#state) throw new CryptoError('locked', 'session is locked');
    return this.#state;
  }

  #wipe(): void {
    if (this.#timer !== null) this.#timers.clearTimeout(this.#timer);
    this.#timer = null;
    this.#state?.keys.wipe();
    this.#state = null;
    for (const w of this.#wipers) w();
  }

  #emit(e: SessionEvent): void {
    for (const l of this.#listeners) l(e);
  }
}
