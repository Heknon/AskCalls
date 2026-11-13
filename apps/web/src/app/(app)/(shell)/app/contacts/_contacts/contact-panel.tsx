'use client';

import { type SearchResultItem, searchCalls } from '@askcalls/client-core/search';
import type { Contact } from '@askcalls/client-core/userdata';
import { dateFromDay } from '@askcalls/domain';
import { type CountryCode, parsePhone } from '@askcalls/indexing';
import { CallRow } from '@askcalls/ui/components/CallRow';
import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { DecryptingPlaceholder } from '@askcalls/ui/components/DecryptingPlaceholder';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { formatPhone } from '@askcalls/ui/lib/format';
import { Button } from '@askcalls/ui/primitives/button';
import { Input } from '@askcalls/ui/primitives/input';
import { Label } from '@askcalls/ui/primitives/label';
import { Sheet, SheetContent, SheetTitle } from '@askcalls/ui/primitives/sheet';
import { Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { useUnlocked } from '../../../../../../client/session/session';
import { intlLocale } from '../../../../../../i18n/locales';
import { colourOf } from '../../tags/_tags/shared';

const DIRECTION = { in: 'incoming', out: 'outgoing', unknown: 'unknown' } as const;

export interface ContactPanelProps {
  /** The contact to edit, or a blank one for "New contact". */
  contact: Contact | null;
  isNew: boolean;
  region: CountryCode;
  onClose: () => void;
  onSave: (contact: Contact) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}

/** K1 detail: the contact's name and numbers, and its calls (found by number on the server). */
export function ContactPanel({
  contact,
  isNew,
  region,
  onClose,
  onSave,
  onDelete,
}: ContactPanelProps) {
  const t = useTranslations('contacts');
  const tc = useTranslations('common');
  const id = useId();
  const [name, setName] = useState('');
  const [phones, setPhones] = useState<string[]>(['']);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setName(contact?.name ?? '');
    setPhones(contact?.phones.length ? contact.phones.map((p) => formatPhone(p)) : ['']);
    setTouched(false);
  }, [contact]);

  const parsed = phones.map((p) => (p.trim() ? parsePhone(p, region) : null));
  const bad = phones.map((p, i) => p.trim() !== '' && parsed[i] === null);
  const numbers = [...new Set(parsed.filter((p): p is string => p !== null))];
  const problem = !name.trim()
    ? 'needName'
    : bad.some(Boolean)
      ? null
      : numbers.length === 0
        ? 'needNumber'
        : null;
  const invalid = problem !== null || bad.some(Boolean);

  const save = async () => {
    setTouched(true);
    if (!contact || invalid) return;
    setSaving(true);
    const ok = await onSave({ ...contact, name: name.trim(), phones: numbers });
    setSaving(false);
    if (ok && isNew) onClose();
  };

  return (
    <Sheet open={contact !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
          <SheetTitle className="min-w-0 truncate font-semibold" dir="auto">
            {isNew ? t('new') : contact?.name}
          </SheetTitle>
          <Button variant="ghost" size="icon-sm" aria-label={tc('close')} onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <form
          className="flex flex-col gap-5 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>{t('name')}</Label>
            <Input
              id={`${id}-name`}
              dir="auto"
              autoComplete="off"
              maxLength={200}
              value={name}
              aria-invalid={(touched && !name.trim()) || undefined}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1.5 font-medium text-sm">{t('numbers')}</legend>
            {phones.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place, not reordered
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="off"
                    aria-label={t('numberN', { n: i + 1 })}
                    value={p}
                    aria-invalid={bad[i] || undefined}
                    onChange={(e) =>
                      setPhones((list) => list.map((x, j) => (j === i ? e.target.value : x)))
                    }
                  />
                  {phones.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('removeNumber', { n: i + 1 })}
                      onClick={() => setPhones((list) => list.filter((_, j) => j !== i))}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
                {bad[i] ? <ErrorState scope="inline" title={t('badNumber')} /> : null}
              </div>
            ))}
            <div>
              <Button variant="ghost" size="sm" onClick={() => setPhones((l) => [...l, ''])}>
                <Plus className="size-4" aria-hidden />
                {t('addNumber')}
              </Button>
            </div>
          </fieldset>
          {touched && problem ? <ErrorState scope="inline" title={t(problem)} /> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" loading={saving}>
              {t('save')}
            </Button>
            {isNew ? (
              <Button variant="ghost" onClick={onClose}>
                {tc('cancel')}
              </Button>
            ) : (
              <Button variant="ghost" className="ms-auto" onClick={() => setConfirm(true)}>
                <Trash2 className="size-4" aria-hidden />
                {t('delete')}
              </Button>
            )}
          </div>
        </form>
        {contact && !isNew ? <ContactCalls contact={contact} /> : null}
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={t('deleteTitle', { name: contact?.name ?? '' })}
          description={t('deleteBody')}
          confirmLabel={t('delete')}
          cancelLabel={tc('cancel')}
          onConfirm={() => contact && void onDelete(contact.id)}
        />
      </SheetContent>
    </Sheet>
  );
}

function ContactCalls({ contact }: { contact: Contact }) {
  const t = useTranslations('contacts');
  const tc = useTranslations('common');
  const { ctx } = useUnlocked();
  const locale = intlLocale(useLocale());
  const [calls, setCalls] = useState<SearchResultItem[] | null | 'error'>(null);
  const key = contact.phones.join(',');

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when the numbers change
  useEffect(() => {
    let stale = false;
    setCalls(null);
    searchCalls(ctx, { contacts: [contact.id], limit: 20 }).then(
      (r) => !stale && setCalls(r.items),
      () => !stale && setCalls('error'),
    );
    return () => {
      stale = true;
    };
  }, [ctx, contact.id, key]);

  return (
    <section className="flex flex-col gap-2 border-t px-5 py-4" aria-labelledby="contact-calls">
      <h3 id="contact-calls" className="font-semibold">
        {t('calls')}
      </h3>
      {calls === null ? (
        <DecryptingPlaceholder shape="row" label={tc('decrypting')} />
      ) : calls === 'error' ? (
        <ErrorState scope="inline" title={tc('error.panel')} />
      ) : calls.length === 0 ? (
        <p className="text-muted-foreground">{t('noCalls')}</p>
      ) : (
        <ul className="m-0 p-0">
          {calls.map((c) => (
            <CallRow
              key={c.id}
              density="compact"
              href={`/app/calls/${c.id}`}
              linkAs={Link}
              locale={locale}
              call={{
                name: contact.name,
                ...(c.meta.phoneE164 && { phone: c.meta.phoneE164 }),
                direction: DIRECTION[c.meta.direction],
                startedAt: c.meta.startedAt ? new Date(c.meta.startedAt) : dateFromDay(c.day),
                durationSec: c.meta.durationSec ?? 0,
                starred: c.starred,
                tags: c.tags.flatMap((tag) =>
                  tag.kind === 'tag'
                    ? [{ id: tag.id, name: tag.tag.name, colour: colourOf(tag.tag.color) }]
                    : [],
                ),
              }}
              labels={{
                star: tc('star'),
                unstar: tc('unstar'),
                hiddenNumber: tc('hiddenNumber'),
                direction: {
                  incoming: tc('incoming'),
                  outgoing: tc('outgoing'),
                  unknown: tc('unknownDirection'),
                },
                moreActions: tc('moreActions'),
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
