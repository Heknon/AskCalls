import { createRequire } from 'node:module';
import { join } from 'node:path';

type Transformers = typeof import('@huggingface/transformers');

/** @huggingface/transformers as apps/web resolves it, so scripts use the browser's exact version. */
export async function loadTransformers(): Promise<Transformers> {
  const web = join(import.meta.dir, '..', '..', 'apps', 'web', 'package.json');
  return (await import(createRequire(web).resolve('@huggingface/transformers'))) as Transformers;
}
