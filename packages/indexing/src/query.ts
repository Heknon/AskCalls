import { EMBEDDING_QUERY_PREFIX } from './constants';
import { type FormOptions, wordForms } from './forms';
import { compareVariants, expandTerm, MAX_VARIANTS_PER_TERM, type Variant } from './fuzzy';
import { tokenize } from './normalize';
import { createRedactor, type RedactorOptions } from './redact';
import type { ReadonlyVocabulary } from './vocabulary';

export interface PrepareQueryOptions extends FormOptions {
  /** The local vocabulary; without it there is no fuzzy or prefix expansion. */
  vocabulary?: ReadonlyVocabulary;
  /** The "include prefixes" search setting. */
  includePrefixes?: boolean;
  /** Edit-distance expansion (default true). */
  fuzzy?: boolean;
  maxVariantsPerTerm?: number;
  /** For redacting the embedding text (contact names, phone region). */
  redaction?: RedactorOptions;
}

export interface QueryTerm {
  /** The normalized word as typed. */
  term: string;
  /** Typed with a trailing `*`. */
  prefix: boolean;
  /** Every form searched for this term: the term's own forms, then variants. At most 32. */
  forms: string[];
  /** Vocabulary variants added by fuzzy or prefix matching ("also matched"). */
  variants: Variant[];
}

export interface PreparedQuery {
  terms: QueryTerm[];
  /** One group per term (AND across, OR within). Hash each form with kind `w` for `keywordGroups`. */
  keywordGroups: string[][];
  /** Distinct variant forms, best first, for the "also matched" line. */
  alsoMatched: string[];
  /** Words dropped as stopwords. */
  ignored: string[];
  /** `query: ` + the redacted query, for the query embedding. */
  embedText: string;
}

/**
 * Turns a search box string into keyword groups (spec 7, 9.1), applying exactly the indexing
 * normalization, Hebrew prefix expansion, synonyms and stopwords, plus fuzzy expansion against the
 * vocabulary. A trailing `*` asks for prefix matching on that word.
 */
export function prepareQuery(query: string, opts: PrepareQueryOptions = {}): PreparedQuery {
  const max = opts.maxVariantsPerTerm ?? MAX_VARIANTS_PER_TERM;
  const terms: QueryTerm[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();

  for (const piece of query.split(/\s+/).filter(Boolean)) {
    const explicit = /\*+$/.test(piece);
    const words = tokenize(piece.replace(/\*+$/, ''));
    words.forEach((word, wi) => {
      const prefix = explicit && wi === words.length - 1;
      const key = `${word}${prefix ? '*' : ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      const own = wordForms(word, opts);
      if (own.length === 0) {
        ignored.push(word);
        return;
      }
      const forms = own
        .sort((a, b) => a.rank - b.rank)
        .map((f) => f.form)
        .slice(0, max);
      const variants: Variant[] = [];
      if (opts.vocabulary) {
        const found = new Map<string, Variant>();
        for (const base of forms) {
          const expanded = expandTerm(base, opts.vocabulary, {
            explicitPrefix: prefix && base === forms[0],
            includePrefixes: opts.includePrefixes ?? false,
            fuzzy: opts.fuzzy ?? true,
            maxVariants: max,
          });
          for (const v of expanded) {
            if (forms.includes(v.form)) continue;
            const prev = found.get(v.form);
            if (!prev || compareVariants(v, prev) < 0) found.set(v.form, v);
          }
        }
        variants.push(...[...found.values()].sort(compareVariants).slice(0, max - forms.length));
      }
      terms.push({
        term: word,
        prefix,
        forms: [...forms, ...variants.map((v) => v.form)],
        variants,
      });
    });
  }

  const also = new Map<string, Variant>();
  for (const t of terms) for (const v of t.variants) if (!also.has(v.form)) also.set(v.form, v);
  const redacted = createRedactor(opts.redaction).redact(
    query.replace(/\*+(?=\s|$)/g, '').trim(),
  ).text;
  return {
    terms,
    keywordGroups: terms.map((t) => t.forms),
    alsoMatched: [...also.values()].sort(compareVariants).map((v) => v.form),
    ignored,
    embedText: EMBEDDING_QUERY_PREFIX + redacted,
  };
}
