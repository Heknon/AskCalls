import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  EMBEDDING_MODEL as BROWSER_MODEL,
  EMBEDDING_MODEL_ID as BROWSER_MODEL_ID,
} from '../../../web/src/client/assets';
import { EMBEDDING_MODEL, EMBEDDING_MODEL_ID, ensureModelFiles } from './model-files';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'askcalls-models-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));
afterEach(() => vi.unstubAllGlobals());

describe('agent embedding model files', () => {
  it('pins exactly the browser build', () => {
    expect(EMBEDDING_MODEL.build).toBe(BROWSER_MODEL.build);
    expect(EMBEDDING_MODEL.dtype).toBe(BROWSER_MODEL.dtype);
    expect(EMBEDDING_MODEL.files).toEqual(BROWSER_MODEL.files);
    expect(EMBEDDING_MODEL_ID).toBe(BROWSER_MODEL_ID);
  });

  it('refuses a downloaded file that does not match its pin and keeps nothing', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        requested.push(String(url));
        return new Response(new Uint8Array(564));
      }),
    );
    await expect(
      ensureModelFiles(dir, { baseUrl: 'https://models.example.com/', log: () => {} }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(requested).toEqual([
      `https://models.example.com/e5-pruned/${EMBEDDING_MODEL.build}/config.json`,
    ]);
    const built = join(dir, 'e5-pruned', EMBEDDING_MODEL.build);
    expect(await readdir(built).catch(() => [])).toEqual([]);
  });
});
