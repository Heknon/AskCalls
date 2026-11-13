'use client';

import type { Contact, Settings, Tag } from '@askcalls/client-core/userdata';
import { randomId } from '@askcalls/client-core/userdata';
import type { CallDirection } from '@askcalls/domain';
import {
  BUILT_IN_INTENTS,
  compileSafeRegex,
  DEFAULT_PHONE_REGION,
  isPhoneRegion,
  parseRules,
  type Rule,
} from '@askcalls/indexing';
import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { EmptyState } from '@askcalls/ui/components/EmptyState';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { JobProgress } from '@askcalls/ui/components/JobProgress';
import { RuleAction } from '@askcalls/ui/components/RuleAction';
import { RuleBuilder } from '@askcalls/ui/components/RuleBuilder';
import {
  RuleCondition,
  type RuleSelect,
  RuleSelectField,
} from '@askcalls/ui/components/RuleCondition';
import { RuleListItem } from '@askcalls/ui/components/RuleListItem';
import { TermInput } from '@askcalls/ui/components/TermInput';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import { Input } from '@askcalls/ui/primitives/input';
import { Label } from '@askcalls/ui/primitives/label';
import { Switch } from '@askcalls/ui/primitives/switch';
import { Plus, Search, WandSparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNotify } from '../../../../../../client/notices/notices';
import { useLockWipe, useUnlocked } from '../../../../../../client/session/session';
import { AsyncView, useAsync } from '../../../_shell/states';
import {
  type ActionDraft,
  type ConditionDraft,
  type ConditionType,
  DURATION_MINUTES,
  type DurationMinutes,
  fromRule,
  newAction,
  newCondition,
  newDraft,
  type RuleDraft,
  summarize,
  toRule,
  validate,
} from './rule-draft';
import { applyRule, countMatches, FactsCache } from './rule-run';
import { SaveIndicator, useSaver } from './shared';

/** Above this many calls the preview waits for a click: counting decrypts every call. */
const AUTO_PREVIEW_MAX = 500;

interface Catalogs {
  rules: Rule[];
  tags: Tag[];
  contacts: Contact[];
  settings: Settings;
}

/** T3: rules that tag or star calls, run at import and on demand over existing calls. */
export function RulesTab() {
  const { ctx } = useUnlocked();
  const data = useAsync(async (): Promise<Catalogs> => {
    const [rules, tags, contacts, settings] = await Promise.all([
      ctx.userData.get('rules', { fresh: true }),
      ctx.userData.get('tags', { fresh: true }),
      ctx.userData.get('contacts'),
      ctx.userData.get('settings'),
    ]);
    return {
      rules: parseRules(rules.rules),
      tags: tags.tags,
      contacts: contacts.contacts,
      settings,
    };
  }, [ctx]);
  return <AsyncView state={data}>{(d) => <Rules initial={d} />}</AsyncView>;
}

