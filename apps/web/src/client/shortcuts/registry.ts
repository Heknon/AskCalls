/**
 * Keyboard shortcuts (design-system.md 11, WCAG 2.1.4). Pure: the React provider feeds it
 * keydown events and the environment.
 *
 * A key is a character as typed on a US layout ("j", "/", "?", "L" for Shift+L) or a named key
 * ("Escape", "Enter", "ArrowLeft", " "). Letters and "/" match by physical key, so they work on
 * a Hebrew layout too. `keys` with more than one entry is a sequence ("g" then "c").
 */
export type ShortcutGroup = 'calls' | 'callView' | 'everywhere';

export interface Shortcut {
  keys: readonly string[];
  /** Ctrl, or ⌘ on macOS. */
  mod?: boolean;
  run: (e: KeyEventLike) => void;
  /** Also while focus is in a text field (Esc, ⌘+Enter). Single-character keys never do. */
  inTextFields?: boolean;
  /** Shown in the shortcuts dialog when both are set. */
  group?: ShortcutGroup;
  label?: string;
  /** Keys shown in the dialog when one row stands for several shortcuts: ["j", "k"]. */
  displayKeys?: readonly string[];
}

export interface KeyEventLike {
  key: string;
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  preventDefault(): void;
}

export interface KeyEnv {
  /** Settings → Privacy → Single-key shortcuts. */
  singleKey: boolean;
  /** Focus is in an input, textarea, select or contenteditable. */
  inTextField: boolean;
}

/** A character shortcut WCAG 2.1.4 lets users turn off: no Ctrl/⌘ and a printable key. */
export function isSingleKey(s: Pick<Shortcut, 'keys' | 'mod'>): boolean {
  return !s.mod && s.keys.some((k) => k.length === 1 && k !== ' ');
}

/** The key an event stands for, by physical position for letters, digits and "/". */
export function eventKey(e: Pick<KeyEventLike, 'key' | 'code' | 'shiftKey'>): string {
  const letter = /^Key([A-Z])$/.exec(e.code)?.[1];
  if (letter) return e.shiftKey ? letter : letter.toLowerCase();
  const digit = /^Digit(\d)$/.exec(e.code)?.[1];
  if (digit && !e.shiftKey) return digit;
  if (e.code === 'Slash') return e.shiftKey ? '?' : '/';
  return e.key;
}

export interface ShortcutRegistry {
  /** Adds a shortcut; the latest registration of the same keys wins. Returns the remover. */
  register(shortcut: Shortcut): () => void;
  /** Runs the matching shortcut; true when the event was used. */
  handle(e: KeyEventLike, env: KeyEnv): boolean;
  /** What the shortcuts dialog lists: labelled shortcuts, one per key combination. */
  list(): Shortcut[];
  subscribe(listener: () => void): () => void;
}

export function createShortcutRegistry(
  opts: { now?: () => number; sequenceTimeoutMs?: number } = {},
): ShortcutRegistry {
  const now = opts.now ?? (() => Date.now());
  const timeout = opts.sequenceTimeoutMs ?? 1_500;
  const entries: Shortcut[] = [];
  const listeners = new Set<() => void>();
  let pending: string[] = [];
  let pendingAt = 0;

  const changed = () => {
    for (const l of listeners) l();
  };
  const usable = (s: Shortcut, env: KeyEnv, modDown: boolean) =>
    !!s.mod === modDown &&
    (env.singleKey || !isSingleKey(s)) &&
    (!env.inTextField || (s.inTextFields === true && !isSingleKey(s)));
  const startsWith = (s: Shortcut, seq: string[]) => seq.every((k, i) => s.keys[i] === k);

  return {
    register(shortcut) {
      entries.push(shortcut);
      changed();
      return () => {
        const i = entries.indexOf(shortcut);
        if (i >= 0) entries.splice(i, 1);
        changed();
      };
    },

    handle(e, env) {
      const modDown = e.ctrlKey || e.metaKey;
      if (e.altKey || ['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) return false;
      const key = eventKey(e);
      const candidates = entries.filter((s) => usable(s, env, modDown));
      const seq = pending.length && now() - pendingAt <= timeout ? [...pending, key] : [key];
      const tryMatch = (keys: string[]) => {
        const matching = candidates.filter((s) => startsWith(s, keys));
        const exact = matching.filter((s) => s.keys.length === keys.length).at(-1);
        if (exact) {
          pending = [];
          e.preventDefault();
          exact.run(e);
          return true;
        }
        if (matching.length) {
          pending = keys;
          pendingAt = now();
          e.preventDefault();
          return true;
        }
        return false;
      };
      if (tryMatch(seq)) return true;
      pending = [];
      return seq.length > 1 ? tryMatch([key]) : false;
    },

    list() {
      const seen = new Map<string, Shortcut>();
      for (const s of entries) {
        if (s.group && s.label) seen.set(`${s.mod ? 'mod+' : ''}${s.keys.join(' ')}`, s);
      }
      return [...seen.values()];
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
