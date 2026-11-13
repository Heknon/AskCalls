/**
 * Deletes a closed pull request's preview objects (`preview/pr-<n>/`) from the dev bucket.
 *
 *   S3_BUCKET=askcalls-dev S3_REGION=eu-central-1 bun scripts/delete-preview-blobs.ts <pr-number>
 *
 * Credentials: S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY when set, otherwise the AWS SDK's
 * default credential chain (preview.yml assumes the `askcalls-github-preview-cleanup` role,
 * which may only list and delete `preview/` objects). S3_ENDPOINT for a non-AWS bucket.
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
if (!S3_BUCKET) {
  process.stderr.write('S3_BUCKET is required\n');
  process.exit(2);
}
if (Boolean(S3_ACCESS_KEY_ID) !== Boolean(S3_SECRET_ACCESS_KEY)) {
  process.stderr.write('set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither\n');
  process.exit(2);
}

const store = new S3BlobStore({
  bucket: S3_BUCKET,
  keyPrefix: `preview/pr-${pr}/`,
  ...(S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY
    ? { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }
    : {}),
  ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT } : {}),
  ...(S3_REGION ? { region: S3_REGION } : {}),
});
const deleted = await store.deletePrefix('');
process.stdout.write(`deleted ${deleted} objects under preview/pr-${pr}/\n`);
