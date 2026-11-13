import { describe, expect, it } from 'vitest';
import { connectSrcOf } from './runtime-config';

describe('connectSrcOf', () => {
  it('reads the connect-src sources of a CSP', () => {
    expect(
      connectSrcOf("default-src 'self'; connect-src 'self' https://api.openai.com; img-src 'self'"),
    ).toEqual(["'self'", 'https://api.openai.com']);
  });

  it('is null without a CSP or the directive', () => {
    expect(connectSrcOf(null)).toBeNull();
    expect(connectSrcOf("default-src 'self'")).toBeNull();
  });
});
