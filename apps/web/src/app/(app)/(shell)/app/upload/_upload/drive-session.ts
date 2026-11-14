import type { DriveImport } from '@askcalls/client-core/bulk/drive';
import type { FileRef } from '@askcalls/client-core/bulk/pairing';
import type { BulkFileReader } from '@askcalls/client-core/bulk/runner';

/**
 * Google Drive for one unlocked session's bulk import: client-core's `DriveImport`, loaded when
 * Drive is first connected, and with it the access token, in memory until lock.
 */
export class DriveSession implements BulkFileReader {
  #impl: DriveImport | null = null;
  #loading: Promise<DriveImport> | null = null;

  load(): Promise<DriveImport> {
    this.#loading ??= import(/* webpackChunkName: "u2" */ '@askcalls/client-core/bulk/drive').then(
      (m) => {
        this.#impl = new m.DriveImport();
        return this.#impl;
      },
    );
    return this.#loading;
  }

  /** Whether a token is held that lasts past the next minute. */
  connected(): boolean {
    return !!this.#impl?.connected();
  }

  clear(): void {
    this.#impl?.clear();
  }

  audio = async (file: FileRef) => (await this.load()).audio(file);

  bytes = async (file: FileRef) => (await this.load()).bytes(file);
}
