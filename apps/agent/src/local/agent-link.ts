import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiError } from '@askcalls/api-contract';
import { listKeyring } from '@askcalls/api-contract/routes/keyring';
import { DeviceLinkJoiner, KeySession, type SecretStore } from '@askcalls/client-core';
import { z } from 'zod';
import { SecretStoreDeviceKeys } from '../adapters/device-keys';
import { type AgentDeps, apiClient, storeToken } from '../agent';
import { saveConfig } from '../config';

/**
 * The agent side of the local-mode link (spec 11.2c; the browser side is apps/web
 * client/local-agent-link.ts). `askcalls local` listens on 127.0.0.1 on a random port at
 * `/link/<nonce>` and hands that URL to the server it starts, whose pages are the only ones that
 * carry it. After the user unlocks, the browser posts a new personal access token and a device
 * link code; this side checks the token, joins the link (spec 6.5) and answers with its
 * fingerprint, which the browser compares with the key the server reports before it sends RK.
 * The listener accepts one link, from the app origin only, then reports `linked`.
 */
export type LinkState = 'waiting' | 'linking' | 'linked' | 'failed';

const Body = z.object({
  token: z.string().regex(/^ac_[A-Za-z0-9_-]{43}$/),
  code: z.string().min(16).max(2048),
});

const MAX_BODY = 8 * 1024;
const POLL_MS = 1_000;
const LINK_TTL_MS = 10 * 60_000;

export interface LocalAgentLinkListener {
  url: string;
  state(): LinkState;
  /** Resolves once the agent holds a token and RK; rejects when a link attempt failed. */
  linked: Promise<void>;
  /** The agent turned out to be linked already: answer `linked` and accept nothing. */
  markLinked(): void;
  close(): void;
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function startLocalAgentLink(opts: {
  /** The local instance, e.g. `http://localhost:4317`; the only origin allowed to call. */
  origin: string;
  dir: string;
  secrets: SecretStore;
  deviceLabel: string;
  deps?: Pick<AgentDeps, 'fetch'>;
  pollMs?: number;
}): Promise<LocalAgentLinkListener> {
  const nonce = randomBytes(32).toString('base64url');
  const path = `/link/${nonce}`;
  let state: LinkState = 'waiting';
  let settle: { resolve: () => void; reject: (e: Error) => void };
  const linked = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });
  linked.catch(() => {});

  const cors = {
    'Access-Control-Allow-Origin': opts.origin,
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  async function join(token: string, code: string): Promise<string> {
    const api = apiClient(opts.origin, token, opts.deps ?? {});
    await api.request(listKeyring, {});
    const deviceKeys = new SecretStoreDeviceKeys(opts.secrets);
    const joiner = await DeviceLinkJoiner.join({
      api,
      code,
      deviceLabel: opts.deviceLabel,
      deviceKeys,
    });
    const session = new KeySession({ idleTimeoutMs: 0 });
    const deadline = Date.now() + LINK_TTL_MS;
    (async () => {
      for (;;) {
        const r = await joiner.poll({
          session,
          deviceKeys,
          storage: { kind: 'device-secret', secrets: opts.secrets },
        });
        if (r.state === 'completed') break;
        if (r.state === 'expired' || Date.now() > deadline) {
          throw new Error('the link was not confirmed');
        }
        await new Promise((r) => setTimeout(r, opts.pollMs ?? POLL_MS));
      }
      session.lock();
      await storeToken(opts.secrets, token);
      await saveConfig(opts.dir, { server: opts.origin });
    })().then(
      () => {
        state = 'linked';
        settle.resolve();
      },
      (e: unknown) => {
        state = 'failed';
        settle.reject(e instanceof Error ? e : new Error('the link failed'));
      },
    );
    return joiner.fingerprint;
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (!same(url.pathname, path) || req.headers.origin !== opts.origin) {
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    if (req.method === 'GET') return send(res, 200, { state });
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    if (state !== 'waiting') return send(res, 409, { state });
    const type = req.headers['content-type'] ?? '';
    const raw = type.startsWith('application/json') ? await readBody(req) : null;
    let body: z.output<typeof Body>;
    try {
      body = Body.parse(JSON.parse(raw ?? ''));
    } catch {
      return send(res, 400, { error: 'invalid' });
    }
    state = 'linking';
    try {
      send(res, 200, { fingerprint: await join(body.token, body.code) });
    } catch (e) {
      state = 'failed';
      settle.reject(e instanceof Error ? e : new Error('the link failed'));
      send(res, e instanceof ApiError && e.status === 401 ? 401 : 502, { error: 'link' });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}${path}`,
    state: () => state,
    linked,
    markLinked: () => {
      if (state === 'waiting') state = 'linked';
    },
    close: () => server.close(),
  };
}
