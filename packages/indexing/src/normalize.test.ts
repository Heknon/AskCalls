import { describe, expect, it } from 'vitest';
import { wordForms } from './forms';
import { hebrewPrefixForms, matchWithPrefix } from './hebrew';
import { foldDigits, foldDigitsInPlace, normalizeWord, tokenize } from './normalize';
import { buildStopwordSet, DEFAULT_STOPWORDS } from './stopwords';
import { buildSynonymLookup, SynonymMapSchema } from './synonyms';

/** [input, normal form] */
const NORMALIZE: Array<[string, string]> = [
  // case and NFKC
  ['Hello', 'hello'],
  ['IPHONE', 'iphone'],
  ['ﬁle', 'file'],
  ['Ｔｅｌ', 'tel'],
  ['①', '1'],
  ['Straße', 'straße'],
  // Latin diacritics
  ['Café', 'cafe'],
  ['naïve', 'naive'],
  ['São', 'sao'],
  ['Ångström', 'angstrom'],
  // niqqud and cantillation
  ['ש\u05b8\u05c1לו\u05b9ם', 'שלומ'],
  ['ב\u05b0\u05bcר\u05b5אש\u05b4\u05c1ית', 'בראשית'],
  ['ה\u05b7ב\u05b7\u05bcי\u05b4ת', 'הבית'],
  ['י\u05b0רו\u05bcש\u05b8\u05c1ל\u05b7י\u05b4ם', 'ירושלימ'],
  ['ת\u05bcו\u05b9ר\u05b8ה', 'תורה'],
  ['ו\u05b7י\u05b9\u05bcאמ\u05b6ר\u05ae', 'ויאמר'],
  ['א\u05b1ל\u05b9ה\u05b4\u0591ים', 'אלהימ'],
  ['ש\u05c1', 'ש'],
  ['ש\u05c2', 'ש'],
  ['ﬠ', 'ע'],
  // final letters
  ['ך', 'כ'],
  ['מלך', 'מלכ'],
  ['שלום', 'שלומ'],
  ['אמן', 'אמנ'],
  ['כסף', 'כספ'],
  ['ארץ', 'ארצ'],
  ['מלכים', 'מלכימ'],
  ['לחץ', 'לחצ'],
  // punctuation stripped
  ['שלום!', 'שלומ'],
  ['"שלום"', 'שלומ'],
  ['(hello)', 'hello'],
  ['?מה', 'מה'],
  ['...ok', 'ok'],
  ['e-mail', 'email'],
  ['תל-אביב', 'תלאביב'],
  ['תל־אביב', 'תלאביב'],
  ['10:30', '1030'],
  ['a/b', 'ab'],
  // inner apostrophes and gershayim kept, outer stripped
  ["don't", "don't"],
  ['don’t', "don't"],
  ["'quoted'", 'quoted'],
  ["ג'ירפה", "ג'ירפה"],
  ['ג׳ירפה', "ג'ירפה"],
  ['צה״ל', 'צה״ל'],
  ['צה"ל', 'צה״ל'],
  ['צה“ל', 'צה״ל'],
  ['מע"מ', 'מע״מ'],
  ['ת"א', 'ת״א'],
  ['"תודה"', 'תודה'],
  ["רח'", 'רח'],
  // digits
  ['١٢٣', '123'],
  ['۴۵۶', '456'],
  ['१२३', '123'],
  ['১০', '10'],
  ['๓', '3'],
  ['𝟗', '9'],
  ['1,200', '1200'],
  ['1,200,000', '1200000'],
  ['3.5', '35'],
  ['₪500', '500'],
  ['050', '050'],
  // Arabic
  ['م\u064fح\u064eم\u064e\u0651د', 'محمد'],
  ['أحمد', 'احمد'],
  ['إسلام', 'اسلام'],
  ['آمن', 'امن'],
  ['مدرسة', 'مدرسه'],
  ['مستشفى', 'مستشفي'],
  ['كتـــاب', 'كتاب'],
  // Russian
  ['Ёлка', 'елка'],
  ['ПРИВЕТ', 'привет'],
  ['чай,', 'чай'],
  ['йод', 'йод'],
  // mixed and empty
  ['iPhone15', 'iphone15'],
  ['!!!', ''],
  ['', ''],
];

