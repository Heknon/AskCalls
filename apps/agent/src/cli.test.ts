import { describe, expect, it } from 'vitest';
import { buildProgram } from './cli';

describe('askcalls CLI', () => {
  it('registers every command from the spec', () => {
    const names = buildProgram()
      .commands.map((c) => c.name())
      .sort();
    expect(names).toEqual(['backup', 'ingest', 'link', 'local', 'login', 'mcp', 'restore']);
  });
});
