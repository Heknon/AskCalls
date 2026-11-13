import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { selectInitializerRows } from '../../../../../../scripts/models/onnx-rows';
import {
  buildHash,
  formatKeepSet,
  parseKeepSet,
  prune,
  pruneTokenizer,
  SOURCE_MODEL,
  type TokenizerJson,
} from '../../../../../../scripts/models/prune-e5';
import { EMBEDDING_MODEL } from '../../assets';
import corpus from './validation-corpus.json';

const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const keepSetFile = join(root, 'scripts', 'models', 'e5-keep-set.txt');
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const size = (path: string) => EMBEDDING_MODEL.files.find((f) => f.path === path)!.bytes;

describe('pruned embedding model manifest', () => {
  it('pins the committed keep-set and a build hash derived from its files', async () => {
    const text = await readFile(keepSetFile, 'utf8');
    expect(sha256(text)).toBe(EMBEDDING_MODEL.keepSet.sha256);
    const ids = parseKeepSet(text);
    expect(ids).toHaveLength(EMBEDDING_MODEL.keepSet.rows);
    expect(ids.every((id, i) => i === 0 || id > ids[i - 1]!)).toBe(true);
    expect(ids.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(ids.at(-1)).toBe(250_001);
    expect(formatKeepSet(ids)).toBe(text);
    expect(buildHash(EMBEDDING_MODEL.files)).toBe(EMBEDDING_MODEL.build);
  });

  it('stays within the size budget', () => {
    expect(size('onnx/model_quantized.onnx')).toBeLessThan(36e6);
    expect(size('tokenizer.json')).toBeLessThan(3e6);
  });
});

/** A minimal ModelProto: graph { initializer { dims 4, dims 2, data_type 2, name "w", raw } }. */
function tinyModel(raw: number[]): Uint8Array {
  const name = [...new TextEncoder().encode('w')];
  const tensor = [0x08, 4, 0x08, 2, 0x10, 2, 0x42, name.length, ...name, 0x4a, raw.length, ...raw];
  const keep = [0x0a, 1, 0x41];
  const graph = [0x2a, tensor.length, ...tensor, ...keep];
  return Uint8Array.from([0x08, 6, 0x3a, graph.length, ...graph]);
}

describe('vocabulary pruning', () => {
  it('keeps the selected initializer rows and every other byte', () => {
    const { model, originalRows } = selectInitializerRows(
      tinyModel([10, 11, 20, 21, 30, 31, 40, 41]),
      'w',
      [0, 2, 3],
    );
    expect(originalRows).toBe(4);
    const name = [...new TextEncoder().encode('w')];
    const tensor = [0x08, 3, 0x08, 2, 0x10, 2, 0x42, 1, ...name, 0x4a, 6, 10, 11, 30, 31, 40, 41];
    const graph = [0x2a, tensor.length, ...tensor, 0x0a, 1, 0x41];
    expect([...model]).toEqual([0x08, 6, 0x3a, graph.length, ...graph]);
    expect(() => selectInitializerRows(tinyModel([1, 2, 3, 4, 5, 6, 7, 8]), 'x', [0])).toThrow();
  });

  it('remaps vocabulary, special tokens and unk to the new ids', () => {
    const tok: TokenizerJson = {
      added_tokens: [
        { id: 0, content: '<s>' },
        { id: 3, content: '<unk>' },
        { id: 5, content: '<mask>' },
      ],
      post_processor: { type: 'TemplateProcessing', special_tokens: { '<s>': { ids: [0] } } },
      model: {
        type: 'Unigram',
        unk_id: 3,
        vocab: [
          ['<s>', 0],
          ['a', -1],
          ['b', -2],
          ['<unk>', 0],
          ['c', -3],
          ['<mask>', 0],
        ],
      },
    };
    const out = pruneTokenizer(tok, [0, 2, 3, 5]);
    expect(out.model.vocab).toEqual([
      ['<s>', 0],
      ['b', -2],
      ['<unk>', 0],
      ['<mask>', 0],
    ]);
    expect(out.model.unk_id).toBe(2);
    expect(out.added_tokens.map((t) => t.id)).toEqual([0, 2, 3]);
    expect(out.post_processor.special_tokens!['<s>']!.ids).toEqual([0]);
    expect(() => pruneTokenizer(tok, [0, 1, 2])).toThrow();
  });
});

const cache =
  process.env.ASKCALLS_MODEL_CACHE ?? join(root, 'node_modules', '.cache', 'askcalls-models');
const sourceName = SOURCE_MODEL.revision.slice(0, 12);
const sourceDir = join(cache, 'source', sourceName);
const originalAvailable = SOURCE_MODEL.files.every((f) => {
  const p = join(sourceDir, f.path);
  return existsSync(p) && statSync(p).size === f.bytes;
});

const cosine = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i]!, 0);
const quantile = (xs: number[], q: number) =>
  [...xs].sort((a, b) => a - b)[Math.floor(q * (xs.length - 1))]!;

