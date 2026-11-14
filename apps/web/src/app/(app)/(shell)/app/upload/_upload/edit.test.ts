import type { IngestMeta } from '@askcalls/client-core/ingest';
import { describe, expect, it } from 'vitest';
import { editValues, toEdits } from './edit';

const meta = new Map<string, IngestMeta>([
  ['a', { phone: '0501234567', contactName: 'Dana', direction: 'in', startedAt: null }],
  ['b', { phone: '+972501234567', contactName: 'Dana ', direction: null, startedAt: null }],
]);

describe('editValues', () => {
  it('keeps the fields the calls agree on', () => {
    const v = editValues(['a', 'b'], meta, 'IL');
    expect(v.phone).toBe('+972 50-123-4567');
    expect(v.startedAt).toBe('');
    expect(v).not.toHaveProperty('contactName');
    expect(v).not.toHaveProperty('direction');
  });

  it('fills every field for one call', () => {
    expect(editValues(['a'], meta, 'IL')).toMatchObject({ contactName: 'Dana', direction: 'in' });
  });
});

describe('toEdits', () => {
  it('turns cleared fields into null and leaves untouched ones out', () => {
    expect(toEdits({ contactName: '  ', direction: 'out' })).toEqual({
      contactName: null,
      direction: 'out',
    });
    expect(toEdits({ startedAt: '2026-11-12T14:32' }).startedAt).toBe(
      new Date('2026-11-12T14:32').toISOString(),
    );
  });
});
