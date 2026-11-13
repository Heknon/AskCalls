import { z } from 'zod';
import { defineRoute } from '../route';
import { B64, BytesCodec, b64Len, DateCodec } from '../wire';

/**
 * Spec 6.7. The body is plaintext: the server sees it in transit, seals it to the user's
 * inbox public key and discards it. Never logged, never stored unencrypted.
 */
export const uploadInbox = defineRoute({
  method: 'POST',
  path: '/api/inbox',
  auth: 'write',
  body: z
    .object({
      transcriptText: z.string().min(1).max(2_000_000).optional(),
      /** Base64 audio, at most 3 MB decoded. */
      audioBase64: B64.max(b64Len(3 * 1024 * 1024)).optional(),
      audioMimeType: z.string().max(100).optional(),
      phone: z.string().max(40).optional(),
      startedAt: z.iso.datetime({ offset: true }).optional(),
      direction: z.enum(['in', 'out', 'unknown']).optional(),
      contactName: z.string().max(200).optional(),
    })
    .refine((b) => b.transcriptText || b.audioBase64, 'send a transcript or audio'),
  response: z.object({ id: z.string(), expiresAt: DateCodec, visibleInTransit: z.literal(true) }),
});

export const InboxItemSchema = z.object({
  id: z.string(),
  ephemeralPublicKey: BytesCodec,
  payloadCt: BytesCodec.nullable(),
  /** Presigned GET for payloads kept in blob storage. */
  payloadUrl: z.string().nullable(),
  createdAt: DateCodec,
  expiresAt: DateCodec,
});

export const listInbox = defineRoute({
  method: 'GET',
  path: '/api/inbox',
  auth: 'read',
  response: z.object({ items: z.array(InboxItemSchema) }),
});

export const deleteInbox = defineRoute({
  method: 'DELETE',
  path: '/api/inbox/:id',
  auth: 'write',
  params: z.object({ id: z.string().min(1).max(64) }),
  response: z.object({ deleted: z.literal(true) }),
});
