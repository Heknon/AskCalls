// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { orderSuggestions, type ScoredSuggestion, SearchBox } from './SearchBox';
import type { SearchSuggestionData } from './SearchSuggestion';

afterEach(cleanup);

const s = (id: string, kind: SearchSuggestionData['kind'], score?: 0 | 1): ScoredSuggestion => ({
  id,
  kind,
  label: id,
  meta: `${kind} meta`,
  score,
  onSelect: vi.fn(),
});

function Harness({
  values,
  records = [],
  onSubmit = () => {},
}: {
  values: ScoredSuggestion[];
  records?: SearchSuggestionData[];
  onSubmit?: (v: string) => void;
}) {
  const [q, setQ] = useState('');
  return (
    <SearchBox
      value={q}
      onChange={setQ}
      onSubmit={onSubmit}
      placeholder="Search names, numbers, tags or words"
      labels={{ search: 'Search calls', clear: 'Clear search' }}
      suggestions={q ? values : []}
      records={q ? records : []}
      wordSearch={q ? { ...s('words', 'words'), label: `Words: ${q}` } : undefined}
    />
  );
}

describe('SearchBox keyboard', () => {
  test('opens the list while typing and moves the highlight with the arrows', async () => {
    const user = userEvent.setup();
    render(<Harness values={[s('Dana Levi', 'contact', 0), s('Daniel Oren', 'contact', 1)]} />);
    const box = screen.getByRole('combobox', { name: 'Search calls' });
    await user.type(box, 'da');
    expect(box.getAttribute('aria-expanded')).toBe('true');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(box.getAttribute('aria-activedescendant')).toBeNull();

    await user.keyboard('{ArrowDown}');
    expect(box.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(box.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    await user.keyboard('{ArrowUp}');
    expect(box.getAttribute('aria-activedescendant')).toBe(options[2]!.id);
  });

  test('Enter applies the highlighted suggestion and clears the text', async () => {
    const user = userEvent.setup();
    const dana = s('Dana Levi', 'contact', 0);
    render(<Harness values={[dana]} />);
    const box = screen.getByRole('combobox');
    await user.type(box, 'da');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(dana.onSelect).toHaveBeenCalledOnce();
    expect((box as HTMLInputElement).value).toBe('');
    expect(box.getAttribute('aria-expanded')).toBe('false');
  });

  test('Enter with nothing highlighted runs the word search', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const dana = s('Dana Levi', 'contact', 0);
    render(<Harness values={[dana]} onSubmit={onSubmit} />);
    await user.type(screen.getByRole('combobox'), 'da{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('da');
    expect(dana.onSelect).not.toHaveBeenCalled();
  });

  test('Esc closes the list, a second Esc clears the text', async () => {
    const user = userEvent.setup();
    render(<Harness values={[s('Dana Levi', 'contact', 0)]} />);
    const box = screen.getByRole('combobox') as HTMLInputElement;
    await user.type(box, 'da');
    await user.keyboard('{Escape}');
    expect(box.getAttribute('aria-expanded')).toBe('false');
    expect(box.value).toBe('da');
    await user.keyboard('{Escape}');
    expect(box.value).toBe('');
  });

  test('/ focuses the box from outside a text field', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">elsewhere</button>
        <Harness values={[]} />
      </>,
    );
    screen.getByRole('button', { name: 'elsewhere' }).focus();
    await user.keyboard('/');
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
  });
});

describe('orderSuggestions', () => {
  const calls = [
    s('call 1', 'call'),
    s('call 2', 'call'),
    s('call 3', 'call'),
    s('call 4', 'call'),
  ];

  test('values first by score, then two calls, then the word search', () => {
    const ordered = orderSuggestions(
      'da',
      [s('b', 'tag', 1), s('a', 'contact', 0)],
      calls,
      s('w', 'words'),
    );
    expect(ordered.map((x) => x.id)).toEqual(['a', 'b', 'call 1', 'call 2', 'w']);
  });

  test('up to four calls when no value matches', () => {
    expect(orderSuggestions('da', [], calls).map((x) => x.id)).toEqual([
      'call 1',
      'call 2',
      'call 3',
      'call 4',
    ]);
  });

  test('identifier-looking text puts calls first', () => {
    const ordered = orderSuggestions('0134', [s('a', 'contact', 0)], calls);
    expect(ordered[0]!.kind).toBe('call');
  });

  test('never more than six', () => {
    const many = Array.from({ length: 9 }, (_, i) => s(`v${i}`, 'tag', 0));
    expect(orderSuggestions('v', many, calls, s('w', 'words'))).toHaveLength(6);
  });
});
