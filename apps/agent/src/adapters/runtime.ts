import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import pkg from '../../package.json' with { type: 'json' };

/**
 * Packages the single binary leaves out: onnxruntime-node and sharp are native addons that
 * `bun build --compile` cannot embed, and ffmpeg-static is an 80 MB download. The binary installs
 * them on first use into `<data dir>/runtime` with its own embedded Bun (`BUN_BE_BUN=1`).
 */
export const RUNTIME_PACKAGES = ['@huggingface/transformers', 'ffmpeg-static'] as const;
export type RuntimePackage = (typeof RUNTIME_PACKAGES)[number];

/** Compiled Bun executables load their modules from an embedded `$bunfs` (`~BUN` on Windows). */
export const isCompiledBinary = () => /[/\\](\$bunfs|~BUN)[/\\]/.test(import.meta.url);

const asBun = { ...process.env, BUN_BE_BUN: '1' };

let installing: Promise<void> | null = null;

async function installed(runtimeDir: string): Promise<boolean> {
  try {
    await Promise.all(
      RUNTIME_PACKAGES.map((name) =>
        access(join(runtimeDir, 'node_modules', name, 'package.json')),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

/** Installs the runtime packages once; stdout stays untouched (it carries MCP in `askcalls mcp`). */
export function ensureRuntime(runtimeDir: string, log: (line: string) => void): Promise<void> {
  installing ??= (async () => {
    if (await installed(runtimeDir)) return;
    await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
    await writeFile(join(runtimeDir, 'package.json'), '{ "private": true }\n');
    log('askcalls: downloading the embedding runtime and ffmpeg (once)…');
    const specs = RUNTIME_PACKAGES.map((name) => `${name}@${pkg.dependencies[name]}`);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['add', '--exact', ...specs], {
        cwd: runtimeDir,
        env: asBun,
        stdio: 'ignore',
      });
      child.once('error', reject);
      child.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error('installing the runtime failed')),
      );
    });
  })();
  installing.catch(() => {
    installing = null;
  });
  return installing;
}

/** ffmpeg-static's binary path, from the bundle or (compiled binary) the runtime directory. */
export async function ffmpegStaticPath(
  runtimeDir: string,
  log: (line: string) => void,
): Promise<string | null> {
  if (!isCompiledBinary()) {
    return ((await import('ffmpeg-static')) as unknown as { default: string | null }).default;
  }
  await ensureRuntime(runtimeDir, log);
  const entry = join(runtimeDir, 'node_modules', 'ffmpeg-static', 'index.js');
  return ((await import(pathToFileURL(entry).href)) as { default: string | null }).default;
}

export type FeatureExtractor = (
  texts: string[],
  opts: { pooling: 'mean'; normalize: true },
) => Promise<{ data: Float32Array; dims: number[] }>;

/**
 * Runs the model in a child Bun process (one JSON line per request on stdin and stdout), set up
 * like onnx-web.ts. The
 * compiled binary can't resolve packages on disk from its own process, but the Bun it embeds can.
 * Texts travel through the pipe only, on this computer.
 */
const WORKER = `import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
const ort = await import(createRequire(import.meta.resolve('@huggingface/transformers')).resolve('onnxruntime-web'));
globalThis[Symbol.for('onnxruntime')] = ort;
ort.env.wasm.numThreads = 1;
const { env, pipeline } = await import('@huggingface/transformers');
env.allowRemoteModels = false;
env.localModelPath = process.argv[2];
const extract = await pipeline('feature-extraction', process.argv[3], {
  dtype: process.argv[4],
  device: 'auto',
  session_options: { executionProviders: ['wasm'] },
});
let queue = Promise.resolve();
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
createInterface({ input: process.stdin }).on('line', (line) => {
  queue = queue.then(async () => {
    const { id, texts } = JSON.parse(line);
    try {
      const out = await extract(texts, { pooling: 'mean', normalize: true });
      const bytes = Buffer.from(out.data.buffer, out.data.byteOffset, out.data.byteLength);
      send({ id, dims: out.dims, data: bytes.toString('base64') });
    } catch {
      send({ id, error: true });
    }
  });
}).on('close', () => process.exit(0));
send({ ready: true });
`;

export async function workerExtractor(opts: {
  runtimeDir: string;
  /** Verified model files (model-files.ts), as transformers.js's `localModelPath`. */
  localModelPath: string;
  model: string;
  dtype: string;
  log: (line: string) => void;
}): Promise<FeatureExtractor> {
  await ensureRuntime(opts.runtimeDir, opts.log);
  const script = join(opts.runtimeDir, 'embed-worker.mjs');
  await writeFile(script, WORKER);
  const child = spawn(process.execPath, [script, opts.localModelPath, opts.model, opts.dtype], {
    cwd: opts.runtimeDir,
    env: asBun,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  child.unref();
  const pipes = [child.stdin, child.stdout] as unknown as Array<{
    ref?: () => void;
    unref?: () => void;
  }>;
  /** The pipes keep the process alive only while a request is in flight. */
  const hold = (on: boolean) => {
    for (const p of pipes) {
      if (on) p.ref?.();
      else p.unref?.();
    }
  };
  const pending = new Map<number, (m: { dims?: number[]; data?: string; error?: true }) => void>();
  let ready: () => void;
  let failed: (e: Error) => void;
  const started = new Promise<void>((resolve, reject) => {
    ready = resolve;
    failed = reject;
  });
  const fail = () => {
    const e = new Error('the embedding worker stopped');
    failed(e);
    for (const [, settle] of pending) settle({ error: true });
    pending.clear();
  };
  child.once('error', fail);
  child.once('close', fail);
  createInterface({ input: child.stdout! }).on('line', (line) => {
    let m: { id?: number; ready?: true; dims?: number[]; data?: string; error?: true };
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    if (m.ready) ready();
    else if (m.id !== undefined) {
      pending.get(m.id)?.(m);
      pending.delete(m.id);
      if (pending.size === 0) hold(false);
    }
  });
  await started;
  hold(false);
  let next = 0;
  return (texts) =>
    new Promise((resolve, reject) => {
      const id = next++;
      if (pending.size === 0) hold(true);
      pending.set(id, (m) => {
        if (m.error || !m.data || !m.dims) return reject(new Error('embedding failed'));
        const bytes = Buffer.from(m.data, 'base64');
        const data = new Float32Array(bytes.byteLength / 4);
        new Uint8Array(data.buffer).set(bytes);
        resolve({ data, dims: m.dims });
      });
      child.stdin!.write(`${JSON.stringify({ id, texts })}\n`);
    });
}
