import type { Shortcut } from '../../../../client/shortcuts/registry';

const NAMED: Record<string, string> = {
  Escape: 'Esc',
  Enter: 'Enter',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ' ': 'Space',
};

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Key caps for the dialog and hints: Shift+L as ["⇧", "L"], ⌘ or Ctrl for `mod`. */
export function keyCaps(s: Pick<Shortcut, 'keys' | 'mod' | 'displayKeys'>): string[] {
  const keys = s.displayKeys ?? s.keys;
  const caps = keys.flatMap((k) => (NAMED[k] ? [NAMED[k]] : /^[A-Z]$/.test(k) ? ['⇧', k] : [k]));
  return s.mod ? [isMac() ? '⌘' : 'Ctrl', ...caps] : caps;
}
