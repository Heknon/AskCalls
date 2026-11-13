import { decryptMeta, decryptTranscript } from '@askcalls/client-core/call-crypto';
import { fromHex, token, tokenSet, UnlockedKeys, unwrapDek } from '@askcalls/crypto';
import { dayFromDate, durationBucket } from '@askcalls/domain';
import { describe, expect, it } from 'vitest';
import data from './diagram.generated.json';
import { MARKETING_CALL } from './sample-call';

describe.each(['en', 'he'] as const)('the %s privacy diagram data', (locale) => {
  const rec = data[locale];
  const call = MARKETING_CALL[locale];

  it('decrypts with the published demo key to the sample call', async () => {
    const keys = await UnlockedKeys.fromRootKey(fromHex(rec.rootKey));
    const ctx = { userId: rec.userId, callId: rec.callId };
    const dek = await unwrapDek(keys.kek, ctx, fromHex(rec.wrappedDek));
    const { transcript } = await decryptTranscript(dek, ctx, fromHex(rec.transcriptCt));
    expect(transcript.segments).toEqual(call.segments);
    const meta = await decryptMeta(dek, ctx, fromHex(rec.metaCt));
    expect(meta.contactName).toBe(call.contactName);
    expect(meta.phoneE164).toBe(call.phoneE164);
  });

  it('has the tokens the index key gives for the contact and the tag', async () => {
    const keys = await UnlockedKeys.fromRootKey(fromHex(rec.rootKey));
    expect(String(await token(keys.indexKey, 'c', call.phoneE164))).toBe(rec.contactTok);
    expect((await tokenSet(keys.indexKey, 't', [rec.tagId])).map(String)).toEqual(rec.tagToks);
  });

  it('carries the day and duration bucket the server stores', () => {
    expect(rec.day).toBe(dayFromDate(new Date(call.startedAt)));
    expect(rec.durationBucket).toBe(durationBucket(call.durationSec));
  });

  it('holds no plaintext from the call', () => {
    const json = JSON.stringify(rec);
    for (const word of [call.contactName, call.phoneE164, call.tag, '9,400'])
      expect(json).not.toContain(word);
  });
});
