'use client';

import { FilterBlank } from '@askcalls/ui/components/FilterBlank';
import { FilterPicker, type FilterPickerLabels } from '@askcalls/ui/components/FilterPicker';
import { FilterSentence } from '@askcalls/ui/components/FilterSentence';
import { FoldedFilterSummary } from '@askcalls/ui/components/FoldedFilterSummary';
import { ResultLine } from '@askcalls/ui/components/ResultLine';
import { type ScoredSuggestion, SearchBox } from '@askcalls/ui/components/SearchBox';
import {
  SearchSuggestion,
  type SearchSuggestionData,
} from '@askcalls/ui/components/SearchSuggestion';
import { matchScore } from '@askcalls/ui/lib/match';
import type { TagColour } from '@askcalls/ui/lib/tag-colour';
import { useState } from 'react';
import { Specimen, State, useCopy, useEnv } from '../shell';

type Facet = 'calls' | 'contact' | 'tag' | 'intent' | 'date' | 'direction' | 'match';

const copy = {
  en: {
    placeholder: 'Search names, numbers, tags or words',
    search: 'Search calls',
    clear: 'Clear search',
    showing: 'Showing',
    clearFilters: 'Clear',
    before: {
      contact: 'with',
      tag: 'tagged',
      intent: 'about',
      date: 'from',
      match: 'matching',
    } as Partial<Record<Facet, string>>,
    empty: {
      calls: 'all calls',
      contact: 'anyone',
      tag: 'any tag',
      intent: 'any intent',
      date: 'any time',
      direction: 'in and out',
      match: 'exact words',
    } as Record<Facet, string>,
    titles: {
      calls: 'Which calls?',
      contact: 'Which contacts?',
      tag: 'Which tag?',
      intent: 'Which intent?',
      date: 'When?',
      direction: 'Which direction?',
      match: 'Match by',
    } as Record<Facet, string>,
    kinds: { contact: 'contacts', tag: 'tags', intent: 'intents' } as Record<string, string>,
    options: {
      calls: [
        ['all', 'All calls'],
        ['starred', 'Starred calls'],
      ],
      contact: [
        ['dana', 'דנה לוי'],
        ['yossi', 'Yossi Mizrahi'],
        ['maya', 'Maya Cohen'],
        ['daniel', 'דניאל אורן'],
        ['n0199', '+972 3-555-0199'],
      ],
      intent: [
        ['purchase', 'Purchase interest'],
        ['price', 'Price question'],
        ['complaint', 'Complaint'],
        ['schedule', 'Scheduling'],
      ],
      date: [
        ['today', 'Today'],
        ['7', 'Last 7 days'],
        ['30', 'Last 30 days'],
        ['year', 'This year'],
        ['custom', 'Custom range'],
      ],
      direction: [
        ['both', 'In and out'],
        ['in', 'Incoming only'],
        ['out', 'Outgoing only'],
      ],
      match: [
        ['words', 'Exact words'],
        ['meaning', 'Meaning'],
      ],
    } as Record<string, [string, string][]>,
    values: {
      date: { '30': 'the last 30 days', '7': 'the last 7 days', today: 'today', year: 'this year' },
      direction: { in: 'incoming only', out: 'outgoing only' },
      match: { meaning: 'meaning' },
      calls: { starred: 'starred calls' },
    } as Record<string, Record<string, string>>,
    tags: [
      ['hot', 'Hot lead', 'rose'],
      ['quote', 'Quote sent', 'blue'],
      ['follow', 'Follow-up', 'amber'],
      ['service', 'Service', 'cyan'],
      ['vip', 'VIP', 'violet'],
      ['closed', 'Closed', 'green'],
      ['legal', 'Legal', 'gray'],
      ['install', 'Installation', 'orange'],
      ['warranty', 'Warranty', 'blue'],
    ] as [string, string, TagColour][],
    picker: {
      clear: 'Clear',
      chosen: (n: number) => `${n} chosen`,
      pickMany: 'Pick as many as you like',
      show: (n: number) => `Show ${n} ${n === 1 ? 'call' : 'calls'}`,
      done: 'Done',
      tapOne: 'Tap one to show only that.',
      empty: 'No tags yet. Tags you add appear here.',
    },
    search_: (n: number, kinds: string) => `Search ${n} ${kinds}`,
    noMatch: (kind: string, q: string) => `No ${kind} matches “${q}”`,
    count: (n: number) => `${n} ${n === 1 ? 'call' : 'calls'}`,
    alsoMatched: 'also matched',
    exclude: (t: string) => `Exclude ${t}`,
    sort: 'Sort',
    sorts: [
      ['new', 'Newest first'],
      ['old', 'Oldest first'],
      ['long', 'Longest first'],
      ['best', 'Best match'],
    ],
    meaningLoading: 'Loading the meaning model (34 MB, once)',
    meta: {
      contact: 'Contact · show only this',
      callWith: (n: string) => `Call with ${n}`,
      words: (q: string) => `Words: ${q}`,
      wordsMeta: 'Search the transcripts',
      tagOnly: 'Tag · show only this',
      tagAdd: 'Tag · add to the filter',
      tagChosen: 'Tag · chosen, tap to remove',
      group: 'Tag · see all 9',
      intent: 'Intent · show only this',
      starred: 'Starred calls · show only these',
      date: 'Last 7 days · Date',
    },
    labels: {
      kind: {
        contact: 'Contact',
        tag: 'Tag',
        intent: 'Intent',
        starred: 'Starred calls',
        date: 'Date',
        group: 'Tag',
      },
    },
    folded: 'Show search and filters',
    foldedAll: 'All calls',
    foldedSummary: ['“מחיר”', ' · Purchase interest · the last 30 days'],
    blankA11y: (frag: string, facet: string) => `${frag}, change ${facet} filter`,
    sampleText: ['Today, 14:32 · 8 min', '3 Nov, 10:05 · 12 min'],
  },
  he: {
    placeholder: 'חיפוש שמות, מספרים, תגיות או מילים',
    search: 'חיפוש שיחות',
    clear: 'ניקוי החיפוש',
    showing: 'מציג',
    clearFilters: 'ניקוי',
    before: { contact: 'עם', tag: 'עם התגית', intent: 'בנושא', match: 'לפי' } as Partial<
      Record<Facet, string>
    >,
    empty: {
      calls: 'כל השיחות',
      contact: 'כל איש קשר',
      tag: 'כל תגית',
      intent: 'כל כוונה',
      date: 'בכל זמן',
      direction: 'נכנסות ויוצאות',
      match: 'מילים מדויקות',
    } as Record<Facet, string>,
    titles: {
      calls: 'אילו שיחות?',
      contact: 'אילו אנשי קשר?',
      tag: 'איזו תגית?',
      intent: 'איזו כוונה?',
      date: 'מתי?',
      direction: 'איזה כיוון?',
      match: 'התאמה לפי',
    } as Record<Facet, string>,
    kinds: { contact: 'אנשי קשר', tag: 'תגיות', intent: 'כוונות' } as Record<string, string>,
    options: {
      calls: [
        ['all', 'כל השיחות'],
        ['starred', 'שיחות מסומנות בכוכב'],
      ],
      contact: [
        ['dana', 'דנה לוי'],
        ['yossi', 'יוסי מזרחי'],
        ['maya', 'Maya Cohen'],
        ['daniel', 'דניאל אורן'],
        ['n0199', '+972 3-555-0199'],
      ],
      intent: [
        ['purchase', 'עניין ברכישה'],
        ['price', 'שאלת מחיר'],
        ['complaint', 'תלונה'],
        ['schedule', 'תיאום'],
      ],
      date: [
        ['today', 'היום'],
        ['7', '7 הימים האחרונים'],
        ['30', '30 הימים האחרונים'],
        ['year', 'השנה'],
        ['custom', 'טווח מותאם'],
      ],
      direction: [
        ['both', 'נכנסות ויוצאות'],
        ['in', 'נכנסות בלבד'],
        ['out', 'יוצאות בלבד'],
      ],
      match: [
        ['words', 'מילים מדויקות'],
        ['meaning', 'משמעות'],
      ],
    } as Record<string, [string, string][]>,
    values: {
      date: { '30': 'ב-30 הימים האחרונים', '7': 'ב-7 הימים האחרונים', today: 'היום', year: 'השנה' },
      direction: { in: 'נכנסות בלבד', out: 'יוצאות בלבד' },
      match: { meaning: 'משמעות' },
      calls: { starred: 'שיחות מסומנות בכוכב' },
    } as Record<string, Record<string, string>>,
    tags: [
      ['hot', 'ליד חם', 'rose'],
      ['quote', 'נשלחה הצעה', 'blue'],
      ['follow', 'מעקב', 'amber'],
      ['service', 'שירות', 'cyan'],
      ['vip', 'VIP', 'violet'],
      ['closed', 'נסגר', 'green'],
      ['legal', 'משפטי', 'gray'],
      ['install', 'התקנה', 'orange'],
      ['warranty', 'אחריות', 'blue'],
    ] as [string, string, TagColour][],
    picker: {
      clear: 'ניקוי',
      chosen: (n: number) => `${n} נבחרו`,
      pickMany: 'אפשר לבחור כמה שרוצים',
      show: (n: number) => (n === 1 ? 'הצגת שיחה אחת' : `הצגת ${n} שיחות`),
      done: 'סיום',
      tapOne: 'הקשה על אחת מציגה רק אותה.',
      empty: 'אין עדיין תגיות. תגיות שיתווספו יופיעו כאן.',
    },
    search_: (n: number, kinds: string) => `חיפוש ב-${n} ${kinds}`,
    noMatch: (kind: string, q: string) => `אין ${kind} שמתאימה ל„${q}”`,
    count: (n: number) => (n === 1 ? 'שיחה אחת' : `${n} שיחות`),
    alsoMatched: 'נמצאו גם',
    exclude: (t: string) => `החרגת ${t}`,
    sort: 'מיון',
    sorts: [
      ['new', 'מהחדשה לישנה'],
      ['old', 'מהישנה לחדשה'],
      ['long', 'מהארוכה לקצרה'],
      ['best', 'ההתאמה הטובה ביותר'],
    ],
    meaningLoading: 'טוען את מודל המשמעות (34 MB, פעם אחת)',
    meta: {
      contact: 'איש קשר · להציג רק את זה',
      callWith: (n: string) => `שיחה עם ${n}`,
      words: (q: string) => `מילים: ${q}`,
      wordsMeta: 'חיפוש בתמלולים',
      tagOnly: 'תגית · להציג רק את זה',
      tagAdd: 'תגית · להוסיף למסנן',
      tagChosen: 'תגית · נבחר, הקשה מסירה',
      group: 'תגית · כל ה-9',
      intent: 'כוונה · להציג רק את זה',
      starred: 'שיחות מסומנות בכוכב · להציג רק אותן',
      date: '7 הימים האחרונים · תאריך',
    },
    labels: {
      kind: {
        contact: 'איש קשר',
        tag: 'תגית',
        intent: 'כוונה',
        starred: 'שיחות מסומנות בכוכב',
        date: 'תאריך',
        group: 'תגית',
      },
    },
    folded: 'הצגת החיפוש והמסננים',
    foldedAll: 'כל השיחות',
    foldedSummary: ['„מחיר”', ' · עניין ברכישה · ב-30 הימים האחרונים'],
    blankA11y: (frag: string, facet: string) => `${frag}, שינוי המסנן ${facet}`,
    sampleText: ['היום, 14:32 · 8 דק׳', '3 בנוב׳, 10:05 · 12 דק׳'],
  },
};

