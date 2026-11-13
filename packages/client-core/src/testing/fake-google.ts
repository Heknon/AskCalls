/**
 * An in-memory stand-in for the parts of Google that Drive as a recording store uses: the
 * OAuth consent redirect and token endpoint, and Drive API v3 (folders, resumable uploads,
 * ranged downloads, delete, about). Request in, Response out, so it serves as a `fetch` in unit
 * tests and behind a local HTTP server in the e2e suite. Never for production use.
 */

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  bytes: Uint8Array;
}

interface UploadSession {
  name: string;
  parents: string[];
  size: number;
  received: Uint8Array;
  offset: number;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';

export interface FakeGoogleOptions {
  email?: string;
  quota?: { limit: number | null };
  /** Base of the upload session URLs it hands out. */
  driveOrigin?: string;
  /** Scope granted on code exchange. */
  grantScope?: string;
}

export class FakeGoogle {
  readonly files = new Map<string, FakeFile>();
  readonly sessions = new Map<string, UploadSession>();
  /** Access tokens Drive accepts. */
  readonly accessTokens = new Set<string>();
  readonly refreshTokens = new Set<string>();
  readonly revoked = new Set<string>();
  readonly codes = new Map<string, { verifierChallenge: string; redirectUri: string }>();
  /** Every Drive request, for assertions (method, path, auth). */
  readonly log: Array<{ method: string; path: string; authorized: boolean }> = [];
  private seq = 0;
  private readonly email: string;
  private readonly limit: number | null;
  private readonly driveOrigin: string;
  private readonly grantScope: string;

  constructor(opts: FakeGoogleOptions = {}) {
    this.email = opts.email ?? 'dana@example.test';
    this.limit = opts.quota ? opts.quota.limit : 15e9;
    this.driveOrigin = opts.driveOrigin ?? 'https://www.googleapis.com';
    this.grantScope = opts.grantScope ?? DRIVE_FILE;
  }

  #id(prefix: string) {
    this.seq += 1;
    return `${prefix}${this.seq.toString(36).padStart(6, '0')}`;
  }

  /** Mints a token pair as the token endpoint would. */
  issue(): { refreshToken: string; accessToken: string } {
    const refreshToken = this.#id('1//rt-');
    const accessToken = this.#id('ya29.at-');
    this.refreshTokens.add(refreshToken);
    this.accessTokens.add(accessToken);
    return { refreshToken, accessToken };
  }

