import { isSingleWord, normalizeWord, type SynonymEntry } from '@askcalls/indexing';

export interface Group {
  key: string;
  canonical: string;
  variants: string[];
}

export type SynonymProblem = 'oneWord' | 'exists';

/** Problems by group key, and the entries that can be stored. */
export function checkGroups(groups: readonly Group[]): {
  problems: Map<string, SynonymProblem>;
  entries: SynonymEntry[];
} {
  const problems = new Map<string, SynonymProblem>();
  const entries: SynonymEntry[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    const canonical = g.canonical.trim();
    if (!canonical && g.variants.length === 0) continue;
    if (!canonical || !isSingleWord(canonical) || g.variants.some((v) => !isSingleWord(v))) {
      problems.set(g.key, 'oneWord');
      continue;
    }
    const norm = normalizeWord(canonical);
    if (seen.has(norm)) {
      problems.set(g.key, 'exists');
      continue;
    }
    seen.add(norm);
    entries.push({ canonical, variants: g.variants });
  }
  return { problems, entries };
}