/**
 * Runs only where the original model has been downloaded (bun run models:build, or
 * fetch-browser-assets building locally). Rebuilds the pruned files from it, checks they equal
 * the pins, and compares vectors on the validation corpus.
 */
describe.skipIf(!originalAvailable)('pruned model against the original', () => {
  it('rebuilds to the pinned files and matches the original on kept tokens', async () => {
    const source = new Map<string, Uint8Array>();
    for (const f of SOURCE_MODEL.files) {
      const bytes = new Uint8Array(await readFile(join(sourceDir, f.path)));
      expect(sha256(bytes)).toBe(f.sha256);
      source.set(f.path, bytes);
    }
    const keep = parseKeepSet(await readFile(keepSetFile, 'utf8'));
    const pruned = prune(source, keep);
    expect(pruned.manifest).toEqual(EMBEDDING_MODEL.files);

    const dir = await mkdtemp(join(tmpdir(), 'askcalls-pruned-'));
    try {
      for (const [path, bytes] of pruned.files) {
        const target = join(dir, 'e5-pruned', EMBEDDING_MODEL.build, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes);
      }
      const { env, pipeline } = await import('@huggingface/transformers');
      env.allowRemoteModels = false;
      const load = async (localModelPath: string, name: string) => {
        env.localModelPath = localModelPath;
        return pipeline('feature-extraction', name, { dtype: 'q8' });
      };
      const original = await load(join(cache, 'source'), sourceName);
      const small = await load(join(dir, 'e5-pruned'), EMBEDDING_MODEL.build);
      const kept = new Set(keep);
      const newId = new Map(keep.map((id, i) => [id, i]));

      const texts = Object.values(corpus).flat();
      // One text per call: the q8 model quantizes activations per batch, so a vector depends
      // slightly on what else is in its batch.
      const embed = async (p: typeof original) => {
        const out: Float32Array[] = [];
        for (const text of texts) {
          out.push((await p(text, { pooling: 'mean', normalize: true })).data as Float32Array);
        }
        return out;
      };
      const [a, b] = [await embed(original), await embed(small)];
      const exact: number[] = [];
      const changed: { group: string; cosine: number }[] = [];
      let i = 0;
      for (const [group, list] of Object.entries(corpus)) {
        for (const text of list) {
          const ids = original.tokenizer.encode(text) as number[];
          const c = cosine(a[i]!, b[i]!);
          if (ids.every((id) => kept.has(id))) {
            expect(small.tokenizer.encode(text)).toEqual(ids.map((id) => newId.get(id)));
            exact.push(c);
          } else {
            changed.push({ group, cosine: c });
          }
          i++;
        }
      }
      expect(exact.length).toBeGreaterThan(texts.length / 2);
      expect(Math.min(...exact)).toBeGreaterThanOrEqual(0.9999);
      const cs = changed.map((c) => c.cosine);
      if (cs.length) expect(Math.min(...cs)).toBeGreaterThan(0.9);
      console.log(
        JSON.stringify({
          texts: texts.length,
          allTokensKept: { count: exact.length, min: Math.min(...exact) },
          someTokensRemoved: {
            count: cs.length,
            groups: changed.map((c) => c.group),
            min: cs.length ? Math.min(...cs) : null,
            p50: cs.length ? quantile(cs, 0.5) : null,
            mean: cs.length ? cs.reduce((s, x) => s + x, 0) / cs.length : null,
          },
        }),
      );
      await original.dispose();
      await small.dispose();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
