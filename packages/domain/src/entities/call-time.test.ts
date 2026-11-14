import { describe, expect, it } from 'vitest';
import { callStartedAt } from './call-time';
import { dayFromDate } from './common';

describe('callStartedAt', () => {
  const uploaded = new Date('2026-11-14T08:42:17.123Z');
  const day = dayFromDate(uploaded);
  const v7 = `${uploaded
    .getTime()
    .toString(16)
    .padStart(12, '0')
    .replace(/^(.{8})/, '$1-')}-7abc-8def-0123456789ab`;

  it('is the start time when the call has one', () => {
    expect(callStartedAt({ id: v7, day }, '2026-11-13T19:05:00.000Z')).toEqual(
      new Date('2026-11-13T19:05:00.000Z'),
    );
  });

  it('is the upload time from the UUIDv7 id when the call has no start time', () => {
    expect(callStartedAt({ id: v7, day }, null)).toEqual(uploaded);
    expect(callStartedAt({ id: v7, day }, undefined)).toEqual(uploaded);
  });

  it('is the start of the day for ids that are not UUIDv7', () => {
    expect(callStartedAt({ id: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b', day }, null)).toEqual(
      new Date('2026-11-14T00:00:00.000Z'),
    );
  });
});
