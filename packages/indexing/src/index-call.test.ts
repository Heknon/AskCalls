import { DomainError, type Transcript } from '@askcalls/domain';
import { describe, expect, it } from 'vitest';
import { createFakeEmbedder } from '../test/fake-embedder';
import { analyzeCall, contentText, indexCall } from './index-call';
import { buildIntentPrototypes } from './intents';
import { normalizeWord } from './normalize';
import { prepareQuery } from './query';
import { parseRules } from './rules';

const transcript: Transcript = {
  segments: [
    { start: 0, end: 6, speaker: 'נציג', text: 'שלום, מדבר יוסי ממוקד השירות. איך אפשר לעזור?' },
    {
      start: 6,
      end: 15,
      speaker: 'לקוח',
      text: 'היי יוסי, זו רונית כהן. המזגן שקניתי לא מקרר, והטכנאי לא הגיע. My number is 054-765-4321.',
    },
    { start: 15, end: 22, speaker: 'נציג', text: 'אני מצטער. אפשר לקבוע טכנאי ליום שלישי בבוקר?' },
    {
      start: 22,
      end: 31,
      speaker: 'לקוח',
      text: 'כן. ותשלחו לי חשבונית ל-ronit@example.com, ת"ז 123456782.',
    },
  ],
  text: '',
};
transcript.text = transcript.segments.map((s) => s.text).join('\n');

describe('analyzeCall', () => {
  const out = analyzeCall({
    transcript,
    meta: { phone: '054-765-4321', direction: 'in' },
    contacts: [
      { name: 'רונית כהן', phones: ['+972 54 765 4321'] },
      { name: 'Dana', phones: ['03-1234567'] },
    ],
    synonyms: [{ canonical: 'ac', variants: ['מזגן'] }],
  });

  it('extracts normal-form keywords including prefix forms and synonyms, without stopwords', () => {
    for (const w of [
      'המזגנ',
      'מזגנ',
      'ac',
      'טכנאי',
      'והטכנאי',
      'חשבונית',
      'שלישי',
      'בבוקר',
      'בוקר',
    ]) {
      expect(out.keywords).toContain(w);
    }
    expect(out.keywords).not.toContain('אני');
    expect(out.keywords).not.toContain('is');
    expect(out.vocabularyDelta.get('טכנאי')).toBe(2);
  });

  it('parses the contact phone to E.164 and finds the contact name', () => {
    expect(out.contactE164).toBe('+972547654321');
    expect(out.contactName).toBe('רונית כהן');
  });

  it('derives duration from segments when metadata has none', () => {
    expect(out.durationSec).toBe(31);
    expect(out.durationBucket).toBe(0);
    expect(analyzeCall({ transcript, meta: { durationSec: 700 } }).durationBucket).toBe(2);
    expect(
      analyzeCall({ transcript: { segments: [{ start: 0, end: 0, text: 'hi' }], text: 'hi' } })
        .durationSec,
    ).toBeNull();
  });

  it('redacts what gets embedded, and keeps the original words in the encrypted snippet', () => {
    expect(out.chunks).toHaveLength(1);
    const c = out.chunks[0]!;
    expect(c.embedText.startsWith('passage: ')).toBe(true);
    expect(c.text).toContain('זו [NAME] [NAME]');
    expect(c.text).toContain('[PHONE]');
    expect(c.text).toContain('[EMAIL]');
    expect(c.text).toContain('[ID]');
    for (const secret of ['רונית', 'כהן', '054', '4321', 'ronit@', '123456782']) {
      expect(c.text).not.toContain(secret);
      expect(c.embedText).not.toContain(secret);
    }
    expect(c.snippet).toContain('רונית');
    expect(c.snippet).not.toContain('[NAME]');
    expect([...c.snippet].length).toBeLessThanOrEqual(300);
    expect(out.redactionCounts).toMatchObject({ NAME: 2, PHONE: 1, EMAIL: 1, ID: 1 });
  });

  it('keywords do keep what was said (they are hashed, not stored)', () => {
    expect(out.keywords).toContain(normalizeWord('רונית'));
  });

  it('content text is format-independent', () => {
    expect(out.contentText).toBe(contentText(transcript.text));
    expect(contentText('ש\u05b8\u05c1לו\u05b9ם, World!')).toBe(contentText('שלום world'));
  });

  it('caps keywords deterministically', () => {
    const words = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
    const t = { segments: [{ start: 0, end: 1, text: words }], text: words };
    const a = analyzeCall({ transcript: t, keywordCap: 50 });
    const b = analyzeCall({ transcript: t, keywordCap: 50 });
    expect(a.keywords).toHaveLength(50);
    expect(a.keywordsCapped).toBe(true);
    expect(a.keywords).toEqual(b.keywords);
    expect(a.keywordCounts.size).toBe(300);
  });
});

