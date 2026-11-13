/**
 * Client-side ports (spec 3.3). The browser and the agent each provide adapters.
 * Nothing here may touch plaintext persistence: decrypted data lives in memory only.
 */

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

/** Audio input: browser File/Blob or an agent file path. */
export type AudioSource = Blob | { path: string };

export interface AudioCodec {
  decode(source: AudioSource): Promise<DecodedAudio>;
  /** Opus in Ogg or WebM. */
  encodeOpus(audio: DecodedAudio, opts: { bitrateKbps: number }): Promise<EncodedAudio>;
  /** Splits encoded audio into chunks of at most `maxBytes`, returning each chunk's start time. */
  chunk(
    audio: DecodedAudio,
    opts: { maxBytes: number; bitrateKbps: number },
  ): Promise<Array<EncodedAudio & { startSec: number }>>;
}

/** Persists wrapped key material only (IndexedDB / OS keychain). Never plaintext keys or content. */
export interface SecretStore {
  get(name: string): Promise<Uint8Array | null>;
  set(name: string, value: Uint8Array): Promise<void>;
  delete(name: string): Promise<void>;
}

export type UnlockMethod = 'passkey' | 'recovery' | 'passphrase' | 'device';

/** Turns a user gesture (or the agent's device secret) into the 32-byte root key. */
export interface Unlocker {
  readonly methods: UnlockMethod[];
  unlock(
    method: UnlockMethod,
    input?: { recoveryCode?: string; passphrase?: string },
  ): Promise<Uint8Array>;
}

/** Fetch-compatible transport, so the typed API client works with session cookies or bearer tokens. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
