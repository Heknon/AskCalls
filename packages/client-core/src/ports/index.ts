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

/** WebAuthn with the PRF extension (browser only). The PRF salt is `PRF_SALT` from crypto. */
export interface PasskeyAuthenticator {
  /** Registers a passkey and evaluates PRF on it. `prfOutput` is null when PRF is unsupported. */
  create(opts: {
    userName: string;
    prfSalt: Uint8Array;
  }): Promise<{ credentialId: string; prfOutput: Uint8Array | null }>;
  /** Asks for one of `credentialIds` and evaluates PRF. */
  assert(opts: {
    credentialIds: string[];
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
