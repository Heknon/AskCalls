/**
 * `bun run models:calibrate [models dir]`: embeds the made-up calls and queries in
 * similarity-corpus.json with the pinned model and prints, for candidate floors, how many related
 * (query, call) pairs a meaning search keeps and how many unrelated ones it still shows. Run it
 * after a model change and set `minSimilarity` in apps/web/src/client/assets.ts and
 * apps/agent/src/adapters/model-files.ts from the result.
 *
 * The models dir defaults to apps/web/public/models, which `bun run dev` fills.
 */

import { TransformersEmbedder } from '../../apps/agent/src/adapters/embedder';
import { EMBEDDING_MODEL } from '../../apps/web/src/client/assets';
import { BACKGROUND, MARGIN } from '../../packages/client-core/src/meaning-floor';
import { chunkSegments } from '../../packages/indexing/src/chunk';
import {
  EMBEDDING_PASSAGE_PREFIX,
  EMBEDDING_QUERY_PREFIX,
} from '../../packages/indexing/src/constants';
import corpus from './similarity-corpus.json';

const FLOORS = [0.76, 0.77, 0.775, 0.78, 0.785, 0.79];

const modelsDir = process.argv[2] ?? 'apps/web/public/models';
const embedder = new TransformersEmbedder({ models: modelsDir, runtime: `${modelsDir}/runtime` });
const embed = async (text: string) => (await embedder.embed([text]))[0]!;

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / Math.sqrt(na * nb);
}

const calls = Object.entries(corpus.calls as Record<string, string>);
const passages: Float32Array[] = [];
for (const [, text] of calls) passages.push(await embed(EMBEDDING_PASSAGE_PREFIX + text));

const pairs: { related: boolean; score: number; query: string }[] = [];
for (const q of corpus.queries) {
  const v = await embed(EMBEDDING_QUERY_PREFIX + q.text);
  calls.forEach(([id], i) => {
    pairs.push({ related: q.related.includes(id), score: cosine(v, passages[i]!), query: q.text });
  });
}

const related = pairs.filter((p) => p.related);
const unrelated = pairs.filter((p) => !p.related);
const offTopic = corpus.queries.filter((q) => q.related.length === 0).map((q) => q.text);
const pct = (n: number, of: number) => `${Math.round((100 * n) / of)}%`.padStart(4);

console.log(`current floor: ${EMBEDDING_MODEL.minSimilarity}`);
for (const floor of FLOORS) {
  const kept = related.filter((p) => p.score >= floor).length;
  const shown = unrelated.filter((p) => p.score >= floor).length;
  const empty = offTopic.filter((q) => pairs.every((p) => p.query !== q || p.score < floor)).length;
  console.log(
    `${floor.toFixed(3)}  related kept ${pct(kept, related.length)}  unrelated shown ${pct(shown, unrelated.length)}  off-topic queries with no results ${empty}/${offTopic.length}`,
  );
}

/*
 * Real calls run for minutes and change topic, and a call scores as its best chunk, so the more
 * chunks a call has, the likelier one clears a fixed floor by chance. Long calls here are 3–6
 * corpus calls back to back, chunked like ingest; the floor that search uses (meaning-floor.ts)
 * is the query's best score against small talk in the language of the best chunk, plus MARGIN,
 * and never under minSimilarity.
 */
let seed = 11;
const rnd = (n: number) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed % n;
};
const ids = calls.map(([id]) => id);
const text = Object.fromEntries(calls);
const longCalls: string[][] = [];
for (let i = 0; i < 40; i++) {
  const parts = new Set<string>();
  const n = 3 + rnd(4);
  while (parts.size < n) parts.add(ids[rnd(ids.length)]!);
  longCalls.push([...parts]);
}
const isHebrew = (t: string) => /[\u0590-\u05FF]/.test(t);
const chunkVectors: Float32Array[][] = [];
const chunkHebrew: boolean[][] = [];
for (const parts of longCalls) {
  const sentences = parts.flatMap((p) => text[p]!.split(/(?<=[.?!])\s+/));
  const chunks = chunkSegments(sentences.map((s, i) => ({ start: i, end: i + 1, text: s })));
  const vectors: Float32Array[] = [];
  for (const c of chunks) vectors.push(await embed(EMBEDDING_PASSAGE_PREFIX + c.text));
  chunkVectors.push(vectors);
  chunkHebrew.push(chunks.map((c) => isHebrew(c.text)));
}
const smallTalkLines = Object.values(BACKGROUND).flat();
const smallTalk: Float32Array[] = [];
for (const b of smallTalkLines) smallTalk.push(await embed(EMBEDDING_PASSAGE_PREFIX + b));

const long: { related: boolean; score: number; floor: number; langFloor: number; query: string }[] =
  [];
for (const q of corpus.queries) {
  const v = await embed(EMBEDDING_QUERY_PREFIX + q.text);
  const bg = smallTalk.map((b) => cosine(v, b));
  const base = Math.max(...bg);
  const baseHe = Math.max(...bg.filter((_, k) => isHebrew(smallTalkLines[k]!)));
  const baseEn = Math.max(...bg.filter((_, k) => !isHebrew(smallTalkLines[k]!)));
  longCalls.forEach((parts, i) => {
    const scores = chunkVectors[i]!.map((c) => cosine(v, c));
    const best = scores.indexOf(Math.max(...scores));
    long.push({
      related: parts.some((p) => q.related.includes(p)),
      score: scores[best]!,
      floor: base,
      langFloor: chunkHebrew[i]![best] ? baseHe : baseEn,
      query: q.text,
    });
  });
}
const longRelated = long.filter((p) => p.related);
const longUnrelated = long.filter((p) => !p.related);
const rule = (name: string, keep: (p: (typeof long)[number]) => boolean) => {
  const empty = offTopic.filter((q) => long.every((p) => p.query !== q || !keep(p))).length;
  console.log(
    `long calls, ${name.padEnd(38)} related kept ${pct(longRelated.filter(keep).length, longRelated.length)}  unrelated shown ${pct(longUnrelated.filter(keep).length, longUnrelated.length)}  off-topic queries with no results ${empty}/${offTopic.length}`,
  );
};
const min = EMBEDDING_MODEL.minSimilarity;
rule(`floor ${min}`, (p) => p.score >= min);
for (const m of [0, 0.01, 0.02]) {
  rule(`any-language small talk + ${m}`, (p) => p.score >= Math.max(min, p.floor + m));
}
for (const m of [0, 0.005, 0.01, MARGIN, 0.02]) {
  rule(
    `same-language small talk + ${m}${m === MARGIN ? ' (used)' : ''}`,
    (p) => p.score >= Math.max(min, p.langFloor + m),
  );
}
