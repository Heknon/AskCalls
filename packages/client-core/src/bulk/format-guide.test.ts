import { parseTranscript, TRANSCRIPT_EXTENSIONS } from '@askcalls/transcript-formats';
import { describe, expect, it } from 'vitest';
import { parseRecordingFileName } from './filenames';
import { EXAMPLE_MANIFEST, importFormatGuide } from './format-guide';
import { MANIFEST_COLUMNS, MANIFEST_DIRECTIONS, parseManifest } from './manifest';
import { AUDIO_EXTENSIONS, pairFiles } from './pairing';

const guide = importFormatGuide();
const ref = (name: string) => ({ ref: name, name, size: 1 });

describe('importFormatGuide', () => {
  it('names every column, direction word and file type the parser accepts', () => {
    for (const c of MANIFEST_COLUMNS) expect(guide).toContain(`| ${c} |`);
    for (const d of Object.keys(MANIFEST_DIRECTIONS)) expect(guide).toContain(d);
    for (const e of [...AUDIO_EXTENSIONS, ...TRANSCRIPT_EXTENSIONS]) {
      expect(guide).toMatch(new RegExp(`(^|\\s)\\.${e.replace(/^\./, '')}[\\s.]`, 'm'));
    }
    expect(guide).not.toContain('..');
  });

  it('holds for the parser: the example manifest, the date forms and the separators', () => {
    expect(parseManifest(EXAMPLE_MANIFEST).issues).toEqual([]);
    const m = parseManifest(
      [
        'tags;direction;file;started_at;extra',
        'a | b;INBOUND;Call.MP3;2026-03-01;x',
        '"x;y";out;b;2026-03-01 07:30:15;',
      ].join('\n'),
    );
    expect(m.issues).toEqual([]);
    expect(m.lookup('call.mp3')).toMatchObject({
      direction: 'in',
      tags: ['a', 'b'],
      startedAt: '2026-03-01T00:00:00.000Z',
    });
    expect(m.lookup('folder/b.txt')).toMatchObject({
      tags: ['x', 'y'],
      startedAt: '2026-03-01T07:30:15.000Z',
    });
  });

  it('holds for pairing: suffixes pair, folders and second files do not', () => {
    const p = pairFiles(
      [
        'call.mp3',
        'call.transcript.json',
        'b.m4a',
        'b-transcript.txt',
        'c.wav',
        'c_tx.srt',
        'd.ogg',
        'd_transcript.vtt',
        'x/call.mp3',
        'call.wav',
        'notes.pdf',
      ].map(ref),
    );
    expect(p.items.map((i) => [i.key, !!i.audio, !!i.transcript])).toEqual([
      ['b', true, true],
      ['c', true, true],
      ['call', true, true],
      ['d', true, true],
      ['x/call', true, false],
    ]);
    expect(p.ignored.map((f) => f.name).sort()).toEqual(['call.wav', 'notes.pdf']);
  });

  it('holds for transcripts and recording names', () => {
    const json = parseTranscript(
      new TextEncoder().encode(
        JSON.stringify({ segments: [{ start: 0, end: 4.2, speaker: 'Dana', text: 'Hello' }] }),
      ),
      { filename: 'a.json' },
    );
    expect(json.transcript.text).toContain('Hello');
    for (const line of ['Dana: Hello', '[00:01:02] Dana: Hello', '00:01:02 - Dana: Hello']) {
      const t = parseTranscript(new TextEncoder().encode(line), { filename: 'a.txt' });
      expect(t.transcript.segments[0]).toMatchObject({ speaker: 'Dana', text: 'Hello' });
    }
    expect(parseRecordingFileName('Call recording Dana_260301_140500.m4a')).toMatchObject({
      contactName: 'Dana',
      startedAt: '2026-03-01T14:05:00.000Z',
    });
    expect(parseRecordingFileName('Call with Dana 2026-03-01 at 14.05.m4a')).toMatchObject({
      contactName: 'Dana',
      startedAt: '2026-03-01T14:05:00.000Z',
    });
  });
});
