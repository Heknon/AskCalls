import { describe, expect, it, vi } from 'vitest';
import { DomainError, isDomainError } from './errors';

/** A second copy of the module, as a separate bundle would load it. */
async function otherCopy(): Promise<typeof import('./errors')> {
  vi.resetModules();
  return import('./errors');
}

describe('DomainError', () => {
  it('is recognized when thrown by another copy of the module', async () => {
    const other = await otherCopy();
    expect(other.DomainError).not.toBe(DomainError);
    const e = new other.DomainError('version_conflict', 'changed', { current: 2 });
    expect(isDomainError(e)).toBe(true);
    expect(e instanceof DomainError).toBe(true);
    expect(other.isDomainError(new DomainError('conflict', 'x'))).toBe(true);
  });

  it('keeps the prototype check for subclasses and rejects plain errors', () => {
    class IngestLike extends DomainError {}
    expect(new DomainError('invalid', 'x') instanceof IngestLike).toBe(false);
    expect(new IngestLike('invalid', 'x') instanceof IngestLike).toBe(true);
    expect(isDomainError(new Error('x'))).toBe(false);
    expect(isDomainError({ code: 'invalid' })).toBe(false);
    expect(isDomainError(null)).toBe(false);
  });
});
