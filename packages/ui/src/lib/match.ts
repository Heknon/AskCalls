/** 0: the text starts with the query, 1: one of its words does; undefined: no match. */
export function matchScore(text: string, query: string): 0 | 1 | undefined {
  const t = text.toLocaleLowerCase();
  const q = query.trim().toLocaleLowerCase();
  if (!q) return undefined;
  if (t.startsWith(q)) return 0;
  return t.split(/[\s\-_/·@.]+/).some((w) => w.startsWith(q)) ? 1 : undefined;
}

/** Where the query matches in `text` at a word start, as [start, end), or null. */
export function matchRange(text: string, query: string): [number, number] | null {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return null;
  const t = text.toLocaleLowerCase();
  let i = t.indexOf(q);
  while (i >= 0) {
    if (i === 0 || /[\s\-_/·@.]/.test(t.charAt(i - 1))) return [i, i + q.length];
    i = t.indexOf(q, i + 1);
  }
  return null;
}

/** Text split into plain and matched parts, every case-insensitive occurrence of each hit. */
export function splitHits(text: string, hits: readonly string[]) {
  // Longest first, so a marked phrase wins over a word inside it.
  const terms = hits
    .map((h) => h.trim())
    .filter(Boolean)
    .sort((x, y) => y.length - x.length);
  if (terms.length === 0) return [{ text, hit: false }];
  const escaped = terms.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'giu');
  return text
    .split(re)
    .filter((part) => part !== '')
    .map((part) => ({
      text: part,
      hit: terms.some((h) => h.toLocaleLowerCase() === part.toLocaleLowerCase()),
    }));
}
