import {
  AadFields,
  aad,
  decrypt,
  decryptJson,
  encrypt,
  encryptJson,
  fromUtf8,
  unwrapDek,
  utf8,
} from '@askcalls/crypto';
import { type CallMeta, DomainError, type Transcript } from '@askcalls/domain';
import { z } from 'zod';
import type { KeySession } from './session';

/** `metaCt` plaintext (spec 5), validated on every decrypt. */
export const CallMetaSchema = z.object({
  phoneE164: z.string().nullable(),
  contactName: z.string().nullable(),
  direction: z.enum(['in', 'out', 'unknown']),
  startedAt: z.string().nullable(),
  durationSec: z.number().nullable(),
  title: z.string().nullable(),
  notes: z.string().nullable(),
  sourceFileName: z.string().nullable(),
  language: z.string().nullable(),
  signature: z.object({ deviceKeyId: z.string(), signature: z.string() }).nullable(),
  segmentsFormat: z.string().nullable(),
  translatedTo: z.array(z.string().regex(/^[a-z]{2}$/)).optional(),
}) satisfies z.ZodType<CallMeta>;

const SegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  speaker: z.string().optional(),
  text: z.string(),
});

const TranslationSchema = z.object({
  segments: z.array(SegmentSchema),
  text: z.string(),
  provider: z.string(),
  model: z.string(),
  createdAt: z.string(),
});

export const TranscriptSchema = z.object({
  segments: z.array(SegmentSchema),
  text: z.string(),
  translations: z.record(z.string().regex(/^[a-z]{2}$/), TranslationSchema).optional(),
}) satisfies z.ZodType<Transcript>;

export interface CallKeyContext {
  userId: string;
  callId: string;
}

const field = (ctx: CallKeyContext, f: string) => aad({ ...ctx, field: f });

export const openDek = (session: KeySession, callId: string, wrappedDek: Uint8Array) =>
  unwrapDek(session.keys.kek, { userId: session.userId, callId }, wrappedDek);

/** The exact bytes encrypted into `transcriptCt` (and signed, spec 6.6). */
export const transcriptPlaintext = (t: Transcript) =>
  utf8(
    JSON.stringify(
      t.translations && Object.keys(t.translations).length
        ? { segments: t.segments, text: t.text, translations: t.translations }
        : { segments: t.segments, text: t.text },
    ),
  );

export const encryptTranscript = (dek: CryptoKey, ctx: CallKeyContext, plaintext: Uint8Array) =>
  encrypt(dek, plaintext, field(ctx, AadFields.transcript));

export async function decryptTranscript(
  dek: CryptoKey,
  ctx: CallKeyContext,
  ct: Uint8Array,
): Promise<{ transcript: Transcript; plaintext: Uint8Array }> {
  const plaintext = await decrypt(dek, ct, field(ctx, AadFields.transcript));
  let json: unknown;
  try {
    json = JSON.parse(fromUtf8(plaintext));
  } catch {
    throw new DomainError('invalid', 'transcript could not be decoded');
  }
  const r = TranscriptSchema.safeParse(json);
  if (!r.success) throw new DomainError('invalid', 'transcript has an unexpected shape');
  return { transcript: r.data, plaintext };
}

export const encryptMeta = (dek: CryptoKey, ctx: CallKeyContext, meta: CallMeta) =>
  encryptJson(dek, CallMetaSchema.parse(meta), field(ctx, AadFields.meta));

export async function decryptMeta(
  dek: CryptoKey,
  ctx: CallKeyContext,
  ct: Uint8Array,
): Promise<CallMeta> {
  const r = CallMetaSchema.safeParse(await decryptJson(dek, ct, field(ctx, AadFields.meta)));
  if (!r.success) throw new DomainError('invalid', 'call metadata has an unexpected shape');
  return r.data;
}

export const encryptSnippet = (dek: CryptoKey, ctx: CallKeyContext, ord: number, text: string) =>
  encrypt(dek, utf8(text), field(ctx, AadFields.snippet(ord)));

export const decryptSnippet = async (
  dek: CryptoKey,
  ctx: CallKeyContext,
  ord: number,
  ct: Uint8Array,
) => fromUtf8(await decrypt(dek, ct, field(ctx, AadFields.snippet(ord))));

export const recordingAad = (ctx: CallKeyContext) => field(ctx, AadFields.recording);
