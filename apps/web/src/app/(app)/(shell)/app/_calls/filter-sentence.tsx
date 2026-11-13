'use client';

import { FilterBlank } from '@askcalls/ui/components/FilterBlank';
import { FilterPicker, type FilterPickerOption } from '@askcalls/ui/components/FilterPicker';
import { FilterSentence } from '@askcalls/ui/components/FilterSentence';
import type { FilterFacet } from '@askcalls/ui/components/SearchSuggestion';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import type { Locale } from 'react-day-picker';
import { intlLocale } from '../../../../../i18n/locales';
import {
  DATE_PRESETS,
  type DatePreset,
  type DirectionFilter,
  EMPTY_FILTERS,
  type Filters,
  fromDay,
  isFiltered,
  toDay,
} from './filters';
import { tagColour } from './present';
import type { Catalogs } from './use-catalogs';

export type ContactOption = FilterPickerOption & { kind: 'contact' | 'number' };

export type FilterSentenceBlockProps = {
  filters: Filters;
  onChange: (next: Filters, facet: FilterFacet) => void;
  catalogs: Catalogs;
  contacts: ContactOption[];
  /** The open picker, controlled so a group suggestion can open one. */
  open: { facet: FilterFacet; query: string } | null;
  onOpenChange: (open: { facet: FilterFacet; query: string } | null) => void;
  /** Words are typed: "matching" has an effect. */
  hasText: boolean;
  meaningBusy: boolean;
  /** Calls matching now, for "Show 18 calls"; undefined while unknown. */
  total?: number;
};

function useDayPickerLocale(locale: string): Locale | undefined {
  const [loaded, setLoaded] = useState<Locale | undefined>();
  useEffect(() => {
    if (locale !== 'he') return setLoaded(undefined);
    let stale = false;
    import('react-day-picker/locale').then((m) => !stale && setLoaded(m.he));
    return () => {
      stale = true;
    };
  }, [locale]);
  return loaded;
}

