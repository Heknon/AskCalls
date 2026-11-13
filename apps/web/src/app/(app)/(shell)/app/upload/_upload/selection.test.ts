import type { IngestMeta } from '@askcalls/client-core/ingest';
import { describe, expect, it } from 'vitest';
import { groupItems, groupState, selectionSummary } from './selection';

const ref = (name: string, size = 8_000) => ({ ref: name, name, size });
const item = (key: string, audio?: string, transcript?: string) => ({
  key,
  audio: audio ? ref(audio) : null,
  transcript: transcript ? ref(transcript) : null,
});
const meta = (over: Partial<IngestMeta> = {}): IngestMeta => ({
  phone: null,
  startedAt: null,
  direction: null,
  contactName: null,
  tags: [],
  ...over,
});

const items = [
  item('a', 'dana/a.mp3', 'dana/a.txt'),
  item('b', 'dana/b.mp3'),
  item('c', undefined, 'c.srt'),
  item('d', 'ron/d.m4a'),
];
const metas = new Map([
  ['a', meta({ phone: '+972501234567', contactName: 'Dana', startedAt: '2026-03-01T10:00:00Z' })],
  ['b', meta({ phone: '050-123-4567', startedAt: '2026-03-20T10:00:00Z' })],
  ['c', meta()],
  ['d', meta({ contactName: 'Ron', startedAt: '2026-01-05T10:00:00Z' })],
]);

describe('groupItems', () => {
  it('puts names that only look different in one group, and name-only calls with their number', () => {
    const list = [item('x', 'x.m4a'), item('y', 'y.m4a'), item('z', 'z.m4a')];
    const m = new Map([
      ['x', meta({ contactName: 'אלון שני' })],
      ['y', meta({ contactName: '\u202Bאלון  שני\u202C' })],
      ['z', meta({ contactName: 'אלון שני', phone: '+972501234567' })],
    ]);
    const groups = groupItems(list, m, 'contact', 'IL');
    expect(groups.map((g) => g.keys)).toEqual([['x', 'y', 'z']]);
    expect(groups[0]!.key).toBe('+972501234567');
  });

  it('groups by number, in local format too, and keeps the known name', () => {
    const groups = groupItems(items, metas, 'contact', 'IL');
    expect(groups.map((g) => g.keys)).toEqual([['a', 'b'], ['d'], ['c']]);
    expect(groups[0]!.label).toEqual({ kind: 'contact', name: 'Dana', phone: '+972501234567' });
    expect(groups[1]!.key).toBe('name:ron');
    expect(groups[2]!.label).toEqual({ kind: 'none' });
  });

  it('groups by folder, top folder first', () => {
    const groups = groupItems(items, metas, 'folder', 'IL');
    expect(groups.map((g) => [g.key, g.keys])).toEqual([
      ['', ['c']],
      ['dana', ['a', 'b']],
      ['ron', ['d']],
    ]);
  });

  it('groups by month, newest first, undated last', () => {
    const groups = groupItems(items, metas, 'month', 'IL');
    expect(groups.map((g) => g.keys)).toEqual([['a', 'b'], ['d'], ['c']]);
    expect(groups[0]!.label).toMatchObject({ kind: 'month', year: 2026, month: 3 });
  });
});

describe('groupState', () => {
  it('is checked, unchecked or indeterminate', () => {
    expect(groupState(['a', 'b'], new Set())).toBe(true);
    expect(groupState(['a', 'b'], new Set(['a', 'b']))).toBe(false);
    expect(groupState(['a', 'b'], new Set(['b']))).toBe('indeterminate');
  });
});

describe('selectionSummary', () => {
  const summary = {
    secondsByKey: { b: 90, d: 45 },
    duplicateKeys: ['c'],
    unreadable: ['c'],
  };

  it('counts every call when nothing is left out', () => {
    expect(selectionSummary(items, summary, new Set(['a']), new Set())).toEqual({
      selected: 4,
      total: 4,
      audioOnly: 2,
      paired: 1,
      transcriptOnly: 1,
      duplicates: 1,
      minutes: 3,
      unreadable: 1,
      manifestCovered: 1,
    });
  });

  it('leaves out the excluded calls and their minutes', () => {
    const s = selectionSummary(items, summary, new Set(['a']), new Set(['a', 'c', 'd']));
    expect(s).toMatchObject({
      selected: 1,
      audioOnly: 1,
      paired: 0,
      transcriptOnly: 0,
      duplicates: 0,
      minutes: 2,
      unreadable: 0,
      manifestCovered: 0,
    });
  });
});
