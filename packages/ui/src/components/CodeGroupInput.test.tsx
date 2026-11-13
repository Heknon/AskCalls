// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, test } from 'vitest';
import { CodeGroupInput } from './CodeGroupInput';
import { FingerprintCode } from './FingerprintCode';
import { RecoveryCodeGrid } from './RecoveryCodeGrid';

afterEach(cleanup);

function Harness({ count = 8, numeric = false }: { count?: number; numeric?: boolean }) {
  const [values, setValues] = useState<string[]>(Array(count).fill(''));
  return (
    <CodeGroupInput
      values={values}
      onChange={setValues}
      groupLength={4}
      numeric={numeric}
      labels={Array.from({ length: count }, (_, i) => `Group ${i + 1}`)}
    />
  );
}

const field = (n: number) => screen.getByLabelText(`Group ${n}`) as HTMLInputElement;

describe('CodeGroupInput', () => {
  test('typing a full group moves on and upper-cases', async () => {
    const user = userEvent.setup();
    render(<Harness count={2} />);
    await user.click(field(1));
    await user.keyboard('k7qx');
    expect(field(1).value).toBe('K7QX');
    expect(document.activeElement).toBe(field(2));
  });

  test('pasting the whole code fills every group', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field(1));
    await user.paste('K7QX-M2PA-9TRD-WB4N\nF3LC-H8ZE-Q6VY-JR5U');
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => field(n).value)).toEqual([
      'K7QX',
      'M2PA',
      '9TRD',
      'WB4N',
      'F3LC',
      'H8ZE',
      'Q6VY',
      'JR5U',
    ]);
  });

  test('Backspace in an empty group goes back', async () => {
    const user = userEvent.setup();
    render(<Harness count={2} />);
    await user.click(field(2));
    await user.keyboard('{Backspace}');
    expect(document.activeElement).toBe(field(1));
  });

  test('numeric codes drop letters', async () => {
    const user = userEvent.setup();
    render(<Harness count={2} numeric />);
    await user.click(field(1));
    await user.keyboard('4a8b2');
    expect(field(1).value).toBe('482');
  });

  test('the error is linked to every group', () => {
    render(
      <CodeGroupInput
        values={['', '']}
        onChange={() => {}}
        groupLength={4}
        labels={['Group 3', 'Group 6']}
        error="Wrong code."
      />,
    );
    const desc = screen.getByText('Wrong code.').id;
    expect(field(3).getAttribute('aria-describedby')).toBe(desc);
    expect(field(6).getAttribute('aria-invalid')).toBe('true');
  });
});

describe('RecoveryCodeGrid', () => {
  test('each group is a list item read character by character, in order', async () => {
    const user = userEvent.setup();
    let saved = false;
    render(
      <RecoveryCodeGrid
        groups={['K7QX', 'M2PA']}
        onCopy={() => {}}
        onDownload={() => {}}
        onPrint={() => {}}
        saved={false}
        onSavedChange={(v) => {
          saved = v;
        }}
        labels={{
          list: 'Recovery code, 8 groups',
          group: (n) => `Group ${n}`,
          copy: 'Copy',
          download: 'Download',
          print: 'Print',
          saved: 'I saved my recovery code somewhere safe',
        }}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('aria-label'))).toEqual([
      'Group 1: K 7 Q X',
      'Group 2: M 2 P A',
    ]);
    await user.click(screen.getByLabelText('I saved my recovery code somewhere safe'));
    expect(saved).toBe(true);
  });
});

describe('FingerprintCode', () => {
  test('is read digit by digit in two groups and stays LTR', () => {
    render(<FingerprintCode digits="482913" />);
    const code = screen.getByRole('img');
    expect(code.getAttribute('aria-label')).toBe('4 8 2, 9 1 3');
    expect(code.getAttribute('dir')).toBe('ltr');
  });
});
