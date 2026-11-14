import { describe, expect, it } from 'vitest';
import { matchesFilter, mergeVcards, parseVcf } from './vcf';

const VCF = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Dana Levi',
  'N:Levi;Dana;;;',
  'TEL;TYPE=CELL:052-555-0134',
  'item1.TEL:+972 3-555-0199',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:4.0',
  'N:Mizrahi;Yossi;;;',
  'TEL;VALUE=uri:tel:+972-54-555-0000',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:2.1',
  'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D7=93=D7=A0=D7=94',
  'TEL;CELL:0501234567',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Long name continued',
  '  here\\, really',
  'END:VCARD',
].join('\r\n');

describe('parseVcf', () => {
  it('reads names (FN, then N) and numbers from vCard 2.1, 3.0 and 4.0', () => {
    expect(parseVcf(VCF)).toEqual([
      { name: 'Dana Levi', phones: ['052-555-0134', '+972 3-555-0199'] },
      { name: 'Yossi Mizrahi', phones: ['+972-54-555-0000'] },
      { name: 'דנה', phones: ['0501234567'] },
      { name: 'Long name continued here, really', phones: [] },
    ]);
  });
});

describe('mergeVcards', () => {
  it('adds new contacts with E.164 numbers and counts ones already saved', () => {
    let n = 0;
    const existing = [{ id: 'x', name: 'Dana', phones: ['+972525550134'], aliases: [] }];
    const result = mergeVcards(existing, parseVcf(VCF), 'IL', () => `id${++n}`);
    expect(result.imported).toBe(2);
    expect(result.existed).toBe(1);
    expect(result.contacts.slice(1)).toEqual([
      { id: 'id1', name: 'Yossi Mizrahi', phones: ['+972545550000'], aliases: [] },
      { id: 'id2', name: 'דנה', phones: ['+972501234567'], aliases: [] },
    ]);
  });

  it('fills in contacts made from calls: numbers for a name, a name for a number', () => {
    const existing = [
      { id: 'a', name: 'yossi  mizrahi', phones: [], aliases: [] },
      { id: 'b', name: '+972525550134', phones: ['+972525550134'], aliases: [] },
    ];
    const result = mergeVcards(existing, parseVcf(VCF), 'IL', () => 'new');
    expect(result.contacts.slice(0, 2)).toEqual([
      { id: 'a', name: 'yossi  mizrahi', phones: ['+972545550000'], aliases: [] },
      { id: 'b', name: 'Dana Levi', phones: ['+972525550134'], aliases: [] },
    ]);
    expect(result.contacts).toHaveLength(3);
  });
});

describe('matchesFilter', () => {
  const c = { id: 'x', name: 'Dana Levi', phones: ['+972525550134'], aliases: [] };
  it('matches names and digits in any format', () => {
    expect(matchesFilter(c, 'lev')).toBe(true);
    expect(matchesFilter(c, '052-555')).toBe(true);
    expect(matchesFilter(c, '5550134')).toBe(true);
    expect(matchesFilter(c, '12')).toBe(false);
    expect(matchesFilter(c, '')).toBe(true);
  });
});
