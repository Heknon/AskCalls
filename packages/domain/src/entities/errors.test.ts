import { describe, expect, it, vi } from 'vitest';
import { DomainError, isDomainError } from './errors';

describe('isDomainError', () => {
  it('recognises a DomainError created by another copy of the module', async () => {
    vi.resetModules();
    const other = await import('./errors');
    const e = new other.DomainError('version_conflict', 'user data changed', { current: 2 });
    expect(e).not.toBeInstanceOf(DomainError);
    expect(isDomainError(e)).toBe(true);
  });

  it('rejects other errors', () => {
    expect(isDomainError(new Error('x'))).toBe(false);
    expect(isDomainError({ code: 'invalid', name: 'DomainError' })).toBe(false);
    expect(isDomainError(null)).toBe(false);
  });
});
