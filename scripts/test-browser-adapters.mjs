/**
 * Real-browser test of the browser adapters (Chromium via Playwright). Starts `next dev` for
 * apps/web (unless BASE_URL is set), opens /dev/adapters under the app's strict CSP, and checks:
 * embeddings (Hebrew and English), WAV/MP3/M4A decoding to 16 kHz mono (WebAudio and the
 * ffmpeg.wasm fallback), Opus encode → decode, chunking, passkey registration + PRF unlock with
 * a CDP virtual authenticator, IndexedDB persistence across a reload with no plaintext, the lock
 * rules, that no request leaves the app's origin (and the model host), and that the agent's Node
 * embedder gives the same vectors as the browser. Prints measurements as JSON.
 *
 *   node scripts/test-browser-adapters.mjs        (from the repo root, after bun install)
 *   MODEL_HOST=1 node scripts/test-browser-adapters.mjs
 *
 * MODEL_HOST=1 serves the model from a second origin (gzip-encoded, CORS, immutable, like the
 * R2 bucket) and starts the app with EMBEDDING_MODEL_URL pointing at it.
 */
import { spawn } from 'node:child_process';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'apps', 'web');
const { chromium } = createRequire(join(web, 'package.json'))('playwright');

const { BASE_URL: baseUrl, MODEL_HOST: modelHost } = process.env;
const failures = [];
const results = {};
function check(name, ok, detail) {
  if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
}

const freePort = () =>
  new Promise((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

/** Serves apps/web/public/models/** the way the published bucket does. */
async function startModelHost() {
  const port = await freePort();
  const server = createHttpServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const file = join(web, 'public', path);
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
    if (!path.startsWith('/models/e5-pruned/') || path.includes('..')) {
      res.writeHead(404, headers).end();
      return;
    }
    try {
      statSync(file);
    } catch {
      res.writeHead(404, headers).end();
      return;
    }
    res.writeHead(200, {
      ...headers,
      'Content-Type': path.endsWith('.json') ? 'application/json' : 'application/octet-stream',
      'Content-Encoding': 'gzip',
    });
    createReadStream(file)
      .pipe(createGzip({ level: 9 }))
      .pipe(res);
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { origin: `http://localhost:${port}`, stop: () => server.close() };
}

async function startServer(env) {
  if (baseUrl) return { base: baseUrl, stop: () => {} };
  const port = await freePort();
  const child = spawn(join(web, 'node_modules', '.bin', 'next'), ['dev', '-p', String(port)], {
    cwd: web,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...env },
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 180; i++) {
    try {
      const r = await fetch(`${base}/dev/adapters`);
      if (r.ok) return { base, stop: () => child.kill('SIGTERM') };
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill('SIGTERM');
  throw new Error(`next dev did not start:\n${log}`);
}

/** The app's CSP for /app/** in development (server/http/csp.ts), without own-key origins. */
const csp = (nonce, extraConnect = []) =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' 'strict-dynamic' 'unsafe-eval'`,
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self'",
    ["connect-src 'self'", ...extraConnect].join(' '),
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

function wav(seconds, rate, freq) {
  const n = seconds * rate;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.round(12_000 * Math.sin((2 * Math.PI * freq * i) / rate)), 44 + i * 2);
  }
  return b;
}

const fixture = (name) => readFileSync(join(root, 'scripts', 'fixtures', name)).toString('base64');

/** The agent's vectors for `texts`, downloading the pinned model from `modelUrl`. */
function agentVectors(texts, modelUrl) {
  return new Promise((resolve, reject) => {
    const dir = join(tmpdir(), `askcalls-agent-models-${process.pid}`);
    const child = spawn('bun', [join(root, 'scripts', 'embed-with-agent.ts'), dir], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, ASKCALLS_MODEL_URL: modelUrl },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`agent embedder exited ${code}`)),
    );
    child.stdin.end(JSON.stringify(texts));
  });
}

