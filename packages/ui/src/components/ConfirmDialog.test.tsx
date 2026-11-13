// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { ConsentSheet } from './ConsentSheet';

afterEach(cleanup);

describe('ConfirmDialog', () => {
  test('typeToConfirm keeps the action disabled until the value is typed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete your account?"
        description="Everything is deleted."
        confirmLabel="Delete account"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        typeToConfirm={{ label: 'Type a@b.test to confirm', value: 'a@b.test' }}
      />,
    );
    const action = screen.getByRole('button', { name: 'Delete account' }) as HTMLButtonElement;
    expect(action.disabled).toBe(true);
    await user.type(screen.getByLabelText('Type a@b.test to confirm'), 'a@b.tes');
    expect(action.disabled).toBe(true);
    await user.type(screen.getByLabelText('Type a@b.test to confirm'), 't');
    expect(action.disabled).toBe(false);
    await user.click(action);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  test('focus starts on Cancel, Esc closes and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Delete this call?"
        description="The transcript, notes, tags and recording are deleted for good."
        confirmLabel="Delete call"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        trigger={<button type="button">Delete…</button>}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Delete…' });
    await user.click(trigger);
    expect(screen.getByRole('alertdialog', { name: 'Delete this call?' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('Tab stays inside the dialog', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">outside</button>
        <ConfirmDialog
          open
          title="Delete?"
          description="Gone for good."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {}}
        />
      </>,
    );
    await user.tab();
    await user.tab();
    await user.tab();
    expect(['Cancel', 'Delete']).toContain(document.activeElement?.textContent);
  });
});

describe('ConsentSheet', () => {
  test('focus starts on "Send and ask"; Cancel closes', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ConsentSheet
        open
        onOpenChange={onOpenChange}
        title="Send this call to Anthropic?"
        route="managed"
        dataFlow="This call's transcript and your question go through AskCalls to Anthropic."
        nodes={{ device: 'Your device', server: 'AskCalls', provider: 'Anthropic' }}
        facts={['Only this call.']}
        remember={false}
        onRememberChange={() => {}}
        onSend={() => {}}
        labels={{
          remember: "Don't ask again until I lock AskCalls",
          change: 'Change provider',
          cancel: 'Cancel',
          send: 'Send and ask',
        }}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Send this call to Anthropic?' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Send and ask' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
