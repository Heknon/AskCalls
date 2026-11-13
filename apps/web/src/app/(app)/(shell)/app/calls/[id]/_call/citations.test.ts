import { describe, expect, it } from 'vitest';
import { parseCitations } from './citations';

describe('ask citations', () => {
  it('turns times inside the call into seek links', () => {
    expect(parseCitations('She asked for a quote 0:48 and a discount [1:05].', 300)).toEqual([
      'She asked for a quote ',
      { seconds: 48 },
      ' and a discount ',
      { seconds: 65 },
      '.',
    ]);
    expect(parseCitations('At [00:02:10] she agreed', 600)).toEqual([
      'At ',
      { seconds: 130 },
      ' she agreed',
    ]);
  });

  it('leaves clock times and other numbers as text', () => {
    expect(parseCitations('The meeting is at 14:32, about 1,200 shekels', 300)).toEqual([
      'The meeting is at 14:32, about 1,200 shekels',
    ]);
    expect(parseCitations('', 300)).toEqual([]);
  });
});
