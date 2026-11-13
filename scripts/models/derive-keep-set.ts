/**
 * Derives the token ids the pruned multilingual-e5-small keeps (README.md, "Keep-set").
 *
 *   bun scripts/models/derive-keep-set.ts      writes scripts/models/e5-keep-set.txt
 *
 * 1. Tokenize the pinned corpora (corpora.ts) with the original tokenizer. Every tenth line is
 *    held out; the rest is counted.
 * 2. Score each token by the sum over languages of its relative frequency, so each language
 *    weighs the same whatever its corpus size, and add tokens in score order until every
 *    language's held-out token coverage reaches COVERAGE.
 * 3. Add every single-character piece (with and without the word-start marker) in the scripts
 *    the four languages are written in, plus Latin and common symbols for names, numbers and
 *    punctuation: any in-scope text stays representable, a word whose long pieces were
 *    removed falls back to shorter kept pieces and never to `<unk>`.
 * 4. Add the pieces of the app's own fixed texts (e5 prefixes, redaction placeholders,
 *    built-in intent examples) and the ids prune-e5.ts always keeps.
 */
import { join } from 'node:path';
import { BUILT_IN_INTENTS } from '../../packages/indexing/src/intents';
import { REDACTION_KINDS } from '../../packages/indexing/src/redact';
import { CORPORA, corpusLines, LANGUAGES, type Language } from './corpora';
import { formatKeepSet, requiredIds, type TokenizerJson } from './prune-e5';
import { cacheDir, KEEP_SET_FILE, sourceModel } from './source';
import { loadTransformers } from './transformers';

export const COVERAGE = 0.95;

/** Unicode blocks whose single characters are always kept. */
const SCRIPT_BLOCKS: [number, number][] = [
  [0x0020, 0x024f], // ASCII, Latin-1, Latin Extended-A/B: English, digits, names
  [0x0300, 0x036f], // combining diacritics
  [0x0400, 0x052f], // Cyrillic
  [0x0590, 0x05ff], // Hebrew, niqqud
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0x2000, 0x206f], // general punctuation
  [0x20a0, 0x20cf], // currency
  [0x2100, 0x214f], // letterlike
  [0x2190, 0x22ff], // arrows, math operators
  [0xfb1d, 0xfb4f], // Hebrew presentation forms
  [0xfb50, 0xfdff], // Arabic presentation forms A
  [0xfe70, 0xfeff], // Arabic presentation forms B
];
const inScript = (ch: string) => {
  const cp = ch.codePointAt(0)!;
  return [...ch].length === 1 && SCRIPT_BLOCKS.some(([lo, hi]) => cp >= lo && cp <= hi);
};
const WORD_START = '▁';

const fixedTexts = () => [
  'query: ',
  'passage: ',
  ...REDACTION_KINDS.map((k) => `[${k}]`),
  ...BUILT_IN_INTENTS.flatMap((i) => i.examples),
];

async function main() {
  const source = await sourceModel();
  const tokenizerJson = JSON.parse(
    new TextDecoder().decode(source.get('tokenizer.json')!),
  ) as TokenizerJson;
  const { XLMRobertaTokenizer } = await loadTransformers();
  const tokenizer = new XLMRobertaTokenizer(
    tokenizerJson,
    JSON.parse(new TextDecoder().decode(source.get('tokenizer_config.json')!)),
  );
  const ids = (text: string) => tokenizer.encode(text, { add_special_tokens: false }) as number[];

  const train = new Map<Language, Map<number, number>>();
  const held = new Map<Language, Map<number, number>>();
  for (const c of CORPORA) {
    const lines = await corpusLines(c, join(cacheDir, 'corpora'));
    const t = train.get(c.language) ?? new Map<number, number>();
    const h = held.get(c.language) ?? new Map<number, number>();
    train.set(c.language, t);
    held.set(c.language, h);
    lines.forEach((line, i) => {
      const counts = i % 10 === 0 ? h : t;
      for (const id of ids(line)) counts.set(id, (counts.get(id) ?? 0) + 1);
    });
    console.log(`${c.name}: ${lines.length} lines`);
  }

  const score = new Map<number, number>();
  for (const counts of train.values()) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    for (const [id, n] of counts) score.set(id, (score.get(id) ?? 0) + n / total);
  }
  const ranked = [...score].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);

  const heldTotal = new Map(
    LANGUAGES.map((l) => [l, [...held.get(l)!.values()].reduce((a, b) => a + b, 0)]),
  );
  const covered = new Map(LANGUAGES.map((l) => [l, 0]));
  const coverage = (l: Language) => covered.get(l)! / heldTotal.get(l)!;
  const keep = new Set<number>();
  const add = (id: number) => {
    if (keep.has(id)) return;
    keep.add(id);
    for (const l of LANGUAGES) covered.set(l, covered.get(l)! + (held.get(l)!.get(id) ?? 0));
  };
  let fromCorpus = 0;
  for (const id of ranked) {
    if (LANGUAGES.every((l) => coverage(l) >= COVERAGE)) break;
    add(id);
    fromCorpus++;
  }

  const before = keep.size;
  tokenizerJson.model.vocab.forEach(([piece], id) => {
    const ch = piece.startsWith(WORD_START) ? piece.slice(1) : piece;
    if (piece === WORD_START || (ch !== '' && inScript(ch))) add(id);
  });
  const scriptChars = keep.size - before;
  for (const text of fixedTexts()) for (const id of ids(text)) add(id);
  for (const id of requiredIds(tokenizerJson)) add(id);

  await Bun.write(KEEP_SET_FILE, formatKeepSet([...keep]));
  console.log(
    JSON.stringify(
      {
        rows: keep.size,
        fromCorpus,
        scriptChars,
        heldOutTokenCoverage: Object.fromEntries(LANGUAGES.map((l) => [l, coverage(l)])),
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`derive-keep-set: ${(e as Error).message}`);
    process.exit(1);
  });
}
