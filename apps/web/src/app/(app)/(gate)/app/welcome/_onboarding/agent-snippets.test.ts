import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_CLIENTS, CLIENT_SNIPPETS, loginCommands, README_URL } from './agent-snippets';

const readme = readFileSync(join(import.meta.dirname, '../../../../../../../../../README.md'), 'utf8');
const blocks = [...readme.matchAll(/```(\w+)\n([\s\S]*?)\n```/g)].map((m) => m[2]!);

describe('Connect your AI snippets', () => {
  it('match the README exactly', () => {
    expect(blocks).toContain(loginCommands(README_URL).join('\n'));
    for (const c of AGENT_CLIENTS) expect(blocks, c).toContain(CLIENT_SNIPPETS[c].code);
  });
});
