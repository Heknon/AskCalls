import { type NextRequest, NextResponse } from 'next/server';
import { isMarketingPath } from './app/(marketing)/_data/routes';
import { directOrigins, readDirectCookie } from './client/direct-origins';
import { enabledProviders } from './server/auth/config';
import { authSecret, readSessionUserId } from './server/auth/secret';
import { getConfigService, getContainer, getSetupToken } from './server/container';
import { appCsp, MARKETING_HEADER, newNonce, publicCsp } from './server/http/csp';
import { verifyDirectCookie } from './server/http/direct-access';
import { localRequestAllowed } from './server/http/local-guard';

/**
 * - /app/** and /admin/**: require a session (redirect to /login), /admin/** also the admin role;
 *   a per-request CSP nonce replaces the static header (spec 2.4). `connect-src` lists provider
 *   and own-bucket origins only when the user enabled own-key mode (the `askcalls-direct`
 *   cookie, signed for this user by the server: server/http/direct-access.ts), and none in
 *   offline mode.
 * - / and /login: a per-request nonce CSP that allows accounts.google.com, the only pages
 *   where the Google One Tap script may load. The other marketing pages get the same CSP
 *   without Google and a cookieless page view (Telemetry port; a no-op without a backend).
 *   In offline mode none of them names an outside origin.
 * - /setup: the first-run wizard, only while the instance needs setup; every other page
 *   redirects there meanwhile.
 * - /api/**: `Cache-Control: no-store` (route handlers set it too).
 * - Local mode: every matched path, /cli/** included, only through the loopback guard of
 *   `askcalls local` (server/http/local-guard.ts).
 * Runs on the Node.js runtime so it can use the container like route handlers do.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const resolved = await getContainer().then(
    (c) => c.config,
    () =>
      getConfigService().then(
        (s) => s.get(),
        () => null,
      ),
  );
  if (resolved && !localRequestAllowed(resolved.config)) {
    return new NextResponse('Start this AskCalls with askcalls local.', {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  if (pathname.startsWith('/cli/')) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    const res = NextResponse.next();
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }

  const marketing = isMarketingPath(pathname);
  const isPublic = marketing || pathname === '/login';
  const oneTapPage = pathname === '/' || pathname === '/login';
  const isSetup = pathname === '/setup';
  let container: Awaited<ReturnType<typeof getContainer>>;
  try {
    container = await getContainer();
  } catch {
    if (await getSetupToken().catch(() => null)) {
      if (!isSetup) return NextResponse.redirect(new URL('/setup', req.url));
      const nonce = newNonce();
      const { environment } = await getConfigService();
      const res = withCsp(req, nonce, publicCsp(nonce, environment, false, true));
      res.headers.set('Cache-Control', 'no-store');
      return res;
    }
    if (isPublic) {
      const nonce = newNonce();
      return withCsp(req, nonce, publicCsp(nonce, 'production', false), marketing);
    }
    return new NextResponse('This instance is not available.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (isSetup) return NextResponse.redirect(new URL('/login', req.url));

  if (isPublic) {
    const nonce = newNonce();
    const oneTap =
      oneTapPage && enabledProviders(container.config).some((p) => p.id === 'google-one-tap');
    const offline = container.config.config.offlineMode;
    const res = withCsp(
      req,
      nonce,
      publicCsp(nonce, container.config.environment, oneTap, offline),
      marketing,
    );
    if (marketing) {
      const prefetch = req.headers.has('next-router-prefetch') || req.headers.has('rsc');
      if (!prefetch) container.ports.telemetry.event(null, { name: 'page_view', route: pathname });
    }
    return res;
  }

  const userId = await readSessionUserId(req.headers, container.config);
  const user = userId ? await container.ports.users.findById(userId) : null;
  if (!user || user.deletedAt) {
    const login = new URL('/login', req.url);
    login.searchParams.set('callbackUrl', `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (user.role !== 'admin') return NextResponse.redirect(new URL('/app', req.url));
  }

  const nonce = newNonce();
  const secret = authSecret(container.config);
  const cookie = readDirectCookie(
    (n) => req.cookies.get(n)?.value,
    req.nextUrl.protocol === 'https:',
  );
  const direct = secret ? directOrigins(await verifyDirectCookie(secret, user.id, cookie)) : [];
  const csp = appCsp(container.config.config, nonce, container.config.environment, direct);
  const res = withCsp(req, nonce, csp);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/** Next.js reads the nonce from the request's CSP header for its bootstrap scripts. */
function withCsp(req: NextRequest, nonce: string, csp: string, marketing = false) {
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  if (marketing) headers.set(MARKETING_HEADER, '1');
  else headers.delete(MARKETING_HEADER);
  headers.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/',
    '/pricing',
    '/security',
    '/faq',
    '/mcp',
    '/self-host',
    '/privacy',
    '/terms',
    '/dpa',
    '/subprocessors',
    '/login',
    '/setup',
    '/app',
    '/app/:path*',
    '/admin',
    '/admin/:path*',
    '/api/:path*',
    '/cli/:path*',
  ],
};
