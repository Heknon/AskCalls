'use client';

import type { Pairing } from '@askcalls/client-core/bulk/pairing';
import type { IngestMeta, MetaEdits } from '@askcalls/client-core/ingest';
import type { Contact } from '@askcalls/client-core/userdata';
import { DEFAULT_PHONE_REGION, isPhoneRegion } from '@askcalls/indexing';
import { ContactLabel } from '@askcalls/ui/components/ContactLabel';
import { ImportEditDialog } from '@askcalls/ui/components/ImportEditDialog';
import { ImportGroup } from '@askcalls/ui/components/ImportGroup';
import { QueueRow } from '@askcalls/ui/components/QueueRow';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import { Checkbox } from '@askcalls/ui/primitives/checkbox';
import { Input } from '@askcalls/ui/primitives/input';
import { ToggleGroup, ToggleGroupItem } from '@askcalls/ui/primitives/toggle-group';
import { Pencil } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { intlLocale } from '../../../../../../i18n/locales';
import type { BulkController } from './bulk-controller';
import { editValues, toEdits } from './edit';
import { type GroupBy, type GroupLabel, groupItems, groupState, type ItemGroup } from './grouping';
import { contactOf, PAGE, parts, QueueTable } from './queue-parts';

export { EmptyCallDialog } from './empty-call-dialog';

import { phoneValid } from './single';

const GROUP_PAGE = 30;
/** Groups at which the filter input appears. */
const FILTER_AT = 12;

/** A group's name as text: for the checkbox label and the filter. */
function groupText(
  label: GroupLabel,
  t: ReturnType<typeof useTranslations<'upload.bulk.review'>>,
  locale: string,
): string {
  switch (label.kind) {
    case 'contact':
      return label.name ?? label.phone ?? '';
    case 'folder':
      return label.path || t('topFolder');
    case 'month':
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        new Date(label.year, label.month - 1, 1),
      );
    case 'none':
      return t('noContact');
  }
}

function GroupName({ group, text }: { group: ItemGroup; text: string }) {
  const { label } = group;
  if (label.kind === 'contact') return <ContactLabel name={label.name} phone={label.phone} />;
  if (label.kind === 'folder' && label.path) {
    return (
      <bdi dir="ltr" className="font-mono text-sm">
        {label.path}/
      </bdi>
    );
  }
  return <span>{text}</span>;
}

/**
 * U2 review: the planned calls grouped by contact, folder or month, each group and each call
 * put in the import or left out, and corrected, before it starts.
 */
