import { describe, expect, it } from 'vitest';
import {
  checkConfirmationGroups,
  formatRecoveryCode,
  generateRecoveryCode,
  normalizeRecoveryCode,
  parseRecoveryCode,
  pickConfirmationGroups,
  recoveryCodeGroups,
} from './recovery';

const FORMAT = /^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/;

describe('recovery codes', () => {
  it('generates 8 groups of 4 Crockford characters that parse back', () => {
    for (let i = 0; i < 50; i++) {
      const { bytes, code } = generateRecoveryCode();
      expect(code).toMatch(FORMAT);
      expect(parseRecoveryCode(code)).toEqual(bytes);
    }
  });

  it('encodes known bytes', () => {
    expect(formatRecoveryCode(new Uint8Array(20))).toBe('0000-0000-0000-0000-0000-0000-0000-0000');
    expect(formatRecoveryCode(new Uint8Array(20).fill(0xff))).toBe(
      'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ',
    );
  });

  it('normalizes case, separators and look-alike letters', () => {
    const { bytes, code } = generateRecoveryCode();
    const variants = [
      code.toLowerCase(),
      code.replaceAll('-', ''),
      code.replaceAll('-', ' '),
      `  ${code.replaceAll('-', ' - ')}\n`,
      code.replaceAll('-', '_'),
    ];
    for (const v of variants) expect(parseRecoveryCode(v)).toEqual(bytes);
    const zeros = '0000-0000-0000-0000-0000-0000-0000-0000';
    expect(parseRecoveryCode(zeros.replaceAll('0', 'O'))).toEqual(new Uint8Array(20));
    expect(normalizeRecoveryCode('iiii llll 1111 IiLl oooo OoOo 0000 0000')).toBe(
      `${'1'.repeat(16)}${'0'.repeat(16)}`,
    );
  });

  it('rejects wrong lengths and invalid characters', () => {
    const { code } = generateRecoveryCode();
    for (const bad of [
      '',
      code.slice(0, -1),
      `${code}0`,
      code.replace(/[0-9A-Z]/, 'U'),
      code.replace(/[0-9A-Z]/, '!'),
      code.replace(/[0-9A-Z]/, 'é'),
    ]) {
      expect(() => parseRecoveryCode(bad)).toThrow(
        expect.objectContaining({ reason: 'invalid_recovery_code' }),
      );
    }
  });

  it('splits into groups', () => {
    const { code } = generateRecoveryCode();
    expect(recoveryCodeGroups(code)).toEqual(code.split('-'));
    expect(recoveryCodeGroups(code.toLowerCase().replaceAll('-', ''))).toEqual(code.split('-'));
  });

  it('picks two distinct groups, covering every index', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const [a, b] = pickConfirmationGroups();
      expect(a).toBeLessThan(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(8);
      seen.add(a).add(b);
    }
    expect(seen.size).toBe(8);
  });

  it('checks confirmation answers', () => {
    const { code } = generateRecoveryCode();
    const groups = code.split('-');
    expect(checkConfirmationGroups(code, { 1: groups[1]!, 6: groups[6]!.toLowerCase() })).toBe(
      true,
    );
    expect(checkConfirmationGroups(code, { 1: groups[2]!, 6: groups[6]! })).toBe(
      groups[1] === groups[2],
    );
    expect(checkConfirmationGroups(code, {})).toBe(false);
    expect(checkConfirmationGroups(code, { 9: groups[0]! })).toBe(false);
    expect(checkConfirmationGroups(code, { 0: `${groups[0]}X` })).toBe(false);
    expect(checkConfirmationGroups(code, { 0: '!!!!' })).toBe(false);
  });
});
