import type { Contact } from '@askcalls/client-core/userdata';
import type { CallDirection, DurationBucket } from '@askcalls/domain';
import {
  type CountryCode,
  checkRegex,
  parsePhone,
  type Rule,
  type RuleInput,
  RuleSchema,
} from '@askcalls/indexing';

export const DURATION_MINUTES = [1, 5, 15, 60] as const;
export type DurationMinutes = (typeof DURATION_MINUTES)[number];

/** `all`: any number in the contact list; otherwise one contact's id. */
export type ContactChoice = 'all' | string;

export type ConditionDraft = { key: string } & (
  | { type: 'keyword'; match: 'any' | 'all'; terms: string[]; fuzzy: boolean }
  | { type: 'intent'; intentId: string | null }
  | { type: 'contact'; op: 'in' | 'not_in'; contact: ContactChoice | null }
  | { type: 'duration'; op: 'atLeast' | 'atMost'; minutes: DurationMinutes }
  | { type: 'direction'; direction: CallDirection }
  | { type: 'regex'; pattern: string; caseSensitive: boolean }
);
export type ConditionType = ConditionDraft['type'];

export type ActionDraft = { key: string } & (
  | { type: 'add_tag'; tagId: string | null }
  | { type: 'star' }
);

export interface RuleDraft {
  id: string;
  name: string;
  enabled: boolean;
  match: 'all' | 'any';
  conditions: ConditionDraft[];
  actions: ActionDraft[];
}

let seq = 0;
export const draftKey = () => `k${++seq}`;

export function newCondition(type: ConditionType): ConditionDraft {
  const key = draftKey();
  switch (type) {
    case 'keyword':
      return { key, type, match: 'any', terms: [], fuzzy: true };
    case 'intent':
      return { key, type, intentId: null };
    case 'contact':
      return { key, type, op: 'in', contact: 'all' };
    case 'duration':
      return { key, type, op: 'atLeast', minutes: 5 };
    case 'direction':
      return { key, type, direction: 'in' };
    case 'regex':
      return { key, type, pattern: '', caseSensitive: false };
  }
}

export function newAction(type: ActionDraft['type']): ActionDraft {
  return type === 'star' ? { key: draftKey(), type } : { key: draftKey(), type, tagId: null };
}

export function newDraft(id: string, name: string): RuleDraft {
  return {
    id,
    name,
    enabled: true,
    match: 'all',
    conditions: [newCondition('keyword')],
    actions: [newAction('add_tag')],
  };
}

/**
 * Duration buckets (0: <1m, 1: 1–5m, 2: 5–15m, 3: 15–60m, 4: 60m+) for "at least" and "at
 * most" a number of minutes on the bucket edges.
 */
export function bucketsFor(op: 'atLeast' | 'atMost', minutes: DurationMinutes): DurationBucket[] {
  const edge = DURATION_MINUTES.indexOf(minutes) + 1;
  const all: DurationBucket[] = [0, 1, 2, 3, 4];
  return op === 'atLeast' ? all.filter((b) => b >= edge) : all.filter((b) => b < edge);
}

