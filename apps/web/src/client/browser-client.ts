import { type ApiClient, createApiClient } from '@askcalls/api-contract';
import { putDirectAccess } from '@askcalls/api-contract/routes/settings';
import type { BulkStateStore } from '@askcalls/client-core/bulk/queue';
import { type ClientContext, createClientContext } from '@askcalls/client-core/context';
import type {
  DeviceKeyStore,
  Embedder,
  FetchLike,
  SecretStore,
  Translator,
} from '@askcalls/client-core/ports/index';
import { knownStores } from '@askcalls/client-core/recording-stores/refs';
import { RecordingStores } from '@askcalls/client-core/recording-stores/router';
import { bucketOrigin } from '@askcalls/client-core/recording-stores/s3-compatible';
import { KeySession } from '@askcalls/client-core/session';
import { managedTranscriber } from '@askcalls/client-core/transcription';
import type { Providers } from '@askcalls/client-core/userdata';
import { BrowserAudioCodec } from './adapters/audio/codec';
import { BrowserBulkFiles } from './adapters/bulk-files';
import { type EmbedderStatus, WorkerEmbedder } from './adapters/embedder/embedder';
import { DeviceDb } from './adapters/idb';
import { SettingsTranscriber } from './adapters/own-key-transcriber';
import { WebAuthnPasskeyAuthenticator } from './adapters/passkey';
import { IdbBulkStateStore, IdbDeviceKeyStore, IdbSecretStore } from './adapters/stores';
import { FetchBlobFetcher, FetchRecordingUploader } from './adapters/transfer';
import {
  type DirectAccess,
  directOrigins,
  encodeDirectCookie,
  GOOGLE_DRIVE_PROVIDER,
  normalizeOrigin,
  PROVIDER_ORIGINS,
} from './direct-origins';
import { BlobUrls, installLockRules } from './lock';
import { readConnectSrc, readEmbeddingModelUrl } from './runtime-config';

export interface BrowserClient {
  /** client-core's context: pass it to every use case (ingest, search, calls, …). */
  ctx: ClientContext;
  api: ApiClient;
  session: KeySession;
  secrets: SecretStore;
  deviceKeys: DeviceKeyStore;
  passkeys: WebAuthnPasskeyAuthenticator;
  bulkState: BulkStateStore;
  bulkFiles: BrowserBulkFiles;
  embedder: Embedder;
  /**
   * The model's first-load status (download progress for the UI); null when a stand-in
   * embedder replaces the model.
   */
  embedderStatus(): EmbedderStatus | null;
  onEmbedderStatus(listener: (s: EmbedderStatus) => void): () => void;
  audio: BrowserAudioCodec;
  /** The user's own recording stores (S3-compatible buckets, Google Drive). */
  ownStores: RecordingStores;
  /** Object URLs for decrypted media; revoked on lock. */
  blobUrls: BlobUrls;
  /**
   * Registers the own-key providers and bucket with the server, which sets the signed
   * `askcalls-direct` cookie so the next page load's CSP allows them. Runs after every unlock;
   * call it after saving Settings → Providers. `stale: true` means this page's CSP blocks an
   * origin the providers now need: reload to apply it. Removed origins need no reload.
   */
  syncDirectAccess(): Promise<{ stale: boolean }>;
  /** Removes the cookie (sign-out). */
  clearDirectAccess(): Promise<void>;
  /** Removes listeners, stops workers and locks. */
  dispose(): void;
}

export interface BrowserClientOptions {
  /** Auto-lock idle timeout; applyAutoLockSetting() replaces it from settings after unlock. */
  idleTimeoutMs?: number;
  fetch?: FetchLike;
  /** IndexedDB database name (tests use their own). */
  dbName?: string;
  /** Called when the sync after an unlock finds this page's CSP stale. */
  onDirectAccessChange?: () => void;
  /** Keep the embedding worker (and model) loaded across locks. Default false. */
  keepEmbedderOnLock?: boolean;
  /** Replaces the model worker (the e2e stand-in); the worker is then never started. */
  embedder?: Embedder;
}

/** Provider ids and custom origins the browser will call directly, from the providers doc. */
export function directAccessFor(p: Providers): DirectAccess {
  const providers: string[] = [];
  const origins: string[] = [];
  for (const cap of [p.transcription, p.llm]) {
    if (cap.mode !== 'own') continue;
    if (cap.key.provider in PROVIDER_ORIGINS) providers.push(cap.key.provider);
    if (cap.key.baseUrl) {
      const o = normalizeOrigin(cap.key.baseUrl);
      if (o) origins.push(o);
    }
  }
  for (const s of knownStores(p)) {
    if (s.kind === 's3-compatible') origins.push(bucketOrigin(s.config));
    else if (!providers.includes(GOOGLE_DRIVE_PROVIDER)) providers.push(GOOGLE_DRIVE_PROVIDER);
  }
  return { providers, origins };
}

