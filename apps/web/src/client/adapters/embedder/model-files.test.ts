import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMBEDDING_MODEL, MODEL_BUILD_PATH, modelDirectoryUrl } from '../../assets';
import { ModelFiles } from './model-files';

const ORIGIN = 'https://app.example.com';
afterEach(() => vi.unstubAllGlobals());

describe('model directory', () => {
  it('is this origin’s /models/ unless the instance names a host', () => {
    expect(modelDirectoryUrl(null, ORIGIN)).toBe(`${ORIGIN}/models/${MODEL_BUILD_PATH}`);
    expect(modelDirectoryUrl('https://models.example.com', ORIGIN)).toBe(
      `https://models.example.com/${MODEL_BUILD_PATH}`,
    );
    expect(modelDirectoryUrl('https://cdn.example.com/askcalls/', ORIGIN)).toBe(
      `https://cdn.example.com/askcalls/${MODEL_BUILD_PATH}`,
    );
  });
});

describe('ModelFiles', () => {
  const base = modelDirectoryUrl('https://models.example.com', ORIGIN);

  it('refuses bytes that do not match the pinned hash, with a content-free error', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array(564).fill(65)));
    vi.stubGlobal('fetch', fetch);
    const files = new ModelFiles(base, ORIGIN, () => {});
    await expect(files.get('config.json')).rejects.toMatchObject({
      code: 'invalid',
      message: 'model file failed verification',
    });
    expect(files.verificationFailed).toBe(true);
    expect(fetch).toHaveBeenCalledWith(`${base}config.json`, expect.anything());
  });

  it('refuses a body longer than the pin without reading all of it', async () => {
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array(10_000)));
    await expect(new ModelFiles(base, ORIGIN, () => {}).get('config.json')).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  it('serves transformers.js only pinned files under its prefix and never fetches others', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const f = new ModelFiles(base, ORIGIN, () => {}).fetchFor('/askcalls-model/e5/');
    expect((await f('/askcalls-model/e5/generation_config.json')).status).toBe(404);
    expect((await f('https://huggingface.co/x/config.json')).status).toBe(404);
    expect((await f(`${ORIGIN}/elsewhere/config.json`)).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect(EMBEDDING_MODEL.files.map((x) => x.path)).toContain('onnx/model_quantized.onnx');
  });
});
