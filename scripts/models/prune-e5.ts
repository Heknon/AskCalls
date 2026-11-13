/**
 * Vocabulary pruning for multilingual-e5-small (see README.md). Given the original q8 files and
 * a keep-set of token ids, writes a model whose token-embedding matrix holds only the kept rows
 * and a tokenizer whose vocabulary is remapped to the new ids. Everything else is byte-for-byte
 * the original, so a text whose original tokens are all kept produces the same vector.
 *
 * Output is deterministic: the same inputs give the same bytes and hashes.
 */
import { createHash } from 'node:crypto';
import { selectInitializerRows } from './onnx-rows';

export const EMBEDDING_INITIALIZER = 'embeddings.word_embeddings.weight_quantized';
export const MODEL_FILE = 'onnx/model_quantized.onnx';

/** The upstream files the pruned model is derived from, pinned to a Hugging Face revision. */
export const SOURCE_MODEL = {
  id: 'Xenova/multilingual-e5-small',
  revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
  files: [
    {
      path: 'config.json',
      bytes: 658,
      sha256: 'cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1',
    },
    {
      path: 'tokenizer_config.json',
      bytes: 443,
      sha256: 'a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b',
    },
    {
      path: 'special_tokens_map.json',
      bytes: 167,
      sha256: 'd05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7',
    },
    {
      path: 'tokenizer.json',
      bytes: 17_082_730,
      sha256: '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39',
    },
    {
      path: MODEL_FILE,
      bytes: 118_308_185,
      sha256: 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193',
    },
  ],
} as const;

export interface TokenizerJson {
  added_tokens: { id: number; content: string }[];
  post_processor: {
    type: string;
    special_tokens?: Record<string, { ids: number[] }>;
  };
  model: { type: string; unk_id: number; vocab: [string, number][] };
  [k: string]: unknown;
}

export interface PrunedFile {
  path: string;
  bytes: number;
  sha256: string;
}

export const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');

const encoder = new TextEncoder();
const json = (v: unknown) => encoder.encode(`${JSON.stringify(v)}\n`);

/**
 * Ids every pruned vocabulary keeps whatever the corpus says: the special tokens, and the
 * lowest-scoring piece, because the Unigram tokenizer scores `<unk>` relative to the minimum
 * score and that must not move.
 */
export function requiredIds(tokenizer: TokenizerJson): number[] {
  const vocab = tokenizer.model.vocab;
  let min = 0;
  vocab.forEach(([, score], id) => {
    if (score < vocab[min]![1]) min = id;
  });
  return [...tokenizer.added_tokens.map((t) => t.id), tokenizer.model.unk_id, min];
}

export function pruneTokenizer(tokenizer: TokenizerJson, keep: readonly number[]): TokenizerJson {
  if (tokenizer.model.type !== 'Unigram') throw new Error('expected a Unigram tokenizer');
  const newId = new Map(keep.map((old, i) => [old, i]));
  const remap = (old: number) => {
    const id = newId.get(old);
    if (id === undefined) throw new Error(`special token ${old} not in keep-set`);
    return id;
  };
  const specials = tokenizer.post_processor.special_tokens;
  return {
    ...tokenizer,
    added_tokens: tokenizer.added_tokens.map((t) => ({ ...t, id: remap(t.id) })),
    post_processor: {
      ...tokenizer.post_processor,
      ...(specials && {
        special_tokens: Object.fromEntries(
          Object.entries(specials).map(([k, v]) => [k, { ...v, ids: v.ids.map(remap) }]),
        ),
      }),
    },
    model: {
      ...tokenizer.model,
      unk_id: remap(tokenizer.model.unk_id),
      vocab: keep.map((old) => tokenizer.model.vocab[old]!),
    },
  };
}

export interface Pruned {
  files: Map<string, Uint8Array>;
  manifest: PrunedFile[];
}

/** `source` maps SOURCE_MODEL paths to their bytes; `keep` is sorted, distinct original ids. */
export function prune(source: Map<string, Uint8Array>, keepSet: readonly number[]): Pruned {
  const get = (p: string) => {
    const b = source.get(p);
    if (!b) throw new Error(`missing ${p}`);
    return b;
  };
  const decode = (p: string) => JSON.parse(new TextDecoder().decode(get(p)));
  const tokenizer = decode('tokenizer.json') as TokenizerJson;
  const keep = [...new Set([...keepSet, ...requiredIds(tokenizer)])].sort((a, b) => a - b);
  if (keep.at(-1)! >= tokenizer.model.vocab.length) throw new Error('keep-set id out of range');

  const { model, originalRows } = selectInitializerRows(
    get(MODEL_FILE),
    EMBEDDING_INITIALIZER,
    keep,
  );
  if (originalRows < tokenizer.model.vocab.length) throw new Error('embedding smaller than vocab');
  const config = { ...decode('config.json'), vocab_size: keep.length };

  const files = new Map<string, Uint8Array>([
    ['config.json', json(config)],
    ['tokenizer_config.json', get('tokenizer_config.json')],
    ['special_tokens_map.json', get('special_tokens_map.json')],
    ['tokenizer.json', json(pruneTokenizer(tokenizer, keep))],
    [MODEL_FILE, model],
  ]);
  const manifest = [...files].map(([path, b]) => ({ path, bytes: b.length, sha256: sha256(b) }));
  return { files, manifest };
}

/** Content address of a pruned build: the directory every file of it is published under. */
export const buildHash = (manifest: readonly PrunedFile[]) =>
  sha256(manifest.map((f) => `${f.sha256}  ${f.path}\n`).join('')).slice(0, 16);

/** The committed keep-set: comma-separated deltas between sorted ids. */
export function parseKeepSet(text: string): number[] {
  let id = 0;
  return text
    .trim()
    .split(',')
    .map((d) => (id += Number.parseInt(d, 36)));
}

export function formatKeepSet(ids: readonly number[]): string {
  let prev = 0;
  const out = [...ids]
    .sort((a, b) => a - b)
    .map((id) => {
      const d = (id - prev).toString(36);
      prev = id;
      return d;
    });
  return `${out.join(',')}\n`;
}
