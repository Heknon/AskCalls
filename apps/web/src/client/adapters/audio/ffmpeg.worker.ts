/// <reference lib="webworker" />
import { FFMPEG_BASE_PATH } from '../../assets';
import type { FfmpegJob, FfmpegReply } from './ffmpeg-protocol';

/**
 * Runs the self-hosted single-threaded ffmpeg.wasm core (spec 3.3 fallback). The core is
 * imported from this origin at run time, never bundled and never from a CDN. ffmpeg's log is
 * discarded: it can echo metadata tags from the file.
 */
interface FfmpegCore {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
  exec(...args: string[]): number;
  ret: number;
  reset(): void;
  setLogger(fn: (m: unknown) => void): void;
}

declare const self: DedicatedWorkerGlobalScope;

let core: Promise<FfmpegCore> | null = null;

function load(): Promise<FfmpegCore> {
  core ??= (async () => {
    const url = new URL(`${FFMPEG_BASE_PATH}ffmpeg-core.js`, self.location.origin).href;
    const mod = (await import(/* webpackIgnore: true */ url)) as {
      default: (opts: object) => Promise<FfmpegCore>;
    };
    const c = await mod.default({});
    c.setLogger(() => {});
    return c;
  })();
  core.catch(() => {
    core = null;
  });
  return core;
}

function reply(msg: FfmpegReply) {
  self.postMessage(msg, msg.ok ? [msg.bytes.buffer] : []);
}

self.onmessage = async ({ data: job }: MessageEvent<FfmpegJob>) => {
  let c: FfmpegCore;
  try {
    c = await load();
  } catch {
    reply({ id: job.id, ok: false, code: 'load_failed' });
    return;
  }
  try {
    c.FS.writeFile(job.input.name, job.input.bytes);
    c.exec(...job.args);
    const exitCode = c.ret;
    c.reset();
    if (exitCode !== 0) {
      reply({ id: job.id, ok: false, code: 'exec_failed', exitCode });
      return;
    }
    const out = c.FS.readFile(job.output);
    reply({ id: job.id, ok: true, bytes: new Uint8Array(out) });
  } catch {
    reply({ id: job.id, ok: false, code: 'exec_failed' });
  } finally {
    for (const f of [job.input.name, job.output]) {
      try {
        c.FS.unlink(f);
      } catch {}
    }
  }
};
