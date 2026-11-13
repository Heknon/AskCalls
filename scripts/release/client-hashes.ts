/**
 * SHA-256 of every client JavaScript asset in the production build (spec 3.6), as served under
 * /_next/static/. Each release publishes this list, so anyone can fetch the same paths from
 * askcalls.com (or rebuild the tag) and compare (docs/reproducible-builds.md).
 *
 * Usage: bun scripts/release/client-hashes.ts [--out <file>]
 * Prints `<sha256>  /_next/static/<path>` lines (sha256sum format), sorted by path.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const STATIC_DIR = join(import.meta.dirname, '../../apps/web/.next/static');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

export function clientHashes(staticDir = STATIC_DIR): Array<{ path: string; sha256: string }> {
  if (!existsSync(staticDir)) {
    throw new Error('No production build in apps/web/.next: run `bun run --cwd apps/web build`.');
  }
  return walk(staticDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({
      path: `/_next/static/${relative(staticDir, f).split(sep).join('/')}`,
      sha256: createHash('sha256').update(readFileSync(f)).digest('hex'),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

if (import.meta.main) {
  const lines = clientHashes().map((h) => `${h.sha256}  ${h.path}`);
  const text = `${lines.join('\n')}\n`;
  const i = process.argv.indexOf('--out');
  if (i > 0 && process.argv[i + 1]) {
    writeFileSync(process.argv[i + 1]!, text);
    console.log(`${lines.length} client JS assets hashed → ${process.argv[i + 1]}`);
  } else {
    process.stdout.write(text);
  }
}
