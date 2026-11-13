import type { FileRef } from '@askcalls/client-core/bulk/pairing';
import { type BulkItemState, type BulkState, planBatch } from '@askcalls/client-core/bulk/queue';
import { describe, expect, it } from 'vitest';
import { pendingSources, remapRefs, sourceOf } from './refs';

const ref = (source: string, name: string, size = 10): FileRef => ({
  ref: source.startsWith('zip:') ? `${source}!${name}` : `${source}:${name}`,
  name,
  size,
});

function batch(items: Array<[FileRef | null, FileRef | null, BulkItemState['status']]>): BulkState {
  const state = planBatch({
    items: items.map(([audio, transcript], i) => ({
      key: `k${i}`,
      name: `k${i}`,
      audio,
      transcript,
    })),
    manifest: ref('file:s1', 'manifest.csv'),
    ignored: [],
  });
  items.forEach(([, , status], i) => {
    state.items[i]!.status = status;
  });
  return state;
}

describe('sources', () => {
  it('groups references by folder, page and archive', () => {
    expect(sourceOf('dir:abc:x/y.wav')).toBe('dir:abc');
    expect(sourceOf('file:s1:y.wav')).toBe('file:s1');
    expect(sourceOf('zip:s1:calls.zip!a/b.txt')).toBe('zip:s1:calls.zip');
  });

  it('lists one reference per source the unfinished items need', () => {
    const state = batch([
      [ref('dir:d1', 'a.wav'), ref('dir:d1', 'a.txt'), 'done'],
      [ref('dir:d1', 'b.wav'), null, 'queued'],
      [null, ref('zip:s1:x.zip', 'c.txt'), 'failed'],
      [ref('file:s2', 'd.wav'), null, 'duplicate'],
    ]);
    expect([...pendingSources(state).keys()].sort()).toEqual(['dir:d1', 'file:s1', 'zip:s1:x.zip']);
  });
});

describe('remapRefs', () => {
  it('points unfinished items at files picked again, by path then by name and size', () => {
    const state = batch([
      [ref('file:old', 'calls/a.wav', 5), ref('file:old', 'calls/a.txt', 7), 'queued'],
      [ref('file:old', 'calls/b.wav', 9), null, 'done'],
      [null, ref('file:old', 'c.srt', 3), 'failed'],
      [ref('file:old', 'gone.wav', 1), null, 'queued'],
    ]);
    const picked = [
      ref('file:new', 'calls/a.wav', 5),
      ref('file:new', 'a.txt', 7),
      ref('file:new', 'c.srt', 4),
      ref('file:new', 'manifest.csv'),
    ];
    const { state: next, matched, unmatched } = remapRefs(state, picked);
    expect(matched).toBe(2);
    expect(unmatched).toBe(2);
    expect(next.items[0]!.audio).toEqual({
      ref: 'file:new:calls/a.wav',
      name: 'calls/a.wav',
      size: 5,
    });
    expect(next.items[0]!.transcript).toEqual({
      ref: 'file:new:a.txt',
      name: 'calls/a.txt',
      size: 7,
    });
    expect(next.items[1]!.audio!.ref).toBe('file:old:calls/b.wav');
    expect(next.items[2]!.transcript!.ref).toBe('file:old:c.srt');
    expect(next.manifest!.ref).toBe('file:new:manifest.csv');
    expect(state.items[0]!.audio!.ref).toBe('file:old:calls/a.wav');
  });
});
