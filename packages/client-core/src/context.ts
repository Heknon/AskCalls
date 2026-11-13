import type { ApiClient } from '@askcalls/api-contract';
import { listKeyring } from '@askcalls/api-contract/routes/keyring';
import { IntentCache } from './intents';
import {
  type AudioCodec,
  type BlobFetcher,
  type Clock,
  type Embedder,
  type RecordingUploader,
  systemClock,
  type Transcriber,
  type Translator,
} from './ports/index';
import type { KeySession } from './session';
import { knownIntentIds, TagDirectory } from './tags';
import { UserDataStore } from './userdata';
import { VocabularySync } from './vocabulary';

/** Own-bucket recordings (spec 11.2a): the device signs requests itself, so this is an adapter. */
export interface OwnBucketStore {
  put(bucketRef: string, objectKey: string, body: Uint8Array): Promise<void>;
  get(bucketRef: string, objectKey: string): Promise<Uint8Array>;
}

export interface ClientDeps {
  api: ApiClient;
  session: KeySession;
  embedder: Embedder;
  clock?: Clock;
  audio?: AudioCodec;
  /** Managed (`managedTranscriber`) or own-key transcription; absent when transcription is off. */
  transcriber?: Transcriber;
  /** Managed (`managedTranslator`) or own-key translation; absent when translation is off. */
  translator?: Translator;
  uploader?: RecordingUploader;
  fetcher?: BlobFetcher;
  ownBuckets?: OwnBucketStore;
}

export interface DeviceInfo {
  id: string;
  label: string;
  signingPublicKey: Uint8Array;
  revoked: boolean;
}

/** Everything the use cases share: ports plus the per-session caches. */
export interface ClientContext extends Required<Pick<ClientDeps, 'api' | 'session' | 'embedder'>> {
  clock: Clock;
  audio: AudioCodec | null;
  transcriber: Transcriber | null;
  translator: Translator | null;
  uploader: RecordingUploader | null;
  fetcher: BlobFetcher | null;
  ownBuckets: OwnBucketStore | null;
  userData: UserDataStore;
  vocabulary: VocabularySync;
  intents: IntentCache;
  tagDirectory(): Promise<TagDirectory>;
  /** Registered device signing keys, cached per session; `refresh` refetches. */
  devices(opts?: { refresh?: boolean }): Promise<Map<string, DeviceInfo>>;
}

export function createClientContext(deps: ClientDeps): ClientContext {
  const { api, session } = deps;
  const userData = new UserDataStore(api, session);
  let devices: Promise<Map<string, DeviceInfo>> | null = null;
  session.onWipe(() => {
    devices = null;
  });
  return {
    api,
    session,
    embedder: deps.embedder,
    clock: deps.clock ?? systemClock,
    audio: deps.audio ?? null,
    transcriber: deps.transcriber ?? null,
    translator: deps.translator ?? null,
    uploader: deps.uploader ?? null,
    fetcher: deps.fetcher ?? null,
    ownBuckets: deps.ownBuckets ?? null,
    userData,
    vocabulary: new VocabularySync(api, session),
    intents: new IntentCache(deps.embedder, session),
    async tagDirectory() {
      const [tags, settings] = await Promise.all([userData.get('tags'), userData.get('settings')]);
      return TagDirectory.build(
        session,
        tags.tags,
        knownIntentIds(settings.customIntents.map((i) => i.id)),
      );
    },
    devices(opts = {}) {
      if (opts.refresh) devices = null;
      devices ??= api.request(listKeyring, {}).then(
        (r) =>
          new Map(
            r.devices.map((d) => [
              d.id,
              {
                id: d.id,
                label: d.label,
                signingPublicKey: d.signingPublicKey,
                revoked: d.revokedAt !== null,
              },
            ]),
          ),
        (e) => {
          devices = null;
          throw e;
        },
      );
      return devices;
    },
  };
}

/** Applies `settings.autoLockMinutes` (0 = never) to the session's idle timer (spec 6.8). */
export async function applyAutoLockSetting(ctx: ClientContext): Promise<void> {
  const { autoLockMinutes } = await ctx.userData.get('settings');
  ctx.session.setIdleTimeout(autoLockMinutes * 60_000);
}