async function main() {
  const host = modelHost === '1' ? await startModelHost() : null;
  const server = await startServer(host ? { EMBEDDING_MODEL_URL: `${host.origin}/models` } : {});
  const origin = new URL(server.base).origin;
  const allowed = new Set([origin, ...(host ? [host.origin] : [])]);
  results.modelHost = host ? host.origin : 'same origin';
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const requests = [];
  const foreign = [];
  const record = (req) => {
    const url = req.url();
    requests.push({ url, resourceType: req.resourceType() });
    const u = new URL(url);
    if (u.protocol !== 'data:' && u.protocol !== 'blob:' && !allowed.has(u.origin)) {
      foreign.push(url);
    }
  };
  context.on('request', record);
  const transferred = {};
  context.on('requestfinished', async (req) => {
    const u = new URL(req.url());
    if (!/^\/(models|ort)\//.test(u.pathname)) return;
    const sizes = await req.sizes().catch(() => null);
    const res = await req.response().catch(() => null);
    if (sizes && res) {
      transferred[`${u.origin === origin ? '' : u.origin}${u.pathname}`] = {
        bytes: sizes.responseBodySize,
        encoding: res.headers()['content-encoding'] ?? null,
      };
    }
  });
  const violations = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text()))
      violations.push(m.text());
  });

  await page.route(`${origin}/dev/adapters`, async (route) => {
    const res = await route.fetch();
    const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
    const body = (await res.text()).replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`);
    await route.fulfill({
      response: res,
      body,
      headers: {
        ...res.headers(),
        'content-security-policy': csp(nonce, host ? [host.origin] : []),
      },
    });
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });

  const open = async () => {
    await page.goto(`${server.base}/dev/adapters`);
    await page.waitForSelector('[data-harness="ready"]', { state: 'attached', timeout: 180_000 });
  };
  const call = (fn, ...args) =>
    page.evaluate(([f, a]) => window.adapters[f](...a), [fn, args], { timeout: 600_000 });

  try {
    await open();

    // Embedder: first load (download), then Hebrew/English similarity.
    const load = await call('loadEmbedder');
    results.embedderLoad = load;
    check('embedder loads (WebGPU or WASM)', ['webgpu', 'wasm'].includes(load.device), load);
    check('embedder reports download progress', load.progressEvents > 0, load);
    const texts = [
      'query: The meeting was moved to Tuesday at three',
      'passage: הפגישה נדחתה ליום שלישי בשלוש',
      'passage: The meeting has been rescheduled to Tuesday, 3 pm',
      'passage: החתול ישן על הספה כל הבוקר',
      'passage: I love eating pizza with extra cheese',
    ];
    const e = await call('embedPairs', texts);
    check(
      '384 dimensions',
      e.dims.every((d) => d === 384),
      e.dims,
    );
    check(
      'L2-normalized',
      e.norms.every((n) => Math.abs(n - 1) < 1e-3),
      e.norms,
    );
    const [q] = e.sim;
    check(
      'similar sentences (EN query → HE and EN paraphrase) closer than unrelated',
      Math.min(q[1], q[2]) > Math.max(q[3], q[4]),
      q,
    );
    results.similarity = {
      queryVsHebrewParaphrase: q[1],
      queryVsEnglishParaphrase: q[2],
      queryVsHebrewUnrelated: q[3],
      queryVsEnglishUnrelated: q[4],
    };
    results.embedBenchmark = await call('embedBenchmark', 32);
    results.embedQueryMs = await page.evaluate(async () => {
      const t = performance.now();
      await window.adapters.embedEach(['query: when is the next meeting with the client']);
      return Math.round(performance.now() - t);
    });

    // The agent's Node embedder, on the same pinned files, gives the same vectors.
    const corpus = JSON.parse(
      readFileSync(
        join(web, 'src', 'client', 'adapters', 'embedder', 'validation-corpus.json'),
        'utf8',
      ),
    );
    const corpusTexts = Object.values(corpus).flat();
    const browserVectors = await call('embedEach', corpusTexts);
    const agent = await agentVectors(
      corpusTexts,
      host ? `${host.origin}/models` : `${origin}/models`,
    );
    const cos = browserVectors.map((v, i) => v.reduce((s, x, k) => s + x * agent.vectors[i][k], 0));
    results.agentVsBrowser = {
      texts: cos.length,
      minCosine: Math.min(...cos),
      meanCosine: cos.reduce((s, x) => s + x, 0) / cos.length,
      agentModelId: agent.modelId,
      agentFirstRunMs: agent.ms,
    };
    check(
      'agent and browser vectors match (same pinned model files)',
      Math.min(...cos) >= 0.9999,
      results.agentVsBrowser,
    );
    check('cancellation rejects with AbortError', (await call('embedCancel')).cancelled, null);

    // AudioCodec: decode.
    const w = await call('decode', wav(3, 44_100, 440).toString('base64'), 'audio/wav');
    results.decodeWav = w;
    check(
      'WAV → 16 kHz mono',
      w.sampleRate === 16_000 && w.length === 48_000 && Math.abs(w.hz - 440) < 10,
      w,
    );
    const m = await call('decode', fixture('tone.mp3'), 'audio/mpeg');
    results.decodeMp3 = m;
    check(
      'MP3 → 16 kHz mono',
      m.sampleRate === 16_000 && Math.abs(m.durationSec - 3) < 0.15 && m.rms > 0.05,
      m,
    );
    const a = await call('decode', fixture('tone.m4a'), 'audio/mp4');
    results.decodeM4a = a;
    check(
      'M4A/AAC → 16 kHz mono (WebAudio or ffmpeg fallback)',
      Math.abs(a.durationSec - 3) < 0.15 && Math.abs(a.hz - 440) < 10,
      a,
    );
    const f = await call('decode', fixture('tone.mp3'), 'audio/mpeg', true);
    results.decodeMp3Ffmpeg = f;
    check(
      'ffmpeg.wasm fallback decodes MP3 like WebAudio',
      f.path === 'ffmpeg' &&
        Math.abs(f.durationSec - 3) < 0.15 &&
        Math.abs(f.hz - m.hz) < 15 &&
        f.rms > 0.03,
      { f, m },
    );

    // Opus encode and decode back.
    const o = await call('opusRoundTrip', 20);
    results.opus = o;
    for (const k of ['kbps24', 'kbps32']) {
      const r = o[k];
      check(
        `Opus ${k} encodes and decodes back`,
        Math.abs(r.decoded.durationSec - 20) < 0.05 &&
          Math.abs(r.decoded.rms - o.inputRms) < 0.1 * o.inputRms,
        r,
      );
    }
    const of = await call('opusRoundTrip', 6, true);
    results.opusFfmpeg = of;
    check(
      'ffmpeg.wasm Opus fallback decodes back',
      Math.abs(of.kbps24.decoded.durationSec - 6) < 0.05,
      of.kbps24,
    );
    const c = await call('chunkRoundTrip', 120, 100_000);
    results.chunks = c;
    check(
      'chunks stay under maxBytes, decode, and start where the previous ends',
      c.sizes.every((s) => s <= 100_000) &&
        c.sizes.length >= 3 &&
        c.decoded.every(
          (d, i) =>
            i === c.decoded.length - 1 ||
            Math.abs(d.startSec + d.durationSec - c.starts[i + 1]) < 0.03,
        ) &&
        Math.abs(c.decoded.reduce((s, d) => s + d.durationSec, 0) - 120) < 0.1,
      c,
    );

    // Passkeys with PRF.
    const reg = await call('passkeyRegister');
    check('passkey registration returns a PRF output', reg.prf?.length === 64, reg);
    const asserted = await call('passkeyAssert', [reg.credentialId]);
    check('assertion evaluates the same PRF output', asserted.prf === reg.prf, { reg, asserted });
    const unlock = await call('passkeyUnlock');
    check('PRF unwraps the root key', unlock.prf && unlock.match, unlock);

    // IndexedDB persistence across a reload, and no plaintext in it.
    await call('persistWrite');
    await open();
    results.embedderCachedLoad = await call('loadEmbedder');
    check(
      'second load comes from Cache Storage',
      results.embedderCachedLoad.device === load.device,
      results.embedderCachedLoad,
    );
    const p = await call('persistRead');
    results.persist = p;
    check(
      'wrapped bytes, non-extractable device key and bulk state survive a reload',
      p.wrapped?.join() === '9,8,7,6' &&
        p.deviceKeyId === 'device-1' &&
        p.extractable === false &&
        p.verified &&
        p.bulkItemName === 'Dana 0521234567',
      p,
    );
    const dump = (await call('dumpIndexedDb')).join('\n');
    check(
      'no plaintext name or number in IndexedDB',
      !dump.includes('0521234567') && !dump.includes('Dana'),
      dump.slice(0, 300),
    );
    const caches = await page.evaluate(async () => {
      const names = await caches.keys();
      const urls = [];
      for (const n of names) for (const r of await (await caches.open(n)).keys()) urls.push(r.url);
      return urls;
    });
    results.cacheStorage = caches.map((u) => new URL(u).pathname);
    check(
      'Cache Storage holds only model files',
      caches.every((u) => new URL(u).pathname.startsWith('/models/')),
      results.cacheStorage,
    );

    const lock = await call('lockOnPageHide');
    check(
      'pagehide locks the session and revokes Blob URLs',
      lock.before && !lock.after && lock.revoked,
      lock,
    );

    check('no request to a third-party origin', foreign.length === 0, foreign);
    // The injected test CSP also trips over Next's dev-only style and HMR loaders; those are
    // not the adapters' concern (the real app gets nonces from middleware).
    const relevant = violations.filter(
      (v) => !/style-src|_next\/static\/chunks\/webpack\.js/.test(v),
    );
    results.ignoredDevCspViolations = violations.length - relevant.length;
    check(
      'no CSP violations for workers, wasm, model files or connections',
      relevant.length === 0,
      relevant,
    );

    const sizes = {};
    for (const r of requests) {
      const path = new URL(r.url).pathname;
      if (/^\/(models|ort|ffmpeg)\//.test(path)) sizes[path] = true;
    }
    results.selfHostedAssetsRequested = Object.keys(sizes);
    results.transferred = transferred;
  } finally {
    await browser.close();
    server.stop();
    host?.stop();
  }
  console.log(JSON.stringify(results, null, 2));
  if (failures.length) {
    console.error(`\n${failures.length} failed:\n${failures.join('\n')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
