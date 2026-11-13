import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** Opens `url` in the default browser. Resolves false when no opener could be started. */
export function openBrowser(url: string): Promise<boolean> {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url.replaceAll('&', '^&')]]
        : ['xdg-open', [url]];
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
      child.once('error', () => resolve(false));
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Reads one line from stdin. `signal` aborts the read (the browser finished first). Resolves
 * null on abort or end of input.
 */
export function readLine(prompt: string, signal?: AbortSignal): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      rl.close();
      resolve(v);
    };
    signal?.addEventListener('abort', () => finish(null), { once: true });
    process.stderr.write(prompt);
    rl.once('line', (line) => finish(line.trim()));
    rl.once('close', () => finish(null));
  });
}

export const isInteractive = () => Boolean(process.stdin.isTTY && process.stderr.isTTY);
