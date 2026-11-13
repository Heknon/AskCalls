'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createShortcutRegistry, type Shortcut, type ShortcutRegistry } from './registry';

/** Per browser: whether single-character shortcuts are on (Settings → Privacy). */
const SINGLE_KEY_STORAGE = 'askcalls:single-key-shortcuts';
const SINGLE_KEY_EVENT = 'askcalls:single-key-shortcuts';

function readSingleKey(): boolean {
  try {
    return localStorage.getItem(SINGLE_KEY_STORAGE) !== 'off';
  } catch {
    return true;
  }
}

function subscribeSingleKey(onChange: () => void) {
  const onStorage = (e: StorageEvent) => e.key === SINGLE_KEY_STORAGE && onChange();
  window.addEventListener('storage', onStorage);
  window.addEventListener(SINGLE_KEY_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(SINGLE_KEY_EVENT, onChange);
  };
}

/** The single-key shortcuts setting, shared across tabs. */
export function useSingleKeyShortcuts(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribeSingleKey, readSingleKey, () => true);
  const set = (next: boolean) => {
    try {
      localStorage.setItem(SINGLE_KEY_STORAGE, next ? 'on' : 'off');
    } catch {}
    window.dispatchEvent(new Event(SINGLE_KEY_EVENT));
  };
  return [on, set];
}

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/** A modal (dialog, sheet, menu) owns the keyboard while it is open. */
function modalOpen(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]',
  );
}

const RegistryContext = createContext<ShortcutRegistry | null>(null);

/** One keydown listener for the app; screens add shortcuts with `useShortcut`. */
export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(createShortcutRegistry);
  const [singleKey] = useSingleKeyShortcuts();
  const singleKeyRef = useRef(singleKey);
  singleKeyRef.current = singleKey;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || modalOpen()) return;
      registry.handle(e, { singleKey: singleKeyRef.current, inTextField: isTextField(e.target) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registry]);

  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useShortcutRegistry(): ShortcutRegistry {
  const r = useContext(RegistryContext);
  if (!r) throw new Error('useShortcut needs ShortcutsProvider (the app shell)');
  return r;
}

/**
 * Registers a shortcut while the component is mounted:
 * `useShortcut({ keys: ['s'], group: 'calls', label: t('keys.star'), run: star })`.
 * `run` may change on every render; set `enabled: false` to pause it.
 */
export function useShortcut(shortcut: Shortcut & { enabled?: boolean }): void {
  const registry = useShortcutRegistry();
  const run = useRef(shortcut.run);
  run.current = shortcut.run;
  const { mod, inTextFields, group, label, enabled = true } = shortcut;
  const keys = shortcut.keys.join('\u0000');
  const display = shortcut.displayKeys?.join('\u0000');
  useEffect(() => {
    if (!enabled) return;
    return registry.register({
      keys: keys.split('\u0000'),
      ...(mod !== undefined && { mod }),
      ...(inTextFields !== undefined && { inTextFields }),
      ...(group !== undefined && { group }),
      ...(label !== undefined && { label }),
      ...(display !== undefined && { displayKeys: display.split('\u0000') }),
      run: (e) => run.current(e),
    });
  }, [registry, keys, display, mod, inTextFields, group, label, enabled]);
}

/** The labelled shortcuts registered right now, for the shortcuts dialog. */
export function useRegisteredShortcuts(): Shortcut[] {
  const registry = useShortcutRegistry();
  const [list, setList] = useState(() => registry.list());
  useEffect(() => {
    setList(registry.list());
    return registry.subscribe(() => setList(registry.list()));
  }, [registry]);
  return list;
}