describe('indexCall', () => {
  it('embeds chunks in one batch, classifies intents and applies rules', async () => {
    const fake = createFakeEmbedder();
    const intents = await buildIntentPrototypes(
      [{ id: 'technician', examples: ['לקבוע טכנאי', 'הטכנאי לא הגיע', 'המזגן לא מקרר'] }],
      fake.embed,
    );
    const rules = parseRules([
      {
        id: 'service',
        conditions: [{ type: 'intent', intentId: 'technician' }],
        actions: [{ type: 'add_tag', tagId: 'tag-service' }],
      },
      {
        id: 'known',
        match: 'all',
        conditions: [
          { type: 'contact', op: 'in' },
          { type: 'keyword', terms: ['חשבונית'] },
        ],
        actions: [{ type: 'star' }],
      },
    ]);
    fake.calls.length = 0;
    const out = await indexCall({
      transcript,
      meta: { phone: '0547654321' },
      contacts: [{ name: 'רונית כהן', phones: ['054-765-4321'] }],
      intents,
      intentThreshold: 0.3,
      minSimilarity: 0,
      rules,
      embed: fake.embed,
    });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toEqual(out.chunks.map((c) => c.embedText));
    expect(out.chunks[0]!.embedding).toHaveLength(384);
    expect(out.intentIds).toEqual(['technician']);
    expect(out.tagIds).toEqual(['__star', 'tag-service']);
    expect(out.matchedRuleIds).toEqual(['service', 'known']);
  });

  it('skips the embedder for an empty transcript', async () => {
    const fake = createFakeEmbedder();
    const out = await indexCall({ transcript: { segments: [], text: '' }, embed: fake.embed });
    expect(fake.calls).toHaveLength(0);
    expect(out.chunks).toEqual([]);
    expect(out.keywords).toEqual([]);
  });

  it('fails clearly when the embedder returns the wrong count', async () => {
    await expect(indexCall({ transcript, embed: async () => [] })).rejects.toThrow(DomainError);
  });

  it('a query prepared with the same options hits the indexed forms', async () => {
    const out = analyzeCall({ transcript });
    const indexed = new Set(out.keywords);
    for (const q of ['טכנאי', 'הטכנאי', 'לטכנאי', 'מזגן', 'חשבונית', 'שלישי', 'השירות']) {
      const groups = prepareQuery(q).keywordGroups;
      expect(groups.every((g) => g.some((f) => indexed.has(f)))).toBe(true);
    }
  });
});

describe('performance', () => {
  it('indexes a 60-minute transcript (~9,000 words) well under a second, excluding embeddings', () => {
    const he =
      'שלום תודה המחיר של המזגן החדש כולל התקנה ושלוש שנות אחריות והטכנאי יגיע ביום שלישי בבוקר אם אפשר לקבוע'.split(
        ' ',
      );
    const en =
      'the price includes installation and three years of warranty and the technician will arrive on tuesday morning'.split(
        ' ',
      );
    const segments = [];
    let t = 0;
    let n = 0;
    for (let i = 0; n < 9000; i++) {
      const pool = i % 3 === 0 ? en : he;
      const words = Array.from(
        { length: 15 },
        (_, k) => `${pool[(i * 7 + k) % pool.length]}${(i * 31 + k) % 400}`,
      );
      if (i % 20 === 0) words.push('054-123-4567', 'לדני', 'dani@example.com');
      n += words.length;
      segments.push({ start: t, end: t + 6, speaker: i % 2 ? 'A' : 'B', text: words.join(' ') });
      t += 6;
    }
    const tr = { segments, text: segments.map((s) => s.text).join('\n') };
    const t0 = performance.now();
    const out = analyzeCall({
      transcript: tr,
      meta: { phone: '054-123-4567' },
      contacts: Array.from({ length: 300 }, (_, i) => ({
        name: `איש קשר${i} דני`,
        phones: [`050-000-${String(i).padStart(4, '0')}`],
      })),
    });
    const ms = performance.now() - t0;
    expect(out.wordCount).toBeGreaterThanOrEqual(9000);
    expect(out.keywords.length).toBe(5000);
    expect(out.chunks.length).toBeGreaterThan(80);
    expect(ms).toBeLessThan(1000);
  });
});
