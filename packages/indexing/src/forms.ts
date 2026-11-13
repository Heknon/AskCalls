import { hebrewPrefixForms } from './hebrew';
import { letterCount, tokenize, withoutInnerMarks } from './normalize';
import { DEFAULT_STOPWORDS, type StopwordSet } from './stopwords';
import { EMPTY_SYNONYMS, type SynonymLookup } from './synonyms';

export interface FormOptions {
  stopwords?: StopwordSet;
  synonyms?: SynonymLookup;
}

/** A keyword form and how far it is from the spoken word: 0 = the word itself or its synonym. */
export interface RankedForm {
  form: string;
  /** 0 the word (or a synonym of it), 1 without apostrophes/gershayim, 2+ prefix-stripped (more letters removed, higher). */
  rank: number;
}

/** Forms shorter than two letters carry no signal, except numbers. */
function keepable(form: string, stopwords: StopwordSet): boolean {
  if (!form || stopwords.has(form)) return false;
  return letterCount(form) >= 2 || /^\d+$/.test(form);
}

/**
 * Every index form of one normalized word (spec 7.2–7.4): the word, the word without inner
 * apostrophes/gershayim, its Hebrew prefix-stripped forms and the synonym canonicals of all of
 * those, minus stopwords. A word that is itself a stopword yields nothing. Used identically for
 * transcripts and queries.
 */
export function wordForms(word: string, opts: FormOptions = {}): RankedForm[] {
  const stopwords = opts.stopwords ?? DEFAULT_STOPWORDS;
  const synonyms = opts.synonyms ?? EMPTY_SYNONYMS;
  if (!word || stopwords.has(word)) return [];

  const ranked = new Map<string, number>();
  const add = (form: string, rank: number) => {
    if (!keepable(form, stopwords)) return;
    const prev = ranked.get(form);
    if (prev === undefined || rank < prev) ranked.set(form, rank);
    for (const canonical of synonyms.get(form) ?? []) {
      if (!keepable(canonical, stopwords)) continue;
      const p = ranked.get(canonical);
      if (p === undefined || rank < p) ranked.set(canonical, rank);
    }
  };

  const bases = [word];
  const bare = withoutInnerMarks(word);
  if (bare !== word) bases.push(bare);
  bases.forEach((base, i) => {
    add(base, i);
    hebrewPrefixForms(base).forEach((f, k) => {
      add(f, 2 + k);
    });
  });

  return [...ranked].map(([form, rank]) => ({ form, rank }));
}

/** Tokenizes text and returns the forms of each token, in order. */
export function textForms(text: string, opts: FormOptions = {}): RankedForm[][] {
  return tokenize(text).map((w) => wordForms(w, opts));
}
