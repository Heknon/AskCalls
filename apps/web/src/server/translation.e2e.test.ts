import { ApiError } from '@askcalls/api-contract';
import { replaceCallContent } from '@askcalls/api-contract/routes/calls';
import {
  type ClientContext,
  createClientContext,
  findPassage,
  getCall,
  ingestCall,
  Onboarding,
  reindexCall,
  reindexCalls,
  reindexCandidates,
  searchCalls,
  updateCallMeta,
} from '@askcalls/client-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ClientDevice, type ClientHarness, startClientHarness } from './testing/client';

/**
 * Every call in both languages (translation milestone), end to end through client-core and the
 * route handlers with the mock LLM's dictionary translation.
 */

const HEBREW = {
  fileName: 'price-question.srt',
  text: [
    '1',
    '00:00:01,000 --> 00:00:04,000',
    'שלום, מה המחיר של המקררים?',
    '',
    '2',
    '00:00:04,500 --> 00:00:08,000',
    'המשלוח יגיע ביום שלישי בבוקר',
    '',
  ].join('\n'),
};

const ENGLISH = {
  fileName: 'contract.txt',
  text: [
    '[00:00:01] Agent: Hello, the price for the warehouse roof is 1,250 shekels.',
    '[00:00:07] Customer: Send the contract on Thursday.',
  ].join('\n'),
};

let h: ClientHarness;
let device: ClientDevice;
let ctx: ClientContext;
const ids = { he: '', en: '' };

async function onboard(d: ClientDevice) {
  const o = await Onboarding.begin(h.userId);
  await o.addPassphrase('a long enough passphrase for tests');
  const [g1, g2] = o.confirmationGroups;
  o.confirmRecovery({ [g1]: o.recoveryGroups[g1]!, [g2]: o.recoveryGroups[g2]! });
  await o.finish({
    api: d.ctx.api,
    session: d.session,
    deviceKeys: d.deviceKeys,
    deviceLabel: 'D',
  });
}

const found = async (text: string, semantic = false) =>
  (await searchCalls(ctx, { text, semantic })).items.map((i) => i.id).sort();

beforeAll(async () => {
  h = await startClientHarness();
  device = h.browser();
  ctx = device.ctx;
  await onboard(device);
  const he = await ingestCall(ctx, {
    source: 'app',
    transcript: HEBREW.text,
    transcriptFileName: HEBREW.fileName,
  });
  const en = await ingestCall(ctx, {
    source: 'app',
    transcript: ENGLISH.text,
    transcriptFileName: ENGLISH.fileName,
  });
  expect(he).toMatchObject({ status: 'done', translation: 'done' });
  expect(en).toMatchObject({ status: 'done', translation: 'done' });
  ids.he = (he as { callId: string }).callId;
  ids.en = (en as { callId: string }).callId;
});

afterAll(() => h.app.close());

describe('translation at ingest', () => {
  it('stores both languages, aligned, signed, with the language in the metadata', async () => {
    const he = await getCall(ctx, ids.he);
    expect(he.meta.language).toBe('he');
    expect(he.meta.translatedTo).toEqual(['en']);
    const tr = he.transcript.translations!.en!;
    expect(tr.segments.map((s) => s.text)).toEqual([
      'hello, מה price של refrigerators?',
      'delivery יגיע ביום tuesday morning',
    ]);
    expect(tr.segments.map((s) => [s.start, s.end])).toEqual(
      he.transcript.segments.map((s) => [s.start, s.end]),
    );
    expect(tr).toMatchObject({ provider: 'mock', model: 'mock-1' });
    expect(he.transcript.translations?.he).toBeUndefined();
    expect(he.signature.status).toBe('valid');

    const en = await getCall(ctx, ids.en);
    expect(en.meta.language).toBe('en');
    expect(en.meta.translatedTo).toEqual(['he']);
    expect(en.transcript.translations!.he!.text).toContain('מחיר');
    expect(en.signature.status).toBe('valid');
  });

  it('keyword search matches across languages, queries never translated', async () => {
    expect(await found('price')).toEqual([ids.he, ids.en].sort());
    expect(await found('refrigerators')).toEqual([ids.he]);
    expect(await found('מחיר')).toEqual([ids.he, ids.en].sort());
    expect(await found('חוזה')).toEqual([ids.en]);
    expect(await found('והחוזה')).toEqual([ids.en]);
    expect(await found('contract')).toEqual([ids.en]);
    const sent = h.app.ports.mockLlm.translated.length;
    await found('price delivery');
    expect(h.app.ports.mockLlm.translated.length).toBe(sent);
  });

  it('finds the passage in the language that matched', async () => {
    const he = await getCall(ctx, ids.he);
    const passage = findPassage(he.transcript, he.meta.language, new Set(['refrigerators']));
    expect(passage).toMatchObject({ lang: 'en', translated: true, segment: 0 });
    expect(passage!.hits).toEqual(['refrigerators']);
    const { forms } = await searchCalls(ctx, { text: 'מקררים' });
    const own = findPassage(he.transcript, 'he', new Set(forms));
    expect(own).toMatchObject({ lang: 'he', translated: false });
  });

  it('semantic search reports the language of the best chunk', async () => {
    const res = await searchCalls(ctx, { text: 'contract Thursday', semantic: true });
    const en = res.items.find((i) => i.id === ids.en)!;
    expect(en.snippet).not.toBeNull();
    expect(['en', 'he']).toContain(en.snippetLang);
    expect(en.snippetTranslated).toBe(en.snippetLang === 'he');
    const chunks = h.app.ports.db.chunks.get(ids.en)!;
    expect(chunks.map((c) => c.lang)).toEqual(['en', 'he']);
    expect(chunks.map((c) => c.ord)).toEqual([0, 1]);
  });

  it('keeps the call, untranslated, when translation fails', async () => {
    const llm = h.app.ports.mockLlm;
    const original = llm.translate.bind(llm);
    llm.translate = async () => {
      throw new Error('provider down');
    };
    try {
      const r = await ingestCall(ctx, {
        source: 'app',
        transcript: '[00:00:01] A: Hello, the invoice for the meeting is ready.',
      });
      expect(r).toMatchObject({ status: 'done', translation: 'failed' });
      const call = await getCall(ctx, (r as { callId: string }).callId);
      expect(call.transcript.translations ?? {}).toEqual({});
      expect(call.meta.translatedTo).toEqual([]);
    } finally {
      llm.translate = original;
    }
  });
});

