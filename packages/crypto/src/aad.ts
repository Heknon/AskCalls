import { concat, lengthPrefixed, utf8 } from './bytes';
import { CryptoError } from './errors';

/**
 * Additional authenticated data binding a ciphertext to its context (spec 6.3).
 *
 * Encoding: `u32be(len(userId)) ‖ userId ‖ u32be(len(callId)) ‖ callId ‖ u32be(len(field)) ‖ field`,
 * every string UTF-8. Length prefixes make the encoding injective: no two different triples
 * produce the same bytes. Data that belongs to no call (UserData, VocabDelta, the inbox private
 * key, …) uses `callId = ''`.
 */
export interface AadContext {
  userId: string;
  callId?: string;
  field: string;
}

export function aad({ userId, callId = '', field }: AadContext): Uint8Array<ArrayBuffer> {
  if (userId.length === 0) throw new CryptoError('invalid_input', 'aad userId is empty');
  if (field.length === 0) throw new CryptoError('invalid_input', 'aad field is empty');
  return concat(
    lengthPrefixed(utf8(userId)),
    lengthPrefixed(utf8(callId)),
    lengthPrefixed(utf8(field)),
  );
}

function ordinal(n: number, what: string): number {
  if (!Number.isInteger(n) || n < 0) throw new CryptoError('invalid_input', `${what} must be >= 0`);
  return n;
}

/** The field names in use. Always build AAD fields through these so every bucket agrees. */
export const AadFields = {
  /** Call.transcriptCt (key: DEK). */
  transcript: 'transcript',
  /** Call.metaCt (key: DEK). */
  meta: 'meta',
  /** CallChunk.snippetCt (key: DEK). */
  snippet: (ord: number) => `snippet:${ordinal(ord, 'ord')}`,
  /** Call.wrappedDek (key: KEK). */
  dek: 'dek',
  /** Recording blob, segmented format (key: DEK). */
  recording: 'recording',
  /** UserData.ct for one kind (key: KEK). */
  userData: (kind: string) => `userdata:${kind}`,
  /** VocabDelta.ct (key: KEK). */
  vocabDelta: (seq: number) => `vocab:${ordinal(seq, 'seq')}`,
  /** UserKeys.inboxPrivateKeyCt (key: KEK). */
  inboxPrivateKey: 'inbox-private-key',
  /** InboxItem payload (ECIES to the inbox public key). */
  inboxItem: 'inbox-item',
  /** DeviceLinkSession.encryptedRootKey (ECIES to the joining device). */
  deviceLink: 'device-link',
  /** Keyring.wrappedRootKey for one unlock method kind (key: wrapKey). */
  rootKey: (kind: string) => `rootkey:${kind}`,
} as const;