type Copy = (typeof copy)['en'];

function Sentence({
  c,
  value,
  setValue,
  hasText,
}: {
  c: Copy;
  value: Record<Facet, string[]>;
  setValue: (f: Facet, v: string[]) => void;
  hasText: boolean;
}) {
  const [open, setOpen] = useState<Facet | null>(null);
  const label = (f: Facet, v: string) =>
    c.values[f]?.[v] ??
    (f === 'tag'
      ? c.tags.find((t) => t[0] === v)?.[1]
      : c.options[f]?.find((o) => o[0] === v)?.[1]) ??
    v;
  const text = (f: Facet) => {
    const vs = value[f].filter((v) => !['all', 'both', 'words'].includes(v));
    if (!vs.length) return undefined;
    return vs.length === 1 ? (
      <bdi>{label(f, vs[0]!)}</bdi>
    ) : (
      <>
        <bdi>{label(f, vs[0]!)}</bdi> + {vs.length - 1}
      </>
    );
  };
  const plain = (f: Facet) => {
    const vs = value[f].filter((v) => !['all', 'both', 'words'].includes(v));
    if (!vs.length) return undefined;
    return vs.length === 1 ? label(f, vs[0]!) : `${label(f, vs[0]!)} + ${vs.length - 1}`;
  };
  const pickerLabels = (f: Facet): FilterPickerLabels => ({
    ...c.picker,
    search: c.search_(f === 'tag' ? c.tags.length : (c.options[f]?.length ?? 0), c.kinds[f] ?? ''),
    noMatch: (q) => c.noMatch(c.labels.kind[f as 'tag'] ?? '', q),
  });
  const facets: Facet[] = ['calls', 'contact', 'tag', 'intent', 'date', 'direction', 'match'];
  const multiple = new Set<Facet>(['contact', 'tag', 'intent']);
  const any = facets.some((f) => text(f));
  return (
    <FilterSentence
      lead={c.showing}
      onClear={
        any
          ? () => {
              for (const f of facets) setValue(f, []);
            }
          : undefined
      }
      clearLabel={c.clearFilters}
      items={facets.map((f) => ({
        key: f,
        before: c.before[f],
        blank: (
          <FilterPicker
            title={c.titles[f]}
            open={open === f}
            onOpenChange={(o) => setOpen(o ? f : null)}
            multiple={multiple.has(f)}
            ordered={f === 'date' || f === 'direction' || f === 'match' || f === 'calls'}
            options={
              f === 'tag'
                ? c.tags.map(([v, l, colour]) => ({ value: v, label: l, colour }))
                : (c.options[f] ?? []).map(([v, l]) => ({
                    value: v,
                    label: l,
                    numeric: l.startsWith('+'),
                  }))
            }
            value={value[f]}
            onChange={(v) => setValue(f, v)}
            total={18}
            labels={pickerLabels(f)}
          >
            <FilterBlank
              facet={f === 'calls' ? 'starred' : f}
              empty={c.empty[f]}
              value={text(f)}
              inactive={f === 'match' && !hasText}
              aria-label={c.blankA11y(plain(f) ?? c.empty[f], c.titles[f])}
            />
          </FilterPicker>
        ),
      }))}
    />
  );
}

