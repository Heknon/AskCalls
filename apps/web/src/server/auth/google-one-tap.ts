import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';
import type { ExternalIdentity } from './adapter';

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

let googleKeys: JWTVerifyGetKey | null = null;
const defaultKeys = () => {
  googleKeys ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  return googleKeys;
};

/**
 * Verifies a Google One Tap credential (an ID token): RS256 signature against Google's JWKS,
 * issuer, audience = our Google client id, and expiry. Returns the identity or null.
 */
export async function verifyGoogleIdToken(
  credential: string,
  clientId: string,
  keys: JWTVerifyGetKey = defaultKeys(),
): Promise<ExternalIdentity | null> {
  try {
    const { payload } = await jwtVerify(credential, keys, {
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
      algorithms: ['RS256'],
    });
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
    return {
      provider: 'google',
      providerAccountId: payload.sub,
      type: 'oidc',
      email: str(payload.email),
      emailVerified: payload.email_verified === true,
      name: str(payload.name),
      image: str(payload.picture),
    };
  } catch {
    return null;
  }
}
