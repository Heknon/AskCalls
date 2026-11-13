# @askcalls/indexing

On-device indexing (spec section 7): normalization, Hebrew + English tokenizer, keyword forms,
redaction, chunking, zero-shot intents, rules, vocabulary and fuzzy query expansion. It produces
plaintext forms only; hashing (HMAC tokens) and encryption happen in `client-core` with
`@askcalls/crypto`. Isomorphic: runs unchanged in the browser and Node 20+.

## Indexing a call

```ts
import { buildIntentPrototypes, BUILT_IN_INTENTS, indexCall, parseRules } from '@askcalls/indexing';

const intents = await buildIntentPrototypes([...BUILT_IN_INTENTS, ...userIntents], embedder.embed); // once per session
const out = await indexCall({
  transcript,                       // { segments, text }
  meta: { phone, contactName, direction, durationSec },
  contacts,                         // [{ name, phones }]  from UserData:contacts
  synonyms,                         // [{ canonical, variants }]  from UserData:synonyms
  intents, intentThreshold: 0.82,
  rules: parseRules(storedRules),   // from UserData:rules
  embed: (texts) => embedder.embed(texts),
  region: 'IL',
});
```

| Field | Use |
| --- | --- |
| `keywords` | ≤ 5,000 normal forms → token kind `w` → `keywordToks` |
| `contactE164` | → kind `c` → `contactTok` (null when no parsable phone) |
| `tagIds` | rule actions (`__star` for star) → kind `t` → `tagToks` |
| `intentIds`, `intents` | intents at or above threshold, with score and best chunk |
| `chunks[]` | `{ ord, text, embedText, snippet, embedding, startSec, endSec }`: `embedding` → `CallChunk.embedding`, `snippet` → encrypt into `snippetCt` |
| `contentText` | SHA-256 it → kind `x` → `contentTok` |
| `vocabularyDelta` | append as an encrypted `VocabDelta` |
| `durationSec`, `durationBucket` | from meta, else the last segment end |
| `keywordCounts`, `matchedRuleIds`, `redactionCounts`, `wordCount`, `keywordsCapped` | diagnostics and re-runs |

`analyzeCall(input)` is the synchronous part (no embedder, intents or rules). Re-applying rules to
existing calls: `evaluateRules(rules, facts)` with `RuleFacts` built from `analyzeCall`.

## Searching

```ts
const q = prepareQuery('לדני מחיר* iphnoe', { vocabulary, synonyms, includePrefixes, redaction: { names } });
q.keywordGroups;  // string[][]: hash every form with kind `w` → SearchQuery.keywordGroups
q.alsoMatched;    // variants for the "also matched" line
q.ignored;        // stopwords dropped
q.embedText;      // "query: " + redacted query → Embedder → SearchQuery.vector
```

## Normalization rules (the same on both sides)