export function ReviewTable({
  controller,
  pairing,
  meta,
  edits,
  excluded,
  region,
  contacts,
}: {
  controller: BulkController;
  pairing: Pairing;
  meta: ReadonlyMap<string, IngestMeta>;
  edits: ReadonlyMap<string, MetaEdits>;
  excluded: ReadonlySet<string>;
  region: string;
  contacts: readonly Contact[];
}) {
  const t = useTranslations('upload');
  const tr = useTranslations('upload.bulk.review');
  const tc = useTranslations('common');
  const locale = intlLocale(useLocale());
  const allId = useId();
  const [by, setBy] = useState<GroupBy>('contact');
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [shownGroups, setShownGroups] = useState(GROUP_PAGE);
  const [editing, setEditing] = useState<{ keys: string[]; title: string } | null>(null);
  const groups = useMemo(
    () => groupItems(pairing.items, meta, by, region),
    [pairing.items, meta, by, region],
  );
  const byKey = useMemo(() => new Map(pairing.items.map((i) => [i.key, i])), [pairing.items]);
  const n = new Intl.NumberFormat(locale);
  const textOf = (g: ItemGroup) =>
    g.label.kind === 'none' && by !== 'contact'
      ? by === 'month'
        ? tr('noDate')
        : tr('topFolder')
      : groupText(g.label, tr, locale);
  const needle = filter.trim().toLowerCase();
  const matching = needle
    ? groups.filter((g) =>
        [textOf(g), g.label.kind === 'contact' ? (g.label.phone ?? '') : '']
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
    : groups;
  const all = pairing.items.map((i) => i.key);
  const selected = all.length - excluded.size;
  const isOpen = (g: ItemGroup) => toggled.has(g.key) !== (groups.length === 1);
  const phoneRegion = isPhoneRegion(region) ? region : DEFAULT_PHONE_REGION;
  const contactNames = useMemo(() => [...new Set(contacts.map((c) => c.name))], [contacts]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b p-3">
        <div className="flex items-center gap-2.5">
          <Checkbox
            id={allId}
            checked={groupState(all, excluded)}
            onCheckedChange={(v) => controller.setIncluded(all, v === true)}
          />
          <label htmlFor={allId} className="cursor-pointer">
            {tr('all')}
          </label>
          <span className="tabular text-muted-foreground text-sm">
            {tr('selected', { n: n.format(selected), total: n.format(all.length) })}
          </span>
        </div>
        <ToggleGroup
          type="single"
          value={by}
          onValueChange={(v) => {
            if (!v) return;
            setBy(v as GroupBy);
            setToggled(new Set());
            setShownGroups(GROUP_PAGE);
          }}
          aria-label={tr('groupBy')}
          className="ms-auto"
        >
          {(['contact', 'folder', 'month'] as const).map((b) => (
            <ToggleGroupItem key={b} value={b}>
              {tr(`by.${b}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {groups.length >= FILTER_AT ? (
          <Input
            type="search"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setShownGroups(GROUP_PAGE);
            }}
            placeholder={tr('filter')}
            aria-label={tr('filter')}
            className="w-full"
          />
        ) : null}
      </div>
      {matching.length === 0 ? (
        <p className="p-5 text-muted-foreground">{tr('noMatch')}</p>
      ) : (
        <QueueTable groups>
          {matching.slice(0, shownGroups).map((g) => {
            const text = textOf(g);
            const out = g.keys.filter((k) => excluded.has(k)).length;
            return (
              <ImportGroup
                key={g.key}
                label={<GroupName group={g} text={text} />}
                count={
                  out === 0
                    ? tr('count', { n: g.keys.length })
                    : tr('countOf', {
                        n: n.format(g.keys.length - out),
                        total: n.format(g.keys.length),
                      })
                }
                checked={groupState(g.keys, excluded)}
                onCheckedChange={(v) => controller.setIncluded(g.keys, v)}
                selectLabel={tr('include', { name: text })}
                edit={{
                  label: tr('editGroup', { name: text }),
                  onEdit: () =>
                    setEditing({ keys: g.keys, title: tr('editCalls', { n: g.keys.length }) }),
                }}
                open={isOpen(g)}
                onOpenChange={() =>
                  setToggled((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.key)) next.delete(g.key);
                    else next.add(g.key);
                    return next;
                  })
                }
                columns={4}
              >
                <GroupRows
                  keys={g.keys}
                  render={(key) => {
                    const p = byKey.get(key)!;
                    const file = (p.audio ?? p.transcript)!.name;
                    const included = !excluded.has(key);
                    return (
                      <QueueRow
                        key={key}
                        fileName={file}
                        parts={parts(p, t)}
                        contact={by === 'contact' ? undefined : contactOf(meta.get(key), region)}
                        status={{
                          state: 'queued',
                          label: t(included ? 'queue.queued' : 'queue.excluded'),
                        }}
                        actions={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={tr('editCall', { name: file })}
                            onClick={() => setEditing({ keys: [key], title: file })}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                        }
                        select={{
                          checked: included,
                          control: (
                            <Checkbox
                              checked={included}
                              onCheckedChange={(v) => controller.setIncluded([key], v === true)}
                              aria-label={tr('include', { name: file })}
                            />
                          ),
                        }}
                      />
                    );
                  }}
                />
              </ImportGroup>
            );
          })}
        </QueueTable>
      )}
      {matching.length > shownGroups ? (
        <div className="flex justify-center p-3">
          <Button variant="ghost" onClick={() => setShownGroups(shownGroups + GROUP_PAGE)}>
            {tr('moreGroups', { n: Math.min(GROUP_PAGE, matching.length - shownGroups) })}
          </Button>
        </div>
      ) : null}
      <ImportEditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.title ?? ''}
        {...(editing && editing.keys.length > 1 && { description: tr('editHint') })}
        values={editing ? editValues(editing.keys, meta, region) : {}}
        date={editing?.keys.length === 1}
        contactNames={contactNames}
        phoneError={(p) => (phoneValid(p, phoneRegion) ? null : t('badNumber'))}
        onSave={(changed) => editing && controller.editMeta(editing.keys, toEdits(changed))}
        {...(editing?.keys.some((k) => edits.has(k)) && {
          onRevert: () => controller.revertMeta(editing.keys),
        })}
        labels={{
          phone: t('phone'),
          phoneHint: t('phoneHint'),
          contactName: t('contact'),
          date: t('date'),
          direction: t('direction.label'),
          in: t('direction.in'),
          out: t('direction.out'),
          unknown: t('direction.unknown'),
          mixed: tr('mixed'),
          save: tr('save'),
          cancel: tc('cancel'),
          revert: tr('revert'),
          close: tc('close'),
        }}
      />
    </Card>
  );
}

/** A group's rows, a page at a time. */
function GroupRows({ keys, render }: { keys: string[]; render: (key: string) => ReactNode }) {
  const t = useTranslations('upload.bulk');
  const [shown, setShown] = useState(PAGE);
  return (
    <>
      {keys.slice(0, shown).map(render)}
      {keys.length > shown ? (
        <tr>
          <td colSpan={4} className="p-2 text-center">
            <Button variant="ghost" onClick={() => setShown(shown + PAGE)}>
              {t('showMore', { n: Math.min(PAGE, keys.length - shown) })}
            </Button>
          </td>
        </tr>
      ) : null}
    </>
  );
}
