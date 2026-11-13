/**
 * Client-side ports (spec 3.3). The browser and the agent each provide adapters.
 * Nothing here may touch plaintext persistence: decrypted data lives in memory only.
 */
import type { TranscriptSegment, TranslationLanguage } from '@askcalls/domain';

/** Text to a 384-dimension, L2-normalized vector. Callers add the e5 `query: ` / `passage: ` prefix. */
export interface Embedder {
  readonly modelId: string;
  readonly dimensions: 384;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export interface DecodedAudio {
  /** 16 kHz mono PCM, float32 in [-1, 1]. */
  pcm: Float32Array;
  sampleRate: 16_000;
  durationSec: number;
}

export interface EncodedAudio {
  bytes: Uint8Array;
  mimeType: string;
}

/** Audio input: browser File/Blob, an agent file path, or bytes already in memory (inbox). */
export type AudioSource = Blob | { path: string } | { bytes: Uint8Array; mimeType: string };

export interface AudioCodec {
  decode(source: AudioSource): Promise<DecodedAudio>;
  /** The undecoded file bytes, for the audio fingerprint fallback when decoding fails. */
  readBytes(source: AudioSource): Promise<Uint8Array>;
  /** Opus in Ogg or WebM. */
  encodeOpus(audio: DecodedAudio, opts: { bitrateKbps: number }): Promise<EncodedAudio>;
  /** Splits encoded audio into chunks of at most `maxBytes`, returning each chunk's start time. */
  chunk(
    audio: DecodedAudio,
    opts: { maxBytes: number; bitrateKbps: number },
  ): Promise<Array<EncodedAudio & { startSec: number }>>;
}

/**
 * Persists wrapped key material and non-secret device facts (IndexedDB / OS keychain).
 * Never plaintext root keys or call content.
 */
export interface SecretStore {
  get(name: string): Promise<Uint8Array | null>;
  set(name: string, value: Uint8Array): Promise<void>;
  delete(name: string): Promise<void>;
}

/**
 * Holds this device's ECDSA signing key. Browsers keep the non-extractable CryptoKey in
 * IndexedDB (`extractable: false`); the agent exports PKCS#8 to the OS keychain (`true`).
 */
export interface DeviceKeyStore {
  readonly extractable: boolean;
  load(): Promise<{ deviceKeyId: string; privateKey: CryptoKey } | null>;
  save(deviceKeyId: string, privateKey: CryptoKey): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Why a new passkey can't unlock: the browser or authenticator lacks PRF, or a password-manager
 * extension answered the prompt and dropped the PRF request.
 */
export type NoPrfReason = 'unsupported' | 'passwordManager';

/**
 * A registered credential and the transports it reported, sent back as `allowCredentials`.
 * `transports` comes back from the server as stored; the authenticator uses it only when it is
 * a non-empty array of strings.
 */
export interface PasskeyCredentialRef {
  id: string;
  transports?: unknown;
}

/** WebAuthn with the PRF extension (browser only). The PRF salt is `PRF_SALT` from crypto. */
export interface PasskeyAuthenticator {
  /** Registers a passkey and evaluates PRF on it. `prfOutput` is null when PRF is missing. */
  create(opts: {
    userName: string;
    prfSalt: Uint8Array;
  }): Promise<
    | { credentialId: string; transports: string[]; prfOutput: Uint8Array }
    | { credentialId: string; transports: string[]; prfOutput: null; noPrf: NoPrfReason }
  >;
  /** Asks for one of `credentials` and evaluates PRF. */
  assert(opts: {
    credentials: PasskeyCredentialRef[];
    prfSalt: Uint8Array;
  }): Promise<{ credentialId: string; prfOutput: Uint8Array }>;
}

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  language: string | null;
  durationSec: number | null;
}

/**
 * Turns one audio chunk into timed segments. `managedTranscriber` posts to `/api/transcribe`;
 * own-key mode supplies an adapter that calls the provider directly with the user's key.
 */
export interface Transcriber {
  readonly id: string;
  /** Largest chunk the transcriber accepts. */
  readonly maxChunkBytes: number;
  transcribe(chunk: EncodedAudio, opts: { language: string }): Promise<TranscriptionResult>;
}

export interface TranslationResult {
  /** One per input segment, in order. */
  segments: string[];
  /** The LLM that translated (provider id and model), recorded with the translation. */
  provider: string;
  model: string;
}

/**
 * Translates a call's segment texts, keeping count and order. `managedTranslator` posts batches
 * to `/api/translate`; own-key mode supplies an adapter that calls the provider directly.
 */
export interface Translator {
  readonly id: string;
  /** False when translation is off right now (Settings); ingest then stores the original only. */
  enabled?(): Promise<boolean>;
  translate(
    segments: readonly string[],
    opts: { source: string | null; target: TranslationLanguage; signal?: AbortSignal },
  ): Promise<TranslationResult>;
}

/** PUTs ciphertext to a presigned URL (instance bucket) and returns the stored size. */
export interface RecordingUploader {
  put(
    request: { url: string; method: 'PUT'; headers: Record<string, string> },
    body: Uint8Array,
  ): Promise<void>;
}

/** Fetches ciphertext from a presigned URL (recordings, large inbox payloads). */
export interface BlobFetcher {
  get(request: { url: string; headers?: Record<string, string> }): Promise<Uint8Array>;
}

/** What Settings shows for a connected store: the account and how much of its space is used. */
export interface RecordingStoreInfo {
  account: string | null;
  /** The folder or bucket recordings go to. */
  location: string | null;
  usedBytes: number | null;
  /** Null when the store reports no limit. */
  limitBytes: number | null;
}

export type RecordingStoreProbe =
  | { ok: true }
  | {
      ok: false;
      reason: 'cors_or_network' | 'unauthorized' | 'not_found' | 'http';
      status?: number;
    };

/**
 * A store the user brings for recording backups (spec 11.2a): an S3-compatible bucket or Google
 * Drive. The device talks to it directly with credentials from the providers document, so only
 * ciphertext reaches it and nothing passes through our server. `ref` is the call's `bucketRef`.
 */
export interface RecordingStore {
  /** Stores `body` under a name derived from `name`; returns the key to keep on the call. */
  put(ref: string, name: string, body: Uint8Array): Promise<{ objectKey: string }>;
  /** Streams the stored ciphertext. */
  get(ref: string, objectKey: string): AsyncIterable<Uint8Array>;
  /** Succeeds when the object is already gone. */
  delete(ref: string, objectKey: string): Promise<void>;
  probe(ref: string): Promise<RecordingStoreProbe>;
  describe(ref: string): Promise<RecordingStoreInfo>;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Timers for auto-lock; injected so tests can drive time. */
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Fetch-compatible transport, so the typed API client works with session cookies or bearer tokens. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
