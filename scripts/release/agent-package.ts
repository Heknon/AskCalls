/**
 * Builds the publishable `askcalls` npm package from apps/agent (spec 14.1, release.yml):
 * the CLI and every workspace package it imports bundled into one ES module for Node 20+ (Bun
 * runs it too), with the third-party dependencies left external and listed in the package's
 * `dependencies` at the versions the workspace pins, so native modules (@napi-rs/keyring,
 * onnxruntime-node) install for the user's platform.
 *
 * Usage: bun scripts/release/agent-package.ts [--version <x.y.z>] [--pack]
 * Writes apps/agent/dist/npm/; with --pack also apps/agent/dist/askcalls-<version>.tgz.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const AGENT = join(ROOT, 'apps/agent');
const OUT = join(AGENT, 'dist/npm');

interface Manifest {
  name: string;
  version: string;
  description?: string;
  license?: string;
  dependencies?: Record<string, string>;
}

const readJson = (path: string): Manifest => JSON.parse(readFileSync(path, 'utf8'));

/** Workspace package name → its directory, from the root workspaces globs. */
function workspaces(): Map<string, string> {
  const out = new Map<string, string>();
  const list = execFileSync('git', ['ls-files', '*/package.json', '*/*/package.json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  for (const file of list.split('\n').filter(Boolean)) {
    if (!/^(apps|packages)\//.test(file)) continue;
    out.set(readJson(join(ROOT, file)).name, join(ROOT, dirname(file)));
  }
  return out;
}

/** Third-party dependencies of the agent and of every workspace package it reaches. */
export function externalDependencies(): Record<string, string> {
  const ws = workspaces();
  const deps: Record<string, string> = {};
  const seen = new Set<string>();
  const visit = (dir: string) => {
    if (seen.has(dir)) return;
    seen.add(dir);
    for (const [name, range] of Object.entries(
      readJson(join(dir, 'package.json')).dependencies ?? {},
    )) {
      if (range.startsWith('workspace:')) {
        const target = ws.get(name);
        if (!target) throw new Error(`workspace dependency ${name} not found`);
        visit(target);
      } else if (deps[name] && deps[name] !== range) {
        throw new Error(`${name} is pinned to both ${deps[name]} and ${range}`);
      } else {
        deps[name] = range;
      }
    }
  };
  visit(AGENT);
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export async function buildAgentPackage(
  version?: string,
): Promise<{ dir: string; version: string }> {
  const agent = readJson(join(AGENT, 'package.json'));
  const v = version ?? agent.version;
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v)) throw new Error(`bad version ${v}`);
  const deps = externalDependencies();
  const external = Object.keys(deps);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'bin'), { recursive: true });

  const result = await Bun.build({
    entrypoints: [join(AGENT, 'src/cli.ts')],
    target: 'node',
    format: 'esm',
    minify: false,
    sourcemap: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'external-third-party',
        setup(build) {
          build.onResolve({ filter: /^[^./]/ }, (args) => {
            const pkg = args.path.startsWith('@')
              ? args.path.split('/').slice(0, 2).join('/')
              : args.path.split('/')[0]!;
            if (args.path.startsWith('node:') || external.includes(pkg)) {
              return { path: args.path, external: true };
            }
            return undefined;
          });
          // `askcalls --version` reports the release, not the workspace's placeholder version.
          build.onLoad({ filter: /apps[\\/]agent[\\/]package\.json$/ }, () => ({
            contents: JSON.stringify({ ...agent, version: v }),
            loader: 'json',
          }));
        },
      },
    ],
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error('agent bundle failed');
  }
  const [output] = result.outputs;
  const code = (await output!.text()).replace(/^#!.*\n/, '');
  const bin = join(OUT, 'bin/askcalls.js');
  writeFileSync(bin, `#!/usr/bin/env node\n${code}`);
  chmodSync(bin, 0o755);

  const manifest = {
    name: 'askcalls',
    version: v,
    description: agent.description,
    license: 'MIT',
    type: 'module',
    bin: { askcalls: 'bin/askcalls.js' },
    files: ['bin', 'README.md', 'LICENSE'],
    engines: { node: '>=20' },
    repository: {
      type: 'git',
      url: 'git+https://github.com/Heknon/AskCalls.git',
      directory: 'apps/agent',
    },
    homepage: 'https://askcalls.com',
    bugs: 'https://github.com/Heknon/AskCalls/issues',
    keywords: ['mcp', 'model-context-protocol', 'end-to-end-encryption', 'call-transcripts'],
    dependencies: deps,
  };
  writeFileSync(join(OUT, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  copyFileSync(join(AGENT, 'README.md'), join(OUT, 'README.md'));
  copyFileSync(join(ROOT, 'LICENSE'), join(OUT, 'LICENSE'));
  return { dir: OUT, version: v };
}

if (import.meta.main) {
  const i = process.argv.indexOf('--version');
  const { dir, version } = await buildAgentPackage(i > 0 ? process.argv[i + 1] : undefined);
  console.log(`askcalls ${version} → ${dir}`);
  if (process.argv.includes('--pack')) {
    const out = execFileSync('npm', ['pack', '--pack-destination', join(AGENT, 'dist'), '--json'], {
      cwd: dir,
      encoding: 'utf8',
    });
    const [info] = JSON.parse(out) as Array<{ filename: string; size: number; files: unknown[] }>;
    console.log(`packed ${info!.filename} (${info!.size} bytes, ${info!.files.length} files)`);
  }
}
