import { describe, expect, it } from 'vitest';
import { planImport } from './import-plan';
import { parseManifest } from './manifest';
import { pairFiles } from './pairing';

const ref = (name: string) => ({ ref: name, name, size: 1 });

describe('planImport', () => {
  it('lists calls with their manifest rows, skipped files and manifest problems', () => {
    const pairing = pairFiles(
      ['manifest.csv', 'a.mp3', 'a.txt', 'a.wav', 'b.srt', 'c.m4a', 'readme.pdf'].map(ref),
    );
    const manifest = parseManifest(
      [
        'file,phone,started_at,direction,contact_name,tags',
        'a.mp3,+972501234567,2026-03-01 10:00,in,Dana,x;y',
        'b,,yesterday,sideways,,',
        'gone.mp3,,,,,',
        ',+972500000000,,,,',
      ].join('\n'),
    );
    const plan = planImport(pairing, manifest, {});

    expect(plan.calls).toEqual([
      {
        name: 'a',
        audio: 'a.mp3',
        transcript: 'a.txt',
        manifestLine: 2,
        phone: '+972501234567',
        startedAt: '2026-03-01T10:00:00.000Z',
        direction: 'in',
        contactName: 'Dana',
        tags: ['x', 'y'],
      },
      expect.objectContaining({ name: 'b', audio: null, transcript: 'b.srt', manifestLine: 3 }),
      expect.objectContaining({ name: 'c', audio: 'c.m4a', manifestLine: null }),
    ]);
    expect(plan.skipped).toEqual([
      { file: 'a.wav', reason: 'extra_audio' },
      { file: 'readme.pdf', reason: 'unsupported' },
    ]);
    expect(plan.manifest).toEqual({
      file: 'manifest.csv',
      issues: [
        { line: 3, code: 'bad_date' },
        { line: 3, code: 'bad_direction' },
        { line: 5, code: 'missing_file' },
      ],
      unmatched: [{ line: 4, file: 'gone.mp3' }],
      callsWithoutRow: 1,
    });
  });

  it('has no manifest section without a manifest', () => {
    expect(planImport(pairFiles([ref('a.mp3')]), null, {}).manifest).toBeNull();
  });
});
