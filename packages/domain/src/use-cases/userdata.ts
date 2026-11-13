import type { Bytes } from '../entities/common';
import { DomainError } from '../entities/errors';
import { USER_DATA_KINDS, type UserDataBlob, type UserDataKind } from '../entities/other';
import type { Ports } from '../ports-bundle';
import type { Actor } from './context';

export const USER_DATA_MAX_BYTES = 2 * 1_024 * 1_024;

function checkKind(kind: string): asserts kind is UserDataKind {
  if (!(USER_DATA_KINDS as readonly string[]).includes(kind)) {
    throw new DomainError('not_found', 'unknown user data kind');
  }
}

/** Encrypted per-user blob; `version` 0 with no ciphertext when it was never written. */
export async function getUserData(
  ports: Ports,
  actor: Actor,
  kind: string,
): Promise<UserDataBlob | { kind: UserDataKind; ct: null; version: 0 }> {
  checkKind(kind);
  return (await ports.userData.get(actor.userId, kind)) ?? { kind, ct: null, version: 0 };
}

/** Optimistic concurrency: `expectedVersion` is the version the client read. */
export async function putUserData(
  ports: Ports,
  actor: Actor,
  kind: string,
  input: { ct: Bytes; expectedVersion: number },
): Promise<{ version: number }> {
  checkKind(kind);
  if (input.ct.length === 0 || input.ct.length > USER_DATA_MAX_BYTES) {
    throw new DomainError('invalid', 'user data has an invalid size');
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new DomainError('invalid', 'expectedVersion must be a non-negative integer');
  }
  return { version: await ports.userData.put(actor.userId, kind, input.ct, input.expectedVersion) };
}
