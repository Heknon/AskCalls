/**
 * Uploads the pruned build to the model bucket at content-hashed keys:
 *
 *   bun run models:publish
 *
 * The hosted site's bucket is `askcalls-models` on AWS S3 behind CloudFront (infra/,
 * AskCallsModels); any S3-compatible bucket works (R2, MinIO, B2: set MODELS_S3_ENDPOINT).
 *
 * Keys: `e5-pruned/<build>/<file>` and `e5-pruned/<build>/manifest.json`. Each object is
 * stored gzip-encoded (`Content-Encoding: gzip`, decoded transparently by browsers and the
 * agent) with `Cache-Control: public, max-age=31536000, immutable`: a key's bytes never
 * change, a new build gets a new prefix. Objects already present with the same hash are
 * skipped; when every pinned file already is, the build itself is skipped too, so the deploy
 * workflow runs this on every deploy for the cost of a few HEAD requests. Builds are only
 * added, never deleted, so deployed versions keep working.
 *
 * Environment (see README.md for the one-time setup):
 * - MODELS_S3_BUCKET       e.g. askcalls-models
 * - MODELS_S3_REGION       default AWS_REGION, else `us-east-1` (AWS); `auto` with an endpoint
 * - MODELS_S3_ENDPOINT     unset for AWS S3; e.g. https://<account id>.eu.r2.cloudflarestorage.com
 * - MODELS_S3_ACCESS_KEY_ID, MODELS_S3_SECRET_ACCESS_KEY   optional: without them the AWS SDK's
 *                          default credential chain is used (the deploy workflow's OIDC role,
 *                          AWS_PROFILE, …)
 * - MODELS_PUBLIC_URL      optional: the public base URL (EMBEDDING_MODEL_URL). Every file is
 *                          then fetched back and checked: hash, Cache-Control, and CORS for each
 *                          origin in MODELS_CHECK_ORIGINS (comma list).
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { EMBEDDING_MODEL, MODEL_BUILD_PATH } from '../../apps/web/src/client/assets';
import { buildPruned } from './build-e5';
import { sha256 } from './prune-e5';

type S3 = typeof import('@aws-sdk/client-s3');

export const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const MANIFEST = 'manifest.json';

const contentType = (path: string) =>
  path.endsWith('.json') ? 'application/json' : 'application/octet-stream';

const {
  MODELS_S3_ENDPOINT: endpoint,
  MODELS_S3_BUCKET: bucket,
  MODELS_S3_ACCESS_KEY_ID: accessKeyId,
  MODELS_S3_SECRET_ACCESS_KEY: secretAccessKey,
  MODELS_S3_REGION: region,
  MODELS_PUBLIC_URL: publicUrl,
  MODELS_CHECK_ORIGINS: checkOrigins,
  AWS_REGION: awsRegion,
} = Bun.env;

/** Fetches every file through the public URL and checks it against its expected SHA-256. */
async function verifyPublic(base: string, expected: Map<string, string>) {
  const origins = (checkOrigins ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const dir = new URL(MODEL_BUILD_PATH, `${base.replace(/\/+$/, '')}/`).href;
  for (const [path, hash] of expected) {
    for (const origin of origins.length ? origins : [null]) {
      const res = await fetch(new URL(path, dir), {
        headers: { 'Accept-Encoding': 'gzip', ...(origin && { Origin: origin }) },
      });
      const body = new Uint8Array(await res.arrayBuffer());
      const problems = [];
      if (!res.ok) problems.push(`HTTP ${res.status}`);
      else if (sha256(body) !== hash) problems.push('bytes differ');
      if (!res.headers.get('cache-control')?.includes('immutable')) problems.push('Cache-Control');
      const allowed = res.headers.get('access-control-allow-origin');
      if (origin && allowed !== '*' && allowed !== origin) problems.push(`CORS for ${origin}`);
      if (problems.length) throw new Error(`${path}: ${problems.join(', ')}`);
    }
    console.log(`models: ${path} served correctly`);
  }
}

async function main() {
  if (!bucket) throw new Error('set MODELS_S3_BUCKET (and MODELS_S3_ENDPOINT for non-AWS buckets)');
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error('set both MODELS_S3_ACCESS_KEY_ID and MODELS_S3_SECRET_ACCESS_KEY, or neither');
  }
  const s3pkg = join(
    import.meta.dir,
    '..',
    '..',
    'packages',
    'adapters',
    'blob-s3',
    'package.json',
  );
  const { S3Client, HeadObjectCommand, PutObjectCommand } = (await import(
    createRequire(s3pkg).resolve('@aws-sdk/client-s3')
  )) as S3;
  const client = new S3Client({
    region: region ?? (endpoint ? 'auto' : (awsRegion ?? 'us-east-1')),
    ...(endpoint && { endpoint, forcePathStyle: true }),
    ...(accessKeyId && secretAccessKey && { credentials: { accessKeyId, secretAccessKey } }),
  });
  /** The stored object's SHA-256 (of the uncompressed bytes), or null if it is missing. */
  const publishedHash = async (path: string) => {
    const head = await client
      .send(new HeadObjectCommand({ Bucket: bucket, Key: `${MODEL_BUILD_PATH}${path}` }))
      .catch(() => null);
    return head ? (head.Metadata?.sha256 ?? '') : null;
  };

  // Fast path: every pinned file is there with its pinned hash, and the manifest exists.
  const expected = new Map(EMBEDDING_MODEL.files.map((f) => [f.path, f.sha256]));
  let complete = true;
  for (const [path, hash] of expected) {
    if ((await publishedHash(path)) !== hash) {
      complete = false;
      break;
    }
  }
  const manifestHash = complete ? await publishedHash(MANIFEST) : null;
  if (complete && manifestHash) {
    console.log(`models: build ${EMBEDDING_MODEL.build} already published`);
    expected.set(MANIFEST, manifestHash);
  } else {
    const build = await buildPruned();
    if (build.manifest.build !== EMBEDDING_MODEL.build) {
      throw new Error(
        `pruned build ${build.manifest.build} does not match assets.ts (${EMBEDDING_MODEL.build})`,
      );
    }
    for (const f of EMBEDDING_MODEL.files) {
      const b = build.files.get(f.path);
      if (!b || b.length !== f.bytes || sha256(b) !== f.sha256)
        throw new Error(`${f.path}: pin mismatch`);
    }
    const objects = new Map(build.files);
    objects.set(MANIFEST, new TextEncoder().encode(`${JSON.stringify(build.manifest, null, 2)}\n`));

    expected.clear();
    for (const [path, bytes] of objects) {
      const key = `${MODEL_BUILD_PATH}${path}`;
      const hash = sha256(bytes);
      expected.set(path, hash);
      if ((await publishedHash(path)) === hash) {
        console.log(`models: ${key} already published`);
        continue;
      }
      const body = gzipSync(bytes, { level: 9 });
      if (sha256(gunzipSync(body)) !== hash) throw new Error(`${path}: gzip round trip failed`);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType(path),
          ContentEncoding: 'gzip',
          CacheControl: CACHE_CONTROL,
          Metadata: { sha256: hash },
        }),
      );
      console.log(`models: uploaded ${key} (${(body.length / 1e6).toFixed(1)} MB gzip)`);
    }
  }
  if (publicUrl) await verifyPublic(publicUrl, expected);
  console.log(`models: EMBEDDING_MODEL_URL base serves ${MODEL_BUILD_PATH}`);
}

main().catch((e) => {
  console.error(`models:publish: ${(e as Error).message}`);
  process.exit(1);
});
