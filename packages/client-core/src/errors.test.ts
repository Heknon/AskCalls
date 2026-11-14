import { DomainError } from '@askcalls/domain';
import { describe, expect, it } from 'vitest';
import { failureReason } from './errors';

describe('failureReason', () => {
  it('names the embedder step that failed, and indexing for anything else it throws', () => {
    const embed = (embedder?: string) =>
      failureReason(
        new DomainError('provider_error', 'embedding failed', embedder ? { embedder } : {}),
      );
    expect(embed('download')).toBe('model_unavailable');
    expect(embed('verification')).toBe('model_unverified');
    expect(embed('load')).toBe('model_unsupported');
    expect(embed('inference')).toBe('indexing_failed');
    expect(embed()).toBe('indexing_failed');
  });
});
