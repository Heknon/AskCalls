import { deleteAccount } from '@askcalls/api-contract/routes/account';
import { deleteAccount as deleteAccountUseCase } from '@askcalls/domain/use-cases/account';
import { SESSION_COOKIES } from '../../../server/auth/secret';
import { route } from '../../../server/http/handler';

/** Crypto-shred, then sign out by expiring the session cookies. */
export const DELETE = route(deleteAccount, async ({ ports, actor }) => {
  const result = await deleteAccountUseCase(ports, actor);
  const res = Response.json({ deleted: true, ownBucketRecordings: result.ownBucketRecordings });
  for (const name of SESSION_COOKIES) {
    const secure = name.startsWith('__Secure-') ? '; Secure' : '';
    res.headers.append(
      'Set-Cookie',
      `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`,
    );
  }
  return res;
});
