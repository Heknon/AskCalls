import { DomainError } from '@askcalls/domain';
import type { ResolvedConfig } from '../config/config-service';

/**
 * Google Drive as a user's recording store (spec 11.2a): the OAuth half that needs the client
 * secret. Tokens pass through here and are never stored, logged or cached.
 */

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH = 'https://oauth2.googleapis.com';
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface GoogleStorageClient {
  id: string;
  secret: string;
  redirectUri: string;
  tokenUrl: string;
  revokeUrl: string;
}

/**
 * The OAuth client for Drive: `storage.google` (STORAGE_GOOGLE_ID/SECRET), else the sign-in
 * client (AUTH_GOOGLE_ID/SECRET). Null when neither is set and in offline mode.
 */
export function googleStorageClient(resolved: ResolvedConfig): GoogleStorageClient | null {
  const { config } = resolved;
  if (config.offlineMode) return null;
  const own = config.storage.google;
  const pair =
    own.id && own.secret
      ? { id: own.id, secret: own.secret }
      : config.auth.google.id && config.auth.google.secret
        ? { id: config.auth.google.id, secret: config.auth.google.secret }
        : null;
  if (!pair) return null;
  const base =
    resolved.environment === 'test' && own.testOAuthUrl
      ? own.testOAuthUrl.replace(/\/+$/, '')
      : GOOGLE_OAUTH;
  return {
    ...pair,
    redirectUri: new URL('/api/storage/callback/google', config.appUrl).href,
    tokenUrl: `${base}/token`,
    revokeUrl: `${base}/revoke`,
  };
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const randomToken = (bytes = 32) =>
  base64url(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function authorizationUrl(
  client: GoogleStorageClient,
  state: string,
  challenge: string,
): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.search = new URLSearchParams({
    client_id: client.id,
    redirect_uri: client.redirectUri,
    response_type: 'code',
    scope: DRIVE_FILE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return u.href;
}

/** What the connect step keeps for the callback, in a signed cookie bound to the user. */
export interface OAuthFlow {
  state: string;
  verifier: string;
  ticket: string;
  expiresAt: number;
}

export const FLOW_TTL_MS = 10 * 60_000;
const FLOW_COOKIE = 'askcalls-storage-oauth';
const FLOW_PATH = '/api/storage/callback';

const flowKeys = new Map<string, Promise<CryptoKey>>();
function flowKey(secret: string): Promise<CryptoKey> {
  let key = flowKeys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(`askcalls-storage-oauth:${secret}`),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
    flowKeys.set(secret, key);
  }
  return key;
}

const flowMessage = (userId: string, value: string) =>
  new TextEncoder().encode(`${userId}\0${value}`);

export async function signFlow(secret: string, userId: string, flow: OAuthFlow): Promise<string> {
  const value = JSON.stringify(flow);
  const mac = await crypto.subtle.sign('HMAC', await flowKey(secret), flowMessage(userId, value));
  return `${base64url(new Uint8Array(mac))}.${base64url(new TextEncoder().encode(value))}`;
}

/** The flow when the signature holds for this user and it hasn't expired, else null. */
export async function verifyFlow(
  secret: string,
  userId: string,
  cookie: string | undefined,
  now: number,
): Promise<OAuthFlow | null> {
  if (!cookie || cookie.length > 2_048) return null;
  const [macPart = '', valuePart = '', ...rest] = cookie.split('.');
  const mac = fromBase64url(macPart);
  const bytes = fromBase64url(valuePart);
  if (mac?.length !== 32 || !bytes || rest.length) return null;
  const value = new TextDecoder().decode(bytes);
  const ok = await crypto.subtle.verify(
    'HMAC',
    await flowKey(secret),
    mac,
    flowMessage(userId, value),
  );
  if (!ok) return null;
  try {
    const flow = JSON.parse(value) as OAuthFlow;
    return typeof flow.expiresAt === 'number' && flow.expiresAt > now ? flow : null;
  } catch {
    return null;
  }
}

const flowName = (secure: boolean) => (secure ? `__Secure-${FLOW_COOKIE}` : FLOW_COOKIE);

/**
 * Lax, not Strict: the browser must send it on Google's top-level redirect back. Scoped to the
 * callback path, HttpOnly, gone after ten minutes or one use.
 */
export function flowCookieHeader(signed: string | null, secure: boolean): string {
  const attrs = `Path=${FLOW_PATH}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  return signed
    ? `${flowName(secure)}=${signed}; Max-Age=${FLOW_TTL_MS / 1000}; ${attrs}`
    : `${flowName(secure)}=; Max-Age=0; ${attrs}`;
}

export function flowCookieFrom(headers: Headers, secure: boolean): string | undefined {
  const name = flowName(secure);
  for (const part of (headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

type Fetch = typeof fetch;

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

async function tokenRequest(fetchImpl: Fetch, url: string, form: Record<string, string>) {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      cache: 'no-store',
    });
  } catch {
    throw new DomainError('provider_error', 'google unreachable', { status: null });
  }
  let json: TokenResponse = {};
  try {
    json = (await res.json()) as TokenResponse;
  } catch {
    // Not JSON: handled by the status below.
  }
  return { status: res.status, json };
}

export interface GrantedTokens {
  refreshToken: string;
  accessToken: string;
  expiresInSec: number;
}

/** Authorization code + PKCE verifier → tokens. Requires that drive.file was granted. */
export async function exchangeCode(
  fetchImpl: Fetch,
  client: GoogleStorageClient,
  code: string,
  verifier: string,
): Promise<GrantedTokens> {
  const { status, json } = await tokenRequest(fetchImpl, client.tokenUrl, {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    client_id: client.id,
    client_secret: client.secret,
    redirect_uri: client.redirectUri,
  });
  if (status !== 200 || !json.access_token || !json.refresh_token) {
    throw new DomainError('provider_error', 'google refused the code', { status });
  }
  if (!(json.scope ?? '').split(' ').includes(DRIVE_FILE_SCOPE)) {
    throw new DomainError('forbidden', 'drive.file was not granted');
  }
  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    expiresInSec: Math.max(60, Math.floor(json.expires_in ?? 3600)),
  };
}

export async function refreshAccessToken(
  fetchImpl: Fetch,
  client: GoogleStorageClient,
  refreshToken: string,
): Promise<{ accessToken: string; expiresInSec: number }> {
  const { status, json } = await tokenRequest(fetchImpl, client.tokenUrl, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: client.id,
    client_secret: client.secret,
  });
  if (status === 200 && json.access_token) {
    return {
      accessToken: json.access_token,
      expiresInSec: Math.max(60, Math.floor(json.expires_in ?? 3600)),
    };
  }
  if (json.error === 'invalid_grant' || status === 400 || status === 401) {
    throw new DomainError('forbidden', 'google refused the refresh token', { status });
  }
  throw new DomainError('provider_error', 'google token refresh failed', { status });
}

/** Revokes the grant. An already invalid token counts as revoked. */
export async function revokeToken(
  fetchImpl: Fetch,
  client: GoogleStorageClient,
  token: string,
): Promise<void> {
  const { status } = await tokenRequest(fetchImpl, client.revokeUrl, { token });
  if (status !== 200 && status !== 400) {
    throw new DomainError('provider_error', 'google revoke failed', { status });
  }
}
