import type { MemoryBlobStore } from '@askcalls/adapter-mocks';
import { createToken } from '@askcalls/api-contract/routes/tokens';
import {
  type ClientContext,
  createClientContext,
  KeySession,
  managedTranscriber,
} from '@askcalls/client-core';
import {
  FakeAudioCodec,
  FakeEmbedder,
  FakePasskeys,
  MemoryDeviceKeyStore,
  MemorySecretStore,
} from '@askcalls/client-core/testing/fakes';
import { sessionCookie, startTestApp, type TestApp } from './http';

/** Maps the mock blob store's presigned `mock://blob/<key>` URLs back to object keys. */
function blobKey(url: string): string {
  const prefix = 'mock://blob/';
  if (!url.startsWith(prefix)) throw new Error('not a mock blob URL');
  return decodeURIComponent(url.slice(prefix.length).split('?')[0]!);
}

export function blobTransport(blobs: MemoryBlobStore) {
  return {
    uploader: {
      async put(req: { url: string }, body: Uint8Array) {
        await blobs.put(blobKey(req.url), body);
      },
    },
    fetcher: {
      async get(req: { url: string }) {
        const data = await blobs.get(blobKey(req.url));
        if (!data) throw new Error('blob not found');
        return data;
      },
    },
  };
}

export type BlobTransport = ReturnType<typeof blobTransport>;

export interface ClientDevice {
  session: KeySession;
  ctx: ClientContext;
  deviceKeys: MemoryDeviceKeyStore;
  secrets: MemorySecretStore;
}

export interface ClientHarness {
  app: TestApp;
  userId: string;
  cookie: string;
  passkeys: FakePasskeys;
  embedder: FakeEmbedder;
  /** A browser signed in with the session cookie. */
  browser(): ClientDevice;
  /** An agent with a personal access token (`read write ask keys`). */
  agent(): Promise<ClientDevice>;
}

/**
 * The memory container behind the real Next.js route handlers, with client-core devices whose
 * typed API client dispatches in-process. Tests only.
 */
export async function startClientHarness(
  opts: Parameters<typeof startTestApp>[0] & { transport?: BlobTransport } = {},
): Promise<ClientHarness> {
  const { transport: blobs, ...appOpts } = opts;
  const app = startTestApp(appOpts);
  const user = await app.ports.users.create({ email: 'owner@example.test' });
  const cookie = await sessionCookie(user.id);
  const embedder = new FakeEmbedder();
  const audio = new FakeAudioCodec();
  const transport = blobs ?? blobTransport(app.ports.blobStore);

  const device = (api: ReturnType<TestApp['client']>, extractable: boolean): ClientDevice => {
    const session = new KeySession({ idleTimeoutMs: 0 });
    return {
      session,
      deviceKeys: new MemoryDeviceKeyStore(extractable),
      secrets: new MemorySecretStore(),
      ctx: createClientContext({
        api,
        session,
        embedder,
        audio,
        transcriber: managedTranscriber(api),
        clock: app.ports.clock,
        ...transport,
      }),
    };
  };

  return {
    app,
    userId: user.id,
    cookie,
    passkeys: new FakePasskeys(),
    embedder,
    browser: () => device(app.client({ cookie }), false),
    async agent() {
      const { token } = await app.client({ cookie }).request(createToken, {
        body: { name: 'agent', scopes: ['read', 'write', 'ask', 'keys'], expiresInDays: null },
      });
      return device(app.client({ token }), true);
    },
  };
}
