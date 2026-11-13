import { type NextRequest, NextResponse } from 'next/server';
import { readSessionUserId } from './server/auth/secret';
import { getContainer } from './server/container';
import { appCsp, newNonce } from './server/http/csp';

/**
 * - /app/** and /admin/**: require a session (redirect to /login), /admin/** also the admin role;
 *   a per-request CSP nonce replaces the static header (spec 2.4).
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

  let container: Awaited<ReturnType<typeof getContainer>>;
  try {
    container = await getContainer();
  } catch {
    return new NextResponse('This instance is not available.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
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
  const csp = appCsp(container.config.config, nonce, container.config.environment);
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/app', '/app/:path*', '/admin', '/admin/:path*', '/api/:path*'],
};
