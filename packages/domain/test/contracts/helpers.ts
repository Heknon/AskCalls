import type { NewCall } from '../../src/entities/call';
import type { UserId } from '../../src/entities/common';

export const bytes = (...xs: number[]) => new Uint8Array(xs);
export const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

let seq = 0;
/** Deterministic, sortable fake UUIDv7-shaped id for tests. */
export function testId(): string {
  seq += 1;
  const hex = (Date.now() * 1000 + seq).toString(16).padStart(32, '0').slice(-32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function randomTok(): bigint {
  const view = new DataView(rand(8).buffer);
  return view.getBigInt64(0);
}

export function makeCall(userId: UserId, overrides: Partial<NewCall> = {}): NewCall {
  return {
    id: testId(),
    userId,
    status: 'ready',
    source: 'app',
    day: 20_000,
    durationBucket: 1,
    wrappedDek: rand(60),
    transcriptCt: rand(100),
    metaCt: rand(80),
    contactTok: randomTok(),
    keywordToks: [randomTok(), randomTok()],
    tagToks: [],
    audioTok: null,
    contentTok: randomTok(),
    recording: null,
    ...overrides,
  };
}

/** Unit vector of 384 dims with weight on one axis, for deterministic similarity tests. */
export function axisVector(axis: number, noise = 0): Float32Array {
  const v = new Float32Array(384);
  v[axis] = 1;
  if (noise) v[(axis + 1) % 384] = noise;
  let norm = 0;
  for (const x of v) norm += x * x;
  return v.map((x) => x / Math.sqrt(norm));
}

export interface Harness<T> {
  setup(): Promise<T>;
  teardown?(subject: T): Promise<void>;
}
