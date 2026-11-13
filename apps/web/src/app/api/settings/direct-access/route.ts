import { putDirectAccess } from '@askcalls/api-contract/routes/settings';
import { DomainError } from '@askcalls/domain';
import { encodeDirectCookie } from '../../../../client/direct-origins';
import { authSecret } from '../../../../server/auth/secret';
import {
  directCookieFrom,
  directCookieHeader,
  signDirectCookie,
  verifyDirectCookie,
} from '../../../../server/http/direct-access';
import { route } from '../../../../server/http/handler';

export const PUT = route(
  putDirectAccess,
  async ({ req, container, actor, body }) => {
    const secret = authSecret(container.config);
    if (!secret) throw new DomainError('unauthorized', 'sign in required');
    const secure = new URL(req.url).protocol === 'https:';
    const value = encodeDirectCookie(body);
    const current = await verifyDirectCookie(
      secret,
      actor.userId,
      directCookieFrom(req.headers, secure),
    );
    const res = Response.json({ changed: (current ?? '') !== value });
    const signed = value ? await signDirectCookie(secret, actor.userId, value) : null;
    res.headers.append('Set-Cookie', directCookieHeader(signed, secure));
    return res;
  },
  { rateLimit: { name: 'direct-access', limit: 30, windowMs: 60_000 } },
);
