/**
 * Rules may hold user regexes, and JavaScript regexes backtrack with no timeout. Patterns are
 * limited to a subset without catastrophic backtracking, and run on bounded input windows with a
 * time budget (see `SafeRegex.test`).
 *
 * Rejected: patterns over 200 characters; backreferences and lookarounds; a quantified group that
 * contains a quantifier or an alternation (`(a+)+`, `(a|ab)*`); more than three unbounded
 * quantifiers; bounded repeats above 100.
 */
export const MAX_REGEX_LENGTH = 200;
export const MAX_UNBOUNDED_QUANTIFIERS = 3;
export const MAX_REPEAT = 100;
/** Text is matched in windows of this many characters, overlapping by `REGEX_WINDOW_OVERLAP`. */
export const REGEX_WINDOW = 500;
export const REGEX_WINDOW_OVERLAP = 100;
/** Total time one regex may spend on one call before it is treated as not matching. */
export const REGEX_TIME_BUDGET_MS = 50;

export type RegexCheck = { ok: true } | { ok: false; reason: string };

interface Group {
  hasQuantifier: boolean;
  hasAlternation: boolean;
}

export function checkRegex(pattern: string, flags = 'u'): RegexCheck {
  if (pattern.length === 0) return { ok: false, reason: 'empty' };
  if (pattern.length > MAX_REGEX_LENGTH) return { ok: false, reason: 'too_long' };
  try {
    new RegExp(pattern, flags.includes('u') ? flags : `${flags}u`);
  } catch {
    return { ok: false, reason: 'syntax' };
  }

  const stack: Group[] = [{ hasQuantifier: false, hasAlternation: false }];
  let unbounded = 0;
  let inClass = false;
  /** What the next quantifier applies to: a closed group (with its contents) or a single atom. */
  let lastAtom: Group | 'atom' | null = null;

  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '\\') {
      const next = pattern[i + 1] ?? '';
      if (/[1-9]/.test(next) || next === 'k') return { ok: false, reason: 'backreference' };
      // \p{…}, \u{…}, \x.. are single atoms; skip their bodies.
      if ((next === 'p' || next === 'P' || next === 'u') && pattern[i + 2] === '{') {
        const close = pattern.indexOf('}', i + 3);
        i = close < 0 ? pattern.length : close;
      } else {
        i++;
      }
      if (!inClass) lastAtom = 'atom';
      continue;
    }
    if (inClass) {
      if (c === ']') {
        inClass = false;
        lastAtom = 'atom';
      }
      continue;
    }
    if (c === '[') {
      inClass = true;
      if (pattern[i + 1] === ']') i++;
      continue;
    }
    if (c === '(') {
      if (pattern[i + 1] === '?') {
        const kind = pattern.slice(i + 2, i + 4);
        if (kind.startsWith('=') || kind.startsWith('!') || kind === '<=' || kind === '<!') {
          return { ok: false, reason: 'lookaround' };
        }
      }
      stack.push({ hasQuantifier: false, hasAlternation: false });
      lastAtom = null;
      continue;
    }
    if (c === ')') {
      const g = stack.pop();
      if (!g || stack.length === 0) return { ok: false, reason: 'syntax' };
      const parent = stack[stack.length - 1]!;
      parent.hasQuantifier ||= g.hasQuantifier;
      parent.hasAlternation ||= g.hasAlternation;
      lastAtom = g;
      continue;
    }
    if (c === '|') {
      stack[stack.length - 1]!.hasAlternation = true;
      lastAtom = null;
      continue;
    }
    let quantifier: { min: number; max: number } | null = null;
    let length = 1;
    if (c === '*') quantifier = { min: 0, max: Number.POSITIVE_INFINITY };
    else if (c === '+') quantifier = { min: 1, max: Number.POSITIVE_INFINITY };
    else if (c === '?') quantifier = { min: 0, max: 1 };
    else if (c === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i));
      if (m) {
        const min = Number(m[1]);
        const max = m[2] === undefined ? min : m[3] === '' ? Number.POSITIVE_INFINITY : Number(m[3]);
        if (min > MAX_REPEAT || (Number.isFinite(max) && max > MAX_REPEAT)) {
          return { ok: false, reason: 'repeat_too_large' };
        }
        quantifier = { min, max };
        length = m[0].length;
      }
    }
    if (quantifier) {
      if (lastAtom === null) return { ok: false, reason: 'syntax' };
      const variable = quantifier.max !== quantifier.min;
      // `(mr|mrs)?` is fine; repeating a group that can match in several ways is not.
      const repeats = variable && quantifier.max > 1;
      if (repeats && lastAtom !== 'atom' && (lastAtom.hasQuantifier || lastAtom.hasAlternation)) {
        return { ok: false, reason: 'nested_quantifier' };
      }
      if (!Number.isFinite(quantifier.max) && ++unbounded > MAX_UNBOUNDED_QUANTIFIERS) {
        return { ok: false, reason: 'too_many_quantifiers' };
      }
      if (variable) stack[stack.length - 1]!.hasQuantifier = true;
      i += length - 1;
      // A lazy `?` after a quantifier is not another quantifier.
      if (pattern[i + 1] === '?') i++;
      lastAtom = null;
      continue;
    }
    lastAtom = 'atom';
  }
  return { ok: true };
}

export function isSafeRegex(pattern: string, flags = 'u'): boolean {
  return checkRegex(pattern, flags).ok;
}

/** Splits text into overlapping windows so no single regex run sees more than `REGEX_WINDOW` chars. */
export function regexWindows(text: string): string[] {
  if (text.length <= REGEX_WINDOW) return [text];
  const out: string[] = [];
  const step = REGEX_WINDOW - REGEX_WINDOW_OVERLAP;
  for (let start = 0; start < text.length; start += step) {
    out.push(text.slice(start, start + REGEX_WINDOW));
    if (start + REGEX_WINDOW >= text.length) break;
  }
  return out;
}

export interface SafeRegex {
  /** True when any text matches. False on budget exhaustion. */
  test(texts: readonly string[]): boolean;
}

/** Compiles a checked pattern. Returns null for an unsafe or invalid pattern. */
export function compileSafeRegex(
  pattern: string,
  opts: { caseSensitive?: boolean; budgetMs?: number; now?: () => number } = {},
): SafeRegex | null {
  const flags = opts.caseSensitive ? 'u' : 'iu';
  if (!isSafeRegex(pattern, flags)) return null;
  const re = new RegExp(pattern, flags);
  const budget = opts.budgetMs ?? REGEX_TIME_BUDGET_MS;
  const now = opts.now ?? (() => performance.now());
  return {
    test(texts) {
      const started = now();
      for (const text of texts) {
        for (const w of regexWindows(text)) {
          if (re.test(w)) return true;
          if (now() - started > budget) return false;
        }
      }
      return false;
    },
  };
}
