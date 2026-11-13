import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, slot } from './markdown';

describe('parseMarkdown', () => {
  it('splits headings, paragraphs and lists, keeping line breaks', () => {
    const blocks = parseMarkdown(
      '# Call summary\nNoah called.\nAbout the quote.\n\n**Topics:**\n- Wall is 4.20 m\n- Quartz *chosen*\n\n1. Send quote\n2. Pay deposit',
    );
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
      'list',
      'list',
    ]);
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      children: [
        { type: 'text', text: 'Noah called.' },
        { type: 'break' },
        { type: 'text', text: 'About the quote.' },
      ],
    });
    const bullets = blocks[3];
    expect(bullets?.type === 'list' && bullets.ordered).toBe(false);
    expect(bullets?.type === 'list' && bullets.items).toHaveLength(2);
    const numbered = blocks[4];
    expect(numbered?.type === 'list' && numbered.ordered).toBe(true);
  });

  it('nests indented lists and reads fences, quotes and rules', () => {
    const blocks = parseMarkdown('- a\n  - b\n\n> note\n\n---\n\n```\nx < y\n```');
    expect(blocks.map((b) => b.type)).toEqual(['list', 'quote', 'rule', 'code']);
    const list = blocks[0];
    expect(list?.type === 'list' && list.items[0]?.map((b) => b.type)).toEqual([
      'paragraph',
      'list',
    ]);
    expect(blocks[3]).toEqual({ type: 'code', text: 'x < y' });
  });

  it('keeps citation slots inside formatting', () => {
    expect(parseInline(`**at ${slot(1)}** done`)).toEqual([
      {
        type: 'strong',
        children: [
          { type: 'text', text: 'at ' },
          { type: 'slot', index: 1 },
        ],
      },
      { type: 'text', text: ' done' },
    ]);
  });

  it('leaves snake_case, lone asterisks and HTML as text', () => {
    expect(parseInline('a_b_c 2 * 3 <img src=x>')).toEqual([
      { type: 'text', text: 'a_b_c 2 * 3 <img src=x>' },
    ]);
  });
});
