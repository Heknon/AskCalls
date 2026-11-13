import { type ApiClient, createApiClient } from '@askcalls/api-contract';
import { getClientConfig } from '@askcalls/api-contract/routes/account';
import {
  type AudioCodec,
  type BlobFetcher,
  type ClientContext,
  type Clock,
  createClientContext,
  DEVICE_SECRETS,
  type Embedder,
  KeySession,
  type RecordingUploader,
  type SecretStore,
  unlockWithDevice,
} from '@askcalls/client-core';
import { fromUtf8, utf8 } from '@askcalls/crypto';
import { isDomainError } from '@askcalls/domain';
import { FfmpegAudioCodec } from './adapters/audio';
import { SecretStoreDeviceKeys } from './adapters/device-keys';
import { TransformersEmbedder } from './adapters/embedder';
import { fetchBlobTransport } from './adapters/http';
import { openSecretStore, type SecretStoreKind } from './adapters/secret-store';
import { transcriberFor } from './adapters/transcriber';
import { type AgentConfig, dataDir, loadConfig, paths } from './config';

/** The personal access token, next to the device secrets of `DEVICE_SECRETS`. */
export const API_TOKEN_SECRET = 'api-token';

export class NotLoggedInError extends Error {
  constructor() {
    super(
      'not logged in. Run: bunx askcalls login --url <your AskCalls server>. With AskCalls on this computer, start askcalls local and unlock in the browser instead.',
    );
    this.name = 'NotLoggedInError';
  }
}

export class NotLinkedError extends Error {
  constructor() {
    super(
      'this computer is not linked to your account yet. Open Settings → Devices → Link a device in the app, then run: bunx askcalls link',
    );
    this.name = 'NotLinkedError';
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Overrides for tests; production uses the defaults. */
export interface AgentDeps {
  dir?: string;
  env?: NodeJS.ProcessEnv;
  secrets?: { store: SecretStore; kind: SecretStoreKind };
  fetch?: FetchLike;
  embedder?: Embedder;
  audio?: AudioCodec | null;
  blobs?: RecordingUploader & BlobFetcher;
  clock?: Clock;
}

export interface AgentAccount {
  dir: string;
  config: AgentConfig;
  origin: string;
  secrets: SecretStore;
  secretsKind: SecretStoreKind;
  /** The typed API client authenticated with the stored token. */
  api: ApiClient;
}

export async function openSecrets(
  origin: string,
  deps: AgentDeps,
): Promise<{ store: SecretStore; kind: SecretStoreKind }> {
  if (deps.secrets) return deps.secrets;
  const dir = deps.dir ?? dataDir(deps.env);
  return openSecretStore({
    scope: origin,
    filePath: paths(dir).secrets,
    ...(deps.env && { env: deps.env }),
  });
}

export const apiClient = (origin: string, token: string, deps: AgentDeps) =>
  createApiClient({ baseUrl: origin, token, ...(deps.fetch && { fetch: deps.fetch }) });

/** The logged-in account: server from config.json, token from the keychain. */
export async function openAccount(deps: AgentDeps = {}): Promise<AgentAccount> {
  const dir = deps.dir ?? dataDir(deps.env);
  const config = await loadConfig(dir);
  if (!config.server) throw new NotLoggedInError();
  const origin = config.server;
  const { store, kind } = await openSecrets(origin, deps);
  const token = await store.get(API_TOKEN_SECRET);
  if (!token) throw new NotLoggedInError();
  return {
    dir,
    config,
    origin,
    secrets: store,
    secretsKind: kind,
    api: apiClient(origin, fromUtf8(token), deps),
  };
}

export async function storeToken(secrets: SecretStore, token: string): Promise<void> {
  await secrets.set(API_TOKEN_SECRET, utf8(token));
}

export async function isLinked(secrets: SecretStore): Promise<boolean> {
  return (await secrets.get(DEVICE_SECRETS.wrappedRootKey)) !== null;
}

/**
 * Where the agent downloads the embedding model: ASKCALLS_MODEL_URL when set, else the linked
 * instance's EMBEDDING_MODEL_URL, else the instance's own `/models/` (also when it cannot say).
 */
export async function modelHost(
  account: Pick<AgentAccount, 'api' | 'origin'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (env.ASKCALLS_MODEL_URL) return env.ASKCALLS_MODEL_URL;
  const config = await account.api.request(getClientConfig, {}).catch(() => null);
  return config?.embeddingModelUrl ?? `${account.origin}/models`;
}

export interface UnlockedAgent extends AgentAccount {
  session: KeySession;
  ctx: ClientContext;
}

/**
 * Unlocks with the RK wrapped under the keychain's device secret (spec 6.5 step 5) and builds the
 * client context: Node adapters, and the transcriber chosen in Settings → Providers. The agent
 * never auto-locks (idle timeout 0); its keys live as long as the process.
 */
export async function unlockAgent(
  account: AgentAccount,
  deps: AgentDeps = {},
): Promise<UnlockedAgent> {
  const session = new KeySession({ idleTimeoutMs: 0 });
  const deviceKeys = new SecretStoreDeviceKeys(account.secrets);
  try {
    await unlockWithDevice({ session, secrets: account.secrets, deviceKeys });
  } catch (e) {
    if (isDomainError(e) && e.code === 'not_found') throw new NotLinkedError();
    throw e;
  }
  const blobs = deps.blobs ?? fetchBlobTransport();
  const dirs = paths(account.dir);
  const audio = deps.audio === undefined ? await FfmpegAudioCodec.create(dirs.runtime) : deps.audio;
  const base = createClientContext({
    api: account.api,
    session,
    embedder:
      deps.embedder ??
      new TransformersEmbedder(dirs, { modelUrl: () => modelHost(account, deps.env) }),
    ...(audio && { audio }),
    ...(deps.clock && { clock: deps.clock }),
    uploader: blobs,
    fetcher: blobs,
  });
  const providers = await base.userData.get('providers');
  let transcriber: ClientContext['transcriber'] = null;
  try {
    transcriber = transcriberFor(account.api, providers.transcription);
  } catch {
    // A broken own-key setting turns transcription off; transcripts still ingest.
  }
  const ctx: ClientContext = { ...base, transcriber };
  return { ...account, session, ctx };
}
