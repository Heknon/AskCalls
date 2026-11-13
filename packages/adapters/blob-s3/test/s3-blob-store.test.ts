import {
  DeleteObjectsCommand,
  GetBucketCorsCommand,
  ListObjectsV2Command,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import {
  checkBucketCors,
  checkCorsByPreflight,
  corsConfigurationJson,
  corsJson,
  evaluateCorsRules,
} from '../src/cors';
import { S3BlobStore } from '../src/s3-blob-store';

const creds = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};

function r2Store() {
  return new S3BlobStore({
    bucket: 'askcalls-dev',
    endpoint: 'https://acct123.r2.cloudflarestorage.com',
    ...creds,
  });
}

/** A client whose `send` is replaced, so no request leaves the process. */
function stubbed(handler: (cmd: unknown) => unknown) {
  const client = new S3Client({ region: 'us-east-1', credentials: creds });
  const calls: unknown[] = [];
  client.send = (async (cmd: unknown) => {
    calls.push(cmd);
    return handler(cmd);
  }) as S3Client['send'];
  return { store: new S3BlobStore({ bucket: 'b', client }), calls };
}

function s3Error(name: string, status: number) {
  return new S3ServiceException({
    name,
    $fault: status >= 500 ? 'server' : 'client',
    $metadata: { httpStatusCode: status },
    message: name,
  });
}

describe('S3BlobStore presign', () => {
  it('signs content-length into a path-style PUT for custom endpoints', async () => {
    const put = await r2Store().presignPut('u1/calls/c1/rec', {
      expiresInSec: 600,
      contentLength: 1234,
      contentType: 'application/octet-stream',
    });
    const url = new URL(put.url);
    expect(url.origin).toBe('https://acct123.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/askcalls-dev/u1/calls/c1/rec');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^AKIDEXAMPLE\/\d{8}\/auto\/s3\//);
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';').sort()).toEqual([
      'content-length',
      'content-type',
      'host',
    ]);
    // No default CRC32 checksum: a browser could not compute it.
    expect([...url.searchParams.keys()].some((k) => k.toLowerCase().includes('checksum'))).toBe(
      false,
    );
    expect(put.method).toBe('PUT');
    expect(put.headers).toEqual({
      'content-length': '1234',
      'content-type': 'application/octet-stream',
    });
    expect(put.expiresAt.getTime() - Date.now()).toBeGreaterThan(590_000);
  });

  it('uses virtual-hosted style on AWS', async () => {
    const store = new S3BlobStore({ bucket: 'my-bucket', region: 'eu-central-1', ...creds });
    const get = await store.presignGet('k', { expiresInSec: 60 });
    const url = new URL(get.url);
    expect(url.host).toBe('my-bucket.s3.eu-central-1.amazonaws.com');
    expect(url.pathname).toBe('/k');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(get.headers).toEqual({});
  });

  it('applies the key prefix', async () => {
    const store = new S3BlobStore({
      bucket: 'askcalls-dev',
      endpoint: 'http://localhost:9000',
      keyPrefix: 'preview/pr-12/',
      ...creds,
    });
    const get = await store.presignGet('u1/x', { expiresInSec: 60 });
    expect(new URL(get.url).pathname).toBe('/askcalls-dev/preview/pr-12/u1/x');
  });

  it('rejects out-of-range expiry and lengths', async () => {
    const s = r2Store();
    await expect(s.presignGet('k', { expiresInSec: 0 })).rejects.toMatchObject({ code: 'invalid' });
    await expect(s.presignGet('k', { expiresInSec: 604_801 })).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(s.presignPut('k', { expiresInSec: 60, contentLength: 1.5 })).rejects.toMatchObject(
      { code: 'invalid' },
    );
  });
});