function durationOf(buckets: readonly number[]): {
  op: 'atLeast' | 'atMost';
  minutes: DurationMinutes;
} {
  const sorted = [...buckets].sort();
  for (const op of ['atLeast', 'atMost'] as const) {
    for (const minutes of DURATION_MINUTES) {
      if (bucketsFor(op, minutes).join() === sorted.join()) return { op, minutes };
    }
  }
  return { op: 'atLeast', minutes: DURATION_MINUTES[Math.max(0, (sorted[0] ?? 1) - 1)]! };
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** The editor's state for a stored rule. */
export function fromRule(rule: Rule, contacts: readonly Contact[], region: CountryCode): RuleDraft {
  const e164 = (phones: readonly string[]) =>
    phones.map((p) => parsePhone(p, region)).filter((p): p is string => p !== null);
  return {
    id: rule.id,
    name: rule.name ?? '',
    enabled: rule.enabled,
    match: rule.match,
    conditions: rule.conditions.map((c): ConditionDraft => {
      const key = draftKey();
      switch (c.type) {
        case 'keyword':
          return { key, type: 'keyword', match: c.match, terms: [...c.terms], fuzzy: c.fuzzy };
        case 'intent':
          return { key, type: 'intent', intentId: c.intentId };
        case 'contact': {
          if (!c.phones) return { key, type: 'contact', op: c.op, contact: 'all' };
          const wanted = e164(c.phones);
          const match = contacts.find((k) => sameSet(e164(k.phones), wanted));
          return { key, type: 'contact', op: c.op, contact: match?.id ?? null };
        }
        case 'duration':
          return { key, type: 'duration', ...durationOf(c.buckets) };
        case 'direction':
          return { key, type: 'direction', direction: c.direction };
        default:
          return { key, type: 'regex', pattern: c.pattern, caseSensitive: c.caseSensitive };
      }
    }),
    actions: rule.actions.map(
      (a): ActionDraft =>
        a.type === 'star'
          ? { key: draftKey(), type: 'star' }
          : { key: draftKey(), type: 'add_tag', tagId: a.tagId },
    ),
  };
}

export type RowProblem = 'pickValue' | 'regexInvalid';

export function regexValid(pattern: string, caseSensitive: boolean): boolean {
  return checkRegex(pattern, caseSensitive ? 'u' : 'iu').ok;
}

/** Problems by row key; a rule saves only without any. */
export function validate(
  draft: RuleDraft,
  known: { tagIds: ReadonlySet<string>; contactIds: ReadonlySet<string> },
): Map<string, RowProblem> {
  const out = new Map<string, RowProblem>();
  for (const c of draft.conditions) {
    if (c.type === 'keyword' && c.terms.length === 0) out.set(c.key, 'pickValue');
    if (c.type === 'intent' && !c.intentId) out.set(c.key, 'pickValue');
    if (
      c.type === 'contact' &&
      (!c.contact || (c.contact !== 'all' && !known.contactIds.has(c.contact)))
    ) {
      out.set(c.key, 'pickValue');
    }
    if (c.type === 'regex') {
      if (!c.pattern.trim()) out.set(c.key, 'pickValue');
      else if (!regexValid(c.pattern, c.caseSensitive)) out.set(c.key, 'regexInvalid');
    }
  }
  for (const a of draft.actions) {
    if (a.type === 'add_tag' && (!a.tagId || !known.tagIds.has(a.tagId)))
      out.set(a.key, 'pickValue');
  }
  return out;
}

/** The stored rule for a valid draft. */
export function toRule(draft: RuleDraft, contacts: readonly Contact[]): Rule {
  const input: RuleInput = {
    id: draft.id,
    ...(draft.name.trim() && { name: draft.name.trim() }),
    enabled: draft.enabled,
    match: draft.match,
    conditions: draft.conditions.map((c) => {
      switch (c.type) {
        case 'keyword':
          return { type: 'keyword', match: c.match, terms: c.terms, fuzzy: c.fuzzy };
        case 'intent':
          return { type: 'intent', intentId: c.intentId! };
        case 'contact':
          return c.contact === 'all'
            ? { type: 'contact', op: c.op }
            : {
                type: 'contact',
                op: c.op,
                phones: contacts.find((k) => k.id === c.contact)?.phones ?? [],
              };
        case 'duration':
          return { type: 'duration', buckets: bucketsFor(c.op, c.minutes) };
        case 'direction':
          return { type: 'direction', direction: c.direction };
        default:
          return { type: 'regex', pattern: c.pattern, caseSensitive: c.caseSensitive };
      }
    }),
    actions: draft.actions.map((a) =>
      a.type === 'star' ? { type: 'star' } : { type: 'add_tag', tagId: a.tagId! },
    ),
  };
  return RuleSchema.parse(input);
}

/** Words for the one-line summary in the rule list. */
export interface SummaryWords {
  intent(id: string): string;
  contact(c: { op: 'in' | 'not_in'; name: string | null }): string;
  duration(op: 'atLeast' | 'atMost', minutes: number): string;
  direction(d: CallDirection): string;
  regex: string;
  tag(name: string): string;
  star: string;
  tagName(id: string): string | null;
  contactName(id: string): string | null;
}

/** "invoice, bill + Purchase interest → tag Billing, star". */
export function summarize(draft: RuleDraft, w: SummaryWords): string {
  const conditions = draft.conditions.map((c) => {
    switch (c.type) {
      case 'keyword':
        return c.terms.join(', ');
      case 'intent':
        return c.intentId ? w.intent(c.intentId) : '';
      case 'contact':
        return w.contact({
          op: c.op,
          name: c.contact && c.contact !== 'all' ? w.contactName(c.contact) : null,
        });
      case 'duration':
        return w.duration(c.op, c.minutes);
      case 'direction':
        return w.direction(c.direction);
      default:
        return w.regex;
    }
  });
  const actions = draft.actions.map((a) =>
    a.type === 'star' ? w.star : w.tag((a.tagId && w.tagName(a.tagId)) || ''),
  );
  return `${conditions.filter(Boolean).join(' + ')} → ${actions.join(', ')}`;
}