/** "Showing [all calls] · with [anyone] · tagged [any tag] …": every filter as one sentence. */
export function FilterSentenceBlock({
  filters,
  onChange,
  catalogs,
  contacts,
  open,
  onOpenChange,
  hasText,
  meaningBusy,
  total,
}: FilterSentenceBlockProps) {
  const t = useTranslations('calls');
  const locale = useLocale();
  const dayLocale = useDayPickerLocale(locale);
  const dayFormat = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short' });

  const labels = (kind?: 'contact' | 'tag' | 'intent', size = 0) => ({
    clear: t('picker.clear'),
    search: kind ? t('picker.search', { n: size, kinds: t(`picker.kinds.${kind}`) }) : '',
    noMatch: (q: string) => t('picker.noMatch', { kind: kind ? t(`kinds.${kind}`) : '', q }),
    empty: kind === 'contact' ? t('picker.noContacts') : t('picker.noTags'),
    chosen: (n: number) => t('picker.chosen', { n }),
    pickMany: t('picker.pickMany'),
    show: (n: number) => t('picker.show', { n }),
    done: t('picker.done'),
    tapOne: t('picker.tapOne'),
  });

  const picker = (
    facet: FilterFacet,
    props: {
      title: string;
      options: FilterPickerOption[];
      value: string[];
      onChange: (v: string[]) => void;
      multiple?: boolean;
      ordered?: boolean;
      kind?: 'contact' | 'tag' | 'intent';
      range?: Parameters<typeof FilterPicker>[0]['range'];
    },
    blank: ReactNode,
  ) => (
    <FilterPicker
      title={props.title}
      options={props.options}
      value={props.value}
      onChange={props.onChange}
      multiple={props.multiple}
      ordered={props.ordered}
      range={props.range}
      total={props.multiple ? total : undefined}
      initialQuery={open?.facet === facet ? open.query : undefined}
      labels={labels(props.kind, props.options.length)}
      open={open?.facet === facet}
      onOpenChange={(o) => onOpenChange(o ? { facet, query: '' } : null)}
    >
      {blank}
    </FilterPicker>
  );

  const several = (names: string[]) =>
    names.length === 0 ? undefined : (
      <>
        <bdi>{names[0]}</bdi>
        {names.length > 1 ? ` + ${names.length - 1}` : null}
      </>
    );

  const contactValues = [...filters.contacts, ...filters.numbers];
  const contactNames = contactValues.map((v) => contacts.find((c) => c.value === v)?.label ?? v);
  const tagNames = filters.tags.map((id) => catalogs.tags.find((x) => x.id === id)?.name ?? '');
  const intentNames = filters.intents.map(catalogs.intentLabel);

  const dateValue =
    filters.date === null
      ? undefined
      : typeof filters.date === 'string'
        ? t(`filters.date.${filters.date}`)
        : t('filters.date.range', {
            from: dayFormat.format(fromDay(filters.date.from)),
            to: dayFormat.format(fromDay(filters.date.to)),
          });

  const set = (patch: Partial<Filters>, facet: FilterFacet) =>
    onChange({ ...filters, ...patch }, facet);
  const dateBefore = t('filters.date.before');

  const items = [
    {
      key: 'calls',
      blank: picker(
        'starred',
        {
          title: t('picker.titles.calls'),
          options: [
            { value: 'all', label: t('picker.options.all') },
            { value: 'starred', label: t('picker.options.starred') },
          ],
          value: [filters.starred ? 'starred' : 'all'],
          onChange: (v) => set({ starred: v[0] === 'starred' }, 'starred'),
          ordered: true,
        },
        <FilterBlank
          facet="starred"
          empty={t('filters.calls.empty')}
          value={filters.starred ? t('filters.calls.starred') : undefined}
        />,
      ),
    },
    {
      key: 'contact',
      before: t('filters.contact.before'),
      blank: picker(
        'contact',
        {
          title: t('picker.titles.contact'),
          options: contacts,
          value: contactValues,
          multiple: true,
          kind: 'contact',
          onChange: (v) =>
            set(
              {
                contacts: v.filter((x) => contacts.find((c) => c.value === x)?.kind === 'contact'),
                numbers: v.filter((x) => contacts.find((c) => c.value === x)?.kind !== 'contact'),
              },
              'contact',
            ),
        },
        <FilterBlank
          facet="contact"
          empty={t('filters.contact.empty')}
          value={several(contactNames)}
        />,
      ),
    },
    {
      key: 'tag',
      before: t('filters.tag.before'),
      blank: picker(
        'tag',
        {
          title: t('picker.titles.tag'),
          options: catalogs.tags.map((x) => ({
            value: x.id,
            label: x.name,
            colour: tagColour(x.id, x.color),
          })),
          value: filters.tags,
          multiple: true,
          kind: 'tag',
          onChange: (v) => set({ tags: v }, 'tag'),
        },
        <FilterBlank facet="tag" empty={t('filters.tag.empty')} value={several(tagNames)} />,
      ),
    },
    {
      key: 'intent',
      before: t('filters.intent.before'),
      blank: picker(
        'intent',
        {
          title: t('picker.titles.intent'),
          options: catalogs.intents.map((i) => ({ value: i.id, label: i.label })),
          value: filters.intents,
          multiple: true,
          kind: 'intent',
          onChange: (v) => set({ intents: v }, 'intent'),
        },
        <FilterBlank
          facet="intent"
          empty={t('filters.intent.empty')}
          value={several(intentNames)}
        />,
      ),
    },
    {
      key: 'date',
      ...(dateBefore && { before: dateBefore }),
      blank: picker(
        'date',
        {
          title: t('picker.titles.date'),
          options: DATE_PRESETS.map((p) => ({ value: p, label: t(`picker.options.${p}`) })),
          value: typeof filters.date === 'string' ? [filters.date] : [],
          ordered: true,
          onChange: (v) => set({ date: (v[0] as DatePreset | undefined) ?? null }, 'date'),
          range: {
            selected:
              filters.date && typeof filters.date !== 'string'
                ? { from: fromDay(filters.date.from), to: fromDay(filters.date.to) }
                : undefined,
            onSelect: (r) => {
              if (r?.from && r.to) set({ date: { from: toDay(r.from), to: toDay(r.to) } }, 'date');
            },
            locale: dayLocale,
          },
        },
        <FilterBlank facet="date" empty={t('filters.date.empty')} value={dateValue} />,
      ),
    },
    {
      key: 'direction',
      blank: picker(
        'direction',
        {
          title: t('picker.titles.direction'),
          options: [
            { value: 'all', label: t('picker.options.both') },
            { value: 'in', label: t('picker.options.in') },
            { value: 'out', label: t('picker.options.out') },
          ],
          value: [filters.direction],
          ordered: true,
          onChange: (v) =>
            set({ direction: (v[0] as DirectionFilter | undefined) ?? 'all' }, 'direction'),
        },
        <FilterBlank
          facet="direction"
          empty={t('filters.dir.empty')}
          value={filters.direction === 'all' ? undefined : t(`filters.dir.${filters.direction}`)}
        />,
      ),
    },
    {
      key: 'match',
      before: t('filters.match.before'),
      blank: picker(
        'match',
        {
          title: t('picker.titles.match'),
          options: [
            { value: 'words', label: t('picker.options.words') },
            { value: 'meaning', label: t('picker.options.meaning') },
          ],
          value: [filters.match],
          ordered: true,
          onChange: (v) =>
            set(
              v[0] === 'meaning'
                ? { match: 'meaning', sort: filters.sort === 'newest' ? 'best' : filters.sort }
                : { match: 'words', sort: filters.sort === 'best' ? 'newest' : filters.sort },
              'match',
            ),
        },
        <FilterBlank
          facet="match"
          empty={t('filters.match.words')}
          value={filters.match === 'meaning' ? t('filters.match.meaning') : undefined}
          inactive={!hasText}
          busy={meaningBusy}
        />,
      ),
    },
  ];

  return (
    <FilterSentence
      lead={t('filters.showing')}
      items={items}
      onClear={
        isFiltered(filters)
          ? () => onChange({ ...EMPTY_FILTERS, sort: 'newest' }, 'starred')
          : undefined
      }
      clearLabel={t('filters.clear')}
    />
  );
}
