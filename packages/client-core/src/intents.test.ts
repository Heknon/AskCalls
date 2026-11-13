import { BUILT_IN_INTENTS } from '@askcalls/indexing';
import { describe, expect, it } from 'vitest';
import { extendBuiltIn } from './intents';

describe('extendBuiltIn', () => {
  const legal = BUILT_IN_INTENTS.find((b) => b.id === 'legal')!;

  it('adds the user’s examples and threshold to a built-in intent', () => {
    const extended = extendBuiltIn(legal, {
      id: 'legal',
      examples: ['Our attorney will send a letter', legal.examples[0]!],
      threshold: 0.9,
    });
    expect(extended.examples).toEqual([...legal.examples, 'Our attorney will send a letter']);
    expect(extended.threshold).toBe(0.9);
  });

  it('keeps the built-in as it is without an extension or a threshold', () => {
    expect(extendBuiltIn(legal, undefined)).toBe(legal);
    expect(extendBuiltIn(legal, { id: 'legal', examples: [legal.examples[0]!] })).toEqual(legal);
  });
});
