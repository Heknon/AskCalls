/**
 * Builds the single `askcalls` binary (`bun build --compile`) and the web bundle archive it
 * downloads on the first `askcalls local` (apps/agent/src/local/web-bundle.ts):
 *
 *   apps/agent/dist/askcalls                          the binary
 *   apps/agent/dist/askcalls-web-<version>.tar.gz     publish as a release asset of v<version>
 *
 * The archive's SHA-256 is compiled into the binary, which refuses any other bytes. Needs the
 * web app built first (`bun run --cwd apps/web build`).
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import agentPkg from '../apps/agent/package.json' with { type: 'json' };

const root = join(import.meta.dir, '..');
const dist = join(root, 'apps', 'agent', 'dist');
const archive = join(dist, `askcalls-web-${agentPkg.version}.tar.gz`);

function run(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  process.stdout.write(r.stdout);
  return r.stdout;
}

const packaged = run('bun', ['scripts/package-local-web.ts', '--archive', archive]);
const sha256 = packaged.match(/^sha256 ([0-9a-f]{64})$/m)?.[1];
if (!sha256) throw new Error('package-local-web.ts printed no SHA-256');
run('bun', [
  'build',
  'apps/agent/src/cli.ts',
  '--compile',
  '--external',
  '@huggingface/transformers',
  '--external',
  'ffmpeg-static',
  '--define',
  `ASKCALLS_WEB_SHA256=${JSON.stringify(sha256)}`,
  '--outfile',
  join(dist, 'askcalls'),
]);
