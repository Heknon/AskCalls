# Embedding model: pruning, hosting and publishing

The browser and the agent embed with **multilingual-e5-small, 8-bit (q8), with its vocabulary
pruned to Hebrew, English, Arabic and Russian**. The upstream model spends 96 of its 118 MB on a
250,037 × 384 token-embedding matrix covering about 100 languages; the pruned build keeps
31,229 rows. Everything else in the model is byte-for-byte the original, so a text whose
tokens are all kept gets exactly the original vector.

| | upstream | pruned |
| --- | --- | --- |
| `onnx/model_quantized.onnx` | 118.3 MB (gzip 78.3, brotli 76.8) | 34.3 MB (gzip 24.4, brotli 24.0) |
| `tokenizer.json` | 17.1 MB (gzip 3.8, brotli 2.5) | 1.4 MB (gzip 0.56, brotli 0.41) |

The non-embedding part of the model (12 transformer layers) is 22.3 MB on its own, so a ~25 MB
model would leave room for only ~7,000 tokens; at that size the median cosine to the original
drops to about 0.93 (table below). The build keeps quality instead: ~25 MB is what it costs on
the wire with gzip.

## Files

| File | Role |
| --- | --- |
| `corpora.ts` | The pinned text samples (URL, byte range, SHA-256) the keep-set is derived from. |
| `derive-keep-set.ts` | `bun run models:derive`: tokenizes the corpora and writes `e5-keep-set.txt`. |
| `e5-keep-set.txt` | The committed keep-set: sorted original token ids, as base-36 deltas. |
| `onnx-rows.ts` | Rewrites one initializer of an ONNX protobuf to a subset of its rows. |
| `prune-e5.ts` | The pruning: model rows, tokenizer remap, `config.json`, manifest, build hash. |
| `build-e5.ts` | `bun run models:build [outDir]`: original files + keep-set → `<outDir>/<build>/`. |
| `publish.ts` | `bun run models:publish`: uploads a build to the model bucket. |
| `source.ts`, `files.ts` | Pinned download of the original files into `node_modules/.cache/askcalls-models`. |

## Toolchain

