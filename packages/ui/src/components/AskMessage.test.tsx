// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

import { AskMessage } from './AskMessage';

describe('AskMessage', () => {
  it('renders answer Markdown with citations in place', () => {
    const { container } = render(
      <AskMessage
        kind="answer"
        parts={['# Summary\n- Price at ', { seconds: 48 }, '\n- **Quartz**']}
        onSeek={() => {}}
      />,
    );
    expect(container.querySelector('h3')?.textContent).toBe('Summary');
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector('[data-component="TimestampLink"]')).not.toBeNull();
    expect(items[1]?.querySelector('strong')?.textContent).toBe('Quartz');
  });

  it('keeps question line breaks', () => {
    const { container } = render(<AskMessage kind="question" parts={['one\ntwo']} />);
    expect(container.firstElementChild?.className).toContain('whitespace-pre-wrap');
  });
});