/** [word, forms emitted besides the word itself] */
const PREFIXES: Array<[string, string[]]> = [
  // one prefix letter
  ['הבית', ['בית']],
  ['לדני', ['דני']],
  ['ודני', ['דני']],
  ['בבית', ['בית']],
  ['מהבית', ['הבית', 'בית']],
  ['שהלכתי', ['הלכתי', 'לכתי']],
  ['כשהגעתי', ['שהגעתי', 'הגעתי', 'געתי']],
  ['לחיפה', ['חיפה']],
  ['בתלם', ['תלמ']],
  ['כמחיר', ['מחיר']],
  ['ומחיר', ['מחיר', 'חיר']],
  ['למשרד', ['משרד']],
  ['בעוד', ['עוד']],
  ['והחשבונית', ['החשבונית', 'חשבונית']],
  // two letters
  ['ובבית', ['בבית', 'בית']],
  ['שבבית', ['בבית', 'בית']],
  ['וכשהגענו', ['כשהגענו', 'שהגענו', 'הגענו', 'גענו']],
  ['שבירושלים', ['בירושלימ', 'ירושלימ']],
  ['וההזמנה', ['ההזמנה', 'הזמנה']],
  ['מהמשרד', ['המשרד', 'משרד']],
  ['שהמחיר', ['המחיר', 'מחיר']],
  ['ולדני', ['לדני', 'דני']],
  ['שלדני', ['לדני', 'דני']],
  ['ומהבית', ['מהבית', 'הבית', 'בית']],
  ['כשבאתי', ['שבאתי', 'באתי', 'אתי']],
  ['לכשיגיע', ['כשיגיע', 'יגיע']],
  ['ולכשתבוא', ['לכשתבוא', 'כשתבוא', 'תבוא']],
  ['משהגיע', ['שהגיע', 'הגיע', 'גיע']],
  ['ובחיפה', ['בחיפה', 'חיפה']],
  ['שבתל', ['בתל', 'תל']],
  ['וכשאני', ['כשאני', 'שאני', 'אני']],
  // final letters are mapped before stripping
  ['בשלום', ['שלומ']],
  ['והשקלים', ['השקלימ', 'שקלימ']],
  // gershayim and geresh inside a prefixed word
  ['בצה״ל', ['צה״ל']],
  ['בצה"ל', ['צה״ל']],
  ["לג'ירפה", ["ג'ירפה"]],
  ['במע״מ', ['מע״מ']],
  // prefixed English or digits after a Hebrew prefix letter
  ['ה2024', ['2024']],
  ['לiphone', ['iphone']],
  // no expansion: 3 letters or fewer, or no prefix letter first
  ['בית', []],
  ['לנו', []],
  ['מה', []],
  ['שלי', []],
  ['דני', []],
  ['ספר', []],
  ['אבא', []],
  ['תודה', []],
  ['רכבת', []],
  ['גמל', []],
  ['iphone', []],
  ['1234', []],
  // stems shorter than two letters are not emitted
  ['ובה', []],
  ['והי', []],
];

describe('normalizeWord', () => {
  it.each(NORMALIZE)('%j → %j', (input, expected) => {
    expect(normalizeWord(input)).toBe(expected);
  });
});

describe('Hebrew prefix expansion', () => {
  it.each(PREFIXES)('%s → %j', (word, expected) => {
    expect(hebrewPrefixForms(normalizeWord(word))).toEqual(expected);
  });

  it('has at least 100 table cases between normalization and prefixes', () => {
    expect(NORMALIZE.length + PREFIXES.length).toBeGreaterThanOrEqual(100);
  });

  it('applies the same expansion to queries and transcripts, so prefixed text matches bare queries', () => {
    const indexed = new Set(wordForms(normalizeWord('וכשהגענו')).map((f) => f.form));
    const query = wordForms(normalizeWord('הגענו')).map((f) => f.form);
    expect(query.some((f) => indexed.has(f))).toBe(true);
    const prefixedQuery = wordForms(normalizeWord('לדני')).map((f) => f.form);
    const bareDoc = new Set(wordForms(normalizeWord('דני')).map((f) => f.form));
    expect(prefixedQuery.some((f) => bareDoc.has(f))).toBe(true);
  });

  it('matchWithPrefix splits the grammatical prefix from a known stem', () => {
    const names = new Set(['דני', 'רונ']);
    expect(matchWithPrefix('לדני', names)).toEqual({ prefix: 'ל', stem: 'דני' });
    expect(matchWithPrefix('ולדני', names)).toEqual({ prefix: 'ול', stem: 'דני' });
    expect(matchWithPrefix('דני', names)).toEqual({ prefix: '', stem: 'דני' });
    expect(matchWithPrefix('ברונ', names)).toEqual({ prefix: 'ב', stem: 'רונ' });
    expect(matchWithPrefix('אדני', names)).toBeNull();
    expect(matchWithPrefix('דניאל', names)).toBeNull();
  });
});

