import { type CallDirection, DomainError, type DurationBucket } from '@askcalls/domain';
import { z } from 'zod';
import { STAR_TAG_ID } from './constants';
import { type FormOptions, wordForms } from './forms';
import { expandTerm } from './fuzzy';
import { tokenize } from './normalize';
import { type CountryCode, DEFAULT_PHONE_REGION, parsePhone } from './phone';
import { compileSafeRegex, checkRegex, MAX_REGEX_LENGTH } from './safe-regex';

/**
 * Rules (spec 7.11) are data: the JSON below is what `UserData:rules` holds once decrypted. They
 * run at ingest, and again on the device when the user applies a rule to existing calls.
 */
const KeywordCondition = z.object({
  type: z.literal('keyword'),
  /** `any`: one term is enough; `all`: every term must appear. */
  match: z.enum(['any', 'all']).default('any'),
  /** Each term is one or more words; a multi-word term needs all its words. */
  terms: z.array(z.string().min(1).max(100)).min(1).max(50),
  /** Also accept vocabulary-style edit-distance variants (spec 7 fuzzy rules) of each word. */
  fuzzy: z.boolean().default(false),
});

const IntentCondition = z.object({
  type: z.literal('intent'),
  intentId: z.string().min(1).max(64),
});

const ContactCondition = z.object({
  type: z.literal('contact'),
  op: z.enum(['in', 'not_in']),
  /** Phone numbers in any format. Omitted: the user's contact list. */
  phones: z.array(z.string().min(1).max(40)).max(1000).optional(),
});

const DurationCondition = z.object({
  type: z.literal('duration'),
  /** Duration buckets (0: <1m, 1: 1–5m, 2: 5–15m, 3: 15–60m, 4: 60m+); any of them matches. */
  buckets: z
    .array(z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]))
    .min(1)
    .max(5),
});

const DirectionCondition = z.object({
  type: z.literal('direction'),
  direction: z.enum(['in', 'out', 'unknown']),
});

const RegexCondition = z
  .object({
    type: z.literal('regex'),
    pattern: z.string().min(1).max(MAX_REGEX_LENGTH),
    caseSensitive: z.boolean().default(false),
  })
  .superRefine((c, ctx) => {
    const check = checkRegex(c.pattern, c.caseSensitive ? 'u' : 'iu');
    if (!check.ok) ctx.addIssue({ code: 'custom', path: ['pattern'], message: `unsafe_regex:${check.reason}` });
  });

export const RuleConditionSchema = z.discriminatedUnion('type', [
  KeywordCondition,
  IntentCondition,
  ContactCondition,
  DurationCondition,
  DirectionCondition,
  RegexCondition,
]);

export const RuleActionSchema = z.discriminatedUnion('type', [
  /** A tag id from the encrypted tag catalog, never a tag name. */
  z.object({ type: z.literal('add_tag'), tagId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('star') }),
]);

export const RuleSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(100).optional(),
  enabled: z.boolean().default(true),
  /** How conditions combine. */
  match: z.enum(['all', 'any']).default('all'),
  conditions: z.array(RuleConditionSchema).min(1).max(20),
  actions: z.array(RuleActionSchema).min(1).max(20),
});

export const RuleSetSchema = z.array(RuleSchema).max(200);

export type RuleCondition = z.infer<typeof RuleConditionSchema>;
export type RuleAction = z.infer<typeof RuleActionSchema>;
export type Rule = z.infer<typeof RuleSchema>;
/** What a rule editor may write: defaults are optional. */
export type RuleInput = z.input<typeof RuleSchema>;

/** Validates stored rules. Throws a content-free `DomainError('invalid')`. */
export function parseRules(input: unknown): Rule[] {
  const result = RuleSetSchema.safeParse(input);
  if (!result.success) {
    throw new DomainError('invalid', 'Rules failed validation', { issues: result.error.issues.length });
  }
  return result.data;
}

/** Everything a rule can look at, from one indexed call. */
export interface RuleFacts {
  /** Keyword forms of the call with counts (all forms, before the 5,000 cap). */
  keywordCounts: ReadonlyMap<string, number>;
  intentIds: readonly string[];
  /** The call's phone, E.164, or null. */
  phoneE164: string | null;
  /** E.164 numbers of the user's contacts. */
  contactPhones: ReadonlySet<string>;
  durationBucket: DurationBucket | null;
  direction: CallDirection;
  /** Segment texts, for regex conditions. */
  texts: readonly string[];
}

export interface RuleEvalOptions extends FormOptions {
  region?: CountryCode;
}

export interface RuleOutcome {
  /** Distinct tag ids to add, sorted; includes `__star` when a rule stars the call. */
  tagIds: string[];
  /** Ids of the rules that matched, in rule order. */
  matchedRuleIds: string[];
}

function termMatches(
  term: string,
  facts: RuleFacts,
  fuzzy: boolean,
  opts: RuleEvalOptions,
): boolean | null {
  const words = tokenize(term);
  let meaningful = 0;
  for (const word of words) {
    const forms = wordForms(word, opts);
    if (forms.length === 0) continue; // stopword: ignored, like in search
    meaningful++;
    const hit =
      forms.some((f) => facts.keywordCounts.has(f.form)) ||
      (fuzzy && forms.some((f) => expandTerm(f.form, facts.keywordCounts, { fuzzy: true }).length > 0));
    if (!hit) return false;
  }
  return meaningful > 0 ? true : null;
}

function conditionMatches(c: RuleCondition, facts: RuleFacts, opts: RuleEvalOptions): boolean {
  switch (c.type) {
    case 'keyword': {
      const results = c.terms.map((t) => termMatches(t, facts, c.fuzzy, opts)).filter((r) => r !== null);
      if (results.length === 0) return false;
      return c.match === 'all' ? results.every(Boolean) : results.some(Boolean);
    }
    case 'intent':
      return facts.intentIds.includes(c.intentId);
    case 'contact': {
      const region = opts.region ?? DEFAULT_PHONE_REGION;
      const list = c.phones
        ? new Set(c.phones.map((p) => parsePhone(p, region)).filter((p): p is string => p !== null))
        : facts.contactPhones;
      const inList = facts.phoneE164 !== null && list.has(facts.phoneE164);
      return c.op === 'in' ? inList : !inList;
    }
    case 'duration':
      return facts.durationBucket !== null && (c.buckets as number[]).includes(facts.durationBucket);
    case 'direction':
      return facts.direction === c.direction;
    case 'regex': {
      const re = compileSafeRegex(c.pattern, { caseSensitive: c.caseSensitive });
      return re ? re.test(facts.texts) : false;
    }
  }
}

/** Runs enabled rules against one call and collects their actions. */
export function evaluateRules(
  rules: readonly Rule[],
  facts: RuleFacts,
  opts: RuleEvalOptions = {},
): RuleOutcome {
  const tags = new Set<string>();
  const matchedRuleIds: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const test = (c: RuleCondition) => conditionMatches(c, facts, opts);
    const matched = rule.match === 'all' ? rule.conditions.every(test) : rule.conditions.some(test);
    if (!matched) continue;
    matchedRuleIds.push(rule.id);
    for (const a of rule.actions) tags.add(a.type === 'star' ? STAR_TAG_ID : a.tagId);
  }
  return { tagIds: [...tags].sort(), matchedRuleIds };
}
