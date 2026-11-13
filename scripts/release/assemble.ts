/**
 * Assembles a release from built parts (release.yml, and `bun run release:dry-run` locally):
 * - one offline bundle per architecture, `askcalls-offline-<version>-<arch>.tar.gz`, holding the
 *   Docker image tarball, the agent binaries, the agent's npm tarball, the Compose files and a
 *   SHA256SUMS of everything in it;
 * - `release-notes.md`: the SHA-256 of every client JS asset (spec 3.6) and of every release file.
 *
 * Usage: bun scripts/release/assemble.ts --version <x.y.z> --dist <dir>
 * Expects in <dir>: client-assets.sha256, askcalls-<version>.tgz, agent/askcalls-*,
 * images/askcalls-<version>-<arch>.tar (one or more).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');

const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

function sums(dir: string, files: string[]): string {
  return `${files.map((f) => `${sha256(join(dir, f))}  ${f}`).join('\n')}\n`;
}

function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? listFiles(join(dir, e.name), `${prefix}${e.name}/`)
        : [`${prefix}${e.name}`],
    )
    .sort();
}

export function assemble(version: string, dist: string): string[] {
  const images = join(dist, 'images');
  const archs = existsSync(images)
    ? readdirSync(images)
        .map(
          (f) =>
            new RegExp(`^askcalls-${version.replaceAll('.', '\\.')}-(\\w+)\\.tar$`).exec(f)?.[1],
        )
        .filter((a): a is string => Boolean(a))
        .sort()
    : [];
  if (archs.length === 0) throw new Error(`no images/askcalls-${version}-<arch>.tar in ${dist}`);
  const npmTarball = `askcalls-${version}.tgz`;
  const agentDir = join(dist, 'agent');
  for (const need of [join(dist, npmTarball), join(dist, 'client-assets.sha256'), agentDir]) {
    if (!existsSync(need)) throw new Error(`missing ${need}`);
  }

  const outputs: string[] = [];
  for (const arch of archs) {
    const name = `askcalls-offline-${version}-${arch}`;
    const stage = join(dist, 'stage', name);
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(join(stage, 'docker'), { recursive: true });
    cpSync(
      join(images, `askcalls-${version}-${arch}.tar`),
      join(stage, `askcalls-image-${arch}.tar`),
    );
    cpSync(agentDir, join(stage, 'agent'), { recursive: true });
    cpSync(join(dist, npmTarball), join(stage, npmTarball));
    for (const f of ['docker-compose.yml', 'docker-compose.offline.yml']) {
      cpSync(join(ROOT, 'docker', f), join(stage, 'docker', f));
    }
    cpSync(join(ROOT, '.env.example'), join(stage, '.env.example'));
    writeFileSync(join(stage, 'SHA256SUMS'), sums(stage, listFiles(stage)));
    const archive = `${name}.tar.gz`;
    // Fixed owner, group and mtime so the archive depends only on its contents.
    execFileSync(
      'tar',
      [
        '--sort=name',
        '--owner=0',
        '--group=0',
        '--numeric-owner',
        '--mtime=@0',
        '-czf',
        archive,
        '-C',
        join(dist, 'stage'),
        name,
      ],
      { cwd: dist, env: { ...process.env, GZIP: '-n' } },
    );
    rmSync(stage, { recursive: true, force: true });
    outputs.push(archive);
  }
  rmSync(join(dist, 'stage'), { recursive: true, force: true });

  const releaseFiles = [
    ...outputs,
    npmTarball,
    ...listFiles(agentDir).map((f) => `agent/${f}`),
    'client-assets.sha256',
  ];
  writeFileSync(join(dist, 'SHA256SUMS'), sums(dist, releaseFiles));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const clientAssets = readFileSync(join(dist, 'client-assets.sha256'), 'utf8').trim();
  const count = clientAssets.split('\n').length;
  writeFileSync(
    join(dist, 'release-notes.md'),
    [
      '## Verify this release',
      '',
      `Built from \`${commit}\`. How to check these against a build of your own, or against what askcalls.com serves: [docs/reproducible-builds.md](https://github.com/Heknon/AskCalls/blob/master/docs/reproducible-builds.md).`,
      '',
      '### Release files',
      '',
      '```',
      readFileSync(join(dist, 'SHA256SUMS'), 'utf8').trim(),
      '```',
      '',
      `### Client JavaScript (${count} assets, as served under \`/_next/static/\`)`,
      '',
      '<details><summary>SHA-256 of every asset</summary>',
      '',
      '```',
      clientAssets,
      '```',
      '',
      '</details>',
      '',
    ].join('\n'),
  );
  return [...releaseFiles.map((f) => basename(f)), 'SHA256SUMS', 'release-notes.md'];
}

if (import.meta.main) {
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    const v = i > 0 ? process.argv[i + 1] : undefined;
    if (!v) throw new Error(`usage: assemble.ts --version <x.y.z> --dist <dir> (missing ${name})`);
    return v;
  };
  const files = assemble(arg('--version'), arg('--dist'));
  console.log(files.join('\n'));
}