Bun (the repo's `packageManager`, 1.4.4) and `@huggingface/transformers` 4.3.2 as apps/web
resolves it (the same tokenizer the browser runs). No Python and no ONNX tooling: the ONNX
change is a protobuf splice (`onnx-rows.ts`) that replaces the dims and `raw_data` of
`embeddings.word_embeddings.weight_quantized` and copies every other byte. The quantization is
untouched: the matrix is uint8 with one per-tensor scale and zero point, so a subset of its rows
dequantizes exactly as before. The output is deterministic: `models:build` always produces
build `0c5a50de057d0d47` from the pinned inputs. Downloads (originals, corpora) are checked
against SHA-256 pins and cached in `node_modules/.cache/askcalls-models` (`ASKCALLS_MODEL_CACHE`
overrides it).

## Keep-set

`derive-keep-set.ts`, in order:

1. **Corpora.** Per language: a 100K-sentence Wikipedia sample and a 100K-sentence news sample
   from the Leipzig Corpora Collection (CC BY), and 200K lines of OPUS OpenSubtitles 2018
   (conversational speech, the closest public text to call transcripts). 1.6M lines in all.
   Every tenth line is held out for measuring; the rest is counted.
2. **Frequency, equal weight per language.** Each token's score is the sum over the four
   languages of its relative frequency in that language. Tokens are added in score order until
   every language's held-out token coverage reaches 95% (30,292 tokens). Held-out coverage:
   Hebrew 99.6%, English 95.0%, Arabic 99.3%, Russian 97.3%.
3. **Representability.** Every single-character piece (with and without the `▁` word-start
   marker) in ASCII/Latin-1/Latin Extended-A/B, combining diacritics, Cyrillic, Hebrew (with
   niqqud and presentation forms), Arabic (with supplements and presentation forms), general
   punctuation, currency, letterlike symbols, arrows and math operators (918 more). The
   tokenizer is a Unigram model without byte fallback: removing a long piece makes the word
   fall back to shorter kept pieces, down to single characters, so in-scope text never turns
   into `<unk>`. Characters outside these blocks (CJK, emoji) become `<unk>`, which the original
   model also does for any character missing from its vocabulary.
4. **The app's own texts.** The `query: `/`passage: ` prefixes, the redaction placeholders
   (`[PHONE]`, `[NAME]`, …) and the built-in intent examples are always kept, plus the special
   tokens and the lowest-scoring piece (the Unigram tokenizer scores `<unk>` relative to the
   minimum score, so it must not move).

Coverage against size, from the same held-out data (all four languages weighted equally):

| tokens kept | model | median cosine to original (all held-out) | English held-out coverage |
| --- | --- | --- | --- |
| 8,880 | 25.7 MB | 0.934 | 78% |
| 24,941 | 31.9 MB | 0.996 | 92% |
| **31,229** | **34.3 MB** | **1.000** | **95%** |
| 40,053 | 37.7 MB | not measured | 98% |

## Validation

`apps/web/src/client/adapters/embedder/pruned-model.test.ts`:

- always: the keep-set's hash and row count match the pins in `assets.ts`, the build hash is
  derived from the pinned files, size budgets, and the pruning itself on synthetic inputs;
- when the original model is in the cache (after `models:build`, or after
  `fetch-browser-assets` built it): rebuilds the pruned files and checks they equal the pins,
  then embeds `validation-corpus.json` (Hebrew, English, Arabic, Russian, mixed-language, names
  and numbers) with both models. Every text whose tokens are all kept must reach cosine
  ≥ 0.9999 (measured: ≥ 0.9999994, and the same token ids); the others are reported (20 of 64:
  min 0.965, median 0.986, mean 0.984).

On 2,640 held-out corpus texts (200 sentences per source and language, plus 60 120-word
subtitle passages per language, the size of an indexed chunk): 64% are identical to the
original; mean cosine 0.995, 5th percentile 0.975, minimum 0.918. Per language the mean is
Hebrew 0.997–0.9998, Arabic 0.995–0.9997, Russian 0.990–0.999, English 0.986–0.996; on
conversational text (subtitles) 87–100% of sentences are identical.

Vectors are computed one text per inference everywhere. The q8 model quantizes activations per
batch, so a batched vector depends on the other texts in the batch (up to ±0.009 cosine in the
adapter test's similarity pairs); one text per call makes a text's vector reproducible. The
agent runs the same ONNX Runtime WebAssembly build as the browser, so its vectors match the
browser's WASM backend (adapter test: min cosine 0.9999993 on the validation corpus; the
native onnxruntime-node kernels gave 0.998). The browser's WebGPU backend computes in a
different order and is not bit-identical to either.

## Hosting

- **Same origin (default, self-host, offline, development):** `scripts/fetch-browser-assets.ts`
  (predev, prebuild) places the build at `apps/web/public/models/e5-pruned/<build>/`. It
  downloads a published build from `EMBEDDING_MODEL_URL` when that is set at build time,
  otherwise it builds it from the original model (downloaded once from Hugging Face, or
  `ASKCALLS_MODEL_MIRROR`), and checks every file against `assets.ts`.
- **Model host (hosted site):** set `EMBEDDING_MODEL_URL` to the bucket's base URL, e.g.
  `https://models.askcalls.com`. The value is instance config (ConfigService), rendered into
  `/app` pages as `<meta name="askcalls-embedding-model-url">`, so one build serves any
  instance. The CSP's `connect-src` gets that one origin; offline mode ignores the setting and
  always serves the model from the app. ONNX Runtime's JS and WebAssembly stay same-origin.
- **Verification:** the embedding worker fetches the files itself (`model-files.ts`) and checks
  each against its SHA-256 in `assets.ts` before transformers.js or ONNX Runtime sees a byte;
  transformers.js cannot fetch anything else. A mismatch fails the load with
  `embedding model failed verification`, and the embedder's status reports
  `{ state: 'failed', reason: 'verification' }`.
- **Caching and laziness:** verified files persist in Cache Storage (`askcalls-models`, keyed by
  hash; other builds' entries are dropped). Nothing loads until the first ingest or semantic
  search; keyword search and reading calls never start the worker. `WorkerEmbedder.status` and
  `onStatus` give `{ loaded, total }` bytes for a progress bar.
- **Agent:** downloads the same pinned files into `~/.askcalls/models/e5-pruned/<build>/` from
  the model host of the instance it is logged in to (its `EMBEDDING_MODEL_URL`, read from
  `GET /api/client-config`, else `https://<instance>/models`); `ASKCALLS_MODEL_URL` overrides
  both. It checks every file's SHA-256 before each load.

Vercel builds for an instance with `EMBEDDING_MODEL_URL` should set
`ASKCALLS_SKIP_MODEL_DOWNLOAD=1`, so the deployment does not carry its own copy.

## Changing the model

1. Change the corpora or the method, then `bun run models:derive` (about 5 minutes).
2. `bun run models:build`: prints the manifest.
3. Copy the build hash, keep-set hash/rows and file pins into `apps/web/src/client/assets.ts`
   and `apps/agent/src/adapters/model-files.ts` (tests check they agree).
4. `bun run models:publish`, then deploy. Old builds stay in the bucket, so pages still running
   the previous version keep working.

## One-time R2 setup

1. **Bucket.** Cloudflare dashboard → R2 → Create bucket `askcalls-models` (EU jurisdiction if
   you want it next to the other buckets; the contents are public weights, no user data).
2. **Public access.** Bucket → Settings → Custom Domains → Connect Domain → `models.askcalls.com`
   (the zone must be on Cloudflare). Don't use the `r2.dev` URL in production: it is
   rate-limited and not cached.
3. **Edge caching.** Cloudflare only caches some extensions by default, not `.onnx`. Add a Cache
   Rule on the zone: hostname equals `models.askcalls.com` → Eligible for cache, Edge TTL "Use
   cache-control header if present". Objects carry `Cache-Control: public, max-age=31536000,
   immutable` and `Content-Encoding: gzip` (set by `models:publish`).
4. **CORS.** Bucket → Settings → CORS policy:

   ```json
   [
     {
       "AllowedOrigins": ["https://askcalls.com", "https://<DEV_DOMAIN>"],
       "AllowedMethods": ["GET", "HEAD"],
       "ExposeHeaders": ["Content-Length", "Content-Encoding"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```

   Vercel preview URLs are not known in advance; since the files are public and fetched without
   credentials, `"AllowedOrigins": ["*"]` is also acceptable.
5. **Upload token.** R2 → Manage R2 API Tokens → Create token, Object Read & Write, limited to
   `askcalls-models`. Keep the access key id and secret for step 7 (a GitHub Actions secret if
   publishing from CI).
6. **App env.** In Vercel (production, preview, dev): `EMBEDDING_MODEL_URL=https://models.askcalls.com`
   and `ASKCALLS_SKIP_MODEL_DOWNLOAD=1`.
7. **Publish** each new build before deploying the code that pins it:

   ```sh
   MODELS_S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com \
   MODELS_S3_BUCKET=askcalls-models \
   MODELS_S3_ACCESS_KEY_ID=… MODELS_S3_SECRET_ACCESS_KEY=… \
   MODELS_PUBLIC_URL=https://models.askcalls.com \
   MODELS_CHECK_ORIGINS=https://askcalls.com,https://<DEV_DOMAIN> \
   bun run models:publish
   ```

   (`https://<account id>.eu.r2.cloudflarestorage.com` for an EU-jurisdiction bucket.) With
   `MODELS_PUBLIC_URL` the script fetches every file back through the public domain and checks
   its hash, `Cache-Control` and CORS for each origin.
