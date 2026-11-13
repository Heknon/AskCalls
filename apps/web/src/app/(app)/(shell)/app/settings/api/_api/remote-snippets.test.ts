import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { README_URL } from '../../../../../(gate)/app/welcome/_onboarding/agent-snippets';
import { REMOTE_TOOLS, remoteCli, remoteJson } from './remote-snippets';

const readme = readFileSync(
  join(import.meta.dirname, '../../../../../../../../../../README.md'),
  'utf8',
);
const blocks = [...readme.matchAll(/```(\w+)\n([\s\S]*?)\n```/g)].map((m) => m[2]!);

describe('remote MCP snippets', () => {
  it('match the README exactly', () => {
    expect(blocks).toContain(remoteCli(README_URL));
    expect(blocks).toContain(remoteJson(README_URL));
  });

  it('name the tools the README lists', () => {
    const section = readme.slice(readme.indexOf('### Remote MCP'));
    for (const tool of REMOTE_TOOLS) expect(section).toContain(`\`${tool}\``);
  });
});
