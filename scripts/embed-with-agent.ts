/**
 * Embeds texts with the agent's Node embedder, one text per call, for the browser adapter test:
 *
 *   bun scripts/embed-with-agent.ts <models dir> < texts.json > vectors.json
 *
 * ASKCALLS_MODEL_URL picks the model host the agent downloads the pinned files from.
 */
import { TransformersEmbedder } from '../apps/agent/src/adapters/embedder';

const modelsDir = process.argv[2];
if (!modelsDir) throw new Error('usage: embed-with-agent.ts <models dir>');
const texts = JSON.parse(await Bun.stdin.text()) as string[];
const embedder = new TransformersEmbedder({ models: modelsDir, runtime: `${modelsDir}/runtime` });
const started = performance.now();
const vectors: number[][] = [];
for (const t of texts) vectors.push(Array.from((await embedder.embed([t]))[0]!));
process.stdout.write(
  JSON.stringify({
    modelId: embedder.modelId,
    ms: Math.round(performance.now() - started),
    vectors,
  }),
);
