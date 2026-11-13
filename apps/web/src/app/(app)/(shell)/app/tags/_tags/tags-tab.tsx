'use client';

import { createTag, deleteTag, renameTag } from '@askcalls/client-core/tags';
import type { Tag } from '@askcalls/client-core/userdata';
import { EmptyState } from '@askcalls/ui/components/EmptyState';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { TagManagerRow } from '@askcalls/ui/components/TagManagerRow';
import { TAG_COLOURS, type TagColour } from '@askcalls/ui/lib/tag-colour';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import { Input } from '@askcalls/ui/primitives/input';
import { Plus, Tag as TagIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useUnlocked } from '../../../../../../client/session/session';
import { intlLocale } from '../../../../../../i18n/locales';
import { AsyncView, useAsync } from '../../../_shell/states';
import { colourOf, SaveIndicator, tagCounts, useSaver } from './shared';

const FILTER_FROM = 20;

const key = (name: string) => name.trim().toLocaleLowerCase();

/** T1: the tag catalog. Names live only in the encrypted catalog; calls hold tokens. */
export function TagsTab() {
  const { ctx } = useUnlocked();
  const doc = useAsync(() => ctx.userData.get('tags', { fresh: true }), [ctx]);
  return <AsyncView state={doc}>{(d) => <TagList ctx={ctx} initial={d.tags} />}</AsyncView>;
}

function TagList({ ctx, initial }: { ctx: ReturnType<typeof useUnlocked>['ctx']; initial: Tag[] }) {
  const t = useTranslations('tags.tags');
  const tc = useTranslations('common');
  const locale = intlLocale(useLocale());
  const saver = useSaver();
  const [tags, setTags] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [conflict, setConflict] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [counts, setCounts] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    let stale = false;
    tagCounts(ctx).then(
      (c) => !stale && setCounts(c),
      () => {},
    );
    return () => {
      stale = true;
    };
  }, [ctx]);

  const sorted = useMemo(
    () =>
      [...tags].sort((a, b) =>
        a.name.localeCompare(b.name, locale, { sensitivity: 'base', numeric: true }),
      ),
    [tags, locale],
  );
  const shown = filter ? sorted.filter((x) => key(x.name).includes(key(filter))) : sorted;
  const taken = (name: string, except?: string) =>
    tags.some((x) => x.id !== except && key(x.name) === key(name));
  const refresh = async () => setTags((await ctx.userData.get('tags')).tags);
  const colourNames = Object.fromEntries(TAG_COLOURS.map((c) => [c, t(`colours.${c}`)])) as Record<
    TagColour,
    string
  >;

  const add = async () => {
    const name = draft.trim();
    if (!name) return;
    if (taken(name)) return setConflict('new');
    setConflict(null);
    const colour = TAG_COLOURS[(tags.length % (TAG_COLOURS.length - 1)) + 1]!;
    await saver.run(() => createTag(ctx.userData, { name, color: colour }));
    await refresh();
    setDraft('');
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="size-4" aria-hidden />
          {t('new')}
        </Button>
        {tags.length >= FILTER_FROM ? (
          <Input
            type="search"
            dir="auto"
            aria-label={t('filter')}
            placeholder={t('filter')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-64"
          />
        ) : null}
        <span className="ms-auto">
          <SaveIndicator saver={saver} />
        </span>
      </div>
      {adding ? (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              dir="auto"
              autoFocus
              aria-label={t('name')}
              placeholder={t('name')}
              value={draft}
              aria-invalid={conflict === 'new' || undefined}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              className="max-w-72"
              maxLength={100}
            />
            <Button type="submit" variant="primary" disabled={!draft.trim()}>
              {t('add')}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              {tc('cancel')}
            </Button>
          </div>
          {conflict === 'new' ? <ErrorState scope="inline" title={t('exists')} /> : null}
        </form>
      ) : null}
      {conflict && conflict !== 'new' ? <ErrorState scope="inline" title={t('exists')} /> : null}
      {tags.length === 0 && !adding ? (
        <EmptyState
          reason="first-use"
          icon={TagIcon}
          title={t('empty')}
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              {t('new')}
            </Button>
          }
        />
      ) : shown.length === 0 && filter ? (
        <EmptyState reason="no-results" title={t('noMatch', { q: filter })} />
      ) : tags.length > 0 ? (
        <Card className="overflow-hidden">
          {shown.map((tag) => {
            const n = counts?.get(tag.id) ?? 0;
            return (
              <TagManagerRow
                key={tag.id}
                name={tag.name}
                colour={colourOf(tag.color)}
                usage={counts ? t('count', { n }) : ''}
                onRename={async (name) => {
                  if (taken(name, tag.id)) return setConflict(tag.id);
                  setConflict(null);
                  await saver.run(() => renameTag(ctx.userData, tag.id, { name }));
                  await refresh();
                }}
                onColourChange={async (colour) => {
                  await saver.run(() => renameTag(ctx.userData, tag.id, { color: colour }));
                  await refresh();
                }}
                onDelete={async () => {
                  await saver.run(() => deleteTag(ctx.userData, tag.id));
                  await refresh();
                }}
                labels={{
                  colour: t('colour'),
                  colourNames,
                  rename: t('rename'),
                  save: t('save'),
                  delete: t('delete'),
                  deleteTitle: t('deleteTitle', { name: tag.name }),
                  deleteBody: t('deleteBody', { n }),
                  cancel: tc('cancel'),
                }}
              />
            );
          })}
        </Card>
      ) : null}
    </div>
  );
}
