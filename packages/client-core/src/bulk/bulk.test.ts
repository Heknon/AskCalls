import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseRecordingFileName } from './filenames';
import { parseCsv, parseManifest } from './manifest';
import { baseName, classifyFile, type FileRef, pairFiles } from './pairing';
import { itemMeta } from './runner';
import { openZip } from './zip';

const ref = (name: string, size = 100): FileRef => ({ ref: `h:${name}`, name, size });

describe('pairing', () => {
  it('strips extensions and transcript suffixes', () => {
    expect(baseName('call1.mp3')).toBe('call1');
    expect(baseName('call1.transcript.txt')).toBe('call1');
    expect(baseName('call1-transcript.srt')).toBe('call1');
    expect(baseName('call1_tx.json')).toBe('call1');
    expect(baseName('dir/Call 2_TX.vtt')).toBe('Call 2');
    expect(baseName('noext')).toBe('noext');
    expect(baseName('a.b.c.m4a')).toBe('a.b.c');
  });

  it('classifies files', () => {
    expect(classifyFile('x/manifest.csv')).toBe('manifest');
    expect(classifyFile('MANIFEST.CSV')).toBe('manifest');
    expect(classifyFile('a.M4A')).toBe('audio');
    expect(classifyFile('a.srt')).toBe('transcript');
    expect(classifyFile('a.pdf')).toBe('other');
  });

  it('pairs audio and transcripts by base name within a folder', () => {
    const p = pairFiles([
      ref('a.mp3'),
      ref('a.transcript.txt'),
      ref('B.m4a'),
      ref('b-transcript.srt'),
      ref('only-audio.wav'),
      ref('only-text_tx.json'),
      ref('x/a.mp3'),
      ref('manifest.csv'),
      ref('notes.pdf'),
      ref('a.ogg'),
    ]);
    const byKey = Object.fromEntries(
      p.items.map((i) => [i.key, [i.audio?.name ?? null, i.transcript?.name ?? null]]),
    );
    expect(byKey).toEqual({
      a: ['a.mp3', 'a.transcript.txt'],
      b: ['B.m4a', 'b-transcript.srt'],
      'only-audio': ['only-audio.wav', null],
      'only-text': [null, 'only-text_tx.json'],
      'x/a': ['x/a.mp3', null],
    });
    expect(p.manifest?.name).toBe('manifest.csv');
    expect(p.ignored.map((f) => f.name).sort()).toEqual(['a.ogg', 'notes.pdf']);
  });
});

describe('manifest.csv', () => {
  it('parses quoted fields, doubled quotes, CRLF and semicolons', () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\n')).toEqual([
      { line: 1, fields: ['a', 'b,c', 'd "e"'] },
      { line: 2, fields: ['1', '2', '3'] },
    ]);
    expect(parseCsv('a;b\n"multi\nline";x').map((r) => r.fields)).toEqual([
      ['a', 'b'],
      ['multi\nline', 'x'],
    ]);
  });

  it('reads every column and reports bad rows by line', () => {
    const m = parseManifest(
      [
        '﻿File,Phone,Started_At,Direction,Contact_Name,Tags',
        'calls/a.mp3,054-123-4567,2026-03-01 09:30,incoming,Dana Levi,"vip;lead"',
        'b.txt,,2026-03-02T10:00:00+02:00,out,,',
        ',0541234567,,,,',
        'c.mp3,,not a date,sideways,,x|y',
        'b.txt,,,,,',
      ].join('\n'),
    );
    expect(m.entries).toEqual([
      {
        file: 'calls/a.mp3',
        phone: '054-123-4567',
        startedAt: '2026-03-01T09:30:00.000Z',
        direction: 'in',
        contactName: 'Dana Levi',
        tags: ['vip', 'lead'],
      },
      {
        file: 'b.txt',
        phone: null,
        startedAt: '2026-03-02T08:00:00.000Z',
        direction: 'out',
        contactName: null,
        tags: [],
      },
      {
        file: 'c.mp3',
        phone: null,
        startedAt: null,
        direction: null,
        contactName: null,
        tags: ['x', 'y'],
      },
    ]);
    expect(m.issues).toEqual([
      { line: 4, code: 'missing_file' },
      { line: 5, code: 'bad_date' },
      { line: 5, code: 'bad_direction' },
      { line: 6, code: 'duplicate_file' },
    ]);
    expect(m.lookup('calls/a.mp3')?.contactName).toBe('Dana Levi');
    expect(m.lookup('elsewhere/A.MP3')?.contactName).toBe('Dana Levi');
    expect(m.lookup('a.transcript.txt')?.contactName).toBe('Dana Levi');
    expect(m.lookup('zzz.mp3')).toBeUndefined();
  });

  it('needs a file column', () => {
    expect(() => parseManifest('phone\n1')).toThrow(/file column/);
    expect(() => parseManifest('')).toThrow(/empty/);
  });

  it('decodes UTF-8 bytes with Hebrew values', () => {
    const m = parseManifest(new TextEncoder().encode('file,contact_name\nx.mp3,דנה'));
    expect(m.entries[0]?.contactName).toBe('דנה');
  });
});

