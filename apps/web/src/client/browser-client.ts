import { type ApiClient, createApiClient } from '@askcalls/api-contract';
import type { BulkStateStore } from '@askcalls/client-core/bulk/queue';
import { type ClientContext, createClientContext } from '@askcalls/client-core/context';
import type {
  DeviceKeyStore,
  Embedder,
  FetchLike,
  SecretStore,
} from '@askcalls/client-core/ports/index';
import { KeySession } from '@askcalls/client-core/session';
import { managedTranscriber } from '@askcalls/client-core/transcription';
import type { Providers } from '@askcalls/client-core/userdata';
import { DomainError } from '@askcalls/domain';
import { BrowserAudioCodec } from './adapters/audio/codec';
import { BrowserBulkFiles } from './adapters/bulk-files';
import { WorkerEmbedder } from './adapters/embedder/embedder';
import { DeviceDb } from './adapters/idb';
import { bucketOrigin, SigV4BucketStore } from './adapters/own-bucket';
import { SettingsTranscriber } from './adapters/own-key-transcriber';
import { WebAuthnPasskeyAuthenticator } from './adapters/passkey';
import { IdbBulkStateStore, IdbDeviceKeyStore, IdbSecretStore } from './adapters/stores';
import { FetchBlobFetcher, FetchRecordingUploader } from './adapters/transfer';
import {
  DIRECT_COOKIE,
  DIRECT_COOKIE_SECURE,
  type DirectAccess,
  encodeDirectCookie,
  normalizeOrigin,
  PROVIDER_ORIGINS,
} from './direct-origins';
import { BlobUrls, installLockRules } from './lock';

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
  audio: BrowserAudioCodec;
  ownBuckets: SigV4BucketStore;
  /** Object URLs for decrypted media; revoked on lock. */
  blobUrls: BlobUrls;
  /**
   * Mirrors the own-key providers and bucket into the `askcalls-direct` cookie so the next page
   * load's CSP allows them. Runs after every unlock; call it after saving Settings → Providers.
   * `changed: true` means the current page's CSP is stale: reload to apply it.
   */
  syncDirectAccess(): Promise<{ changed: boolean }>;
  /** Removes the cookie (sign-out). */
  clearDirectAccess(): void;
  /** Removes listeners, stops workers and locks. */
  dispose(): void;
}

export interface BrowserClientOptions {
  /** Auto-lock idle timeout; applyAutoLockSetting() replaces it from settings after unlock. */
  idleTimeoutMs?: number;
  fetch?: FetchLike;
  /** IndexedDB database name (tests use their own). */
  dbName?: string;
  /** Called when `syncDirectAccess` changed the cookie after an unlock. */
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
  if (p.recordings.mode === 'own') origins.push(bucketOrigin(p.recordings.bucket));
  return { providers, origins };
}

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(prefix))
    ?.slice(prefix.length);
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
  const worker = opts.embedder ? null : new WorkerEmbedder();
  const embedder: Embedder = opts.embedder ?? worker!;
  const audio = new BrowserAudioCodec();
  const blobUrls = new BlobUrls();
  let ctx: ClientContext | null = null;
  const context = () => ctx!;

  const ownBuckets = new SigV4BucketStore(async (bucketRef) => {
    const p = await context().userData.get('providers');
    if (p.recordings.mode !== 'own' || p.recordings.bucket.id !== bucketRef) {
      throw new DomainError('not_found', 'this bucket is not configured');
    }
    return p.recordings.bucket;
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
    uploader: new FetchRecordingUploader(),
    fetcher: new FetchBlobFetcher(),
    ownBuckets,
  });

  const secure = location.protocol === 'https:';
  const cookieName = secure ? DIRECT_COOKIE_SECURE : DIRECT_COOKIE;
  const writeCookie = (value: string, maxAge: number) => {
    // biome-ignore lint/suspicious/noDocumentCookie: the middleware reads it on the next request.
    document.cookie = `${cookieName}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Strict${secure ? '; Secure' : ''}`;
  };
  const syncDirectAccess = async () => {
    const value = encodeDirectCookie(directAccessFor(await context().userData.get('providers')));
    const before = readCookie(cookieName) ?? '';
    if (value === before) return { changed: false };
    if (value) writeCookie(value, 400 * 24 * 3600);
    else writeCookie('', 0);
    return { changed: true };
  };

  const unsubscribe = session.subscribe((e) => {
    if (e.type === 'unlocked') {
      void syncDirectAccess().then(
        (r) => r.changed && opts.onDirectAccessChange?.(),
        () => {},
      );
    }
  });
  const unwipe = session.onWipe(() => {
    blobUrls.revokeAll();
    audio.dispose();
    if (!opts.keepEmbedderOnLock) worker?.dispose();
  });
  const uninstall = installLockRules(session);

  return {
    ctx,
    api,
    session,
    secrets: new IdbSecretStore(db),
    deviceKeys: new IdbDeviceKeyStore(db),
    passkeys: new WebAuthnPasskeyAuthenticator(),
    bulkState: new IdbBulkStateStore(db, session),
    bulkFiles: new BrowserBulkFiles(db),
    embedder,
    audio,
    ownBuckets,
    blobUrls,
    syncDirectAccess,
    clearDirectAccess: () => writeCookie('', 0),
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