Per character (`normalizeText`): NFKC; lower-case; strip Hebrew niqqud and cantillation
(U+0591–U+05C7 except maqaf, paseq, sof pasuq, nun hafukha), Arabic harakat and tatweel, Latin
diacritics (`café` → `cafe`); map final letters ך→כ ם→מ ן→נ ף→פ ץ→צ; Arabic أ إ آ ٱ→ا, ى→ي, ة→ه;
Russian ё→е; fold every Unicode decimal digit to ASCII; apostrophe variants (’ ‘ ʼ ׳ ` ´) → `'`; `"`,
“ ” or ״ between Hebrew letters → ״ (gershayim).

Per token (`tokenize`): a token is a run of letters, marks and digits, joined by an inner `'`, an
inner ״, or `.`/`,` between digits (removed: `1,200` → `1200`). Everything else (spaces,
punctuation, hyphen, maqaf, `:`) separates tokens. `normalizeWord` joins a word's tokens
(`e-mail` → `email`).

Forms of a token (`wordForms`), in rank order:

1. the token, and synonym canonicals of it;
2. the token without `'` / ״ (`צה״ל` → `צהל`, `don't` → `dont`);
3. Hebrew prefix forms, for Hebrew words of 4+ letters: leading prefix letters (ו ה ב ל מ ש כ)
   removed in any order Hebrew allows, `ו? (ש|כש|לכש|מש)? [בכלמ]? ה?`, up to 4 letters, keeping at
   least 2 letters (`וכשהגענו` → `כשהגענו`, `שהגענו`, `הגענו`, `גענו`), plus their synonyms.

Forms that are stopwords (bundled Hebrew and English lists, `DEFAULT_STOPWORDS`) or shorter than
two letters (numbers excepted) are dropped; a token that is itself a stopword yields nothing.
Queries use the same function, so a stopword in a query is ignored, never missed. Over-matching is
accepted (`מספר` also indexes `ספר`); missed matches are not.

Keyword cap: when a call has more than 5,000 distinct forms, keep by rank, then frequency, then code
point order (deterministic).

## Other pieces

- **Phones**: `parsePhone(input, region = 'IL')` → E.164 or null (libphonenumber-js, Unicode digits,
  `00` prefix). `findPhones(text, region)`.
- **Redaction** (`createRedactor({ names, region }).redact(text)`): `[EMAIL]`, `[IBAN]` (mod-97),
  `[CARD]` (13–19 digits, Luhn), `[ID]` (Israeli ID, 9 digits with checksum, optional dash before
  the check digit), `[PHONE]`, `[NAME]` (each word of each contact name and the call's contact name,
  also behind Hebrew prefixes: `לדני` → `ל[NAME]`, and English `'s`). Earlier kinds win overlaps.
  In regions that write a trunk 0 (Israel, most of Europe), a phone without `+`/`00` must start with
  0 or the calling code (or be an Israeli 1-800-style service number), which rejects dates and
  order numbers that the bundled metadata would otherwise accept.
- **Chunking** (`chunkSegments`): ~120 words, 20-word overlap; ends snap to a segment boundary
  within 30 words of the target, longer segments are split inside; a short tail merges into the
  last chunk. Embed text is `passage: ` + redacted chunk; `makeSnippet` cuts to 300 characters.
- **Intents**: `BUILT_IN_INTENTS` (7 intents, 6 Hebrew + 6 English examples each),
  `buildIntentPrototypes(intents, embed)` (normalized mean of example embeddings),
  `classifyIntents(chunkVectors, prototypes, { threshold })`; per-intent `threshold` overrides.
- **Rules**: zod schemas `RuleSchema`, `RuleSetSchema`; `parseRules(json)`; conditions `keyword`
  (any/all, multi-word terms, optional fuzzy), `intent`, `contact` (in/not in the contact list or a
  phone list), `duration` (buckets), `direction`, `regex`; actions `add_tag` (tag id) and `star`.
  Regexes are restricted to a safe subset (`checkRegex`: ≤ 200 chars, no backreferences or
  lookarounds, no quantified group containing a quantifier or alternation, ≤ 3 unbounded
  quantifiers, repeats ≤ 100) and run on 500-character windows with a 50 ms budget per call.
- **Vocabulary**: `Map<form, count>`; `mergeVocabulary`, `negateVocabulary`, `newForms`,
  `compactDeltas`, `needsCompaction` (> 50 deltas), `serializeVocabulary` / `deserializeVocabulary`
  (sorted UTF-8 JSON, deterministic bytes).
- **Fuzzy**: `expandTerm(term, vocabulary, opts)`: prefix matches (trailing `*` at any length, or
  the include-prefixes setting at 3+ letters) and Damerau-Levenshtein (≤ 1 for 4–6 letters, ≤ 2 for
  7+), ranked by distance (exact 0, prefix 1) then frequency, ≤ 32 per term.

Changing any normalization rule changes tokens: existing calls must be re-indexed and the
vocabulary rebuilt.
