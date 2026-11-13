/**
 * `bun run release:dry-run`: everything release.yml builds, on this machine, publishing nothing.
 * Builds the web app and hashes its client JS, packs the `askcalls` npm package, compiles the
 * agent for this platform, builds the Docker image for this architecture, and assembles the
 * offline bundle and release notes in dist/release/.
 *
 * Flags: --reuse-build (hash the build already in apps/web/.next), --skip-docker.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildBinaries } from './agent-binaries';
import { buildAgentPackage } from './agent-package';
import { assemble } from './assemble';
import { clientHashes } from './client-hashes';

const ROOT = join(import.meta.dirname, '../..');
const DIST = join(ROOT, 'dist/release');
const VERSION = '0.0.0-dry-run';
const flag = (name: string) => process.argv.includes(name);
const run = (cmd: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
const mb = (file: string) => `${(statSync(file).size / 1e6).toFixed(1)} MB`;

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'images'), { recursive: true });
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

if (!flag('--reuse-build')) run('bun', ['run', '--cwd', 'apps/web', 'build']);
const hashes = clientHashes();
await Bun.write(
  join(DIST, 'client-assets.sha256'),
  `${hashes.map((h) => `${h.sha256}  ${h.path}`).join('\n')}\n`,
);
console.log(`\n${hashes.length} client JS assets hashed`);

const { dir } = await buildAgentPackage(VERSION);
const packed = JSON.parse(
  execFileSync('npm', ['pack', '--json', '--pack-destination', DIST], {
    cwd: dir,
    encoding: 'utf8',
  }),
) as Array<{ filename: string; files: Array<{ path: string; size: number }> }>;
const tarball = join(DIST, packed[0]!.filename);
console.log(`\nnpm package ${packed[0]!.filename} (${mb(tarball)}):`);
for (const f of packed[0]!.files) console.log(`  ${f.path}  ${f.size} bytes`);

const binaries = buildBinaries(join(DIST, 'agent'), false);
for (const b of binaries) console.log(`agent binary ${b} (${mb(b)})`);

if (flag('--skip-docker')) {
  console.log('\nDocker build skipped; no offline bundle.');
} else {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const tag = `askcalls:${VERSION}`;
  run('docker', [
    'build',
    '-f',
    'docker/Dockerfile',
    '--platform',
    `linux/${arch}`,
    '--build-arg',
    `ASKCALLS_BUILD_ID=${commit}`,
    '-t',
    tag,
    '.',
  ]);
  const image = join(DIST, 'images', `askcalls-${VERSION}-${arch}.tar`);
  run('docker', ['save', '-o', image, tag]);
  console.log(`\nimage ${tag} → ${image} (${mb(image)})`);
  for (const f of assemble(VERSION, DIST)) console.log(`release file ${f}`);
}
console.log(`\nDry run done in ${DIST}. Nothing was published.`);
