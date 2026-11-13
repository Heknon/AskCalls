/**
 * Uploads the pruned build to an S3-compatible bucket (Cloudflare R2) at content-hashed keys:
 *
 *   bun run models:publish
 *
 * Keys: `e5-pruned/<build>/<file>` and `e5-pruned/<build>/manifest.json`. Each object is
 * stored gzip-encoded (`Content-Encoding: gzip`, decoded transparently by browsers and the
 * agent) with `Cache-Control: public, max-age=31536000, immutable`: a key's bytes never
 * change, a new build gets a new prefix. Objects already present with the same hash are
 * skipped. Builds are only added, never deleted, so deployed versions keep working.
 *
 * Environment (see README.md for the one-time bucket setup):
 * - MODELS_S3_ENDPOINT     e.g. https://<account id>.eu.r2.cloudflarestorage.com
 * - MODELS_S3_BUCKET       e.g. askcalls-models
 * - MODELS_S3_ACCESS_KEY_ID, MODELS_S3_SECRET_ACCESS_KEY   an R2 token with write access
 * - MODELS_S3_REGION       default `auto`
 * - MODELS_PUBLIC_URL      optional: the bucket's public base URL (EMBEDDING_MODEL_URL). Every
 *                          file is then fetched back and checked: hash, Cache-Control, and CORS
 *                          for each origin in MODELS_CHECK_ORIGINS (comma list).
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { EMBEDDING_MODEL, MODEL_BUILD_PATH } from '../../apps/web/src/client/assets';
import { buildPruned } from './build-e5';
import { sha256 } from './prune-e5';

type S3 = typeof import('@aws-sdk/client-s3');

export const CACHE_CONTROL = 'public, max-age=31536000, immutable';

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
} = Bun.env;

async function verifyPublic(base: string, objects: Map<string, Uint8Array>) {
  const origins = (checkOrigins ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const dir = new URL(MODEL_BUILD_PATH, `${base.replace(/\/+$/, '')}/`).href;
  for (const [path, bytes] of objects) {
    for (const origin of origins.length ? origins : [null]) {
      const res = await fetch(new URL(path, dir), {
        headers: { 'Accept-Encoding': 'gzip', ...(origin && { Origin: origin }) },
      });
      const body = new Uint8Array(await res.arrayBuffer());
      const problems = [];
      if (!res.ok) problems.push(`HTTP ${res.status}`);
      else if (sha256(body) !== sha256(bytes)) problems.push('bytes differ');
      if (!res.headers.get('cache-control')?.includes('immutable')) problems.push('Cache-Control');
      const allowed = res.headers.get('access-control-allow-origin');
      if (origin && allowed !== '*' && allowed !== origin) problems.push(`CORS for ${origin}`);
      if (problems.length) throw new Error(`${path}: ${problems.join(', ')}`);
    }
    console.log(`models: ${path} served correctly`);
  }
}

async function main() {
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
  objects.set(
    'manifest.json',
    new TextEncoder().encode(`${JSON.stringify(build.manifest, null, 2)}\n`),
  );

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'set MODELS_S3_ENDPOINT, MODELS_S3_BUCKET, MODELS_S3_ACCESS_KEY_ID and MODELS_S3_SECRET_ACCESS_KEY',
    );
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
    endpoint,
    region: region ?? 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  for (const [path, bytes] of objects) {
    const key = `${MODEL_BUILD_PATH}${path}`;
    const hash = sha256(bytes);
    const head = await client
      .send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      .catch(() => null);
    if (head?.Metadata?.sha256 === hash) {
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
  if (publicUrl) await verifyPublic(publicUrl, objects);
  console.log(`models: EMBEDDING_MODEL_URL base serves ${MODEL_BUILD_PATH}`);
}

main().catch((e) => {
  console.error(`models:publish: ${(e as Error).message}`);
  process.exit(1);
});
