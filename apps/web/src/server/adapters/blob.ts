import { homedir } from 'node:os';
import { join } from 'node:path';
import { FsBlobStore } from '@askcalls/adapter-blob-fs';
import { S3BlobStore } from '@askcalls/adapter-blob-s3';
import { MemoryBlobStore } from '@askcalls/adapter-mocks';
import type { BlobStore } from '@askcalls/domain';
import type { InstanceConfig } from '../config/schema';
import { assertLocalTarget } from '../http/offline-fetch';
import { AdapterUnavailableError } from './errors';

/** `~` and `~/x` → the user's home directory. */
export function expandHome(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

/** BLOB_DRIVER → adapter. */
export async function buildBlobStore(config: InstanceConfig): Promise<BlobStore> {
  switch (config.blob.driver) {
    case 'memory':
      return new MemoryBlobStore();
    case 's3': {
      const { bucket, endpoint, region, accessKeyId, secretAccessKey, keyPrefix } = config.blob.s3;
      if (!bucket) throw new Error('S3_BUCKET: required when BLOB_DRIVER=s3');
      assertLocalTarget(
        config.offlineMode,
        endpoint ?? `https://s3.${region ?? 'us-east-1'}.amazonaws.com`,
      );
      return new S3BlobStore({
        bucket,
        ...(endpoint ? { endpoint } : {}),
        ...(region ? { region } : {}),
        ...(accessKeyId ? { accessKeyId } : {}),
        ...(secretAccessKey ? { secretAccessKey } : {}),
        ...(keyPrefix ? { keyPrefix } : {}),
      });
    }
    case 'fs':
      // Presigned URLs point at this app's /api/blob route; the signing key lives in the folder.
      return new FsBlobStore({ dir: expandHome(config.blob.fsDir), baseUrl: config.appUrl });
    default:
      throw new AdapterUnavailableError('blob storage', config.blob.driver);
  }
}
