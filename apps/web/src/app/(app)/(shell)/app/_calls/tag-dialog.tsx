'use client';

import { updateCallTags } from '@askcalls/client-core/calls';
import type { ClientContext } from '@askcalls/client-core/context';
import { createTag } from '@askcalls/client-core/tags';
import type { Tag } from '@askcalls/client-core/userdata';
import { tagDotClass } from '@askcalls/ui/lib/tag-colour';
import { Button } from '@askcalls/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@askcalls/ui/primitives/dialog';
import { Toggle } from '@askcalls/ui/primitives/toggle';
import { Check, Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useNotify } from '../../../../../client/notices/notices';
import { tagColour } from './present';

export type TagDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: ClientContext;
  call: { id: string; tagToks: readonly bigint[] } | null;
  /** Catalog tag ids on the call now. */
  selected: readonly string[];
  catalog: readonly Tag[];
  /** After a tag was created: reload the catalog. */
  onCatalogChange: () => void;
  onChange: (tagToks: bigint[]) => void;
};

/** Adds and removes a call's tags; typing narrows the catalog or creates a new tag. */
export function TagDialog({
  open,
  onOpenChange,
  ctx,
  call,
  selected,
  catalog,
  onCatalogChange,
  onChange,
}: TagDialogProps) {
  const t = useTranslations('call.tags');
  const notify = useNotify();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [order] = useState(() =>
    [...catalog].sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id))),
  );

  const q = query.trim().toLocaleLowerCase();
  const known = [...order, ...catalog.filter((c) => !order.some((o) => o.id === c.id))];
  const shown = known.filter((tag) => !q || tag.name.toLocaleLowerCase().includes(q));
  const exact = known.some((tag) => tag.name.trim().toLocaleLowerCase() === q);

  const change = async (add: string[], remove: string[]) => {
    if (!call) return;
    setBusy(true);
    try {
      onChange(await updateCallTags(ctx, call, { add, remove }));
    } catch {
      notify({ kind: 'error', title: t('failed') });
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const name = query.trim();
    if (!name || !call) return;
    setBusy(true);
    try {
      const tag = await createTag(ctx.userData, { name });
      onCatalogChange();
      setQuery('');
      onChange(await updateCallTags(ctx, call, { add: [tag.id] }));
    } catch {
      notify({ kind: 'error', title: t('failed') });
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="flex min-h-0 flex-col gap-3 px-6 pt-2 pb-5">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground"
          aria-hidden
        />
        <input
          type="text"
          dir="auto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q) {
              e.preventDefault();
              const match = shown[0];
              if (exact && match)
                void change(
                  selected.includes(match.id) ? [] : [match.id],
                  selected.includes(match.id) ? [match.id] : [],
                );
              else void create();
            }
          }}
          placeholder={t('search')}
          aria-label={t('search')}
          className="h-10 w-full rounded-lg border border-input bg-card ps-9 pe-3 text-md text-ui-start placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:outline-offset-1 md:text-base"
        />
      </div>
      <div className="min-h-0 overflow-y-auto">
        {catalog.length === 0 && !q ? (
          <p className="py-4 text-center text-muted-foreground text-sm">{t('empty')}</p>
        ) : shown.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground text-sm">
            {t('noMatch', { q: query.trim() })}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {shown.map((tag) => {
              const on = selected.includes(tag.id);
              return (
                <Toggle
                  key={tag.id}
                  variant="chip"
                  pressed={on}
                  disabled={busy}
                  onPressedChange={() => void change(on ? [] : [tag.id], on ? [tag.id] : [])}
                  className="max-w-full"
                >
                  {on ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <span
                      aria-hidden
                      className={`size-2 rounded-full ${tagDotClass[tagColour(tag.id, tag.color)]}`}
                    />
                  )}
                  <bdi className="truncate">{tag.name}</bdi>
                </Toggle>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {q && !exact ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void create()}>
            <Plus className="size-4" aria-hidden />
            <bdi>{t('create', { name: query.trim() })}</bdi>
          </Button>
        ) : null}
        <Button variant="primary" size="sm" className="ms-auto" onClick={() => onOpenChange(false)}>
          {t('done')}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-component="TagDialog" className="md:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('search')}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
