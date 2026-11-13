import { type StorageConnectMessage, storageCallback } from '@askcalls/api-contract/routes/storage';
import { isDomainError } from '@askcalls/domain';
import { audit } from '@askcalls/domain/use-cases/context';
import { authSecret } from '../../../../../server/auth/secret';
import { newNonce } from '../../../../../server/http/csp';
import { route } from '../../../../../server/http/handler';
import { guardedFetch } from '../../../../../server/http/offline-fetch';
import {
  exchangeCode,
  flowCookieFrom,
  flowCookieHeader,
  googleStorageClient,
  verifyFlow,
} from '../../../../../server/storage/google';

/** Same-origin channel for when the consent page cut the popup off from its opener. */
const CHANNEL = 'askcalls-storage';

/**
 * Hands the result to the window that opened the popup, then closes. Tokens exist only in this
 * response: never stored, logged or cached. The page runs one inline script, under a nonce.
 */
function handOff(message: StorageConnectMessage | null, secure: boolean): Response {
  const nonce = newNonce();
  const json = JSON.stringify(message).replace(/</g, '\\u003c');
  const script = `(function(){var m=${json};if(m){try{if(window.opener)window.opener.postMessage(m,location.origin)}catch(e){}try{var c=new BroadcastChannel(${JSON.stringify(CHANNEL)});c.postMessage(m);c.close()}catch(e){}}window.close()})()`;
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>AskCalls</title></head><body><script nonce="${nonce}">${script}</script></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        'Referrer-Policy': 'no-referrer',
        'Set-Cookie': flowCookieHeader(null, secure),
      },
    },
  );
}

export const GET = route(
  storageCallback,
  async ({ req, container, ports, actor, query }) => {
    const secure = new URL(req.url).protocol === 'https:';
    const secret = authSecret(container.config);
    const client = googleStorageClient(container.config);
    const flow = secret
      ? await verifyFlow(
          secret,
          actor.userId,
          flowCookieFrom(req.headers, secure),
          ports.clock.now().getTime(),
        )
      : null;
    if (!flow || !client || !query.state || query.state !== flow.state) {
      return handOff(null, secure);
    }
    const base = { type: 'askcalls:storage', ticket: flow.ticket } as const;
    if (query.error || !query.code) {
      const error = query.error === 'access_denied' ? 'denied' : 'failed';
      return handOff({ ...base, ok: false, error }, secure);
    }
    try {
      const tokens = await exchangeCode(
        guardedFetch(container.config.config.offlineMode),
        client,
        query.code,
        flow.verifier,
      );
      await audit(ports, actor, actor.userId, 'storage.link', null, { provider: 'google' });
      return handOff({ ...base, ok: true, ...tokens }, secure);
    } catch (e) {
      const error = isDomainError(e) && e.code === 'forbidden' ? 'scope' : 'failed';
      return handOff({ ...base, ok: false, error }, secure);
    }
  },
  { rateLimit: { name: 'storage-callback', limit: 10, windowMs: 60_000 } },
);
