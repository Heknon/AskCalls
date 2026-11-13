/**
 * A small promise wrapper over one IndexedDB database. Stores hold wrapped key material,
 * non-extractable CryptoKeys, encrypted bulk-queue state and file handles: never plaintext
 * call content (spec 2.5).
 */
export const DEVICE_DB_NAME = 'askcalls-device';
const DB_VERSION = 1;

export const STORES = {
  secrets: 'secrets',
  deviceKey: 'device-key',
  bulk: 'bulk',
  handles: 'handles',
} as const;
export type StoreName = (typeof STORES)[keyof typeof STORES];

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class DeviceDb {
  #db: Promise<IDBDatabase> | null = null;

  constructor(
    readonly name = DEVICE_DB_NAME,
    private readonly factory: () => IDBFactory = () => globalThis.indexedDB,
  ) {}

  #open(): Promise<IDBDatabase> {
    this.#db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = this.factory().open(this.name, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const store of Object.values(STORES)) {
          if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          this.#db = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
    }).catch((e) => {
      this.#db = null;
      throw e;
    });
    return this.#db;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    const db = await this.#open();
    return request(db.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<
      T | undefined
    >;
  }

  async keys(store: StoreName): Promise<string[]> {
    const db = await this.#open();
    const keys = await request(db.transaction(store, 'readonly').objectStore(store).getAllKeys());
    return keys.map(String);
  }

  async put(store: StoreName, key: string, value: unknown): Promise<void> {
    await this.#write(store, (s) => s.put(value, key));
  }

  async delete(store: StoreName, key: string): Promise<void> {
    await this.#write(store, (s) => s.delete(key));
  }

  async clear(store: StoreName): Promise<void> {
    await this.#write(store, (s) => s.clear());
  }

  close(): void {
    void this.#db?.then((db) => db.close());
    this.#db = null;
  }

  async #write(store: StoreName, op: (s: IDBObjectStore) => IDBRequest): Promise<void> {
    const db = await this.#open();
    const tx = db.transaction(store, 'readwrite');
    op(tx.objectStore(store));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  }
}
