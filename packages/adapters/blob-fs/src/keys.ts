import { DomainError } from '@askcalls/domain';

/** Longest key accepted, in characters. */
export const MAX_KEY_LENGTH = 1024;

/**
 * One key segment: letters, digits, `_`, `-` and `.`, never starting with a dot. That rules out
 * `.`, `..`, hidden files and anything a filesystem or URL would reinterpret (`/`, `\`, `%`, NUL,
 * `:`), so a key maps to exactly one path under the root and is safe in a URL path unescaped.
 */
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,254}$/;

/** Suffix for object files. Keeps a key `p` (file `p.blob`) apart from `p/1` (directory `p`). */
export const OBJECT_SUFFIX = '.blob';

/** Splits and validates a key. Throws DomainError('invalid') with a content-free message. */
export function keySegments(key: string): string[] {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) {
    throw new DomainError('invalid', 'Blob key has an invalid length');
  }
  const segments = key.split('/');
  for (const s of segments) {
    if (!SEGMENT.test(s)) throw new DomainError('invalid', 'Blob key has an invalid segment');
  }
  return segments;
}

export function isValidKey(key: string): boolean {
  try {
    keySegments(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * The directory part of a prefix (everything up to the last `/`), validated as key segments, and
 * the remaining partial name. `''` means the root.
 */
export function prefixParts(prefix: string): { dirSegments: string[]; rest: string } {
  if (prefix.length > MAX_KEY_LENGTH) throw new DomainError('invalid', 'Blob prefix is too long');
  const cut = prefix.lastIndexOf('/');
  const dir = cut === -1 ? '' : prefix.slice(0, cut);
  const rest = cut === -1 ? prefix : prefix.slice(cut + 1);
  const dirSegments = dir === '' ? [] : keySegments(dir);
  if (rest !== '' && !/^[A-Za-z0-9._-]*$/.test(rest)) {
    throw new DomainError('invalid', 'Blob prefix has an invalid segment');
  }
  return { dirSegments, rest };
}