describe('tokenize', () => {
  it.each<[string, string[]]>([
    ['שלום, מה נשמע?', ['שלומ', 'מה', 'נשמע']],
    ['Hello, world!', ['hello', 'world']],
    ['צה"ל ו-ת"א', ['צה״ל', 'ו', 'ת״א']],
    ['ה-iPhone שלי', ['ה', 'iphone', 'שלי']],
    ['עולה ₪1,200 לחודש', ['עולה', '1200', 'לחודש']],
    ['call 054-1234567', ['call', '054', '1234567']],
    ["I'm here", ["i'm", 'here']],
    ['  \n\t ', []],
    ['مرحبا بالعالم', ['مرحبا', 'بالعالم']],
    ['Привет, мир', ['привет', 'мир']],
    ['שלום\u200f world\u200e', ['שלומ', 'world']],
  ])('%j', (text, expected) => {
    expect(tokenize(text)).toEqual(expected);
  });
});

describe('digits', () => {
  it('folds every Unicode decimal digit block', () => {
    // Arabic-Indic, Extended Arabic-Indic, Devanagari, Bengali, Thai, Tibetan, Myanmar, Fullwidth, Mathematical
    const samples = [
      '٠١٢٣٤٥٦٧٨٩',
      '۰۱۲۳۴۵۶۷۸۹',
      '०१२३४५६७८९',
      '০১২৩৪৫৬৭৮৯',
      '๐๑๒๓๔๕๖๗๘๙',
      '༠༡༢༣༤༥༦༧༨༩',
      '၀၁၂၃၄၅၆၇၈၉',
    ];
    for (const s of samples) expect(foldDigits(s)).toBe('0123456789');
    expect(normalizeWord('０１２')).toBe('012');
    expect(normalizeWord('𝟎𝟏𝟐')).toBe('012');
  });
  it('folds in place for BMP digits', () => {
    const s = 'טל ٠٥٤-١٢٣';
    expect(foldDigitsInPlace(s)).toBe('טל 054-123');
    expect(foldDigitsInPlace(s)).toHaveLength(s.length);
  });
});

describe('wordForms', () => {
  it('drops stopwords, including prefixed stopword forms', () => {
    expect(wordForms(normalizeWord('אני'))).toEqual([]);
    expect(wordForms(normalizeWord('ולא'))).toEqual([]);
    expect(wordForms('the')).toEqual([]);
    // שאני and אני are stopwords; the surface form stays.
    expect(wordForms(normalizeWord('כשאני')).map((f) => f.form)).toEqual([]);
    expect(wordForms(normalizeWord('וכשאני')).map((f) => f.form)).toEqual(['וכשאני']);
  });
  it('drops one-letter forms but keeps numbers', () => {
    expect(wordForms('a')).toEqual([]);
    expect(wordForms('5').map((f) => f.form)).toEqual(['5']);
  });
  it('emits the bare form of words with apostrophes and gershayim', () => {
    expect(wordForms(normalizeWord('צה"ל')).map((f) => f.form)).toEqual(['צה״ל', 'צהל']);
    expect(wordForms(normalizeWord('בצה״ל')).map((f) => [f.form, f.rank])).toEqual([
      ['בצה״ל', 0],
      ['צה״ל', 2],
      ['בצהל', 1],
      ['צהל', 2],
    ]);
  });
  it('emits synonym canonicals, also for prefixed words', () => {
    const synonyms = buildSynonymLookup([{ canonical: 'iphone', variants: ['אייפון', 'aifon'] }]);
    expect(wordForms(normalizeWord('אייפון'), { synonyms }).map((f) => f.form)).toEqual([
      'אייפונ',
      'iphone',
    ]);
    expect(wordForms(normalizeWord('לאייפון'), { synonyms }).map((f) => f.form)).toContain(
      'iphone',
    );
    expect(wordForms('aifon', { synonyms }).map((f) => f.form)).toEqual(['aifon', 'iphone']);
  });
  it('custom stopwords', () => {
    const stopwords = buildStopwordSet(['שלום']);
    expect(wordForms(normalizeWord('שלום'), { stopwords })).toEqual([]);
    expect(DEFAULT_STOPWORDS.has(normalizeWord('שלום'))).toBe(false);
    expect(DEFAULT_STOPWORDS.has(normalizeWord('אתם'))).toBe(true);
  });
});

describe('synonyms', () => {
  it('rejects multi-word entries in the schema and skips them in the lookup', () => {
    expect(SynonymMapSchema.safeParse([{ canonical: 'tel aviv', variants: ['תא'] }]).success).toBe(
      false,
    );
    expect(SynonymMapSchema.safeParse([{ canonical: 'tlv', variants: ['ת"א'] }]).success).toBe(
      true,
    );
    const lookup = buildSynonymLookup([
      { canonical: 'tel aviv', variants: ['tlv'] },
      { canonical: 'tlv', variants: ['ת"א', 'tlv', 'תל אביב'] },
    ]);
    expect([...lookup]).toEqual([['ת״א', ['tlv']]]);
  });
});
