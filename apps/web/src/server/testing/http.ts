import { createApiClient } from '@askcalls/api-contract';
import type { Limits, Ports } from '@askcalls/domain';
import { encode } from 'next-auth/jwt';
import * as account from '../../app/api/account/route';
import * as adminInstanceOffline from '../../app/api/admin/instance/offline/route';
import * as adminInstance from '../../app/api/admin/instance/route';
import * as adminInstanceTest from '../../app/api/admin/instance/test/route';
import * as adminUserLimits from '../../app/api/admin/users/[id]/limits/route';
import * as adminUser from '../../app/api/admin/users/[id]/route';
import * as adminUsers from '../../app/api/admin/users/route';
import * as ask from '../../app/api/ask/route';
import * as audit from '../../app/api/audit/route';
import * as callContent from '../../app/api/calls/[id]/content/route';
import * as recording from '../../app/api/calls/[id]/recording/route';
import * as recordingUpload from '../../app/api/calls/[id]/recording-upload/route';
import * as callById from '../../app/api/calls/[id]/route';
import * as calls from '../../app/api/calls/route';
import * as clientConfig from '../../app/api/client-config/route';
import * as cron from '../../app/api/cron/retention/route';
import * as linkSession from '../../app/api/devices/link/[session]/route';
import * as link from '../../app/api/devices/link/route';
import * as inboxById from '../../app/api/inbox/[id]/route';
import * as inbox from '../../app/api/inbox/route';
import * as keyringById from '../../app/api/keyring/[id]/route';
import * as keyring from '../../app/api/keyring/route';
import * as me from '../../app/api/me/route';
import * as search from '../../app/api/search/route';
import * as directAccess from '../../app/api/settings/direct-access/route';
import * as retention from '../../app/api/settings/retention/route';
import * as setupComplete from '../../app/api/setup/complete/route';
import * as setupPasskey from '../../app/api/setup/passkey/route';
import * as setup from '../../app/api/setup/route';
import * as setupTest from '../../app/api/setup/test/route';
import * as consent from '../../app/api/telemetry/consent/route';
import * as telemetryErrors from '../../app/api/telemetry/errors/route';
import * as telemetryEvents from '../../app/api/telemetry/events/route';
import * as tokens from '../../app/api/tokens/route';
import * as transcribe from '../../app/api/transcribe/route';
import * as transcribeToken from '../../app/api/transcribe/token/route';
import * as translate from '../../app/api/translate/route';
import * as userdata from '../../app/api/userdata/[kind]/route';
import * as vocab from '../../app/api/vocab/route';
import { SESSION_COOKIES } from '../auth/secret';
import { ConfigService } from '../config/config-service';
import { setContainerForTests } from '../container';
import type { NextHandler } from '../http/handler';
import { makeTestPorts, type TestPorts } from './ports';

type Module = Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', NextHandler>>;

/** Every API route module, by its Next.js path pattern. */
export const ROUTES: Array<[string, Module]> = [
  ['/api/me', me],
  ['/api/client-config', clientConfig],
  ['/api/account', account],
  ['/api/keyring', keyring],
  ['/api/keyring/[id]', keyringById],
  ['/api/devices/link', link],
  ['/api/devices/link/[session]', linkSession],
  ['/api/transcribe', transcribe],
  ['/api/transcribe/token', transcribeToken],
  ['/api/telemetry/consent', consent],
  ['/api/telemetry/events', telemetryEvents],
  ['/api/telemetry/errors', telemetryErrors],
  ['/api/ask', ask],
  ['/api/translate', translate],
  ['/api/calls', calls],
  ['/api/calls/[id]', callById],
  ['/api/calls/[id]/recording-upload', recordingUpload],
  ['/api/calls/[id]/content', callContent],
  ['/api/calls/[id]/recording', recording],
  ['/api/search', search],
  ['/api/vocab', vocab],
  ['/api/userdata/[kind]', userdata],
  ['/api/inbox', inbox],
  ['/api/inbox/[id]', inboxById],
  ['/api/tokens', tokens],
  ['/api/audit', audit],
  ['/api/settings/retention', retention],
  ['/api/settings/direct-access', directAccess],
  ['/api/cron/retention', cron],
  ['/api/admin/instance', adminInstance],
  ['/api/admin/instance/test', adminInstanceTest],
  ['/api/admin/instance/offline', adminInstanceOffline],
  ['/api/admin/users', adminUsers],
  ['/api/admin/users/[id]', adminUser],
  ['/api/admin/users/[id]/limits', adminUserLimits],
  ['/api/setup', setup],
  ['/api/setup/test', setupTest],
  ['/api/setup/passkey', setupPasskey],
  ['/api/setup/complete', setupComplete],
];

