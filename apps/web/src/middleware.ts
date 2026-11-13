import { type NextRequest, NextResponse } from 'next/server';
import { isMarketingPath } from './app/(marketing)/_data/routes';
import { directOrigins, readDirectCookie, rewriteConnectSrc } from './client/direct-origins';
import { enabledProviders } from './server/auth/config';
import { readSessionUserId } from './server/auth/secret';
import { getContainer } from './server/container';
import {
  appCsp,
  DIRECT_PROVIDER_ORIGINS,
  MARKETING_HEADER,
  newNonce,
  publicCsp,
} from './server/http/csp';

/**
 * - /app/** and /admin/**: require a session (redirect to /login), /admin/** also the admin role;
 *   a per-request CSP nonce replaces the static header (spec 2.4). `connect-src` lists provider
 *   and own-bucket origins only when the user enabled own-key mode (the `askcalls-direct`
 *   cookie, see client/direct-origins.ts), and none in offline mode.
 * - / and /login: a per-request nonce CSP that allows accounts.google.com, the only pages
 *   where the Google One Tap script may load. The other marketing pages get the same CSP
 *   without Google and a cookieless page view (Telemetry port; a no-op without a backend).
 * - /api/**: `Cache-Control: no-store` (route handlers set it too).
 * Runs on the Node.js runtime so it can use the container like route handlers do.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    const res = NextResponse.next();
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }

  const marketing = isMarketingPath(pathname);
  const isPublic = marketing || pathname === '/login';
  const oneTapPage = pathname === '/' || pathname === '/login';
  let container: Awaited<ReturnType<typeof getContainer>>;
  try {
    container = await getContainer();
  } catch {
    if (isPublic) {
      const nonce = newNonce();
      return withCsp(req, nonce, publicCsp(nonce, 'production', false), marketing);
    }
    return new NextResponse('This instance is not available.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  if (isPublic) {
    const nonce = newNonce();
    const oneTap =
      oneTapPage && enabledProviders(container.config).some((p) => p.id === 'google-one-tap');
    const res = withCsp(
      req,
      nonce,
      publicCsp(nonce, container.config.environment, oneTap),
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
  const direct = container.config.config.offlineMode
    ? []
    : directOrigins(
        readDirectCookie((n) => req.cookies.get(n)?.value, req.nextUrl.protocol === 'https:'),
      );
  const csp = rewriteConnectSrc(
    appCsp(container.config.config, nonce, container.config.environment),
    DIRECT_PROVIDER_ORIGINS,
    direct,
  );
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
    '/app',
    '/app/:path*',
    '/admin',
    '/admin/:path*',
    '/api/:path*',
  ],
};
