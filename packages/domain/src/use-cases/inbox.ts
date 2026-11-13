import { type Bytes, DAY_MS, type UserId } from '../entities/common';
import { DomainError } from '../entities/errors';
import type { InboxItem } from '../entities/other';
import type { CallDirection } from '../entities/transcript';
import type { Ports } from '../ports-bundle';
import { type Actor, audit, blobKeys } from './context';

/**
 * Inbox (spec 6.7). The route receives plaintext, seals it to the user's inbox public key and
 * drops it; the next unlocked device decrypts it, runs the full ingest and deletes the item.
 */
export const INBOX_LIMITS = {
  /** Items wait this long for a device to process them. */
  ttlMs: 30 * DAY_MS,
  /** Sealed payloads above this go to the BlobStore instead of the row. */
  inlineMaxBytes: 256 * 1_024,
  maxPending: 1_000,
  maxTranscriptChars: 2_000_000,
  maxAudioBytes: 3 * 1_024 * 1_024,
  presignSec: 900,
} as const;

/** What the sender supplied. Plaintext: it exists only in memory for the length of a request. */
export interface InboxPayload {
  transcriptText: string | null;
  audio: { bytes: Uint8Array; mimeType: string } | null;
  phone: string | null;
  startedAt: string | null;
  direction: CallDirection | null;
  contactName: string | null;
}

/**
 * Seals plaintext to the user's inbox ECDH P-256 public key. Returns the 65-byte ephemeral
 * point and the AES-GCM envelope (`0x01 ‖ nonce ‖ ct ‖ tag`); `aad` is `inboxAad(userId)`.
 */
export type InboxSealer = (
  recipientPublicKey: Bytes,
  plaintext: Uint8Array,
  aad: Uint8Array,
) => Promise<{ ephemeralPublicKey: Bytes; ciphertext: Bytes }>;

const PAYLOAD_VERSION = 1;

/**
 * AAD for inbox items, as `@askcalls/crypto` builds it:
 * `u32be(len)‖userId ‖ u32be(0) (empty callId) ‖ u32be(len)‖"inbox-item"`, all UTF-8.
 */
export function inboxAad(userId: UserId): Uint8Array {
  const parts = [userId, '', 'inbox-item'].map((p) => new TextEncoder().encode(p));
  const out = new Uint8Array(parts.reduce((n, p) => n + 4 + p.length, 0));
  const view = new DataView(out.buffer);
  let o = 0;
  for (const p of parts) {
    view.setUint32(o, p.length);
    out.set(p, o + 4);
    o += 4 + p.length;
  }
  return out;
}

/**
 * Plaintext framing inside the sealed box:
 * `version (1 byte = 1) ‖ uint32be(headerLength) ‖ header JSON (UTF-8) ‖ audio bytes`.
 * The header holds every field except the audio bytes, plus `audioBytes` (their length).
 */
export function encodeInboxPayload(p: InboxPayload): Uint8Array {
  const header = new TextEncoder().encode(
    JSON.stringify({
      transcriptText: p.transcriptText,
      audioMimeType: p.audio?.mimeType ?? null,
      audioBytes: p.audio?.bytes.length ?? 0,
      phone: p.phone,
      startedAt: p.startedAt,
      direction: p.direction,
      contactName: p.contactName,
    }),
  );
  const audio = p.audio?.bytes ?? new Uint8Array();
  const out = new Uint8Array(5 + header.length + audio.length);
  out[0] = PAYLOAD_VERSION;
  new DataView(out.buffer).setUint32(1, header.length);
  out.set(header, 5);
  out.set(audio, 5 + header.length);
  header.fill(0);
  return out;
}

