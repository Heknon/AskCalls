/**
 * Deletes a closed pull request's preview objects (`preview/pr-<n>/`) from the dev bucket.
 *
 *   S3_ENDPOINT=… S3_BUCKET=askcalls-dev S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… \
 *   bun scripts/delete-preview-blobs.ts <pr-number>
 *
 * Takes a PR number, not a prefix, so it can never be pointed at anything but a preview's
 * objects. Output is a count only. The repo root has no dependency on the adapter (Bun's
 * isolated installs), hence the relative import: the adapter resolves the AWS SDK itself.
 */
import { S3BlobStore } from '../packages/adapters/blob-s3/src/index';

const pr = process.argv[2] ?? '';
if (!/^[1-9]\d*$/.test(pr)) {
  process.stderr.write('usage: bun scripts/delete-preview-blobs.ts <pr-number>\n');
  process.exit(2);
}
const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  process.stderr.write('S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required\n');
  process.exit(2);
}

const store = new S3BlobStore({
  bucket: S3_BUCKET,
  keyPrefix: `preview/pr-${pr}/`,
  accessKeyId: S3_ACCESS_KEY_ID,
  secretAccessKey: S3_SECRET_ACCESS_KEY,
  ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT } : {}),
  ...(S3_REGION ? { region: S3_REGION } : {}),
});
const deleted = await store.deletePrefix('');
process.stdout.write(`deleted ${deleted} objects under preview/pr-${pr}/\n`);
