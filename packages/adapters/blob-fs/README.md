# @askcalls/adapter-blob-fs

`BlobStore` on local disk, for development, self-hosting and local mode (`BLOB_DRIVER=fs`,
`FS_BLOB_DIR`, default `~/.askcalls/blobs` in local mode). It stores ciphertext only.

## Layout and safety

- A key such as `u1/calls/<id>/rec` maps to `<dir>/u1/calls/<id>/rec.blob`. The `.blob` suffix keeps
  a key `p` apart from keys under `p/`.
- Every key segment must match `[A-Za-z0-9_-][A-Za-z0-9._-]*` (max 255 chars; whole key max 1024).
  That rejects `.`, `..`, empty segments, leading `/`, backslashes, `%`, `:`, NUL, whitespace and
  non-ASCII, so a key can neither traverse out of the root nor be reinterpreted in a URL. The
  resolved path is also checked to stay under the root. Invalid keys throw `DomainError('invalid')`.
- Writes go to a dot-prefixed temp file in the target directory, are fsynced, then renamed over the
  target, so readers never see a partial object.
- Directories are created `0700`, files `0600`.
- `deletePrefix` takes a plain string prefix (it need not end at `/`), walks only the directory the
  prefix names, and prunes directories it empties.

## Presigned URLs

Local disk has no presigner, so `presignPut` / `presignGet` return HMAC-SHA256-signed URLs to an app
route:

```
<appUrl>/api/blob/<key>?exp=<unix seconds>[&len=<bytes>]&sig=<base64url>
```

The MAC covers `askcalls-blob-v1`, the method, the key, `exp` and `len` (newline-separated), so a GET
URL can't be used to PUT, a URL for one key can't reach another, and a PUT presigned with a content
length only accepts a body of exactly that length. Expiry is capped at 7 days, like S3.

The signing key is `signingSecret` when given, otherwise 32 random bytes created once in
`<dir>/.signing-key` (`0600`).

**The route itself (`/api/blob/[...key]`) belongs to the API bucket.** It must:

1. Take the key from the path, percent-decoded once.
2. Call `store.verifyPresigned({ method, blobKey, query, contentLength })` (or the standalone
   `verifyBlobUrl` with the same key) and answer 403 on any failure, without saying which check
   failed.
3. For PUT, refuse bodies longer than `len` while streaming, then `store.put(key, bytes)`.
   For GET, `store.get(key)` and 404 when it returns `null`.
4. Never log bodies, and answer with `Cache-Control: no-store`.

Because `ports.blobs` is typed as the `BlobStore` port, the route needs the concrete `FsBlobStore`
(or a port-level verifier; see the note in the bucket report).

## Tests

`test/fs-blob-store.test.ts` runs the shared `BlobStore` contract against a temp directory, plus
traversal, permission, atomicity, prefix and signature tests.
