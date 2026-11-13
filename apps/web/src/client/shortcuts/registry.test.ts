import { describe, expect, it, vi } from 'vitest';
import { createShortcutRegistry, eventKey, isSingleKey, type KeyEventLike } from './registry';

const key = (k: string, extra: Partial<KeyEventLike> = {}): KeyEventLike => {
  const letter = /^[a-z]$/i.test(k);
  return {
    key: k,
    code: letter ? `Key${k.toUpperCase()}` : k === '/' || k === '?' ? 'Slash' : k,
    shiftKey: (letter && k === k.toUpperCase()) || k === '?',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...extra,
  };
};
const on = { singleKey: true, inTextField: false };

describe('shortcut registry', () => {
  it('runs a single-key shortcut and prevents the default', () => {
    const r = createShortcutRegistry();
    const run = vi.fn();
    r.register({ keys: ['j'], run });
    const e = key('j');
    expect(r.handle(e, on)).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(r.handle(key('k'), on)).toBe(false);
  });

  it('matches letters by physical key, so a Hebrew layout works', () => {
    const r = createShortcutRegistry();
    const run = vi.fn();
    r.register({ keys: ['j'], run });
    r.register({ keys: ['/'], run });
    r.handle(key('j', { key: 'ח' }), on);
    r.handle(key('/', { key: '.' }), on);
    expect(run).toHaveBeenCalledTimes(2);
    expect(eventKey({ key: 'L', code: 'KeyL', shiftKey: true })).toBe('L');
    expect(eventKey({ key: '?', code: 'Slash', shiftKey: true })).toBe('?');
  });

  it('turns every single-character shortcut off when the setting is off (WCAG 2.1.4)', () => {
    const r = createShortcutRegistry();
    const single = vi.fn();
    const shiftL = vi.fn();
    const esc = vi.fn();
    const send = vi.fn();
    r.register({ keys: ['s'], run: single });
    r.register({ keys: ['L'], run: shiftL });
    r.register({ keys: ['Escape'], run: esc });
    r.register({ keys: ['Enter'], mod: true, run: send });
    const off = { singleKey: false, inTextField: false };
    r.handle(key('s'), off);
    r.handle(key('L'), off);
    r.handle(key('Escape', { code: 'Escape' }), off);
    r.handle(key('Enter', { code: 'Enter', metaKey: true }), off);
    expect(single).not.toHaveBeenCalled();
    expect(shiftL).not.toHaveBeenCalled();
    expect(esc).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    expect(isSingleKey({ keys: ['g', 'c'] })).toBe(true);
    expect(isSingleKey({ keys: ['Escape'] })).toBe(false);
  });

  it('ignores shortcuts while typing unless they opt in and are not characters', () => {
    const r = createShortcutRegistry();
    const j = vi.fn();
    const esc = vi.fn();
    const slash = vi.fn();
    r.register({ keys: ['j'], run: j });
    r.register({ keys: ['/'], run: slash, inTextFields: true });
    r.register({ keys: ['Escape'], run: esc, inTextFields: true });
    const typing = { singleKey: true, inTextField: true };
    expect(r.handle(key('j'), typing)).toBe(false);
    expect(r.handle(key('/'), typing)).toBe(false);
    r.handle(key('Escape', { code: 'Escape' }), typing);
    expect(j).not.toHaveBeenCalled();
    expect(slash).not.toHaveBeenCalled();
    expect(esc).toHaveBeenCalledOnce();
  });

  it('does not fire plain shortcuts with Ctrl, ⌘ or Alt held', () => {
    const r = createShortcutRegistry();
    const s = vi.fn();
    r.register({ keys: ['s'], run: s });
    r.handle(key('s', { metaKey: true }), on);
    r.handle(key('s', { ctrlKey: true }), on);
    r.handle(key('s', { altKey: true }), on);
    expect(s).not.toHaveBeenCalled();
  });

  it('runs sequences within the timeout and restarts after it', () => {
    let t = 0;
    const r = createShortcutRegistry({ now: () => t, sequenceTimeoutMs: 1000 });
    const calls = vi.fn();
    const upload = vi.fn();
    r.register({ keys: ['g', 'c'], run: calls });
    r.register({ keys: ['g', 'u'], run: upload });
    expect(r.handle(key('g'), on)).toBe(true);
    t = 500;
    r.handle(key('c'), on);
    expect(calls).toHaveBeenCalledOnce();
    r.handle(key('g'), on);
    t = 2000;
    expect(r.handle(key('u'), on)).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('lets a later registration of the same keys win, and restores the earlier one', () => {
    const r = createShortcutRegistry();
    const first = vi.fn();
    const second = vi.fn();
    r.register({ keys: ['Escape'], run: first });
    const remove = r.register({ keys: ['Escape'], run: second });
    r.handle(key('Escape', { code: 'Escape' }), on);
    remove();
    r.handle(key('Escape', { code: 'Escape' }), on);
    expect(second).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledOnce();
  });

  it('lists labelled shortcuts once per key and notifies subscribers', () => {
    const r = createShortcutRegistry();
    const listener = vi.fn();
    r.subscribe(listener);
    r.register({ keys: ['s'], run: () => {}, group: 'calls', label: 'Star' });
    r.register({ keys: ['s'], run: () => {}, group: 'callView', label: 'Star' });
    r.register({ keys: ['x'], run: () => {} });
    expect(r.list().map((s) => s.group)).toEqual(['callView']);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