export function SearchGroup() {
  const c = useCopy(copy);
  const { lang } = useEnv();
  const [q, setQ] = useState(lang === 'he' ? 'דנ' : 'דנ');
  const [sort, setSort] = useState('new');
  const empty: Record<Facet, string[]> = {
    calls: [],
    contact: [],
    tag: [],
    intent: [],
    date: [],
    direction: [],
    match: [],
  };
  const [filters, setFilters] = useState<Record<Facet, string[]>>({
    ...empty,
    intent: ['purchase'],
    date: ['30'],
  });
  const [full, setFull] = useState<Record<Facet, string[]>>({
    calls: ['starred'],
    contact: ['dana', 'maya'],
    tag: ['hot'],
    intent: ['purchase'],
    date: ['30'],
    direction: ['in'],
    match: ['meaning'],
  });
  const [variants, setVariants] = useState(['מחירים', 'המחיר', 'במחיר', 'price', 'prices']);

  const values: ScoredSuggestion[] = [];
  for (const [v, l] of c.options.contact ?? []) {
    const score = matchScore(l, q);
    if (score !== undefined && !l.startsWith('+')) {
      values.push({
        id: `contact:${v}`,
        kind: 'contact',
        label: l,
        meta: c.meta.contact,
        score,
        onSelect: () => setFilters((f) => ({ ...f, contact: [v] })),
      });
    }
  }
  for (const [v, l, colour] of c.tags) {
    const score = matchScore(l, q);
    if (score !== undefined)
      values.push({
        id: `tag:${v}`,
        kind: 'tag',
        label: l,
        colour,
        meta: c.meta.tagOnly,
        score,
        onSelect: () => {},
      });
  }
  const records: SearchSuggestionData[] = q.trim()
    ? [
        {
          id: 'call:1',
          kind: 'call',
          label: c.meta.callWith('דנה לוי'),
          meta: c.sampleText[0]!,
          onSelect: () => {},
        },
        {
          id: 'call:2',
          kind: 'call',
          label: c.meta.callWith('דנה לוי'),
          meta: c.sampleText[1]!,
          onSelect: () => {},
        },
      ]
    : [];
  const words: SearchSuggestionData = {
    id: 'words',
    kind: 'words',
    label: c.meta.words(q.trim()),
    meta: c.meta.wordsMeta,
    onSelect: () => {},
  };
  const sorts = c.sorts
    .slice(0, full.match.includes('meaning') ? 4 : 3)
    .map(([value, label]) => ({ value: value!, label: label! }));

  const one: SearchSuggestionData[] = [
    { id: 's1', kind: 'contact', label: 'דנה לוי', meta: c.meta.contact, onSelect: () => {} },
    {
      id: 's2',
      kind: 'tag',
      label: c.tags[0]![1],
      colour: 'rose',
      meta: c.meta.tagAdd,
      onSelect: () => {},
    },
    {
      id: 's3',
      kind: 'tag',
      label: c.tags[4]![1],
      colour: 'violet',
      meta: c.meta.tagChosen,
      onSelect: () => {},
    },
    {
      id: 's4',
      kind: 'group',
      facet: 'tag',
      label: c.labels.kind.group,
      meta: c.meta.group,
      onSelect: () => {},
    },
    {
      id: 's5',
      kind: 'intent',
      label: c.options.intent![0]![1],
      meta: c.meta.intent,
      onSelect: () => {},
    },
    {
      id: 's6',
      kind: 'starred',
      label: c.labels.kind.starred,
      meta: c.meta.starred,
      onSelect: () => {},
    },
    {
      id: 's7',
      kind: 'date-preset',
      label: c.options.date![1]![1],
      meta: c.meta.date,
      onSelect: () => {},
    },
    {
      id: 's8',
      kind: 'call',
      label: '+972 52-555-0134',
      numeric: true,
      meta: c.sampleText[0]!,
      onSelect: () => {},
    },
    {
      id: 's9',
      kind: 'words',
      label: c.meta.words('מחיר'),
      meta: c.meta.wordsMeta,
      onSelect: () => {},
    },
  ];

  return (
    <>
      <Specimen name="SearchBox" note="type to see suggestions; ↑ ↓ Enter Esc; / focuses" wide>
        <div id="searchbox-demo" className="flex flex-col gap-3">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder={c.placeholder}
            labels={{ search: c.search, clear: c.clear }}
            suggestions={values}
            records={records}
            wordSearch={words}
          />
          <Sentence
            c={c}
            value={filters}
            setValue={(f, v) => setFilters((s) => ({ ...s, [f]: v }))}
            hasText={q.trim() !== ''}
          />
          <ResultLine
            total={18}
            formatTotal={c.count}
            variants={variants.map((term) => ({
              term,
              onExclude: () => setVariants((v) => v.filter((x) => x !== term)),
            }))}
            labels={{ alsoMatched: c.alsoMatched, exclude: c.exclude, sort: c.sort }}
            sort={{ value: sort, options: sorts, onChange: setSort }}
          />
        </div>
      </Specimen>
      <Specimen name="SearchBox" note="empty">
        <SearchBox
          value=""
          onChange={() => {}}
          placeholder={c.placeholder}
          labels={{ search: c.search, clear: c.clear }}
          slashShortcut={false}
        />
      </Specimen>
      <Specimen name="FoldedFilterSummary" note="phones only, fixed to the top; shown framed here">
        <State label="filtered">
          <div className="relative h-12 overflow-hidden rounded-lg border border-border [transform:translateZ(0)] [&>button]:flex">
            <FoldedFilterSummary
              summary={
                <>
                  <bdi>{c.foldedSummary[0]}</bdi>
                  {c.foldedSummary[1]}
                </>
              }
              total={18}
              label={c.folded}
              onShow={() => {}}
            />
          </div>
        </State>
        <State label="nothing set">
          <div className="relative h-12 overflow-hidden rounded-lg border border-border [transform:translateZ(0)] [&>button]:flex">
            <FoldedFilterSummary
              summary={c.foldedAll}
              total={212}
              label={c.folded}
              onShow={() => {}}
            />
          </div>
        </State>
      </Specimen>
      <Specimen name="SearchSuggestion" note="every kind; the highlighted row shows ↵" wide>
        <div
          role="listbox"
          aria-label={c.search}
          className="flex max-w-md flex-col rounded-xl border border-border bg-popover p-1.5 shadow-lg"
        >
          {one.map((s, i) => (
            <SearchSuggestion
              key={s.id}
              suggestion={s}
              query={i === 0 ? 'דנ' : ''}
              highlighted={i === 0}
            />
          ))}
        </div>
      </Specimen>
      <Specimen name="FilterSentence" note="every blank set · Clear" wide>
        <Sentence
          c={c}
          value={full}
          setValue={(f, v) => setFull((s) => ({ ...s, [f]: v }))}
          hasText
        />
      </Specimen>
      <Specimen name="FilterBlank">
        <State label="empty · set · several · inactive · busy · read-only">
          <p className="text-muted-foreground text-sm leading-8">
            <FilterBlank facet="tag" empty={c.empty.tag} /> ·{' '}
            <FilterBlank facet="intent" empty={c.empty.intent} value={c.options.intent![0]![1]} /> ·{' '}
            <FilterBlank
              facet="contact"
              empty={c.empty.contact}
              value={
                <>
                  <bdi>דנה לוי</bdi> + 1
                </>
              }
            />{' '}
            · <FilterBlank facet="match" empty={c.empty.match} inactive /> ·{' '}
            <FilterBlank facet="match" empty={c.empty.match} value={c.values.match!.meaning} busy />{' '}
            ·{' '}
            <FilterBlank facet="date" empty={c.empty.date} value={c.values.date!['30']} readOnly />
          </p>
        </State>
      </Specimen>
      <Specimen name="ResultLine">
        <State label="meaning model loading, best match sort">
          <ResultLine
            total={undefined}
            formatTotal={c.count}
            labels={{ alsoMatched: c.alsoMatched, exclude: c.exclude, sort: c.sort }}
            sort={{
              value: 'best',
              options: c.sorts.map(([value, label]) => ({ value: value!, label: label! })),
              onChange: () => {},
            }}
            status={c.meaningLoading}
          />
        </State>
        <State label="one result">
          <ResultLine
            total={1}
            formatTotal={c.count}
            labels={{ alsoMatched: c.alsoMatched, exclude: c.exclude, sort: c.sort }}
            sort={{ value: 'new', options: sorts, onChange: () => {} }}
          />
        </State>
      </Specimen>
      <Specimen
        name="FilterPicker"
        note="open any blank above: popover on desktop, bottom sheet on phones; tags (9) get a search field"
      >
        <State label="empty catalog">
          <p className="text-muted-foreground text-sm leading-8">
            {c.before.tag}{' '}
            <FilterPicker
              title={c.titles.tag}
              options={[]}
              value={[]}
              onChange={() => {}}
              multiple
              labels={{
                ...c.picker,
                search: c.search_(0, c.kinds.tag ?? ''),
                noMatch: (x) => c.noMatch(c.labels.kind.tag, x),
              }}
            >
              <FilterBlank facet="tag" empty={c.empty.tag} id="empty-tag-blank" />
            </FilterPicker>
          </p>
        </State>
      </Specimen>
    </>
  );
}
