import { describe, expect, it } from 'vitest';
import type { LlmProvider, TranscriptionProvider } from '../../src/ports/providers';
import type { Harness } from './helpers';

/** Providers run against recorded fixtures in CI, never live keys (spec 13). */
export function describeTranscriptionProviderContract(
  name: string,
  harness: Harness<{ provider: TranscriptionProvider; sampleAudio: Uint8Array; mimeType: string }>,
) {
  describe(`TranscriptionProvider contract: ${name}`, () => {
    it('returns ordered, timed segments', async () => {
      const { provider, sampleAudio, mimeType } = await harness.setup();
      const res = await provider.transcribe({ audio: sampleAudio, mimeType, language: 'auto' });
      expect(res.segments.length).toBeGreaterThan(0);
      for (const [i, seg] of res.segments.entries()) {
        expect(seg.end).toBeGreaterThanOrEqual(seg.start);
        expect(typeof seg.text).toBe('string');
        if (i > 0) expect(seg.start).toBeGreaterThanOrEqual(res.segments[i - 1]!.start);
      }
      expect(provider.capabilities.maxChunkBytes).toBeGreaterThan(0);
    });
  });
}

export function describeLlmProviderContract(name: string, harness: Harness<LlmProvider>) {
  describe(`LlmProvider contract: ${name}`, () => {
    it('streams a non-empty answer', async () => {
      const llm = await harness.setup();
      let out = '';
      for await (const chunk of llm.ask({
        question: 'What was discussed?',
        transcriptText: 'We discussed the price.',
      })) {
        out += chunk;
      }
      expect(out.length).toBeGreaterThan(0);
    });

    it('translates one string per segment, in order', async () => {
      const llm = await harness.setup();
      const out = await llm.translate({
        segments: LLM_CONTRACT_SEGMENTS,
        source: 'en',
        target: 'he',
      });
      expect(out).toHaveLength(LLM_CONTRACT_SEGMENTS.length);
      expect(out.every((s) => typeof s === 'string')).toBe(true);
    });
  });
}

/** The segments the LlmProvider contract translates; scripted adapters answer for exactly these. */
export const LLM_CONTRACT_SEGMENTS = ['Hello, this is Dana.', 'The price is 1,250 shekels.'];
