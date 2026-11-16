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
import { ABOVE_MEDIAN, BACKGROUND, MARGIN } from '../../packages/client-core/src/meaning-floor';
import { chunkSegments } from '../../packages/indexing/src/chunk';
import {
  EMBEDDING_PASSAGE_PREFIX,
  EMBEDDING_QUERY_PREFIX,
} from '../../packages/indexing/src/constants';
import chatter from './chatter-corpus.json';
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
 * Real calls run for minutes, are mostly chatter, and a call scores as its best chunk, so the
 * more chunks a call has, the likelier one clears a fixed floor by chance. Long calls here are
 * 4–8 passages of chatter (chatter-corpus.json, mostly Hebrew) with one corpus call mixed into
 * every other one, chunked like ingest, so each topic sits in a few calls. Rules are compared on
 * how many related calls they keep and how many unrelated ones they show.
 */
let seed = 11;
const rnd = (n: number) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed % n;
};
const isHebrew = (t: string) => /[֐-׿]/.test(t);
const ids = calls.map(([id]) => id);
const text = Object.fromEntries(calls);
const chatterLines = [...chatter.he, ...chatter.he, ...chatter.en];
const longCalls: { topic: string | null; passages: string[] }[] = [];
for (let i = 0; i < 40; i++) {
  const passages = Array.from(
    { length: 4 + rnd(5) },
    () => chatterLines[rnd(chatterLines.length)]!,
  );
  const topic = i % 2 === 0 ? ids[rnd(ids.length)]! : null;
  if (topic) passages.splice(rnd(passages.length + 1), 0, text[topic]!);
  longCalls.push({ topic, passages });
}
const chunkVectors: Float32Array[][] = [];
const chunkHebrew: boolean[][] = [];
for (const c of longCalls) {
  const sentences = c.passages.flatMap((p) => p.split(/(?<=[.?!])\s+/));
  const chunks = chunkSegments(sentences.map((s, i) => ({ start: i, end: i + 1, text: s })));
  const vectors: Float32Array[] = [];
  for (const ch of chunks) vectors.push(await embed(EMBEDDING_PASSAGE_PREFIX + ch.text));
  chunkVectors.push(vectors);
  chunkHebrew.push(chunks.map((ch) => isHebrew(ch.text)));
}
const smallTalkLines = Object.values(BACKGROUND).flat();
const smallTalk: Float32Array[] = [];
for (const b of smallTalkLines) smallTalk.push(await embed(EMBEDDING_PASSAGE_PREFIX + b));

type Pair = { related: boolean; score: number; langFloor: number; query: string; median: number };
const long: Pair[] = [];
for (const q of corpus.queries) {
  const v = await embed(EMBEDDING_QUERY_PREFIX + q.text);
  const bg = smallTalk.map((b) => cosine(v, b));
  const baseHe = Math.max(...bg.filter((_, k) => isHebrew(smallTalkLines[k]!)));
  const baseEn = Math.max(...bg.filter((_, k) => !isHebrew(smallTalkLines[k]!)));
  const rows = longCalls.map((c, i) => {
    const scores = chunkVectors[i]!.map((ch) => cosine(v, ch));
    const best = scores.indexOf(Math.max(...scores));
    return {
      related: c.topic !== null && q.related.includes(c.topic),
      score: scores[best]!,
      langFloor: chunkHebrew[i]![best] ? baseHe : baseEn,
      query: q.text,
    };
  });
  const sorted = rows.map((r) => r.score).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  for (const r of rows) long.push({ ...r, median });
}
const longRelated = long.filter((p) => p.related);
const longUnrelated = long.filter((p) => !p.related);
const rule = (name: string, keep: (p: Pair) => boolean) => {
  const empty = offTopic.filter((q) => long.every((p) => p.query !== q || !keep(p))).length;
  const shownFor = (q: string) => long.filter((p) => p.query === q && keep(p)).length;
  console.log(
    `long calls, ${name.padEnd(44)} related kept ${pct(longRelated.filter(keep).length, longRelated.length)}  unrelated shown ${pct(longUnrelated.filter(keep).length, longUnrelated.length)}  off-topic empty ${empty}/${offTopic.length}  טמפרטורה ${shownFor('טמפרטורה')}/40`,
  );
};
const min = EMBEDDING_MODEL.minSimilarity;
const smallTalkBar = (p: Pair, m: number) => p.score >= Math.max(min, p.langFloor + m);
const medianBar = (p: Pair, d: number) => p.score >= Math.max(min, p.median + d);
rule(`floor ${min}`, (p) => p.score >= min);
for (const m of [0.01, MARGIN, 0.02]) rule(`small talk + ${m}`, (p) => smallTalkBar(p, m));
for (const d of [0.01, ABOVE_MEDIAN, 0.03]) rule(`median + ${d}`, (p) => medianBar(p, d));
rule(
  `median + ${ABOVE_MEDIAN} & small talk + ${MARGIN} (used)`,
  (p) => medianBar(p, ABOVE_MEDIAN) && smallTalkBar(p, MARGIN),
);
