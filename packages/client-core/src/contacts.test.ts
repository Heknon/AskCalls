import { describe, expect, it } from 'vitest';
import { callContactKey, contactKeys, nameKey, withCallContact } from './contacts';
import type { Contact } from './userdata';

const c = (id: string, name: string, phones: string[] = [], aliases: string[] = []): Contact => ({
  id,
  name,
  phones,
  aliases,
});

describe('callContactKey', () => {
  it('uses the number, else the normalised name', () => {
    expect(callContactKey('+972525550134', 'Dana')).toBe('+972525550134');
    expect(callContactKey(null, ' ‏Dana  Levi ')).toBe('name:dana levi');
    expect(callContactKey(null, ' ')).toBeNull();
    expect(callContactKey(null, null)).toBeNull();
  });
});

describe('contactKeys', () => {
  it('covers numbers, the name and earlier names', () => {
    expect(contactKeys(c('a', 'Dana', ['052-555-0134'], ['Dana L']), 'IL')).toEqual([
      '+972525550134',
      nameKey('Dana'),
      nameKey('Dana L'),
    ]);
  });
});

describe('withCallContact', () => {
  const id = () => 'new';
  it('adds a contact for a new number, named by the call or the number', () => {
    expect(withCallContact([], { phoneE164: '+972525550134', name: 'Dana' }, 'IL', id)).toEqual([
      c('new', 'Dana', ['+972525550134']),
    ]);
    expect(withCallContact([], { phoneE164: '+972525550134', name: null }, 'IL', id)).toEqual([
      c('new', '+972525550134', ['+972525550134']),
    ]);
    expect(withCallContact([], { phoneE164: null, name: 'Avi' }, 'IL', id)).toEqual([
      c('new', 'Avi'),
    ]);
  });

  it('changes nothing for a known number or name, or a call with neither', () => {
    const list = [c('a', 'Dana', ['0525550134'])];
    expect(withCallContact(list, { phoneE164: '+972525550134', name: 'Other' }, 'IL')).toBeNull();
    expect(withCallContact(list, { phoneE164: null, name: 'dana' }, 'IL')).toBeNull();
    expect(withCallContact(list, { phoneE164: null, name: null }, 'IL')).toBeNull();
  });

  it('gives a known name the number, and a number-only contact the name', () => {
    expect(
      withCallContact([c('a', 'Avi')], { phoneE164: '+972545550000', name: 'AVI' }, 'IL'),
    ).toEqual([c('a', 'Avi', ['+972545550000'])]);
    expect(
      withCallContact(
        [c('a', '+972545550000', ['+972545550000'])],
        { phoneE164: '+972545550000', name: 'Avi' },
        'IL',
      ),
    ).toEqual([c('a', 'Avi', ['+972545550000'])]);
  });

  it('matches a renamed contact by an earlier name', () => {
    const list = [c('a', 'Avi M', [], ['Avi'])];
    expect(withCallContact(list, { phoneE164: null, name: 'Avi' }, 'IL')).toBeNull();
  });
});