function Rules({ initial }: { initial: Catalogs }) {
  const t = useTranslations('tags.rules');
  const tc = useTranslations('common');
  const ti = useTranslations('tags.intents.names');
  const { ctx, me } = useUnlocked();
  const notify = useNotify();
  const saver = useSaver();
  const { tags, contacts, settings } = initial;
  const region = isPhoneRegion(settings.phoneRegion) ? settings.phoneRegion : DEFAULT_PHONE_REGION;
  const [rules, setRules] = useState(initial.rules);
  const [draft, setDraft] = useState<RuleDraft | null>(() =>
    initial.rules[0] ? fromRule(initial.rules[0], contacts, region) : null,
  );
  const [touched, setTouched] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [job, setJob] = useState<{ done: number; abort: AbortController } | null>(null);
  const cache = useRef(new FactsCache());
  useLockWipe(() => cache.current.clear());
  useEffect(() => {
    const c = cache.current;
    return () => c.clear();
  }, []);

  const intents = useMemo(
    () => [
      ...BUILT_IN_INTENTS.map((b) => ({ value: b.id, label: ti(b.id) })),
      ...settings.customIntents
        .filter((c) => !BUILT_IN_INTENTS.some((b) => b.id === c.id))
        .map((c) => ({ value: c.id, label: c.label ?? c.id })),
    ],
    [settings, ti],
  );
  const known = useMemo(
    () => ({
      tagIds: new Set(tags.map((x) => x.id)),
      contactIds: new Set(contacts.map((x) => x.id)),
    }),
    [tags, contacts],
  );
  const words = {
    intent: (id: string) => intents.find((i) => i.value === id)?.label ?? id,
    contact: ({ op, name }: { op: 'in' | 'not_in'; name: string | null }) =>
      name
        ? t(op === 'in' ? 'sum.contactIs' : 'sum.contactIsNot', { name })
        : t(op === 'in' ? 'sum.saved' : 'sum.notSaved'),
    duration: (op: 'atLeast' | 'atMost', minutes: number) => t(`sum.${op}`, { n: minutes }),
    direction: (d: CallDirection) => t(`direction.${d}`),
    regex: t('sum.regex'),
    tag: (name: string) => t('sum.tag', { name }),
    star: t('sum.star'),
    tagName: (id: string) => tags.find((x) => x.id === id)?.name ?? null,
    contactName: (id: string) => contacts.find((x) => x.id === id)?.name ?? null,
  };

  const problems = draft ? validate(draft, known) : new Map();
  const valid = draft !== null && problems.size === 0;
  const stored = draft ? rules.find((r) => r.id === draft.id) : undefined;

  const select = (rule: Rule) => {
    if (job) return;
    setDraft(fromRule(rule, contacts, region));
    setTouched(false);
  };
  const create = () => {
    if (job) return;
    setDraft(newDraft(`rule_${randomId()}`, ''));
    setTouched(false);
  };
  const change = (patch: Partial<RuleDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setCondition = (key: string, next: ConditionDraft) =>
    setDraft((d) =>
      d ? { ...d, conditions: d.conditions.map((c) => (c.key === key ? next : c)) } : d,
    );
  const setAction = (key: string, next: ActionDraft) =>
    setDraft((d) => (d ? { ...d, actions: d.actions.map((a) => (a.key === key ? next : a)) } : d));

  const save = async (): Promise<Rule | null> => {
    setTouched(true);
    if (!draft || !valid) return null;
    const rule = toRule({ ...draft, name: draft.name.trim() || t('untitled') }, contacts);
    const doc = await saver.run(() =>
      ctx.userData.update('rules', (d) => ({
        ...d,
        rules: d.rules.some((r) => r.id === rule.id)
          ? d.rules.map((r) => (r.id === rule.id ? rule : r))
          : [...d.rules, rule],
      })),
    );
    if (!doc) return null;
    setRules(parseRules(doc.rules));
    change({ name: rule.name ?? '' });
    return rule;
  };

  const remove = async () => {
    if (!draft) return;
    const id = draft.id;
    const doc = await saver.run(() =>
      ctx.userData.update('rules', (d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) })),
    );
    if (!doc) return;
    const next = parseRules(doc.rules);
    setRules(next);
    setDraft(next[0] ? fromRule(next[0], contacts, region) : null);
  };

  const apply = async () => {
    const rule = await save();
    if (!rule) return;
    const abort = new AbortController();
    setJob({ done: 0, abort });
    const result = await applyRule(ctx, rule, {
      cache: cache.current,
      signal: abort.signal,
      onProgress: (done) => setJob((j) => (j ? { ...j, done } : j)),
    }).catch(() => null);
    setJob(null);
    if (!result) {
      notify({ kind: 'error', title: t('applyFailed') });
    } else if (result.finished) {
      notify({ kind: 'event', title: t('applied', { n: result.matched }), icon: WandSparkles });
    }
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Card className="flex flex-col gap-1 p-2">
        <div className="flex items-center justify-between gap-2 ps-2">
          <h2 className="font-semibold">{t('title')}</h2>
          <Button variant="ghost" size="sm" onClick={create} disabled={!!job}>
            <Plus className="size-4" aria-hidden />
            {t('new')}
          </Button>
        </div>
        {rules.length === 0 && !draft ? (
          <EmptyState
            reason="first-use"
            icon={WandSparkles}
            title={t('empty')}
            action={
              <Button variant="primary" onClick={create}>
                {t('new')}
              </Button>
            }
          />
        ) : (
          <ul className="m-0 flex flex-col gap-0.5 p-0">
            {rules.map((r) => {
              const asDraft = fromRule(r, contacts, region);
              return (
                <RuleListItem
                  key={r.id}
                  name={r.name || t('untitled')}
                  summary={summarize(asDraft, words)}
                  enabled={r.enabled}
                  offLabel={t('off')}
                  selected={draft?.id === r.id}
                  onSelect={() => select(r)}
                />
              );
            })}
            {draft && !stored ? (
              <RuleListItem
                name={draft.name || t('untitled')}
                summary={summarize(draft, words)}
                enabled={draft.enabled}
                offLabel={t('off')}
                selected
                onSelect={() => {}}
              />
            ) : null}
          </ul>
        )}
      </Card>
      {draft ? (
        <RuleBuilder
          name={draft.name}
          onNameChange={(name) => change({ name })}
          enabled={draft.enabled}
          onEnabledChange={(enabled) => change({ enabled })}
          match={{
            value: draft.match,
            options: [
              { value: 'all', label: t('all') },
              { value: 'any', label: t('any') },
            ],
            onChange: (v) => change({ match: v as 'all' | 'any' }),
            label: t('matchLabel'),
          }}
          conditions={draft.conditions.map((c) => (
            <ConditionRow
              key={c.key}
              condition={c}
              onChange={(next) => setCondition(c.key, next)}
              onRemove={() =>
                change({
                  conditions:
                    draft.conditions.length > 1
                      ? draft.conditions.filter((x) => x.key !== c.key)
                      : [newCondition('keyword')],
                })
              }
              problem={
                touched
                  ? problems.get(c.key)
                  : problems.get(c.key) === 'regexInvalid'
                    ? 'regexInvalid'
                    : undefined
              }
              intents={intents}
              contacts={contacts}
            />
          ))}
          onAddCondition={() =>
            change({ conditions: [...draft.conditions, newCondition('keyword')] })
          }
          actions={draft.actions.map((a) => (
            <ActionRow
              key={a.key}
              action={a}
              tags={tags}
              onChange={(next) => setAction(a.key, next)}
              onRemove={() =>
                change({
                  actions:
                    draft.actions.length > 1
                      ? draft.actions.filter((x) => x.key !== a.key)
                      : [newAction('add_tag')],
                })
              }
              problem={touched ? problems.get(a.key) : undefined}
            />
          ))}
          onAddAction={() => change({ actions: [...draft.actions, newAction('add_tag')] })}
          preview={
            valid && !job ? (
              <Preview
                draft={draft}
                contacts={contacts}
                cache={cache.current}
                auto={me.usage.calls <= AUTO_PREVIEW_MAX}
              />
            ) : undefined
          }
          job={
            job ? (
              <JobProgress
                done={job.done}
                total={Math.max(job.done, me.usage.calls)}
                label={t('applying', { done: job.done, total: Math.max(job.done, me.usage.calls) })}
                onStop={() => job.abort.abort()}
                labels={{ pause: '', resume: '', stop: t('stop'), progress: t('applyingLabel') }}
              />
            ) : undefined
          }
          saveStatus={<SaveIndicator saver={saver} />}
          onSave={() => void save()}
          onApply={() => !job && void apply()}
          onDelete={() =>
            stored
              ? setDeleting(true)
              : setDraft(rules[0] ? fromRule(rules[0], contacts, region) : null)
          }
          labels={{
            name: t('name'),
            on: t('on'),
            when: t('when'),
            ofThese: t('ofThese'),
            actions: t('then'),
            addCondition: t('addCondition'),
            addAction: t('addAction'),
            save: t('save'),
            apply: t('apply'),
            delete: t('delete'),
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('deleteTitle', { name: draft?.name || t('untitled') })}
        description={t('deleteBody')}
        confirmLabel={t('delete')}
        cancelLabel={tc('cancel')}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

function Preview({
  draft,
  contacts,
  cache,
  auto,
}: {
  draft: RuleDraft;
  contacts: Contact[];
  cache: FactsCache;
  auto: boolean;
}) {
  const t = useTranslations('tags.rules');
  const { ctx } = useUnlocked();
  const [n, setN] = useState<number | null>(null);
  const [requested, setRequested] = useState(auto);
  const key = JSON.stringify(toRule(draft, contacts));
  useEffect(() => {
    setN(null);
    if (!requested) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      countMatches(ctx, JSON.parse(key) as Rule, { cache, signal: abort.signal }).then(
        (count) => !abort.signal.aborted && setN(count),
        () => {},
      );
    }, 600);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [ctx, key, cache, requested]);
  if (!requested) {
    return (
      <Button variant="link" onClick={() => setRequested(true)}>
        {t('count')}
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2" aria-live="polite">
      <Search className="size-4" aria-hidden />
      {n === null ? t('counting') : t('preview', { n })}
    </span>
  );
}

function select(
  value: string,
  options: { value: string; label: string }[],
  onChange: (v: string) => void,
  label: string,
): RuleSelect {
  return { value, options, onChange, label };
}

function Problem({ problem }: { problem: 'pickValue' | 'regexInvalid' | undefined }) {
  const t = useTranslations('tags.rules');
  return problem ? <ErrorState scope="inline" title={t(problem)} /> : null;
}

function ConditionRow({
  condition: c,
  onChange,
  onRemove,
  problem,
  intents,
  contacts,
}: {
  condition: ConditionDraft;
  onChange: (c: ConditionDraft) => void;
  onRemove: () => void;
  problem: 'pickValue' | 'regexInvalid' | undefined;
  intents: { value: string; label: string }[];
  contacts: Contact[];
}) {
  const t = useTranslations('tags.rules');
  const id = useId();
  const fields: ConditionType[] = [
    'keyword',
    'intent',
    'contact',
    'duration',
    'direction',
    'regex',
  ];
  const field = select(
    c.type,
    fields.map((f) => ({ value: f, label: t(`field.${f}`) })),
    (v) => v !== c.type && onChange(newCondition(v as ConditionType)),
    t('condition'),
  );
  const op = (value: string, values: string[], set: (v: string) => void) =>
    select(
      value,
      values.map((v) => ({ value: v, label: t(`op.${v}` as 'op.is') })),
      set,
      t('comparison'),
    );
  let operator: RuleSelect;
  let value: ReactNode;
  switch (c.type) {
    case 'keyword':
      operator = op(
        c.match === 'any' ? 'containsAny' : 'containsAll',
        ['containsAny', 'containsAll'],
        (v) => onChange({ ...c, match: v === 'containsAll' ? 'all' : 'any' }),
      );
      value = (
        <TermInput
          terms={c.terms}
          onChange={(terms) => onChange({ ...c, terms })}
          label={t('keywords')}
          removeLabel={(term) => t('removeTerm', { term })}
          fuzzy={{
            checked: c.fuzzy,
            onChange: (fuzzy) => onChange({ ...c, fuzzy }),
            label: t('fuzzy'),
          }}
        />
      );
      break;
    case 'intent':
      operator = op('is', ['is'], () => {});
      value = (
        <RuleSelectField
          select={select(
            c.intentId ?? '',
            intents,
            (intentId) => onChange({ ...c, intentId }),
            t('value'),
          )}
        />
      );
      break;
    case 'contact':
      operator = op(c.op === 'in' ? 'isIn' : 'isNotIn', ['isIn', 'isNotIn'], (v) =>
        onChange({ ...c, op: v === 'isIn' ? 'in' : 'not_in' }),
      );
      value = (
        <RuleSelectField
          select={select(
            c.contact ?? '',
            [
              { value: 'all', label: t('contactAll') },
              ...contacts.map((k) => ({ value: k.id, label: k.name })),
            ],
            (contact) => onChange({ ...c, contact }),
            t('value'),
          )}
        />
      );
      break;
    case 'duration':
      operator = op(c.op, ['atLeast', 'atMost'], (v) =>
        onChange({ ...c, op: v as 'atLeast' | 'atMost' }),
      );
      value = (
        <RuleSelectField
          select={select(
            String(c.minutes),
            DURATION_MINUTES.map((m) => ({ value: String(m), label: t('minutes', { n: m }) })),
            (m) => onChange({ ...c, minutes: Number(m) as DurationMinutes }),
            t('value'),
          )}
        />
      );
      break;
    case 'direction':
      operator = op('is', ['is'], () => {});
      value = (
        <RuleSelectField
          select={select(
            c.direction,
            (['in', 'out', 'unknown'] as const).map((d) => ({
              value: d,
              label: t(`direction.${d}`),
            })),
            (d) => onChange({ ...c, direction: d as CallDirection }),
            t('value'),
          )}
        />
      );
      break;
    case 'regex':
      operator = op('matches', ['matches'], () => {});
      value = <RegexValue condition={c} onChange={onChange} id={id} />;
      break;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <RuleCondition
        field={field}
        operator={operator}
        onRemove={onRemove}
        removeLabel={t('removeCondition')}
      >
        {value}
      </RuleCondition>
      <Problem problem={problem} />
    </div>
  );
}

function RegexValue({
  condition: c,
  onChange,
  id,
}: {
  condition: Extract<ConditionDraft, { type: 'regex' }>;
  onChange: (c: ConditionDraft) => void;
  id: string;
}) {
  const t = useTranslations('tags.rules');
  const [sample, setSample] = useState('');
  const re = c.pattern ? compileSafeRegex(c.pattern, { caseSensitive: c.caseSensitive }) : null;
  return (
    <div className="flex flex-col gap-2">
      <Input
        dir="ltr"
        aria-label={t('pattern')}
        placeholder={t('pattern')}
        value={c.pattern}
        aria-invalid={(c.pattern !== '' && !re) || undefined}
        onChange={(e) => onChange({ ...c, pattern: e.target.value })}
        className="font-mono"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          dir="auto"
          aria-label={t('test')}
          placeholder={t('test')}
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          className="min-w-0 flex-1"
        />
        {sample && re ? (
          <span aria-live="polite">{re.test([sample]) ? t('testMatch') : t('testNoMatch')}</span>
        ) : null}
        <span className="flex items-center gap-2">
          <Switch
            id={`${id}-case`}
            size="sm"
            checked={c.caseSensitive}
            onCheckedChange={(caseSensitive) => onChange({ ...c, caseSensitive })}
          />
          <Label htmlFor={`${id}-case`} className="font-normal">
            {t('caseSensitive')}
          </Label>
        </span>
      </div>
    </div>
  );
}

function ActionRow({
  action: a,
  tags,
  onChange,
  onRemove,
  problem,
}: {
  action: ActionDraft;
  tags: Tag[];
  onChange: (a: ActionDraft) => void;
  onRemove: () => void;
  problem: 'pickValue' | 'regexInvalid' | undefined;
}) {
  const t = useTranslations('tags.rules');
  return (
    <div className="flex flex-col gap-1.5">
      <RuleAction
        action={select(
          a.type,
          [
            { value: 'add_tag', label: t('action.addTag') },
            { value: 'star', label: t('action.star') },
          ],
          (v) => v !== a.type && onChange(newAction(v as ActionDraft['type'])),
          t('actionLabel'),
        )}
        onRemove={onRemove}
        removeLabel={t('removeAction')}
      >
        {a.type === 'add_tag' ? (
          tags.length ? (
            <RuleSelectField
              select={select(
                a.tagId ?? '',
                tags.map((x) => ({ value: x.id, label: x.name })),
                (tagId) => onChange({ ...a, tagId }),
                t('tag'),
              )}
            />
          ) : (
            <span>{t('noTags')}</span>
          )
        ) : null}
      </RuleAction>
      <Problem problem={problem} />
    </div>
  );
}