/**
 * After unlock: deletes recordings the server queued for the user's own stores (retention,
 * deleted calls), which it can't reach itself. Loads only when an own store is configured.
 */
async function sweepOwnStores(ctx: ClientContext, secrets: SecretStore): Promise<void> {
  if (knownStores(await ctx.userData.get('providers')).length === 0) return;
  const { sweepAtUnlock } = await import('@askcalls/client-core/recording-stores/lazy');
  await sweepAtUnlock(ctx, secrets);
}

/** Translation code loads on the first upload that needs it, not with every page. */
function lazyTranslator(load: () => Promise<Translator>): Translator {
  let loaded: Promise<Translator> | null = null;
  const get = () => {
    loaded ??= load().catch((e) => {
      loaded = null;
      throw e;
    });
    return loaded;
  };
  return {
    id: 'settings',
    enabled: async () => (await get()).enabled?.() ?? true,
    translate: async (...args) => (await get()).translate(...args),
  };
}

/**
 * The browser composition root: client-core's context wired to the browser adapters, the
 * same-origin typed API client (session cookie) and the lock rules of spec 6.8. Heavy parts
 * start lazily: the embedding worker on the first embed, ffmpeg.wasm only for formats the
 * browser cannot decode, provider adapters only in own-key mode.
 */
export function createBrowserClient(opts: BrowserClientOptions = {}): BrowserClient {
  const api = createApiClient(opts.fetch ? { fetch: opts.fetch } : {});
  const session = new KeySession(
    opts.idleTimeoutMs === undefined ? {} : { idleTimeoutMs: opts.idleTimeoutMs },
  );
  const db = new DeviceDb(opts.dbName);
  const worker = opts.embedder
    ? null
    : new WorkerEmbedder({ modelBaseUrl: readEmbeddingModelUrl() });
  const embedder: Embedder = opts.embedder ?? worker!;
  const audio = new BrowserAudioCodec();
  const blobUrls = new BlobUrls();
  let ctx: ClientContext | null = null;
  const context = () => ctx!;

  const ownStores = new RecordingStores({
    api,
    providers: () => context().userData.get('providers'),
    updateProviders: (mutate) => context().userData.update('providers', mutate),
    ...(opts.fetch && { fetch: opts.fetch }),
  });
  ctx = createClientContext({
    api,
    session,
    embedder,
    audio,
    transcriber: new SettingsTranscriber(
      () => context().userData,
      managedTranscriber(api),
      session,
    ),
    translator: lazyTranslator(() =>
      Promise.all([
        import('./adapters/settings-translator'),
        import('@askcalls/client-core/translation'),
      ]).then(
        ([{ SettingsTranslator }, { managedTranslator }]) =>
          new SettingsTranslator(api, () => context().userData, managedTranslator(api), session),
      ),
    ),
    uploader: new FetchRecordingUploader(),
    fetcher: new FetchBlobFetcher(),
    ownStores,
  });

  const putDirect = (access: DirectAccess) => api.request(putDirectAccess, { body: access });
  // The CSP is fixed per document, so read what this one allows once, before any refresh.
  const allowed = readConnectSrc();
  const syncDirectAccess = async () => {
    const access = directAccessFor(await context().userData.get('providers'));
    const { changed } = await putDirect(access);
    if (!allowed) return { stale: changed };
    return { stale: directOrigins(encodeDirectCookie(access)).some((o) => !allowed.includes(o)) };
  };

  const secrets = new IdbSecretStore(db);
  const unsubscribe = session.subscribe((e) => {
    if (e.type === 'unlocked') {
      void syncDirectAccess().then(
        (r) => r.stale && opts.onDirectAccessChange?.(),
        () => {},
      );
      void sweepOwnStores(context(), secrets).catch(() => {});
    }
  });
  const unwipe = session.onWipe(() => {
    blobUrls.revokeAll();
    ownStores.clear();
    audio.dispose();
    if (!opts.keepEmbedderOnLock) worker?.dispose();
  });
  const uninstall = installLockRules(session);

  return {
    ctx,
    api,
    session,
    secrets,
    deviceKeys: new IdbDeviceKeyStore(db),
    passkeys: new WebAuthnPasskeyAuthenticator(),
    bulkState: new IdbBulkStateStore(db, session),
    bulkFiles: new BrowserBulkFiles(db),
    embedder,
    embedderStatus: () => worker?.status ?? null,
    onEmbedderStatus: (listener) => worker?.onStatus(listener) ?? (() => {}),
    audio,
    ownStores,
    blobUrls,
    syncDirectAccess,
    clearDirectAccess: async () => {
      await putDirect({ providers: [], origins: [] });
    },
    dispose() {
      uninstall();
      unsubscribe();
      session.lock('manual');
      unwipe();
      worker?.dispose();
      audio.dispose();
      db.close();
    },
  };
}
