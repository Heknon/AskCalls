# @askcalls/adapter-blob-s3

`BlobStore` over the S3 API with `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
(`BLOB_DRIVER=s3`). Works with AWS S3, Cloudflare R2, MinIO and Backblaze B2, in Node and in the
browser (own-bucket mode signs on the device, spec 11.2a). Stores ciphertext only.

## Configuration

| Option | Env | Notes |
| --- | --- | --- |
| `bucket` | `S3_BUCKET` | required |
| `endpoint` | `S3_ENDPOINT` | omit for AWS; R2 `https://<account>.r2.cloudflarestorage.com`, B2 `https://s3.<region>.backblazeb2.com`, MinIO `http://host:9000` |
| `region` | `S3_REGION` | default `auto` with a custom endpoint (R2), `us-east-1` otherwise |
| `forcePathStyle` | | default `true` with a custom endpoint, virtual-hosted on AWS |
| `accessKeyId` / `secretAccessKey` | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | omit to use the SDK's default credential chain |
| `keyPrefix` | | e.g. `preview/pr-12/` for preview deployments |

The client sets `requestChecksumCalculation` and `responseChecksumValidation` to `WHEN_REQUIRED`.
SDK 3.729+ otherwise adds CRC32 checksums to every upload, which R2/B2/older MinIO reject and which
would make presigned PUT URLs require a checksum header a browser can't compute.
([AWS SDK data-integrity change](https://github.com/aws/aws-sdk-js-v3/issues/6810),
[R2 compatibility](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/))

## Behaviour

- `presignPut(key, { contentLength, contentType })`: `content-length` (and `content-type`) become
  SigV4 signed headers (`X-Amz-SignedHeaders=content-length;content-type;host`), so the service
  rejects a body of any other size. Browsers set Content-Length from the body; the returned
  `headers` say what to send. Expiry is 1 second to 7 days.
- `deletePrefix` pages through `ListObjectsV2` (1000 keys per page, `ContinuationToken`) and
  deletes each page with one `DeleteObjects` call; any per-key error fails the call. An empty
  prefix is refused.
- `healthCheck` sends `HeadBucket`: `connected`, `bucket not found` (404), `access denied` (403),
  `wrong region or endpoint` (301/400), `unreachable`.
- Errors are `DomainError('provider_error')` with the HTTP status and S3 error code only, never a
  key or body.

## CORS (spec 11.2a, 14)

Browsers PUT and GET recordings straight to the bucket, so its CORS must allow the app origin.
`corsJson(origins)` returns the exact JSON to paste; the same array works in the AWS S3 console
(Permissions → Cross-origin resource sharing) and the R2 dashboard (Settings → CORS policy):

```json
[
  {
    "AllowedOrigins": ["https://askcalls.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

For the AWS CLI (also B2's S3 endpoint), `corsConfigurationJson(origins)` wraps it as
`{"CORSRules": [...]}` for `aws s3api put-bucket-cors --cors-configuration file://cors.json`.

- `checkBucketCors(store, origin)` reads `GetBucketCors` and lists what's missing
  (`no_cors_configuration`, `origin_not_allowed`, `put_not_allowed`, `get_not_allowed`,
  `content_type_header_not_allowed`, `etag_not_exposed`) with the JSON that fixes it. It returns
  `unknown` when the key may not read CORS (403) or the server doesn't implement it (501).
- `checkCorsByPreflight(store, origin)` sends the same OPTIONS preflights a browser would against
  presigned URLs. Use it on the server or agent when `checkBucketCors` says `unknown`. MinIO's
  community edition configures CORS server-wide (`MINIO_API_CORS_ALLOW_ORIGIN`, default `*`) and
  answers `PutBucketCors` with 501, so only this check applies there.
- `applyBucketCors(store, origins)` writes the rules (needs `s3:PutBucketCORS`).

References: [S3 CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html),
[R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/),
[B2 CORS](https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules),
[presigner](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/).

## Tests

- `test/s3-blob-store.test.ts` (unit): presigned URL shape (path vs virtual-hosted style, signed
  headers, no checksum parameters, key prefix), pagination, error mapping and health with a stubbed
  `send`, CORS rule evaluation and preflight checks with a stubbed `fetch`.
- `test/s3-blob-store.int.test.ts` (integration, skipped unless `S3_TEST_ENDPOINT`,
  `S3_TEST_ACCESS_KEY_ID` and `S3_TEST_SECRET_ACCESS_KEY` are set): the `BlobStore` contract, real
  presigned PUT with a wrong and a right length, `deletePrefix` over 1005 objects, missing-bucket
  health, and both CORS checks. Each run creates and removes its own bucket.

  ```sh
  S3_TEST_ENDPOINT=http://127.0.0.1:9000 S3_TEST_ACCESS_KEY_ID=minioadmin \
  S3_TEST_SECRET_ACCESS_KEY=minioadmin bun run test:integration
  ```