  /** Expires every access token (the next Drive call gets 401). */
  expireAccessTokens() {
    this.accessTokens.clear();
  }

  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    this.handle(input instanceof Request ? input : new Request(input, init));

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/o/oauth2/v2/auth') return this.#consent(url);
    if (url.pathname === '/token') return this.#token(req);
    if (url.pathname === '/revoke') return this.#revoke(req);
    return this.#drive(req, url);
  }

  /** accounts.google.com: consents at once and redirects back with a code. */
  #consent(url: URL): Response {
    const redirect = new URL(url.searchParams.get('redirect_uri') ?? '');
    const code = this.#id('code-');
    this.codes.set(code, {
      verifierChallenge: url.searchParams.get('code_challenge') ?? '',
      redirectUri: redirect.href,
    });
    redirect.searchParams.set('code', code);
    redirect.searchParams.set('state', url.searchParams.get('state') ?? '');
    redirect.searchParams.set('scope', this.grantScope);
    return new Response(null, { status: 302, headers: { location: redirect.href } });
  }

  async #token(req: Request): Promise<Response> {
    const form = new URLSearchParams(await req.text());
    if (form.get('grant_type') === 'authorization_code') {
      const code = this.codes.get(form.get('code') ?? '');
      const verifier = form.get('code_verifier') ?? '';
      if (!code || (await challenge(verifier)) !== code.verifierChallenge) {
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      this.codes.delete(form.get('code')!);
      const t = this.issue();
      return Response.json({
        access_token: t.accessToken,
        refresh_token: t.refreshToken,
        expires_in: 3599,
        scope: this.grantScope,
        token_type: 'Bearer',
      });
    }
    const rt = form.get('refresh_token') ?? '';
    if (!this.refreshTokens.has(rt) || this.revoked.has(rt)) {
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    }
    const accessToken = this.#id('ya29.at-');
    this.accessTokens.add(accessToken);
    return Response.json({ access_token: accessToken, expires_in: 3599, token_type: 'Bearer' });
  }

  async #revoke(req: Request): Promise<Response> {
    const token = new URLSearchParams(await req.text()).get('token') ?? '';
    if (!this.refreshTokens.has(token)) return Response.json({}, { status: 400 });
    this.revoked.add(token);
    return new Response(null, { status: 200 });
  }

  #cors(req: Request, res: Response): Response {
    const origin = req.headers.get('origin');
    if (!origin) return res;
    const h = new Headers(res.headers);
    h.set('access-control-allow-origin', origin);
    h.set('access-control-expose-headers', 'location, range, content-range, content-length');
    return new Response(res.body, { status: res.status, headers: h });
  }

  async #drive(req: Request, url: URL): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': req.headers.get('origin') ?? '*',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE',
          'access-control-allow-headers':
            req.headers.get('access-control-request-headers') ?? 'authorization',
          'access-control-max-age': '600',
        },
      });
    }
    const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
    const authorized = token !== undefined && this.accessTokens.has(token);
    this.log.push({ method: req.method, path: url.pathname, authorized });
    const session = url.searchParams.get('upload_id');
    if (!authorized && !session) {
      return this.#cors(req, Response.json({ error: { code: 401 } }, { status: 401 }));
    }
    return this.#cors(req, await this.#route(req, url, session));
  }

  async #route(req: Request, url: URL, sessionId: string | null): Promise<Response> {
    const path = url.pathname;
    if (path === '/drive/v3/about') {
      const used = [...this.files.values()].reduce((n, f) => n + f.bytes.length, 0);
      return Response.json({
        user: { emailAddress: this.email },
        storageQuota: {
          usage: String(used + 2_400_000_000),
          ...(this.limit !== null && { limit: String(this.limit) }),
        },
      });
    }
    if (path === '/drive/v3/files' && req.method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const name = /name = '([^']*)'/.exec(q)?.[1];
      const files = [...this.files.values()]
        .filter((f) => f.mimeType === FOLDER_MIME && f.name === name)
        .map((f) => ({ id: f.id }));
      return Response.json({ files });
    }
    if (path === '/drive/v3/files' && req.method === 'POST') {
      const meta = (await req.json()) as { name: string; mimeType?: string; parents?: string[] };
      if (!this.#parentsExist(meta.parents)) return Response.json({}, { status: 404 });
      const id = this.#id('f');
      this.files.set(id, {
        id,
        name: meta.name,
        mimeType: meta.mimeType ?? 'application/octet-stream',
        parents: meta.parents ?? [],
        bytes: new Uint8Array(),
      });
      return Response.json({ id });
    }
    if (path === '/upload/drive/v3/files' && req.method === 'POST' && !sessionId) {
      const meta = (await req.json()) as { name: string; parents?: string[] };
      if (!this.#parentsExist(meta.parents)) return Response.json({}, { status: 404 });
      const size = Number(req.headers.get('x-upload-content-length') ?? '0');
      const id = this.#id('u');
      this.sessions.set(id, {
        name: meta.name,
        parents: meta.parents ?? [],
        size,
        received: new Uint8Array(size),
        offset: 0,
      });
      return new Response(null, {
        status: 200,
        headers: {
          location: `${this.driveOrigin}/upload/drive/v3/files?uploadType=resumable&upload_id=${id}`,
        },
      });
    }
    if (path === '/upload/drive/v3/files' && req.method === 'PUT' && sessionId) {
      const s = this.sessions.get(sessionId);
      if (!s) return Response.json({}, { status: 404 });
      const range = /bytes (\d+)-(\d+)\/(\d+)/.exec(req.headers.get('content-range') ?? '');
      const chunk = new Uint8Array(await req.arrayBuffer());
      if (range) {
        const start = Number(range[1]);
        if (start !== s.offset) return Response.json({}, { status: 400 });
        s.received.set(chunk, start);
        s.offset = start + chunk.length;
      }
      if (s.offset < s.size) {
        return new Response(null, { status: 308, headers: { range: `bytes=0-${s.offset - 1}` } });
      }
      this.sessions.delete(sessionId);
      const id = this.#id('f');
      this.files.set(id, {
        id,
        name: s.name,
        mimeType: 'application/octet-stream',
        parents: s.parents,
        bytes: s.received,
      });
      return Response.json({ id });
    }
    const fileId = /^\/drive\/v3\/files\/([^/]+)$/.exec(path)?.[1];
    if (fileId) {
      const f = this.files.get(decodeURIComponent(fileId));
      if (!f) return Response.json({ error: { code: 404 } }, { status: 404 });
      if (req.method === 'DELETE') {
        this.files.delete(f.id);
        for (const child of [...this.files.values()]) {
          if (child.parents.includes(f.id)) this.files.delete(child.id);
        }
        return new Response(null, { status: 204 });
      }
      if (req.method === 'GET' && url.searchParams.get('alt') === 'media') {
        const m = /bytes=(\d+)-(\d+)?/.exec(req.headers.get('range') ?? '');
        if (!m) return new Response(f.bytes as BodyInit, { status: 200 });
        const start = Number(m[1]);
        if (start >= f.bytes.length && f.bytes.length > 0)
          return new Response(null, { status: 416 });
        const end = Math.min(m[2] ? Number(m[2]) : f.bytes.length - 1, f.bytes.length - 1);
        return new Response(f.bytes.slice(start, end + 1) as BodyInit, {
          status: 206,
          headers: { 'content-range': `bytes ${start}-${end}/${f.bytes.length}` },
        });
      }
    }
    return Response.json({ error: { code: 400 } }, { status: 400 });
  }

  #parentsExist(parents: string[] | undefined): boolean {
    return (parents ?? []).every((p) => this.files.get(p)?.mimeType === FOLDER_MIME);
  }
}

async function challenge(verifier: string): Promise<string> {
  const d = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  );
  return btoa(String.fromCharCode(...d))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
