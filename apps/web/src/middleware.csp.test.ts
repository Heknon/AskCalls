import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { DIRECT_COOKIE_SECURE, encodeDirectCookie } from './client/direct-origins';
import { middleware } from './middleware';
import { sessionCookie, startTestApp, type TestApp } from './server/testing/http';

/**
 * The CSP check (spec 2.4, 13): every /app and /admin page, as the real middleware answers it,
 * allows scripts from this origin and this response's nonce only. Pages come from the file
 * tree, so a new page is covered without editing this test. Together with the source scan below
 * (no third-party <script> in app code), no outside script can run on an app route.
 */

const APP_DIR = join(import.meta.dirname, 'app');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** `app/(app)/(shell)/app/calls/[id]/page.tsx` → `/app/calls/sample`. */
const APP_ROUTES = files(join(APP_DIR, '(app)'))
  .filter((f) => f.endsWith(`${sep}page.tsx`))
  .map(
    (f) =>
      `/${relative(APP_DIR, f)
        .split(sep)
        .slice(0, -1)
        .filter((s) => !s.startsWith('('))
        .map((s) => (s.startsWith('[') ? 'sample' : s))
        .join('/')}`,
  )
  .sort();

const ALLOWED_SCRIPT_SOURCES = ["'self'", "'wasm-unsafe-eval'", "'strict-dynamic'"];

const directives = (csp: string) =>
  new Map(
    csp.split('; ').map((d) => {
      const [name, ...values] = d.split(' ');
      return [name!, values] as const;
    }),
  );

let app: TestApp | null = null;
afterEach(() => {
  app?.close();
  app = null;
});

async function signedIn(env: Record<string, string> = {}) {
  app = startTestApp({ env });
  const user = await app.ports.users.create({ email: 'csp@example.test' });
  await app.ports.users.setRole(user.id, 'admin');
  return sessionCookie(user.id);
}

async function cspFor(path: string, cookie: string) {
  const res = await middleware(
    new NextRequest(`https://askcalls.test${path}`, { headers: { cookie } }),
  );
  expect(res.status, path).toBe(200);
  const csp = res.headers.get('content-security-policy') ?? '';
  const nonce = res.headers.get('x-middleware-request-x-nonce');
  return { csp, nonce, cacheControl: res.headers.get('cache-control') };
}

function expectStrictScripts(path: string, csp: string, nonce: string | null) {
  expect(nonce, path).toMatch(/^[A-Za-z0-9+/]+=*$/);
  const d = directives(csp);
  expect(d.get('default-src'), path).toEqual(["'self'"]);
  expect(d.get('object-src'), path).toEqual(["'none'"]);
  expect(d.get('base-uri'), path).toEqual(["'none'"]);
  const script = d.get('script-src') ?? [];
  expect(script, path).toEqual(expect.arrayContaining(["'self'", "'wasm-unsafe-eval'"]));
  for (const source of script) {
    expect(
      ALLOWED_SCRIPT_SOURCES.includes(source) || source === `'nonce-${nonce}'`,
      `${path}: script-src allows ${source}`,
    ).toBe(true);
  }
  expect(d.has('script-src-elem'), path).toBe(false);
  expect(d.has('script-src-attr'), path).toBe(false);
  expect(csp, path).not.toContain('unsafe-inline');
  expect(csp, path).not.toContain("'unsafe-eval'");
}

describe('CSP check: app routes', () => {
  it('finds the app pages', () => {
    expect(APP_ROUTES).toEqual(expect.arrayContaining(['/app', '/app/welcome', '/admin/instance']));
  });

  const modes: Array<[string, Record<string, string>]> = [
    ['default', {}],
    [
      'S3 recordings and an embedding model host',
      {
        BLOB_DRIVER: 's3',
        S3_BUCKET: 'askcalls-dev',
        S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
        S3_ACCESS_KEY_ID: 'AKIDEXAMPLE',
        S3_SECRET_ACCESS_KEY: 'secret',
        EMBEDDING_MODEL_URL: 'https://models.example.org/askcalls',
      },
    ],
    ['hosted', { ASKCALLS_HOSTED: 'true' }],
  ];

  for (const [mode, env] of modes) {
    it(`allows only this origin and the response nonce for scripts (${mode})`, async () => {
      const cookie = await signedIn(env);
      for (const path of APP_ROUTES) {
        const { csp, nonce, cacheControl } = await cspFor(path, cookie);
        expectStrictScripts(path, csp, nonce);
        expect(cacheControl, path).toBe('no-store');
      }
    });
  }

  it('gives every response its own nonce', async () => {
    const cookie = await signedIn();
    const a = await cspFor('/app', cookie);
    const b = await cspFor('/app', cookie);
    expect(a.nonce).not.toBe(b.nonce);
  });

  it('keeps own-key origins in connect-src, even from a tampered cookie', async () => {
    const session = await signedIn();
    const direct = encodeDirectCookie({
      providers: ['openai'],
      origins: ['https://bucket.example.org'],
    });
    const forged = `o=${encodeURIComponent('https://evil.example; script-src *')}&p=openai`;
    for (const value of [direct, forged]) {
      const cookie = `${session}; ${DIRECT_COOKIE_SECURE}=${encodeURIComponent(value)}`;
      const { csp, nonce } = await cspFor('/app/upload', cookie);
      expectStrictScripts('/app/upload', csp, nonce);
      expect(directives(csp).get('connect-src')).toContain('https://api.openai.com');
      expect(csp).not.toContain('evil.example');
    }
  });
});

describe('CSP check: app source', () => {
  const sources = [
    ...files(join(APP_DIR, '(app)')),
    join(APP_DIR, 'layout.tsx'),
    ...files(join(import.meta.dirname, 'client')),
  ].filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));

  it('loads no script element from another origin', () => {
    const offenders = sources.flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      const found: string[] = [];
      if (/from ['"]next\/script['"]/.test(text)) found.push('next/script');
      if (/<script\b[^>]*\bsrc=/.test(text)) found.push('<script src>');
      if (/createElement\(\s*['"]script['"]/.test(text)) found.push("createElement('script')");
      return found.map((what) => `${relative(APP_DIR, f)}: ${what}`);
    });
    expect(offenders).toEqual([]);
  });
});
