import { parseManifest } from '@askcalls/client-core/bulk/manifest';
import { pairFiles } from '@askcalls/client-core/bulk/pairing';
import { describe, expect, it } from 'vitest';
import { EXAMPLE_MANIFEST, EXAMPLE_TREE, MANIFEST_COLUMNS } from './import-example';

/** The tree's files as paths under `calls/`. */
function paths(tree: string): string[] {
  const out: string[] = [];
  const dirs: string[] = [];
  for (const line of tree.split('\n').slice(1)) {
    const depth = Math.floor(line.search(/[├└]/) / 3);
    const name = line.replace(/^[\s│├└─]+/, '');
    dirs.length = depth;
    if (name.endsWith('/')) dirs.push(name.slice(0, -1));
    else out.push([...dirs, name].join('/'));
  }
  return out;
}

describe('the bulk import example', () => {
  it('pairs into three calls and a manifest', () => {
    const pairing = pairFiles(paths(EXAMPLE_TREE).map((name) => ({ ref: name, name, size: 1 })));
    expect(pairing.manifest?.name).toBe('manifest.csv');
    expect(pairing.items.map((i) => [i.name, !!i.audio, !!i.transcript])).toEqual([
      ['2026-03-01 Dana', true, true],
      ['2026-03-02 Ron', true, true],
      ['2026-03-05 Front desk', true, false],
    ]);
  });

  it('has a manifest that parses without issues and covers every call', () => {
    const manifest = parseManifest(EXAMPLE_MANIFEST);
    expect(manifest.issues).toEqual([]);
    expect(EXAMPLE_MANIFEST.split('\n')[0]).toBe(MANIFEST_COLUMNS.join(','));
    for (const p of paths(EXAMPLE_TREE).filter((f) => !f.endsWith('.csv'))) {
      expect(manifest.lookup(p), p).toBeDefined();
    }
    expect(manifest.lookup('2026-03-01 Dana.mp3')).toMatchObject({
      phone: '+972501234567',
      startedAt: '2026-03-01T12:05:00.000Z',
      direction: 'in',
      contactName: 'Dana Levi',
      tags: ['supplier', 'fridges'],
    });
  });
});