describe('S3BlobStore operations (stubbed client)', () => {
  it('deletes a prefix across pages', async () => {
    const pages = [
      {
        Contents: [{ Key: 'p/1' }, { Key: 'p/2' }],
        IsTruncated: true,
        NextContinuationToken: 't1',
      },
      { Contents: [{ Key: 'p/3' }], IsTruncated: false },
    ];
    const { store, calls } = stubbed((cmd) => {
      if (cmd instanceof ListObjectsV2Command) {
        return cmd.input.ContinuationToken === 't1' ? pages[1] : pages[0];
      }
      if (cmd instanceof DeleteObjectsCommand) return { Deleted: cmd.input.Delete?.Objects };
      throw new Error('unexpected');
    });
    expect(await store.deletePrefix('p/')).toBe(3);
    const lists = calls.filter((c) => c instanceof ListObjectsV2Command) as ListObjectsV2Command[];
    expect(lists.map((c) => c.input.ContinuationToken)).toEqual([undefined, 't1']);
    expect(lists[0]!.input.Prefix).toBe('p/');
    const dels = calls.filter((c) => c instanceof DeleteObjectsCommand) as DeleteObjectsCommand[];
    expect(dels.map((d) => d.input.Delete?.Objects?.length)).toEqual([2, 1]);
  });

  it('keeps every operation inside the key prefix', async () => {
    const client = new S3Client({ region: 'us-east-1', credentials: creds });
    const keys: unknown[] = [];
    client.send = (async (cmd: { input: { Key?: string; Prefix?: string } }) => {
      keys.push(cmd.input.Key ?? cmd.input.Prefix);
      if (cmd instanceof ListObjectsV2Command)
        return { Contents: [{ Key: `${cmd.input.Prefix}1` }] };
      if (cmd instanceof DeleteObjectsCommand) return {};
      return { ContentLength: 1 };
    }) as S3Client['send'];
    const store = new S3BlobStore({ bucket: 'b', client, keyPrefix: 'preview/pr-12/' });
    await store.put('u1/rec', new Uint8Array(1));
    await store.size('u1/rec');
    await store.delete('u1/rec');
    expect(await store.deletePrefix('u1/')).toBe(1);
    // An empty prefix inside a store with a key prefix clears only that prefix (preview cleanup).
    expect(await store.deletePrefix('')).toBe(1);
    expect(keys).toEqual([
      'preview/pr-12/u1/rec',
      'preview/pr-12/u1/rec',
      'preview/pr-12/u1/rec',
      'preview/pr-12/u1/',
      undefined,
      'preview/pr-12/',
      undefined,
    ]);
  });

  it('fails deletePrefix when some deletions fail', async () => {
    const { store } = stubbed((cmd) => {
      if (cmd instanceof ListObjectsV2Command) return { Contents: [{ Key: 'p/1' }] };
      return { Errors: [{ Key: 'p/1', Code: 'AccessDenied' }] };
    });
    await expect(store.deletePrefix('p/')).rejects.toMatchObject({
      code: 'provider_error',
      details: { failed: 1 },
    });
  });

  it('refuses to delete the whole bucket', async () => {
    const { store } = stubbed(() => ({}));
    await expect(store.deletePrefix('')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('maps 404 to null and other errors to content-free provider errors', async () => {
    const { store: missing } = stubbed(() => {
      throw s3Error('NoSuchKey', 404);
    });
    expect(await missing.get('u1/secret-name')).toBeNull();
    expect(await missing.size('u1/secret-name')).toBeNull();
    await missing.delete('u1/secret-name');
    const { store: broken } = stubbed(() => {
      throw s3Error('InternalError', 500);
    });
    const err = await broken.get('u1/secret-name').catch((e) => e);
    expect(err).toMatchObject({
      code: 'provider_error',
      details: { status: 500, code: 'InternalError' },
    });
    expect(String(err.message)).not.toContain('secret-name');
  });

  it('reports health from HeadBucket', async () => {
    for (const [status, message] of [
      [404, 'bucket not found'],
      [403, 'access denied'],
      [301, 'wrong region or endpoint'],
      [503, 'error 503'],
    ] as const) {
      const { store } = stubbed(() => {
        throw s3Error('X', status);
      });
      expect(await store.healthCheck()).toMatchObject({ ok: false, message });
    }
    const { store } = stubbed(() => ({}));
    expect(await store.healthCheck()).toMatchObject({ ok: true, message: 'connected' });
  });
});

describe('CORS helpers', () => {
  const origin = 'https://askcalls.com';

  it('produces the JSON to paste', () => {
    expect(JSON.parse(corsJson([origin, 'http://localhost:3000/']))).toEqual([
      {
        AllowedOrigins: ['https://askcalls.com', 'http://localhost:3000'],
        AllowedMethods: ['GET', 'PUT', 'HEAD'],
        AllowedHeaders: ['content-type'],
        ExposeHeaders: ['ETag', 'Content-Length'],
        MaxAgeSeconds: 3600,
      },
    ]);
    expect(JSON.parse(corsConfigurationJson([origin])).CORSRules).toHaveLength(1);
  });

  it('accepts its own rules and common wildcards', () => {
    expect(evaluateCorsRules(JSON.parse(corsJson([origin])), origin)).toEqual([]);
    expect(
      evaluateCorsRules(
        [
          {
            AllowedOrigins: ['https://*.askcalls.com'],
            AllowedMethods: ['PUT', 'GET'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['etag'],
          },
        ],
        'https://dev.askcalls.com',
      ),
    ).toEqual([]);
  });

  it('names what is missing', () => {
    expect(evaluateCorsRules([], origin)).toEqual(['no_cors_configuration']);
    expect(
      evaluateCorsRules(
        [{ AllowedOrigins: ['https://other.com'], AllowedMethods: ['GET'] }],
        origin,
      ),
    ).toEqual(['origin_not_allowed']);
    expect(
      evaluateCorsRules([{ AllowedOrigins: [origin], AllowedMethods: ['GET', 'PUT'] }], origin),
    ).toEqual(['content_type_header_not_allowed', 'etag_not_exposed']);
    expect(
      evaluateCorsRules(
        [{ AllowedOrigins: ['*'], AllowedMethods: ['GET'], ExposeHeaders: ['ETag'] }],
        origin,
      ),
    ).toEqual(['put_not_allowed']);
  });

  it('checks the bucket configuration', async () => {
    const { store: none } = stubbed(() => {
      throw s3Error('NoSuchCORSConfiguration', 404);
    });
    expect(await checkBucketCors(none, origin)).toMatchObject({
      status: 'missing',
      problems: ['no_cors_configuration'],
    });
    const { store: denied } = stubbed(() => {
      throw s3Error('AccessDenied', 403);
    });
    expect(await checkBucketCors(denied, origin)).toEqual({
      status: 'unknown',
      reason: 'access_denied',
      httpStatus: 403,
    });
    const { store: good, calls } = stubbed(() => ({ CORSRules: JSON.parse(corsJson([origin])) }));
    expect(await checkBucketCors(good, origin)).toEqual({ status: 'ok' });
    expect(calls[0]).toBeInstanceOf(GetBucketCorsCommand);
  });

  it('checks by preflight', async () => {
    const seen: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const allow = (allowOrigin: string | null): typeof fetch =>
      (async (url: string, init: RequestInit) => {
        seen.push({
          url,
          method: init.method!,
          headers: init.headers as Record<string, string>,
        });
        const h = new Headers();
        if (allowOrigin) {
          h.set('access-control-allow-origin', allowOrigin);
          h.set('access-control-allow-methods', 'GET, PUT, HEAD');
          h.set('access-control-allow-headers', 'content-type');
        }
        return new Response(null, { status: allowOrigin ? 200 : 403, headers: h });
      }) as typeof fetch;
    expect(await checkCorsByPreflight(r2Store(), origin, allow(origin))).toEqual({ status: 'ok' });
    expect(seen[0]).toMatchObject({
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT' },
    });
    expect(await checkCorsByPreflight(r2Store(), origin, allow(null))).toMatchObject({
      status: 'missing',
      problems: ['origin_not_allowed'],
    });
  });
});
