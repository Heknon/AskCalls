import type { ApiClient } from '@askcalls/api-contract';
import type { RecordingStore, RecordingStoreInfo, RecordingStoreProbe } from '../ports/index';
import type { Providers } from '../userdata';
import type { GoogleDriveStore } from './google-drive';
import type { Fetch } from './http';
import { findStore, isDriveRef, withDriveFolder } from './refs';
import { SigV4BucketStore } from './s3-compatible';

export interface RecordingStoresOptions {
  api: ApiClient;
  /** The decrypted providers document (cached by UserDataStore). */
  providers: () => Promise<Providers>;
  /** Writes it back (the Drive folder id); absent where the device can't write. */
  updateProviders?: (mutate: (p: Providers) => Providers) => Promise<unknown>;
  fetch?: Fetch;
}

/**
 * Every own store this account knows, behind one `RecordingStore`: the call's `bucketRef`
 * picks the adapter. The Drive adapter loads on first use, so pages without Drive don't ship it.
 */
export class RecordingStores implements RecordingStore {
  readonly s3: SigV4BucketStore;
  #drive: Promise<GoogleDriveStore> | null = null;

  constructor(private readonly opts: RecordingStoresOptions) {
    this.s3 = new SigV4BucketStore(
      async (ref) => {
        const s = findStore(await opts.providers(), ref);
        if (s.kind !== 's3-compatible') throw new Error('not an S3-compatible store');
        return s.config;
      },
      opts.fetch ? { fetch: opts.fetch } : {},
    );
  }

  drive(): Promise<GoogleDriveStore> {
    this.#drive ??= import('./google-drive').then(
      ({ GoogleDriveStore, serverDriveTokens }) =>
        new GoogleDriveStore({
          resolve: async (ref) => {
            const s = findStore(await this.opts.providers(), ref);
            if (s.kind !== 'google-drive') throw new Error('not a Google Drive store');
            return s.config;
          },
          tokens: serverDriveTokens(this.opts.api),
          ...(this.opts.updateProviders && {
            saveFolder: async (ref, folderId) => {
              await this.opts.updateProviders!((p) => withDriveFolder(p, ref, folderId));
            },
          }),
          ...(this.opts.fetch && { fetch: this.opts.fetch }),
        }),
      (e) => {
        this.#drive = null;
        throw e;
      },
    );
    return this.#drive;
  }

  /** Drops in-memory access tokens (lock). */
  clear(): void {
    void this.#drive?.then(
      (d) => d.clear(),
      () => {},
    );
  }

  #pick(ref: string): Promise<RecordingStore> {
    return isDriveRef(ref) ? this.drive() : Promise.resolve(this.s3);
  }

  async put(ref: string, callId: string, body: Uint8Array): Promise<{ objectKey: string }> {
    return (await this.#pick(ref)).put(ref, callId, body);
  }

  async *get(ref: string, objectKey: string): AsyncGenerator<Uint8Array> {
    yield* (await this.#pick(ref)).get(ref, objectKey);
  }

  async delete(ref: string, objectKey: string): Promise<void> {
    return (await this.#pick(ref)).delete(ref, objectKey);
  }

  async probe(ref: string): Promise<RecordingStoreProbe> {
    return (await this.#pick(ref)).probe(ref);
  }

  async describe(ref: string): Promise<RecordingStoreInfo> {
    return (await this.#pick(ref)).describe(ref);
  }
}