describe('recording file names', () => {
  it('reads Samsung names with a number or a contact', () => {
    expect(parseRecordingFileName('Call recording +972541234567_240501_101532.m4a')).toEqual({
      format: 'samsung',
      phone: '+972541234567',
      contactName: null,
      startedAt: '2024-05-01T10:15:32.000Z',
    });
    expect(parseRecordingFileName('Call recording Dana Levi_240501_101532.m4a')).toMatchObject({
      phone: null,
      contactName: 'Dana Levi',
    });
    expect(parseRecordingFileName('0541234567_20240501_101532.m4a')).toMatchObject({
      format: 'samsung',
      phone: '+972541234567',
      startedAt: '2024-05-01T10:15:32.000Z',
    });
    expect(parseRecordingFileName('הקלטת שיחה דנה_240501_101532.m4a')?.contactName).toBe('דנה');
  });

  it('reads iPhone-style names', () => {
    expect(
      parseRecordingFileName('Call with +1 (415) 555-0132 2025-11-03 at 14.05.09.m4a'),
    ).toEqual({
      format: 'iphone',
      phone: '+14155550132',
      contactName: null,
      startedAt: '2025-11-03T14:05:09.000Z',
    });
    expect(parseRecordingFileName('Call with Dana Levi.m4a')).toEqual({
      format: 'iphone',
      phone: null,
      contactName: 'Dana Levi',
      startedAt: null,
    });
    expect(parseRecordingFileName('2025-11-03 14-05.m4a')?.startedAt).toBe(
      '2025-11-03T14:05:00.000Z',
    );
  });

  it('applies the phone clock offset and rejects impossible dates', () => {
    expect(
      parseRecordingFileName('x_240501_101532.m4a', { utcOffsetMinutes: 180 })?.startedAt,
    ).toBe('2024-05-01T07:15:32.000Z');
    expect(parseRecordingFileName('x_241341_101532.m4a')).toBeNull();
    expect(parseRecordingFileName('voice memo.m4a')).toBeNull();
  });

  it('lets the manifest override file-name data field by field', () => {
    const manifest = parseManifest(
      'file,contact_name,tags\nCall recording 0541234567_240501_101532.m4a,Dana,vip',
    );
    const meta = itemMeta(
      {
        audio: ref('Call recording 0541234567_240501_101532.m4a'),
        transcript: null,
      },
      { manifest },
    );
    expect(meta).toEqual({
      phone: '+972541234567',
      startedAt: '2024-05-01T10:15:32.000Z',
      direction: null,
      contactName: 'Dana',
      tags: ['vip'],
    });
  });
});

describe('zip input', () => {
  it('lists audio, transcripts and the manifest and reads them by reference', async () => {
    const zip = zipSync({
      'calls/a.mp3': new Uint8Array([1, 2, 3]),
      'calls/a.transcript.txt': new TextEncoder().encode('hello'),
      'manifest.csv': new TextEncoder().encode('file\na.mp3'),
      '__MACOSX/calls/._a.mp3': new Uint8Array([9]),
      'readme.pdf': new Uint8Array([7]),
    });
    const { files, reader } = openZip(zip, 'zip1');
    expect(files.map((f) => f.name).sort()).toEqual([
      'calls/a.mp3',
      'calls/a.transcript.txt',
      'manifest.csv',
    ]);
    const audio = await reader.audio(files.find((f) => f.name === 'calls/a.mp3')!);
    expect(audio).toEqual({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'audio/mpeg' });
    await expect(reader.bytes({ ref: 'other!x', name: 'calls/a.mp3', size: 3 })).rejects.toThrow();
  });
});