describe('re-index and backfill', () => {
  let offline: ClientContext;

  beforeAll(() => {
    offline = createClientContext({
      api: ctx.api,
      session: device.session,
      embedder: h.embedder,
      clock: h.app.ports.clock,
    });
  });

  it('ingests without a translator as `off`, then backfills on the device', async () => {
    const r = await ingestCall(offline, {
      source: 'app',
      transcript: '[00:00:01] A: שלום, ההצעה לגג מוכנה',
    });
    expect(r).toMatchObject({ status: 'done', translation: 'off' });
    const id = (r as { callId: string }).callId;
    expect(await found('quote')).not.toContain(id);

    const candidates = await reindexCandidates(ctx, 'translate');
    expect(candidates).toContain(id);
    const progress: number[] = [];
    const result = await reindexCalls(ctx, {
      mode: 'translate',
      onProgress: (p) => progress.push(p.done),
    });
    expect(result.total).toBe(candidates.length);
    expect(result.failed).toBe(0);
    expect(progress.at(-1)).toBe(candidates.length);
    expect(await found('quote')).toContain(id);
    const call = await getCall(ctx, id);
    expect(call.meta.translatedTo).toEqual(['en']);
    expect(call.signature.status).toBe('valid');
    expect(h.app.ports.db.audit.filter((e) => e.action === 'call.reindex').length).toBe(
      candidates.length,
    );
    expect(await reindexCandidates(ctx, 'translate')).toEqual([]);
  });

  it('stops between calls and resumes where it left off', async () => {
    for (let i = 0; i < 4; i++) {
      await ingestCall(offline, { source: 'app', transcript: `[00:00:01] A: invoice ${i} ready` });
    }
    expect(await reindexCandidates(ctx, 'translate')).toHaveLength(4);
    const stop = new AbortController();
    const first = await reindexCalls(ctx, {
      mode: 'translate',
      concurrency: 1,
      signal: stop.signal,
      onProgress: (p) => {
        if (p.done === 1) stop.abort();
      },
    });
    expect(first.done).toBe(1);
    expect(await reindexCandidates(ctx, 'translate')).toHaveLength(3);
    const rest = await reindexCalls(ctx, { mode: 'translate' });
    expect(rest).toMatchObject({ total: 3, done: 3, failed: 0 });
    // The four, and the call whose translation failed at ingest, backfilled before.
    expect(await found('חשבונית')).toHaveLength(5);
  });

  it('re-indexes every call after a synonym change, keeping translations', async () => {
    expect(await found('orbitron')).toEqual([]);
    await ctx.userData.update('synonyms', (d) => ({
      ...d,
      entries: [{ canonical: 'orbitron', variants: ['warehouse'] }],
    }));
    const before = await getCall(ctx, ids.en);
    const r = await reindexCalls(ctx, { mode: 'all' });
    expect(r.failed).toBe(0);
    expect(await found('orbitron')).toEqual([ids.en]);
    const after = await getCall(ctx, ids.en);
    expect(after.transcript).toEqual(before.transcript);
    expect(after.tagToks).toEqual(before.tagToks);
    expect(after.signature.status).toBe('valid');
  });

  it('retries once on a concurrent change and refuses a stale write', async () => {
    const call = await getCall(ctx, ids.he);
    await updateCallMeta(ctx, call, { notes: 'later note' });
    await expect(
      ctx.api.request(replaceCallContent, {
        params: { id: ids.he },
        body: {
          transcriptCt: new Uint8Array(8),
          metaCt: new Uint8Array(8),
          keywordToks: [],
          chunks: [],
          expectedUpdatedAt: call.updatedAt,
        },
      }),
    ).rejects.toSatisfy((e) => e instanceof ApiError && e.code === 'version_conflict');
    expect(await reindexCall(ctx, ids.he, { translate: false })).toBe('reindexed');
    const after = await getCall(ctx, ids.he);
    expect(after.meta.notes).toBe('later note');
    expect(await found('price')).toContain(ids.he);
  });
});
