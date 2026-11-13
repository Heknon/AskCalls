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