function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/');
  const s = path.split('/');
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]!;
    if (seg.startsWith('[')) params[seg.slice(1, -1)] = decodeURIComponent(s[i]!);
    else if (seg !== s[i]) return null;
  }
  return params;
}

/** Routes a Request to the real Next.js handler, the way the App Router would. */
export async function dispatch(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  for (const [pattern, mod] of ROUTES) {
    const params = match(pattern, pathname);
    if (!params) continue;
    const handler = mod[req.method as keyof Module];
    if (!handler) return new Response(null, { status: 405 });
    return handler(req, { params: Promise.resolve(params) });
  }
  return new Response(null, { status: 404 });
}

export const AUTH_SECRET = 'test-auth-secret-0123456789abcdef0123456789';
export const CRON_SECRET = 'test-cron-secret-0123456789';

export async function sessionCookie(userId: string, secret = AUTH_SECRET): Promise<string> {
  const name = SESSION_COOKIES[1];
  const jwt = await encode({ token: { sub: userId }, secret, salt: name });
  return `${name}=${jwt}`;
}

export type Credential = { cookie: string } | { token: string } | null;

export interface TestApp {
  ports: TestPorts;
  /** Raw request against the handlers. */
  req(
    method: string,
    path: string,
    opts?: {
      as?: Credential;
      json?: unknown;
      raw?: { bytes: Uint8Array; contentType: string };
      headers?: Record<string, string>;
    },
  ): Promise<Response>;
  /** The typed contract client, signed in as `as`. */
  client(as: Credential): ReturnType<typeof createApiClient>;
  close(): void;
}

export function startTestApp(
  opts: {
    env?: Record<string, string>;
    limits?: Partial<Limits>;
    llm?: boolean;
    translation?: boolean;
    transcription?: boolean;
    /** Real adapters in place of the in-memory ones (the PGlite + fs leak test). */
    adapters?: Partial<Ports>;
  } = {},
): TestApp {
  const config = new ConfigService({
    NODE_ENV: 'test',
    DB_DRIVER: 'memory',
    BLOB_DRIVER: 'memory',
    TRANSCRIPTION_PROVIDER: 'mock',
    LLM_PROVIDER: 'mock',
    AUTH_SECRET,
    CRON_SECRET,
    ...opts.env,
  }).loadFromEnvOnly();
  const ports: TestPorts = {
    ...makeTestPorts({
      ...(opts.limits && { limits: opts.limits }),
      ...(opts.llm !== undefined && { llm: opts.llm }),
      ...(opts.translation !== undefined && { translation: opts.translation }),
      ...(opts.transcription !== undefined && { transcription: opts.transcription }),
    }),
    ...opts.adapters,
  };
  setContainerForTests({ config, ports, restartRequired: [], close: async () => {} });

  const headersFor = (as: Credential | undefined): Record<string, string> => {
    if (!as) return {};
    return 'cookie' in as ? { cookie: as.cookie } : { authorization: `Bearer ${as.token}` };
  };
  const fetchLike = (as: Credential) => (url: string, init: RequestInit) =>
    dispatch(
      new Request(new URL(url, 'http://localhost'), {
        ...init,
        headers: { ...(init.headers as Record<string, string>), ...headersFor(as) },
      }),
    );

  return {
    ports,
    async req(method, path, o = {}) {
      const headers: Record<string, string> = { ...headersFor(o.as), ...o.headers };
      let body: BodyInit | undefined;
      if (o.json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(o.json);
      } else if (o.raw) {
        headers['content-type'] = o.raw.contentType;
        body = o.raw.bytes as BodyInit;
      }
      return dispatch(
        new Request(`http://localhost${path}`, { method, headers, ...(body && { body }) }),
      );
    },
    client: (as) => createApiClient({ baseUrl: 'http://localhost', fetch: fetchLike(as) }),
    close: () => setContainerForTests(null),
  };
}
