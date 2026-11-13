import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { isCompiledBinary } from '../adapters/runtime';
import { paths } from '../config';
import { VERSION } from '../version';
import { readTar } from './tar';

/**
 * The web app `askcalls local` runs: the Next.js standalone build with its static files, the
 * self-hosted model, ONNX Runtime, ffmpeg.wasm and font files, and apps/web/local-server.mjs.
 * Built by scripts/package-local-web.ts.
 * - npm package (`bunx askcalls`): shipped inside it, in `web/`.
 * - single binary: downloaded once from the release into `<data dir>/runtime/web-<version>/` and
 *   checked against the SHA-256 compiled into the binary (scripts/build-agent-binary.ts).
 * - `ASKCALLS_WEB_DIR`: a bundle elsewhere (development, tests).
 * Nothing is fetched at runtime after that: the browser loads every asset from this server.
 */
export const SERVER_ENTRY = join('apps', 'web', 'local-server.mjs');

declare const ASKCALLS_WEB_SHA256: string | undefined;

/** The pinned SHA-256 of this binary's web bundle archive, or null outside a release binary. */
export function pinnedWebSha256(): string | null {
  return typeof ASKCALLS_WEB_SHA256 === 'string' && /^[0-9a-f]{64}$/.test(ASKCALLS_WEB_SHA256)
    ? ASKCALLS_WEB_SHA256
    : null;
}

export const webBundleUrl = (version: string) =>
  `https://github.com/Heknon/AskCalls/releases/download/v${version}/askcalls-web-${version}.tar.gz`;

export class WebBundleMissingError extends Error {
  constructor(where: string) {
    super(
      `the AskCalls web app is not in ${where}. In a checkout, run: bun run --cwd apps/agent package:web`,
    );
    this.name = 'WebBundleMissingError';
  }
}

const hasEntry = (dir: string) =>
  access(join(dir, SERVER_ENTRY)).then(
    () => true,
    () => false,
  );

async function sha256File(path: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest('hex');
}

/** Downloads, verifies and unpacks the release's web bundle into `target`. */
export async function installWebBundle(opts: {
  target: string;
  url: string;
  sha256: string;
  log: (line: string) => void;
  fetch?: typeof fetch;
}): Promise<void> {
  const work = `${opts.target}.${randomBytes(4).toString('hex')}.part`;
  const gz = `${work}.tar.gz`;
  const tar = `${work}.tar`;
  await mkdir(work, { recursive: true, mode: 0o700 });
  try {
    opts.log('askcalls: downloading the AskCalls web app (once)…');
    const res = await (opts.fetch ?? fetch)(opts.url);
    if (!res.ok || !res.body) throw new Error(`could not download the web app (${res.status})`);
    await pipeline(
      Readable.fromWeb(res.body as import('node:stream/web').ReadableStream),
      createWriteStream(gz, { mode: 0o600 }),
    );
    if ((await sha256File(gz)) !== opts.sha256) {
      throw new Error('the downloaded web app failed verification (SHA-256 mismatch)');
    }
    await pipeline(createReadStream(gz), createGunzip(), createWriteStream(tar, { mode: 0o600 }));
    for await (const entry of readTar(tar)) {
      const target = join(work, ...entry.path.split('/'));
      if (entry.type === 'directory') await mkdir(target, { recursive: true, mode: 0o700 });
      else await entry.extractTo(target);
    }
    if (!(await hasEntry(work))) throw new Error('the downloaded web app is incomplete');
    await rm(opts.target, { recursive: true, force: true });
    await rename(work, opts.target);
    await writeFile(join(opts.target, '.verified'), `${opts.sha256}\n`);
  } finally {
    await rm(work, { recursive: true, force: true });
    await rm(gz, { force: true });
    await rm(tar, { force: true });
  }
}

/** The directory holding `apps/web/local-server.mjs`, installing it first for the binary. */
export async function resolveWebBundle(opts: {
  dir: string;
  env: NodeJS.ProcessEnv;
  log: (line: string) => void;
}): Promise<string> {
  if (opts.env.ASKCALLS_WEB_DIR) {
    if (await hasEntry(opts.env.ASKCALLS_WEB_DIR)) return opts.env.ASKCALLS_WEB_DIR;
    throw new WebBundleMissingError(opts.env.ASKCALLS_WEB_DIR);
  }
  if (!isCompiledBinary()) {
    const bundled = fileURLToPath(new URL('../../web/', import.meta.url));
    if (await hasEntry(bundled)) return bundled;
    throw new WebBundleMissingError(bundled);
  }
  const target = join(paths(opts.dir).runtime, `web-${VERSION}`);
  const verified = await access(join(target, '.verified')).then(
    () => true,
    () => false,
  );
  if (verified && (await hasEntry(target))) return target;
  const sha256 = pinnedWebSha256();
  if (!sha256) {
    throw new Error('this askcalls binary was built without a web app; use bunx askcalls local');
  }
  await installWebBundle({
    target,
    url: opts.env.ASKCALLS_WEB_URL || webBundleUrl(VERSION),
    sha256,
    log: opts.log,
  });
  return target;
}
