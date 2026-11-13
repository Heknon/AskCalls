import {
  CallMetaSchema,
  encryptMeta,
  encryptTranscript,
  transcriptPlaintext,
} from '@askcalls/client-core/call-crypto';
import { createDek, generateRootKey, toHex, token, tokenSet, UnlockedKeys } from '@askcalls/crypto';
import { dayFromDate, durationBucket } from '@askcalls/domain';
import type { MarketingCall } from './sample-call';

/** What the server stores for the sample call: the fields the privacy diagram shows, as hex and decimal strings. */
export interface DiagramRecord {
  /** Demo-only keys, published so anyone can check the bytes decrypt to the sample call. */
  rootKey: string;
  userId: string;
  callId: string;
  tagId: string;
  wrappedDek: string;
  transcriptCt: string;
  metaCt: string;
  contactTok: string;
  tagToks: string[];
  day: number;
  durationBucket: number;
}

/**
 * Runs the sample call through the same encryption the ingest pipeline uses (client-core's
 * call-crypto and @askcalls/crypto tokens) under a fresh demo root key.
 */
export async function encryptSampleCall(call: MarketingCall): Promise<DiagramRecord> {
  const rootKey = generateRootKey();
  const keys = await UnlockedKeys.fromRootKey(rootKey);
  const userId = globalThis.crypto.randomUUID();
  const callId = globalThis.crypto.randomUUID();
  const tagId = globalThis.crypto.randomUUID();
  const ctx = { userId, callId };
  const { dek, wrappedDek } = await createDek(keys.kek, ctx);
  const text = call.segments.map((s) => s.text).join('\n');
  const meta = CallMetaSchema.parse({
    phoneE164: call.phoneE164,
    contactName: call.contactName,
    direction: 'in',
    startedAt: call.startedAt,
    durationSec: call.durationSec,
    title: null,
    notes: null,
    sourceFileName: null,
    language: null,
    signature: null,
    segmentsFormat: null,
  });
  const [transcriptCt, metaCt, contactTok, tagToks] = await Promise.all([
    encryptTranscript(dek, ctx, transcriptPlaintext({ segments: call.segments, text })),
    encryptMeta(dek, ctx, meta),
    token(keys.indexKey, 'c', call.phoneE164),
    tokenSet(keys.indexKey, 't', [tagId]),
  ]);
  keys.wipe();
  return {
    rootKey: toHex(rootKey),
    userId,
    callId,
    tagId,
    wrappedDek: toHex(wrappedDek),
    transcriptCt: toHex(transcriptCt),
    metaCt: toHex(metaCt),
    contactTok: contactTok.toString(),
    tagToks: tagToks.map(String),
    day: dayFromDate(new Date(call.startedAt)),
    durationBucket: durationBucket(call.durationSec),
  };
}
