import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Reproducible client builds (docs/reproducible-builds.md): Next.js salts server action ids with
 * a random per-build key, so a client component that calls a server action would ship a chunk
 * whose hash differs on every build. Browser code talks to the server through API routes
 * (packages/api-contract); `'use server'` modules are imported only by server code.
 */

const SRC = import.meta.dirname;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const sources = files(SRC).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const directive = (text: string) =>
  /^\s*(?:\/\/.*\n|\/\*[\s\S]*?\*\/\s*)*['"]use server['"]/.test(text);
const serverActionModules = new Set(sources.filter((f) => directive(readFileSync(f, 'utf8'))));

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const specs = [...text.matchAll(/(?:from|import\()\s*['"](\.[^'"]+)['"]/g)].map((m) => m[1]!);
  return specs
    .map((s) => resolve(dirname(file), s))
    .flatMap((base) =>
      ['.ts', '.tsx', '/index.ts']
        .map((ext) => base + ext)
        .filter((p) => serverActionModules.has(p)),
    );
}

const serverOnly = (f: string) =>
  f.endsWith(`${sep}route.ts`) || relative(SRC, f).startsWith(`server${sep}`);

describe('reproducible client build', () => {
  it('finds the server action modules', () => {
    expect(serverActionModules.size).toBeGreaterThan(0);
  });

  it('calls no server action from browser code', () => {
    const offenders = sources.flatMap((f) =>
      serverOnly(f) ? [] : importsOf(f).map((m) => `${relative(SRC, f)} → ${relative(SRC, m)}`),
    );
    expect(offenders).toEqual([]);
  });
});