export function decodeInboxPayload(bytes: Uint8Array): InboxPayload {
  if (bytes.length < 5 || bytes[0] !== PAYLOAD_VERSION) {
    throw new DomainError('invalid', 'unknown inbox payload version');
  }
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset).getUint32(1);
  if (5 + headerLength > bytes.length) throw new DomainError('invalid', 'truncated inbox payload');
  const h = JSON.parse(new TextDecoder().decode(bytes.subarray(5, 5 + headerLength))) as {
    transcriptText: string | null;
    audioMimeType: string | null;
    audioBytes: number;
    phone: string | null;
    startedAt: string | null;
    direction: CallDirection | null;
    contactName: string | null;
  };
  const audio = bytes.subarray(5 + headerLength);
  if (audio.length !== h.audioBytes) throw new DomainError('invalid', 'truncated inbox payload');
  return {
    transcriptText: h.transcriptText,
    audio: h.audioMimeType ? { bytes: audio.slice(), mimeType: h.audioMimeType } : null,
    phone: h.phone,
    startedAt: h.startedAt,
    direction: h.direction,
    contactName: h.contactName,
  };
}

export async function uploadToInbox(
  ports: Ports,
  actor: Actor,
  payload: InboxPayload,
  seal: InboxSealer,
): Promise<{ id: string; expiresAt: Date }> {
  const userId = actor.userId;
  if (!payload.transcriptText && !payload.audio) {
    throw new DomainError('invalid', 'send a transcript or audio');
  }
  if ((payload.transcriptText?.length ?? 0) > INBOX_LIMITS.maxTranscriptChars) {
    throw new DomainError('invalid', 'transcript is too long');
  }
  if ((payload.audio?.bytes.length ?? 0) > INBOX_LIMITS.maxAudioBytes) {
    throw new DomainError('invalid', 'audio is too large');
  }
  const keys = await ports.keyring.getUserKeys(userId);
  if (!keys) throw new DomainError('conflict', 'set up encryption on a device first');
  if ((await ports.inbox.count(userId)) >= INBOX_LIMITS.maxPending) {
    throw new DomainError('quota_exceeded', 'too many unprocessed inbox items', {
      limit: INBOX_LIMITS.maxPending,
      quota: 'inbox',
    });
  }

  const id = ports.ids.randomId();
  const plaintext = encodeInboxPayload(payload);
  let sealed: { ephemeralPublicKey: Bytes; ciphertext: Bytes };
  try {
    sealed = await seal(keys.inboxPublicKey, plaintext, inboxAad(userId));
  } finally {
    // Discard the plaintext copy we own. Strings from the request body are left to the GC.
    plaintext.fill(0);
    payload.audio?.bytes.fill(0);
  }

  const now = ports.clock.now();
  const expiresAt = new Date(now.getTime() + INBOX_LIMITS.ttlMs);
  const inline = sealed.ciphertext.length <= INBOX_LIMITS.inlineMaxBytes;
  const blobKey = inline ? null : blobKeys.inbox(userId, id);
  if (blobKey) {
    await ports.blobs.put(blobKey, sealed.ciphertext, { contentType: 'application/octet-stream' });
  }
  await ports.inbox.create({
    id,
    userId,
    ephemeralPublicKey: sealed.ephemeralPublicKey,
    payloadCt: inline ? sealed.ciphertext : null,
    blobKey,
    expiresAt,
  });
  await audit(ports, actor, userId, 'inbox.upload', null, {
    inboxId: id,
    bytes: sealed.ciphertext.length,
    audio: payload.audio !== null,
  });
  return { id, expiresAt };
}

export interface InboxItemOut {
  id: string;
  ephemeralPublicKey: Bytes;
  payloadCt: Bytes | null;
  /** Presigned GET for payloads kept in the BlobStore. */
  payloadUrl: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export async function listInbox(ports: Ports, actor: Actor): Promise<InboxItemOut[]> {
  const items = await ports.inbox.list(actor.userId);
  return Promise.all(
    items.map(async (i: InboxItem) => ({
      id: i.id,
      ephemeralPublicKey: i.ephemeralPublicKey,
      payloadCt: i.payloadCt,
      payloadUrl: i.blobKey
        ? (await ports.blobs.presignGet(i.blobKey, { expiresInSec: INBOX_LIMITS.presignSec })).url
        : null,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
    })),
  );
}

export async function deleteInboxItem(ports: Ports, actor: Actor, id: string): Promise<void> {
  const item = await ports.inbox.delete(actor.userId, id);
  if (!item) throw new DomainError('not_found', 'inbox item not found');
  if (item.blobKey) await ports.blobs.delete(item.blobKey);
  await audit(ports, actor, actor.userId, 'inbox.delete', null, { inboxId: id });
}
