import type { Actor } from '@askcalls/domain/use-cases/context';
import type { CreateCallInput } from '@askcalls/domain/use-cases/calls';
import { uuidv7 } from 'uuidv7';

export const rand = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function randTok(): bigint {
  return new DataView(rand(8).buffer).getBigInt64(0);
}

export function vector(axis = 0): Float32Array {
  const v = new Float32Array(384);
  v[axis % 384] = 1;
  return v;
}

export function newCall(overrides: Partial<CreateCallInput> = {}): CreateCallInput {
  return {
    id: uuidv7(),
    source: 'app',
    day: 20_600,
    durationBucket: 1,
    wrappedDek: rand(60),
    transcriptCt: rand(200),
    metaCt: rand(80),
    contactTok: randTok(),
    keywordToks: [randTok(), randTok()],
    tagToks: [],
    audioTok: null,
    contentTok: randTok(),
    chunks: [{ ord: 0, embedding: vector(1), snippetCt: rand(40) }],
    ...overrides,
  };
}

export const session = (userId: string): Actor => ({ kind: 'session', userId });
export const tokenActor = (
  userId: string,
  tokenId: string,
  scopes: Array<'read' | 'write' | 'ask' | 'keys'> = ['read', 'write'],
): Actor => ({ kind: 'token', userId, tokenId, scopes });
