import { MemoryBlobStore } from '@askcalls/adapter-mocks';
import type { BlobStore } from '@askcalls/domain';
import type { InstanceConfig } from '../config/schema';
import { AdapterUnavailableError } from './errors';

/** BLOB_DRIVER → adapter. blob-s3 registers `s3`, blob-fs registers `fs`. */
export async function buildBlobStore(config: InstanceConfig): Promise<BlobStore> {
  switch (config.blob.driver) {
    case 'memory':
      return new MemoryBlobStore();
    default:
      throw new AdapterUnavailableError('blob storage', config.blob.driver);
  }
}
