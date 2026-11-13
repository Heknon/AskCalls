import type { ApiClient } from '@askcalls/api-contract';
import { createToken } from '@askcalls/api-contract/routes/tokens';
import type { KeySession } from '@askcalls/client-core';
import {
  checkDeviceLink,
  confirmDeviceLink,
  startDeviceLink,
} from '@askcalls/client-core/device-link';
import { z } from 'zod';

const Status = z.object({ state: z.enum(['waiting', 'linking', 'linked', 'failed']) });
const Joined = z.object({ fingerprint: z.string().regex(/^\d{6}$/) });

export type LocalAgentLinkResult = 'linked' | 'not-waiting' | 'mismatch';

/**
 * Local mode (spec 11.2c): links the `askcalls local` process that started this server, so
 * `askcalls mcp` needs neither `login` nor `link`. It is the device link of spec 6.5 with both
 * human steps done by the two programs: this browser creates a personal access token and a link
 * session and posts both to the agent's loopback listener, whose URL only this server's pages
 * carry (with a one-time nonce); the agent joins and answers with the fingerprint it computed.
 * RK is sent only when that fingerprint equals the one of the key the server reports, exactly
 * the comparison a person would make between two screens.
 */
export async function linkLocalAgent(opts: {
  url: string;
  api: ApiClient;
  session: KeySession;
  fetch?: typeof fetch;
  pollMs?: number;
}): Promise<LocalAgentLinkResult> {
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const status = Status.parse(await (await f(opts.url, { cache: 'no-store' })).json());
  if (status.state !== 'waiting') return 'not-waiting';

  const { token } = await opts.api.request(createToken, {
    body: {
      name: 'askcalls agent (this computer)',
      scopes: ['read', 'write', 'ask', 'keys'],
      expiresInDays: null,
    },
  });
  const link = await startDeviceLink({ api: opts.api, session: opts.session });
  const res = await f(opts.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, code: link.code }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`the agent refused the link (${res.status})`);
  const { fingerprint } = Joined.parse(await res.json());

  const deadline = Date.now() + 60_000;
  for (;;) {
    const s = await checkDeviceLink(opts.api, link);
    if (s.state === 'waiting_for_confirmation') {
      if (s.fingerprint !== fingerprint) return 'mismatch';
      await confirmDeviceLink({ api: opts.api, session: opts.session }, link, s.devicePublicKey);
      return 'linked';
    }
    if (s.state !== 'waiting_for_device' || Date.now() > deadline) {
      throw new Error('the agent did not join the link');
    }
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 500));
  }
}
