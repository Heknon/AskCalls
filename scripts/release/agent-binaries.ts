/**
 * Standalone `askcalls` executables (Bun's --compile), with the same externals as apps/agent's
 * build:binary: the embedding runtime and ffmpeg are loaded from the system, not embedded.
 *
 * Usage: bun scripts/release/agent-binaries.ts --out <dir> [--all]
 * Without --all, only this machine's platform is built (the release dry run).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');

export const TARGETS = [
  'linux-x64',
  'linux-arm64',
  'darwin-x64',
  'darwin-arm64',
  'windows-x64',
] as const;

function host(): (typeof TARGETS)[number] {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const os = process.platform === 'win32' ? 'windows' : process.platform;
  return `${os}-${arch}` as (typeof TARGETS)[number];
}

export function buildBinaries(out: string, all: boolean): string[] {
  mkdirSync(out, { recursive: true });
  return (all ? [...TARGETS] : [host()]).map((target) => {
    const file = join(out, `askcalls-${target}${target.startsWith('windows') ? '.exe' : ''}`);
    execFileSync(
      'bun',
      [
        'build',
        join(ROOT, 'apps/agent/src/cli.ts'),
        '--compile',
        `--target=bun-${target}`,
        '--external',
        '@huggingface/transformers',
        '--external',
        'ffmpeg-static',
        '--outfile',
        file,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    return file;
  });
}

if (import.meta.main) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : undefined;
  if (!out) throw new Error('usage: agent-binaries.ts --out <dir> [--all]');
  for (const f of buildBinaries(out, process.argv.includes('--all'))) console.log(f);
}
