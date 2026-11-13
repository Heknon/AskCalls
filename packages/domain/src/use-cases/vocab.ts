import type { Bytes } from '../entities/common';
import { DomainError } from '../entities/errors';
import type { VocabDelta } from '../entities/other';
import type { Ports } from '../ports-bundle';
import type { Actor } from './context';

export const VOCAB_LIMITS = {
  deltaBytes: 1_024 * 1_024,
  compactedBytes: 3 * 1_024 * 1_024,
  /** Spec 7.12: compact when there are more than 50 deltas. */
  compactAfter: 50,
} as const;

export type VocabDeltaOut = Omit<VocabDelta, 'userId'>;

const strip = ({ userId: _u, ...d }: VocabDelta): VocabDeltaOut => d;

export async function listVocab(
  ports: Ports,
  actor: Actor,
  afterSeq: number,
): Promise<{ deltas: VocabDeltaOut[]; count: number; compactAfter: number }> {
  if (!Number.isInteger(afterSeq) || afterSeq < 0) {
    throw new DomainError('invalid', 'since must be a non-negative integer');
  }
  const [deltas, count] = await Promise.all([
    ports.vocab.listSince(actor.userId, afterSeq),
    ports.vocab.count(actor.userId),
  ]);
  return { deltas: deltas.map(strip), count, compactAfter: VOCAB_LIMITS.compactAfter };
}

export async function appendVocab(ports: Ports, actor: Actor, ct: Bytes): Promise<VocabDeltaOut> {
  if (ct.length === 0 || ct.length > VOCAB_LIMITS.deltaBytes) {
    throw new DomainError('invalid', 'vocabulary delta has an invalid size');
  }
  return strip(await ports.vocab.append(actor.userId, ct));
}

/** Replaces every delta up to `upToSeq` with one compacted delta the device built. */
export async function compactVocab(
  ports: Ports,
  actor: Actor,
  upToSeq: number,
  ct: Bytes,
): Promise<VocabDeltaOut> {
  if (ct.length === 0 || ct.length > VOCAB_LIMITS.compactedBytes) {
    throw new DomainError('invalid', 'compacted vocabulary has an invalid size');
  }
  if (!Number.isInteger(upToSeq) || upToSeq < 1) {
    throw new DomainError('invalid', 'upToSeq must be a positive integer');
  }
  const all = await ports.vocab.listSince(actor.userId, 0);
  if (!all.some((d) => d.seq === upToSeq)) {
    throw new DomainError('version_conflict', 'vocabulary changed; reload before compacting', {
      latest: all.at(-1)?.seq ?? 0,
    });
  }
  return strip(await ports.vocab.compact(actor.userId, upToSeq, ct));
}
