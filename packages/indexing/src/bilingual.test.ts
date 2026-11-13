import type { Transcript, TranscriptSegment } from '@askcalls/domain';
import { describe, expect, it } from 'vitest';
import { createFakeEmbedder } from '../test/fake-embedder';
import { analyzeCall, indexCall } from './index-call';
import { MAX_KEYWORDS_PER_TEXT } from './keywords';
import { prepareQuery } from './query';
import { parseRules } from './rules';

const seg = (start: number, text: string): TranscriptSegment => ({
  start,
  end: start + 5,
  speaker: start % 10 ? 'B' : 'A',
  text,
});

function transcript(segments: TranscriptSegment[], translations?: Transcript['translations']) {
  return {
    segments,
    text: segments.map((s) => s.text).join('\n'),
    ...(translations && { translations }),
  } satisfies Transcript;
}

function translation(segments: TranscriptSegment[]) {
  return {
    segments,
    text: segments.map((s) => s.text).join('\n'),
    provider: 'mock',
    model: 'mock-1',
    createdAt: '2026-06-15T12:00:00Z',
  };
}

const hebrewCall = transcript(
  [seg(0, 'שלום, מה המחיר של המקרר?'), seg(5, 'המשלוח יגיע ביום שלישי')],
  {
    en: translation([
      seg(0, 'Hello, what is the price of the refrigerator?'),
      seg(5, 'The delivery arrives on Tuesday'),
    ]),
  },
);

const englishCall = transcript(
  [seg(0, 'The price per panel is 1,250 shekels.'), seg(5, 'Send the contract by Thursday.')],
  {
    he: translation([seg(0, 'המחיר לפאנל הוא 1,250 שקל.'), seg(5, 'שלחו את החוזה עד יום חמישי.')]),
  },
);

/** Does a keyword query match the call, the way the server ANDs groups and ORs variants? */
function matches(keywords: readonly string[], query: string): boolean {
  const set = new Set(keywords);
  const q = prepareQuery(query);
  return q.keywordGroups.length > 0 && q.keywordGroups.every((g) => g.some((f) => set.has(f)));
}

describe('bilingual keyword index', () => {
  const he = analyzeCall({ transcript: hebrewCall, language: 'he' });
  const en = analyzeCall({ transcript: englishCall, language: 'en' });

  it('finds a Hebrew-only original by an English word of its translation', () => {
    expect(matches(he.keywords, 'price')).toBe(true);
    expect(matches(he.keywords, 'refrigerator delivery')).toBe(true);
    expect(matches(he.keywords, 'מחיר')).toBe(true);
  });

  it('finds an English original by a Hebrew word of its translation', () => {
    expect(matches(en.keywords, 'מחיר')).toBe(true);
    expect(matches(en.keywords, 'חוזה')).toBe(true);
    expect(matches(en.keywords, 'price')).toBe(true);
  });

  it('matches Hebrew prefix forms in queries against the Hebrew translation', () => {
    // "והמחיר" (and the price), "בחוזה" (in the contract), "שהחוזה" (that the contract).
    expect(matches(en.keywords, 'והמחיר')).toBe(true);
    expect(matches(en.keywords, 'בחוזה')).toBe(true);
    expect(matches(en.keywords, 'שהחוזה')).toBe(true);
    // The translation's own prefixed word is indexed with its stripped forms too.
    expect(matches(en.keywords, 'לפאנל')).toBe(true);
  });

  it('does not match words in neither language', () => {
    expect(matches(he.keywords, 'contract')).toBe(false);
    expect(matches(en.keywords, 'מקרר')).toBe(false);
  });

  it('keeps the original first, adds translation counts and the content text of the original only', () => {
    expect(he.keywords.indexOf('מחיר')).toBeLessThan(he.keywords.indexOf('price'));
    expect(he.vocabularyDelta.get('price')).toBe(1);
    expect(he.contentText).toBe(
      analyzeCall({ transcript: { ...hebrewCall, translations: {} } }).contentText,
    );
    expect(he.wordCount).toBe(9);
  });

  it('caps each text on its own', () => {
    const many = (prefix: string) =>
      Array.from({ length: 40 }, (_, i) => seg(i * 5, `${prefix}${i}a ${prefix}${i}b`));
    const t = transcript(many('orig'), { he: translation(many('tr')) });
    const out = analyzeCall({ transcript: t, language: 'en', keywordCap: 30 });
    expect(out.keywordsCapped).toBe(true);
    expect(out.keywords.filter((k) => k.startsWith('orig'))).toHaveLength(30);
    expect(out.keywords.filter((k) => k.startsWith('tr'))).toHaveLength(30);
    expect(MAX_KEYWORDS_PER_TEXT).toBe(5000);
  });
});

describe('bilingual chunks', () => {
  it('chunks the original and each translation with unique ords and their language', async () => {
    const out = await indexCall({
      transcript: hebrewCall,
      language: 'he',
      embed: createFakeEmbedder().embed,
    });
    expect(out.chunks.map((c) => [c.ord, c.lang, c.translated])).toEqual([
      [0, 'he', false],
      [1, 'en', true],
    ]);
    expect(out.chunks[1]!.snippet).toContain('price');
    expect(out.chunks[1]!.embedText.startsWith('passage: ')).toBe(true);
  });

  it('redacts translations like the original', () => {
    const t = transcript([seg(0, 'דנה התקשרה מ-054-765-4321')], {
      en: translation([seg(0, 'Dana called from 054-765-4321')]),
    });
    const out = analyzeCall({
      transcript: t,
      language: 'he',
      contacts: [{ name: 'Dana', phones: [] }],
    });
    expect(out.chunks[1]!.text).toBe('[NAME] called from [PHONE]');
    expect(out.chunks.map((c) => c.text).join(' ')).not.toContain('4321');
  });

  it('runs keyword rules against every language', async () => {
    const rules = parseRules([
      {
        id: 'r1',
        conditions: [{ type: 'keyword', terms: ['price'] }],
        actions: [{ type: 'add_tag', tagId: 'pricing' }],
      },
    ]);
    const out = await indexCall({
      transcript: hebrewCall,
      language: 'he',
      embed: createFakeEmbedder().embed,
      rules,
    });
    expect(out.tagIds).toContain('pricing');
  });
});
