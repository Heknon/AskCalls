/**
 * `bun run models:calibrate-intents [models dir]`: embeds the labeled call chunks in
 * intent-corpus.json and the built-in intents with the pinned model, and prints how many intent
 * tags each rule gives: the absolute threshold, and the margin over the filler prototype
 * (`NEUTRAL_EXAMPLES`) that `classifyIntents` uses. Run it after a model change and set
 * `DEFAULT_INTENT_MARGIN` in packages/indexing/src/intents.ts from the result.
 *
 * The models dir defaults to apps/web/public/models, which `bun run dev` fills.
 */

import { TransformersEmbedder } from '../../apps/agent/src/adapters/embedder';
import { EMBEDDING_MODEL } from '../../apps/web/src/client/assets';
import { EMBEDDING_PASSAGE_PREFIX } from '../../packages/indexing/src/constants';
import {
  BUILT_IN_INTENTS,
  buildIntentPrototypes,
  cosine,
  DEFAULT_INTENT_MARGIN,
  DEFAULT_INTENT_THRESHOLD,
  meanVector,
} from '../../packages/indexing/src/intents';
import { NEUTRAL_EXAMPLES } from '../../packages/indexing/src/neutral';
import corpus from './intent-corpus.json';

const THRESHOLDS = [0.8, 0.82, 0.84, 0.86, 0.88];
const MARGINS = [0.005, 0.0075, 0.01, 0.0125, 0.015, 0.02, 0.025, 0.03];

const modelsDir = process.argv[2] ?? 'apps/web/public/models';
const embedder = new TransformersEmbedder({ models: modelsDir, runtime: `${modelsDir}/runtime` });
const embed = (texts: string[]) => embedder.embed(texts);

const prototypes = await buildIntentPrototypes(BUILT_IN_INTENTS, embed);
const neutral = meanVector(await embed(NEUTRAL_EXAMPLES.map((t) => EMBEDDING_PASSAGE_PREFIX + t)));
const chunks = corpus.chunks;
const vectors = await embed(chunks.map((c) => EMBEDDING_PASSAGE_PREFIX + c.text));

type Pair = { expected: boolean; abs: number; rel: number; neutral: boolean };
const pairs: Pair[] = [];
chunks.forEach((c, i) => {
  const v = vectors[i]!;
  const base = cosine(v, neutral);
  for (const p of prototypes) {
    const abs = cosine(v, p.vector);
    pairs.push({
      expected: c.intents.includes(p.id),
      abs,
      rel: abs - base,
      neutral: c.intents.length === 0,
    });
  }
});

const expected = pairs.filter((p) => p.expected);
const wrong = pairs.filter((p) => !p.expected);
const neutralChunks = chunks.filter((c) => c.intents.length === 0).length;
const pct = (n: number, of: number) => `${Math.round((100 * n) / of)}%`.padStart(4);

function report(label: string, hit: (p: Pair) => boolean) {
  const found = expected.filter(hit).length;
  const extra = wrong.filter(hit).length;
  const onNeutral = pairs.filter((p) => p.neutral && hit(p)).length;
  console.log(
    `${label}  intents found ${pct(found, expected.length)}  wrong tags ${String(extra).padStart(3)}/${wrong.length}  tags on small talk ${onNeutral}/${neutralChunks * prototypes.length}`,
  );
}

console.log(`absolute threshold (before; default ${DEFAULT_INTENT_THRESHOLD})`);
for (const t of THRESHOLDS) report(t.toFixed(3), (p) => p.abs >= t);
console.log(`margin over small talk (current default ${DEFAULT_INTENT_MARGIN})`);
for (const m of MARGINS)
  report(m.toFixed(4), (p) => p.rel >= m && p.abs >= EMBEDDING_MODEL.minSimilarity);
const smallTalk = pairs.filter((p) => p.neutral).map((p) => p.rel);
console.log(`highest small-talk margin: ${Math.max(...smallTalk).toFixed(4)}`);
