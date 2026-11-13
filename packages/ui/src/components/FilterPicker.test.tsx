// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { FilterBlank } from './FilterBlank';
import { FilterPicker, type FilterPickerOption } from './FilterPicker';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const labels = {
  clear: 'Clear',
  search: 'Search 9 tags',
  noMatch: (q: string) => `No tag matches “${q}”`,
  empty: 'No tags yet. Tags you add appear here.',
  chosen: (n: number) => `${n} chosen`,
  pickMany: 'Pick as many as you like',
  show: (n: number) => `Show ${n} calls`,
  done: 'Done',
  tapOne: 'Tap one to show only that.',
};

const tags: FilterPickerOption[] = ['Hot lead', 'Quote sent', 'Follow-up'].map((label, i) => ({
  value: `t${i}`,
  label,
  colour: 'blue',
}));

function Harness({
  multiple = true,
  options = tags,
}: {
  multiple?: boolean;
  options?: FilterPickerOption[];
}) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <FilterPicker
      title="Which tag?"
      options={options}
      value={value}
      onChange={setValue}
      multiple={multiple}
      total={18}
      labels={labels}
    >
      <FilterBlank
        facet="tag"
        empty="any tag"
        value={value.length ? `${value.length} set` : undefined}
      />
    </FilterPicker>
  );
}

describe('FilterPicker', () => {
  test('the blank opens a dialog named by the title; chips toggle aria-pressed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const blank = screen.getByRole('button', { name: 'any tag' });
    expect(blank.getAttribute('aria-haspopup')).toBe('dialog');
    await user.click(blank);
    expect(blank.getAttribute('aria-expanded')).toBe('true');
    const dialog = screen.getByRole('dialog', { name: 'Which tag?' });
    const hot = within(dialog).getByRole('button', { name: 'Hot lead' });
    expect(hot.getAttribute('aria-pressed')).toBe('false');
    await user.click(hot);
    expect(hot.getAttribute('aria-pressed')).toBe('true');
    expect(within(dialog).getByText('1 chosen')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Show 18 calls' })).toBeTruthy();
  });

  test('a chip does not move when chosen while open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'any tag' }));
    const dialog = screen.getByRole('dialog');
    const before = within(dialog)
      .getAllByRole('button', { pressed: false })
      .map((b) => b.textContent);
    await user.click(within(dialog).getByRole('button', { name: 'Follow-up' }));
    const after = within(dialog)
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('aria-pressed'))
      .map((b) => b.textContent);
    expect(after).toEqual(before);
  });

  test('Esc closes and returns focus to the blank', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const blank = screen.getByRole('button', { name: 'any tag' });
    await user.click(blank);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(blank);
  });

  test('single choice closes on one tap', async () => {
    const user = userEvent.setup();
    render(<Harness multiple={false} />);
    await user.click(screen.getByRole('button', { name: 'any tag' }));
    expect(screen.getByText('Tap one to show only that.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Quote sent' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: '1 set' })).toBeTruthy();
  });

  test('over 8 options gets a search field, with an empty result line', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 9 }, (_, i) => ({ value: `v${i}`, label: `Tag ${i}` }));
    render(<Harness options={many} />);
    await user.click(screen.getByRole('button', { name: 'any tag' }));
    const search = screen.getByRole('textbox', { name: 'Search 9 tags' });
    await user.type(search, 'xyz');
    expect(screen.getByText('No tag matches “xyz”')).toBeTruthy();
  });

  test('an empty catalog says so', async () => {
    const user = userEvent.setup();
    render(<Harness options={[]} />);
    await user.click(screen.getByRole('button', { name: 'any tag' }));
    expect(screen.getByText(labels.empty)).toBeTruthy();
  });

  test('on phones it is a bottom sheet that does not focus the search field', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    const user = userEvent.setup();
    const many = Array.from({ length: 9 }, (_, i) => ({ value: `v${i}`, label: `Tag ${i}` }));
    render(<Harness options={many} />);
    await user.click(screen.getByRole('button', { name: 'any tag' }));
    const sheet = screen.getByRole('dialog');
    expect(sheet.getAttribute('data-side')).toBe('bottom');
    expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: 'Search 9 tags' }));
  });
});
