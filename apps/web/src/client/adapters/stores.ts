import type { BulkState, BulkStateStore } from '@askcalls/client-core/bulk/queue';
import type { DeviceKeyStore, SecretStore } from '@askcalls/client-core/ports/index';
import type { KeySession } from '@askcalls/client-core/session';
import { aad, decryptJson, encryptJson, isCryptoError } from '@askcalls/crypto';
import { DomainError } from '@askcalls/domain';
import { type DeviceDb, STORES } from './idb';

/**
 * Wrapped key material and non-secret device facts, as bytes in IndexedDB. Callers store only
 * what is already encrypted or public (spec 2.5); this store adds no encryption of its own.
 */
export class IdbSecretStore implements SecretStore {
  constructor(private readonly db: DeviceDb) {}

  async get(name: string): Promise<Uint8Array | null> {
    const v = await this.db.get<Uint8Array>(STORES.secrets, name);
    return v ? new Uint8Array(v) : null;
  }

  async set(name: string, value: Uint8Array): Promise<void> {
    await this.db.put(STORES.secrets, name, new Uint8Array(value));
  }

  async delete(name: string): Promise<void> {
    await this.db.delete(STORES.secrets, name);
  }
}

interface StoredDeviceKey {
  deviceKeyId: string;
  privateKey: CryptoKey;
}

const DEVICE_KEY = 'current';

/**
 * The device signing key as a non-extractable CryptoKey, stored by structured clone: the
 * browser keeps the key material out of reach of script, and it never leaves this profile.
 */
export class IdbDeviceKeyStore implements DeviceKeyStore {
  readonly extractable = false;

  constructor(private readonly db: DeviceDb) {}

  async load(): Promise<StoredDeviceKey | null> {
    const v = await this.db.get<StoredDeviceKey>(STORES.deviceKey, DEVICE_KEY);
    return v ? { deviceKeyId: v.deviceKeyId, privateKey: v.privateKey } : null;
  }

  async save(deviceKeyId: string, privateKey: CryptoKey): Promise<void> {
    if (privateKey.extractable) {
      throw new DomainError('invalid', 'browser device keys must be non-extractable');
    }
    await this.db.put(STORES.deviceKey, DEVICE_KEY, { deviceKeyId, privateKey });
  }

  async clear(): Promise<void> {
    await this.db.delete(STORES.deviceKey, DEVICE_KEY);
  }
}

/** AAD field for the bulk queue state; local to this device, never uploaded. */
export const BULK_STATE_AAD_FIELD = 'local:bulk-state';

/**
 * Bulk queue state (file references and statuses), encrypted with the KEK before it reaches
 * IndexedDB, because file names can carry contact names and numbers. Reading it needs the
 * session unlocked, which resuming a batch needs anyway. State written by another account, or
 * that fails to decrypt, reads as no state.
 */
export class IdbBulkStateStore implements BulkStateStore {
  constructor(
    private readonly db: DeviceDb,
    private readonly session: KeySession,
  ) {}

  async load(): Promise<BulkState | null> {
    const { userId, keys } = this.session;
    const ct = await this.db.get<Uint8Array>(STORES.bulk, userId);
    if (!ct) return null;
    try {
      return await decryptJson<BulkState>(keys.kek, ct, this.#aad(userId));
    } catch (e) {
      if (isCryptoError(e) && e.reason === 'locked') throw e;
      return null;
    }
  }

  async save(state: BulkState): Promise<void> {
    const { userId, keys } = this.session;
    await this.db.put(STORES.bulk, userId, await encryptJson(keys.kek, state, this.#aad(userId)));
  }

  async clear(): Promise<void> {
    await this.db.delete(STORES.bulk, this.session.userId);
  }

  #aad(userId: string) {
    return aad({ userId, field: BULK_STATE_AAD_FIELD });
  }
}
