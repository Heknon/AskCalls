import { createToken } from '@askcalls/api-contract/routes/tokens';
import { Onboarding, processInbox, searchCalls } from '@askcalls/client-core';
import type { ApiScope } from '@askcalls/domain';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ClientDevice,
  type ClientHarness,
  startClientHarness,
} from '../../../server/testing/client';
import { ENGLISH_CALL, INBOX_CALL } from '../../../server/testing/samples';
import * as wellKnown from '../../.well-known/oauth-protected-resource/[[...path]]/route';
import * as mcp from './route';

const URL_ = 'http://localhost:3000/api/mcp';
const METADATA = 'http://localhost:3000/.well-known/oauth-protected-resource/api/mcp';

let h: ClientHarness;
let browser: ClientDevice;
const clients: Client[] = [];
const tokens = new Map<string, string>();

/** One token per scope set: the free tier allows five. */
async function tokenWith(scopes: ApiScope[]): Promise<string> {
  const key = scopes.join(' ');
  if (!tokens.has(key)) {
    const { token } = await h.app.client({ cookie: h.cookie }).request(createToken, {
      body: { name: `mcp ${key}`, scopes, expiresInDays: null },
    });
    tokens.set(key, token);
  }
  return tokens.get(key)!;
}

const handler = (req: Request) => {
  const fn = mcp[req.method as 'GET' | 'POST' | 'DELETE'];
  return fn ? fn(req) : Promise.resolve(new Response(null, { status: 405 }));
};

const rpc = (
  headers: Record<string, string>,
  body: unknown = { jsonrpc: '2.0', id: 1, method: 'tools/list' },
) =>
  handler(
    new Request(URL_, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(URL_), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
      fetch: (url, init) => handler(new Request(url, init)),
    }),
  );
  clients.push(client);
  return client;
}

async function tool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const r = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: Array<{ text: string }>;
  };
  return { isError: r.isError === true, text: r.content[0]!.text };
}

beforeAll(async () => {
  h = await startClientHarness();
  browser = h.browser();
  const o = await Onboarding.begin(h.userId);
  const [g1, g2] = o.confirmationGroups;
  o.confirmRecovery({ [g1]: o.recoveryGroups[g1]!, [g2]: o.recoveryGroups[g2]! });
  await o.finish({
    api: browser.ctx.api,
    session: browser.session,
    deviceKeys: browser.deviceKeys,
    deviceLabel: 'Laptop',
  });
});

afterAll(async () => {
  for (const c of clients) await c.close();
  h.app.close();
});

describe('remote MCP at /api/mcp', () => {
  it('answers 401 with a pointer to the protected-resource metadata without a token', async () => {
    const res = await rpc({});
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${METADATA}"`);

    const invalid = await rpc({ authorization: `Bearer ac_${'x'.repeat(43)}` });
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get('www-authenticate')).toMatch(
      /^Bearer error="invalid_token", resource_metadata=/,
    );

    const cookieOnly = await rpc({ cookie: h.cookie });
    expect(cookieOnly.status).toBe(401);
  });

  it('serves the protected-resource metadata at the path-suffixed and root URLs', async () => {
    for (const path of [['api', 'mcp'], undefined]) {
      const res = await wellKnown.GET(new Request(METADATA), { params: Promise.resolve({ path }) });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        resource: URL_,
        bearer_methods_supported: ['header'],
        scopes_supported: ['read', 'write'],
      });
    }
    const other = await wellKnown.GET(new Request(METADATA), {
      params: Promise.resolve({ path: ['api', 'calls'] }),
    });
    expect(other.status).toBe(404);
  });

  it('refuses a token without read or write with 403 insufficient_scope', async () => {
    const res = await rpc({ authorization: `Bearer ${await tokenWith(['ask', 'keys'])}` });
    expect(res.status).toBe(403);
    expect(res.headers.get('www-authenticate')).toMatch(
      /error="insufficient_scope", scope="read write"/,
    );
  });

  it('offers each tool only with its scope', async () => {
    const names = async (scopes: ApiScope[]) =>
      (await (await connect(await tokenWith(scopes))).listTools()).tools.map((t) => t.name).sort();
    expect(await names(['read'])).toEqual(['account_status', 'list_recent_calls']);
    expect(await names(['write'])).toEqual(['account_status', 'inbox_upload']);
  });

  it('inbox_upload seals the transcript; processInbox ingests it on the next unlock', async () => {
    const client = await connect(await tokenWith(['read', 'write']));
    const up = await tool(client, 'inbox_upload', {
      transcript_text: INBOX_CALL.text,
      phone: INBOX_CALL.phone,
      direction: 'in',
    });
    expect(up.isError).toBe(false);
    expect(up.text).toMatch(/saw this content in transit/);
    const items = [...h.app.ports.db.inbox.values()];
    expect(items).toHaveLength(1);
    const stored = new TextDecoder('utf-8', { fatal: false }).decode(items[0]!.payloadCt!);
    for (const w of INBOX_CALL.words) expect(stored).not.toContain(w);

    expect(JSON.parse((await tool(client, 'account_status')).text)).toMatchObject({
      plan: 'free',
      calls: 0,
      pending_inbox_items: 1,
      encryption_set_up: true,
    });
    expect(await processInbox(browser.ctx)).toEqual({ processed: 1, duplicates: 0, failed: [] });
    const found = await searchCalls(browser.ctx, { text: 'xylophonix' });
    expect(found.items.map((i) => i.meta.phoneE164)).toEqual([INBOX_CALL.e164]);
    expect(JSON.parse((await tool(client, 'account_status')).text).pending_inbox_items).toBe(0);
  });

  it('list_recent_calls returns ids, days and durations only, and points to the agent', async () => {
    const client = await connect(await tokenWith(['read']));
    const r = await tool(client, 'list_recent_calls', { days: 3650 });
    const body = JSON.parse(r.text);
    expect(body.count).toBe(1);
    expect(Object.keys(body.calls[0]).sort()).toEqual(['day', 'duration', 'id']);
    expect(body.note).toMatch(/bunx askcalls mcp/);
    for (const w of [
      ...INBOX_CALL.words,
      INBOX_CALL.e164,
      INBOX_CALL.contactName,
      ENGLISH_CALL.e164,
    ]) {
      expect(r.text).not.toContain(w);
    }
  });

  it('is stateless: GET is refused once authenticated', async () => {
    const res = await handler(
      new Request(URL_, { headers: { authorization: `Bearer ${await tokenWith(['read'])}` } }),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
});
