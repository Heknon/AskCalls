import { isDomainError } from '@askcalls/domain';
import { createApiToken } from '@askcalls/domain/use-cases/tokens';
import { readSessionUserId } from '../../../../server/auth/secret';
import { type Container, getContainer } from '../../../../server/container';
import { newNonce } from '../../../../server/http/csp';
import { type Locale, resolveLocale, translator } from '../../../../server/i18n/translator';

/**
 * `askcalls login` (apps/agent login/loopback.ts). The CLI listens on 127.0.0.1:<port> with a
 * one-time `state` and opens GET /cli/login?port&state. Behind the user's session this page asks
 * for consent; the consent form POSTs back here (same origin, SameSite cookie, Origin checked),
 * which creates a personal access token with scopes `read write ask keys` and answers with a
 * form that carries the token and the state to the loopback listener. Each response has its own
 * CSP: no third-party anything, scripts only with this response's nonce, and forms may go only
 * to this origin (consent) or to that one loopback port (hand-off).
 */
const STATE = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_SCOPES = ['read', 'write', 'ask', 'keys'] as const;
const MAX_FORM_BYTES = 4 * 1024;
const RATE_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

interface LoopbackTarget {
  port: number;
  state: string;
}

function parse(port: string | null, state: string | null): LoopbackTarget | null {
  if (!port || !/^\d{4,5}$/.test(port) || !state || !STATE.test(state)) return null;
  const n = Number(port);
  return n >= 1024 && n <= 65535 ? { port: n, state } : null;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function html(opts: {
  locale: Locale;
  status: number;
  body: string;
  nonce: string;
  formAction: string;
  script?: string;
}): Response {
  const { dir } = translator(opts.locale, 'cliLogin');
  const csp = [
    "default-src 'none'",
    `style-src 'nonce-${opts.nonce}'`,
    `script-src 'nonce-${opts.nonce}'`,
    `form-action ${opts.formAction}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; ');
  const doc = `<!doctype html><html lang="${opts.locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AskCalls</title><style nonce="${opts.nonce}">body{font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;line-height:1.5}button,a{font:inherit;margin-inline-end:.75rem}</style></head><body>${opts.body}${opts.script ? `<script nonce="${opts.nonce}">${opts.script}</script>` : ''}</body></html>`;
  return new Response(doc, {
    status: opts.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': csp,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function message(
  locale: Locale,
  status: number,
  key: 'invalid' | 'forbidden' | 'quota' | 'signedOut' | 'tooMany',
) {
  const { t } = translator(locale, 'cliLogin');
  return html({
    locale,
    status,
    nonce: newNonce(),
    formAction: "'none'",
    body: `<h1>${escapeHtml(t('title'))}</h1><p role="alert">${escapeHtml(t(key))}</p>`,
  });
}

function localeOf(req: Request): Locale {
  const cookie = req.headers.get('cookie')?.match(/(?:^|;\s*)locale=([^;]+)/)?.[1];
  return resolveLocale(cookie, req.headers.get('accept-language'));
}

async function sessionUser(req: Request, container: Container): Promise<string | null> {
  const userId = await readSessionUserId(req.headers, container.config);
  if (!userId) return null;
  const user = await container.ports.users.findById(userId);
  return user && !user.deletedAt ? user.id : null;
}

export async function GET(req: Request): Promise<Response> {
  const locale = localeOf(req);
  const url = new URL(req.url);
  const r = parse(url.searchParams.get('port'), url.searchParams.get('state'));
  if (!r) return message(locale, 400, 'invalid');
  const container = await getContainer();
  if (!(await sessionUser(req, container))) {
    const login = new URL('/login', container.config.config.appUrl);
    login.searchParams.set('callbackUrl', `/cli/login?port=${r.port}&state=${r.state}`);
    return new Response(null, {
      status: 303,
      headers: { Location: login.toString(), 'Cache-Control': 'no-store' },
    });
  }
  const { t } = translator(locale, 'cliLogin');
  return html({
    locale,
    status: 200,
    nonce: newNonce(),
    formAction: "'self'",
    body: [
      `<h1>${escapeHtml(t('title'))}</h1>`,
      `<p>${escapeHtml(t('intro'))}</p>`,
      `<p>${escapeHtml(t('scopes'))}</p>`,
      `<p><strong>${escapeHtml(t('port', { port: r.port }))}</strong></p>`,
      `<form method="post" action="/cli/login"><input type="hidden" name="port" value="${r.port}"><input type="hidden" name="state" value="${r.state}"><button type="submit">${escapeHtml(t('authorize'))}</button><a href="/app">${escapeHtml(t('cancel'))}</a></form>`,
    ].join(''),
  });
}

export async function POST(req: Request): Promise<Response> {
  const locale = localeOf(req);
  const container = await getContainer();
  const { ports } = container;
  if (req.headers.get('origin') !== new URL(container.config.config.appUrl).origin) {
    return message(locale, 403, 'forbidden');
  }
  const userId = await sessionUser(req, container);
  if (!userId) return message(locale, 401, 'signedOut');
  const limit = await ports.rateLimiter.hit(
    `rl:cli-login:${userId}`,
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs,
  );
  if (!limit.allowed) return message(locale, 429, 'tooMany');

  const type = req.headers.get('content-type') ?? '';
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (!type.startsWith('application/x-www-form-urlencoded') || declared > MAX_FORM_BYTES) {
    return message(locale, 400, 'invalid');
  }
  const text = await req.text();
  if (text.length > MAX_FORM_BYTES) return message(locale, 400, 'invalid');
  const form = new URLSearchParams(text);
  const r = parse(form.get('port'), form.get('state'));
  if (!r) return message(locale, 400, 'invalid');

  let token: string;
  try {
    ({ token } = await createApiToken(
      ports,
      { kind: 'session', userId },
      { name: 'askcalls CLI', scopes: [...TOKEN_SCOPES], expiresInDays: null },
    ));
  } catch (e) {
    if (isDomainError(e) && e.code === 'quota_exceeded') return message(locale, 403, 'quota');
    throw e;
  }
  const { t } = translator(locale, 'cliLogin');
  const callback = `http://127.0.0.1:${r.port}/callback`;
  return html({
    locale,
    status: 200,
    nonce: newNonce(),
    formAction: callback,
    body: [
      `<h1>${escapeHtml(t('title'))}</h1>`,
      `<p role="status">${escapeHtml(t('sending'))}</p>`,
      `<form id="handoff" method="post" action="${callback}"><input type="hidden" name="state" value="${r.state}"><input type="hidden" name="token" value="${token}"><button type="submit">${escapeHtml(t('continue'))}</button></form>`,
    ].join(''),
    script: "document.getElementById('handoff').submit();",
  });
}
