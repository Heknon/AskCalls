import { describe, expect, it } from 'vitest';
import { directAccessFor } from './browser-client';
import {
  directOrigins,
  encodeDirectCookie,
  normalizeOrigin,
  parseDirectCookie,
  readDirectCookie,
} from './direct-origins';

describe('direct origins', () => {
  it('encodes provider ids and custom origins, and parses them back', () => {
    const v = encodeDirectCookie({
      providers: ['elevenlabs', 'nope', 'anthropic'],
      origins: [
        'https://acct.r2.cloudflarestorage.com/bucket/x',
        'http://evil.com',
        'javascript:1',
      ],
    });
    expect(parseDirectCookie(v)).toEqual({
      providers: ['elevenlabs', 'anthropic'],
      origins: ['https://acct.r2.cloudflarestorage.com'],
    });
    expect(directOrigins(v)).toEqual([
      'https://api.elevenlabs.io',
      'https://api.anthropic.com',
      'https://acct.r2.cloudflarestorage.com',
    ]);
  });

  it('accepts plain http only for loopback', () => {
    expect(normalizeOrigin('http://localhost:9000/x')).toBe('http://localhost:9000');
    expect(normalizeOrigin('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000');
    expect(normalizeOrigin('http://example.com')).toBeNull();
    expect(normalizeOrigin('https://user:pw@example.com')).toBeNull();
  });

  it('ignores garbage and caps custom origins', () => {
    expect(directOrigins('%%%')).toEqual([]);
    expect(directOrigins('x'.repeat(5000))).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => `o=https%3A%2F%2Fh${i}.example`).join('&');
    expect(directOrigins(many)).toHaveLength(4);
  });

  it('trusts the plain cookie only on plain-HTTP requests', () => {
    const jar: Record<string, string> = { 'askcalls-direct': 'p=openai' };
    const get = (n: string) => jar[n];
    expect(readDirectCookie(get, true)).toBeUndefined();
    expect(readDirectCookie(get, false)).toBe('p=openai');
    jar['__Host-askcalls-direct'] = 'p=deepgram';
    expect(readDirectCookie(get, true)).toBe('p=deepgram');
  });

  it('derives access from the providers document', () => {
    expect(
      directAccessFor({
        v: 1,
        transcription: {
          mode: 'own',
          key: {
            provider: 'elevenlabs',
            apiKey: 'k',
            baseUrl: null,
            model: null,
            zeroRetention: false,
          },
        },
        translation: { rules: [] },
        llm: {
          mode: 'own',
          key: {
            provider: 'openai-compatible',
            apiKey: 'k',
            baseUrl: 'http://localhost:11434/v1',
            model: 'llama',
            zeroRetention: false,
          },
        },
        recordings: {
          mode: 'own',
          bucket: {
            id: 'b1',
            endpoint: 'https://s3.eu-central-1.amazonaws.com',
            bucket: 'my-calls',
            region: 'eu-central-1',
            accessKeyId: 'AK',
            secretAccessKey: 'SK',
          },
        },
      }),
    ).toEqual({
      providers: ['elevenlabs'],
      origins: ['http://localhost:11434', 'https://my-calls.s3.eu-central-1.amazonaws.com'],
    });
    expect(
      directAccessFor({
        v: 1,
        transcription: { mode: 'managed' },
        llm: { mode: 'off' },
        translation: { rules: [] },
        recordings: { mode: 'managed' },
      }),
    ).toEqual({ providers: [], origins: [] });
  });
});
