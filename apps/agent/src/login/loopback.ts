import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** The browser page that creates the token for the CLI (apps/web `/cli/login`). */
export const CLI_LOGIN_PATH = '/cli/login';
export const CALLBACK_PATH = '/callback';
const TOKEN_PATTERN = /^ac_[A-Za-z0-9_-]{43}$/;
const MAX_BODY = 8 * 1024;
export const LOGIN_TIMEOUT_MS = 5 * 60_000;

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function page(title: string, text: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5}</style></head><body><h1>${title}</h1><p>${text}</p></body></html>`;
}

function reply(res: ServerResponse, status: number, title: string, text: string): void {
  res.writeHead(status, PAGE_HEADERS);
  res.end(page(title, text));
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface LoopbackLogin {
  port: number;
  /** One-time value the page must echo back; it proves the callback answers this CLI run. */
  state: string;
  /** Open this in the browser. */
  authorizeUrl: string;
  /** Resolves with the token on the first valid callback, then the listener closes. */
  token: Promise<string>;
  close(): void;
}

/**
 * The CLI side of `askcalls login` (a loopback redirect, as RFC 8252 describes for native apps).
 * It listens on 127.0.0.1 on a random port with a random 256-bit state, and opens
 * `<server>/cli/login?port&state`. That page, behind the user's session, creates a token with
 * scopes `read write ask keys` and posts it here in a form with the state. The listener accepts
 * exactly one POST to /callback whose state matches (compared in constant time) and whose Origin
 * is the server, then stops listening. Anything else is refused without ending the wait.
 */
export async function startLoopbackLogin(opts: {
  serverOrigin: string;
  timeoutMs?: number;
}): Promise<LoopbackLogin> {
  const state = randomBytes(32).toString('base64url');
  let used = false;
  let settle: { resolve: (t: string) => void; reject: (e: Error) => void };
  const token = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });
  token.catch(() => {});

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method !== 'POST' || url.pathname !== CALLBACK_PATH) {
      reply(res, 404, 'Not found', 'This address only accepts the askcalls sign-in.');
      return;
    }
    if (used) {
      reply(res, 410, 'Already signed in', 'This sign-in link was already used.');
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== opts.serverOrigin) {
      reply(res, 403, 'Wrong server', 'This sign-in came from a different server.');
      return;
    }
    const body = await readBody(req);
    const form = new URLSearchParams(body ?? '');
    const given = form.get('state') ?? '';
    const tok = form.get('token') ?? '';
    if (!body || !sameSecret(given, state)) {
      reply(res, 400, 'Sign-in did not match', 'Start again with askcalls login.');
      return;
    }
    if (!TOKEN_PATTERN.test(tok)) {
      reply(res, 400, 'Sign-in failed', 'The server sent no valid token.');
      return;
    }
    used = true;
    res.on('finish', close);
    reply(res, 200, 'askcalls is signed in', 'You can close this tab and return to the terminal.');
    settle.resolve(tok);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  const timer = setTimeout(() => {
    settle.reject(new Error('timed out waiting for the browser'));
    close();
  }, opts.timeoutMs ?? LOGIN_TIMEOUT_MS);
  timer.unref?.();

  function close() {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
  }

  const authorize = new URL(CLI_LOGIN_PATH, opts.serverOrigin);
  authorize.searchParams.set('port', String(port));
  authorize.searchParams.set('state', state);
  return { port, state, authorizeUrl: authorize.toString(), token, close };
}
