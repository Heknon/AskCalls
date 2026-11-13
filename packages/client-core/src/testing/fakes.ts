import { DomainError } from '@askcalls/domain';
import { normalizeWord } from '@askcalls/indexing';
import type { BulkState, BulkStateStore } from '../bulk/queue';
import type {
  AudioCodec,
  AudioSource,
  DecodedAudio,
  DeviceKeyStore,
  Embedder,
  EncodedAudio,
  PasskeyAuthenticator,
  SecretStore,
} from '../ports/index';

/**
 * Test doubles for the client ports. Deterministic and in memory; never for production use.
 */

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A bag-of-words embedder: each normalized word adds ±1 at a hashed dimension, then the vector
 * is L2-normalized. Texts sharing words have high cosine similarity, which is enough to test
 * semantic ranking without a model.
 */
export class FakeEmbedder implements Embedder {
  readonly modelId = 'fake-hash-embedder';
  readonly dimensions = 384 as const;
  calls = 0;

  async embed(texts: string[]): Promise<Float32Array[]> {
    this.calls++;
    return texts.map((t) => {
      const v = new Float32Array(384);
      const body = t.replace(/^(query|passage): /, '');
      for (const w of body.split(/\s+/)) {
        const word = normalizeWord(w);
        if (!word) continue;
        const h = fnv1a(word);
        v[h % 384]! += h & 0x8000_0000 ? -1 : 1;
      }
      let n = 0;
      for (const x of v) n += x * x;
      if (n === 0) v[0] = 1;
      else for (let i = 0; i < v.length; i++) v[i]! /= Math.sqrt(n);
      return v;
    });
  }
}

/** Fake audio bytes: a header and any payload. Decodes to one sample per byte. */
export const FAKE_AUDIO_MAGIC = 'FAKEAUDIO';

/**
 * Treats any byte string that starts with `FAKEAUDIO` as audio at 16 kHz, one sample per byte
 * (so 16,000 bytes are one second); anything else fails to decode. "Opus" is the int8 samples.
 */
export class FakeAudioCodec implements AudioCodec {
  async readBytes(source: AudioSource): Promise<Uint8Array> {
    if (source instanceof Blob) return new Uint8Array(await source.arrayBuffer());
    if ('bytes' in source) return source.bytes;
    throw new DomainError('unsupported', 'fake codec reads no paths');
  }

  async decode(source: AudioSource): Promise<DecodedAudio> {
    const bytes = await this.readBytes(source);
    const magic = new TextDecoder().decode(bytes.subarray(0, FAKE_AUDIO_MAGIC.length));
    if (magic !== FAKE_AUDIO_MAGIC) throw new DomainError('invalid', 'not audio');
    const body = bytes.subarray(FAKE_AUDIO_MAGIC.length);
    const pcm = Float32Array.from(body, (b) => (b - 128) / 128);
    return { pcm, sampleRate: 16_000, durationSec: pcm.length / 16_000 };
  }

  async encodeOpus(audio: DecodedAudio): Promise<EncodedAudio> {
    return {
      bytes: Uint8Array.from(audio.pcm, (x) => Math.round(x * 127) & 0xff),
      mimeType: 'audio/ogg',
    };
  }

  async chunk(
    audio: DecodedAudio,
    opts: { maxBytes: number; bitrateKbps: number },
  ): Promise<Array<EncodedAudio & { startSec: number }>> {
    const { bytes, mimeType } = await this.encodeOpus(audio);
    const out: Array<EncodedAudio & { startSec: number }> = [];
    for (let o = 0; o < Math.max(bytes.length, 1); o += opts.maxBytes) {
      out.push({ bytes: bytes.subarray(o, o + opts.maxBytes), mimeType, startSec: o / 16_000 });
    }
    return out;
  }
}

export const fakeAudio = (payload: Uint8Array) => {
  const head = new TextEncoder().encode(FAKE_AUDIO_MAGIC);
  const out = new Uint8Array(head.length + payload.length);
  out.set(head);
  out.set(payload, head.length);
  return out;
};

export class MemorySecretStore implements SecretStore {
  readonly values = new Map<string, Uint8Array>();
  async get(name: string) {
    return this.values.get(name)?.slice() ?? null;
  }
  async set(name: string, value: Uint8Array) {
    this.values.set(name, value.slice());
  }
  async delete(name: string) {
    this.values.delete(name);
  }
}

export class MemoryDeviceKeyStore implements DeviceKeyStore {
  #key: { deviceKeyId: string; privateKey: CryptoKey } | null = null;
  constructor(readonly extractable = false) {}
  async load() {
    return this.#key;
  }
  async save(deviceKeyId: string, privateKey: CryptoKey) {
    this.#key = { deviceKeyId, privateKey };
  }
  async clear() {
    this.#key = null;
  }
}

export class MemoryBulkStateStore implements BulkStateStore {
  state: BulkState | null = null;
  saves = 0;
  async load() {
    return this.state ? structuredClone(this.state) : null;
  }
  async save(state: BulkState) {
    this.saves++;
    this.state = structuredClone(state);
  }
  async clear() {
    this.state = null;
  }
}

/** A passkey authenticator with PRF: one random secret per credential. */
export class FakePasskeys implements PasskeyAuthenticator {
  readonly credentials = new Map<string, Uint8Array>();
  #n = 0;
  constructor(readonly prf = true) {}

  async #evaluate(secret: Uint8Array, salt: Uint8Array) {
    const key = await crypto.subtle.importKey(
      'raw',
      secret as Uint8Array<ArrayBuffer>,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, salt as Uint8Array<ArrayBuffer>));
  }

  async create(opts: { userName: string; prfSalt: Uint8Array }) {
    const credentialId = `cred-${++this.#n}`;
    const secret = crypto.getRandomValues(new Uint8Array(32));
    this.credentials.set(credentialId, secret);
    return {
      credentialId,
      prfOutput: this.prf ? await this.#evaluate(secret, opts.prfSalt) : null,
    };
  }

  async assert(opts: { credentialIds: string[]; prfSalt: Uint8Array }) {
    const credentialId = opts.credentialIds.find((id) => this.credentials.has(id));
    if (!credentialId) throw new DomainError('not_found', 'no matching passkey');
    return {
      credentialId,
      prfOutput: await this.#evaluate(this.credentials.get(credentialId)!, opts.prfSalt),
    };
  }
}
