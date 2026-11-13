/**
 * Performance budget (spec 13): the JavaScript a browser downloads to open an /app or /admin
 * page, gzipped, must stay within BUDGET_KB. Lazy chunks (the embedding model runtime,
 * ffmpeg.wasm, the date grid, anything behind `import()`) are not part of a page's first load,
 * so they don't count.
 *
 * A page's first load is Next.js's root main files plus the chunks of the page and of every
 * layout above it (app-build-manifest.json), gzipped at level 9, in kB of 1000 bytes. Reads the
 * production build in apps/web/.next, so run `bun run --cwd apps/web build` first.
 *
 * Pages that were over the budget when the gate landed are listed in bundle-budget.json with
 * the size they had then. They fail if they grow past it, and the list only shrinks: `--record`
 * lowers each ceiling to the page's current size and drops pages that now fit the budget. It
 * never raises one; raising a ceiling is a reviewed edit of the JSON file.
 *
 * Usage: bun scripts/checks/bundle-budget.ts [--record] [--json]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const BUDGET_KB = 250;
const NEXT_DIR = join(import.meta.dirname, '../../apps/web/.next');
const CEILINGS_FILE = join(import.meta.dirname, 'bundle-budget.json');

interface PageSize {
  route: string;
  bytes: number;
  largest: Array<{ file: string; bytes: number }>;
}

interface Ceilings {
  /** Route → the most kB it may load, for pages over BUDGET_KB. */
  overBudget: Record<string, number>;
}

const gzipped = new Map<string, number>();
function gzipSize(file: string): number {
  let size = gzipped.get(file);
  if (size === undefined) {
    size = gzipSync(readFileSync(join(NEXT_DIR, file)), { level: 9 }).length;
    gzipped.set(file, size);
  }
  return size;
}

/** `/(app)/(shell)/app/calls/[id]/page` → `/app/calls/[id]`. */
const routeOf = (entry: string) => entry.replace(/\/page$/, '').replace(/\/\([^)]+\)/g, '') || '/';

export function measure(): PageSize[] {
  const manifest = join(NEXT_DIR, 'app-build-manifest.json');
  if (!existsSync(manifest)) {
    throw new Error('No production build in apps/web/.next: run `bun run --cwd apps/web build`.');
  }
  const pages: Record<string, string[]> = JSON.parse(readFileSync(manifest, 'utf8')).pages;
  const { rootMainFiles }: { rootMainFiles: string[] } = JSON.parse(
    readFileSync(join(NEXT_DIR, 'build-manifest.json'), 'utf8'),
  );
  const out: PageSize[] = [];
  for (const entry of Object.keys(pages)) {
    if (!entry.endsWith('/page')) continue;
    const route = routeOf(entry);
    if (!/^\/(app|admin)(\/|$)/.test(route)) continue;
    const files = new Set(rootMainFiles);
    const parts = entry.split('/').slice(1, -1);
    for (let i = 0; i <= parts.length; i++) {
      const layout = `/${[...parts.slice(0, i), 'layout'].join('/')}`;
      for (const f of pages[layout] ?? []) files.add(f);
    }
    for (const f of pages[entry]!) files.add(f);
    const sizes = [...files]
      .filter((f) => f.endsWith('.js'))
      .map((file) => ({ file, bytes: gzipSize(file) }))
      .sort((a, b) => b.bytes - a.bytes);
    out.push({
      route,
      bytes: sizes.reduce((n, s) => n + s.bytes, 0),
      largest: sizes.slice(0, 5),
    });
  }
  if (out.length === 0) throw new Error('No /app or /admin pages in the build manifest.');
  return out.sort((a, b) => b.bytes - a.bytes);
}

const kb = (bytes: number) => bytes / 1000;
const fmt = (bytes: number) => kb(bytes).toFixed(1);

function readCeilings(): Ceilings {
  return existsSync(CEILINGS_FILE)
    ? JSON.parse(readFileSync(CEILINGS_FILE, 'utf8'))
    : { overBudget: {} };
}

/** The most a page may load: its recorded ceiling if it has one, else the budget. */
const limitFor = (c: Ceilings, route: string) => c.overBudget[route] ?? BUDGET_KB;

function record(pages: PageSize[], c: Ceilings): Ceilings {
  const next: Record<string, number> = {};
  for (const p of pages) {
    const ceiling = c.overBudget[p.route];
    if (ceiling === undefined || kb(p.bytes) <= BUDGET_KB) continue;
    next[p.route] = Math.min(ceiling, Math.ceil(kb(p.bytes)));
  }
  return { overBudget: next };
}

if (import.meta.main) {
  const pages = measure();
  const ceilings = readCeilings();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ budgetKb: BUDGET_KB, ceilings, pages }, null, 2));
    process.exit(0);
  }
  if (process.argv.includes('--record')) {
    const next = record(pages, ceilings);
    writeFileSync(CEILINGS_FILE, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Recorded ${Object.keys(next.overBudget).length} over-budget page ceilings.`);
  }
  for (const p of pages) {
    const limit = limitFor(ceilings, p.route);
    const note = limit > BUDGET_KB ? `  (ceiling ${limit} kB, budget ${BUDGET_KB} kB)` : '';
    console.log(`${fmt(p.bytes).padStart(7)} kB  ${p.route}${note}`);
  }
  const failing = pages.filter((p) => kb(p.bytes) > limitFor(ceilings, p.route));
  if (failing.length > 0) {
    console.error(
      `\nBundle budget exceeded (spec 13: app pages load at most ${BUDGET_KB} kB of gzipped JS before lazy chunks):`,
    );
    for (const p of failing) {
      const limit = limitFor(ceilings, p.route);
      console.error(
        `  ${p.route}: ${fmt(p.bytes)} kB, ${(kb(p.bytes) - limit).toFixed(1)} kB over its limit of ${limit} kB`,
      );
      for (const f of p.largest) console.error(`    ${fmt(f.bytes).padStart(6)} kB  ${f.file}`);
    }
    console.error(
      'Move code a page does not need at first paint behind a dynamic import(), or drop the dependency.',
    );
    process.exit(1);
  }
  const over = pages.filter((p) => kb(p.bytes) > BUDGET_KB).length;
  console.log(
    over
      ? `\nNo page grew. ${over} of ${pages.length} pages are still over the ${BUDGET_KB} kB budget (scripts/checks/bundle-budget.json).`
      : `\nAll ${pages.length} app pages are within ${BUDGET_KB} kB gzipped.`,
  );
}
