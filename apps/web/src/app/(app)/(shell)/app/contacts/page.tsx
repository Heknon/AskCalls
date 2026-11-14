'use client';

import { type Contact, randomId } from '@askcalls/client-core/userdata';
import { type CountryCode, DEFAULT_PHONE_REGION, isPhoneRegion } from '@askcalls/indexing';
import { ContactRow } from '@askcalls/ui/components/ContactRow';
import { EmptyState } from '@askcalls/ui/components/EmptyState';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import { Input } from '@askcalls/ui/primitives/input';
import { BookUser, Plus, Upload } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  type AnchorHTMLAttributes,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNotify } from '../../../../../client/notices/notices';
import { useUnlocked } from '../../../../../client/session/session';
import { intlLocale } from '../../../../../i18n/locales';
import { Screen } from '../../_shell/screen';
import { AsyncView, useAsync } from '../../_shell/states';
import { ContactPanel } from './_contacts/contact-panel';
import { matchesFilter, mergeVcards, parseVcf } from './_contacts/vcf';

const OpenContext = createContext<(id: string) => void>(() => {});

/** A row's link: opens the contact's panel in place; modifier clicks open the deep link. */
function RowLink({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) {
  const open = useContext(OpenContext);
  return (
    <a
      {...rest}
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        const id = new URL(href ?? '', location.href).searchParams.get('c');
        if (id) open(id);
      }}
    >
      {children}
    </a>
  );
}

export default function ContactsPage() {
  const t = useTranslations('contacts');
  const { ctx } = useUnlocked();
  const data = useAsync(async () => {
    if (!(await ctx.userData.get('settings')).contactsFromCalls) {
      const { backfillCallContacts } = await import('@askcalls/client-core/contact-backfill');
      await backfillCallContacts(ctx).catch(() => null);
    }
    const [contacts, settings] = await Promise.all([
      ctx.userData.get('contacts', { fresh: true }),
      ctx.userData.get('settings'),
    ]);
    return { contacts: contacts.contacts, settings };
  }, [ctx]);
  if (data.status !== 'ready') {
    return (
      <Screen title={t('title')}>
        <AsyncView state={data}>{() => null}</AsyncView>
      </Screen>
    );
  }
  const { contacts, settings } = data.data;
  return (
    <Contacts
      initial={contacts}
      region={isPhoneRegion(settings.phoneRegion) ? settings.phoneRegion : DEFAULT_PHONE_REGION}
      title={t('title')}
    />
  );
}

function Contacts({
  initial,
  region,
  title,
}: {
  initial: Contact[];
  region: CountryCode;
  title: string;
}) {
  const t = useTranslations('contacts');
  const { ctx } = useUnlocked();
  const notify = useNotify();
  const locale = intlLocale(useLocale());
  const [contacts, setContacts] = useState(initial);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<{ contact: Contact; isNew: boolean } | null>(null);
  const vcf = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () =>
      [...contacts].sort((a, b) =>
        a.name.localeCompare(b.name, locale, { sensitivity: 'base', numeric: true }),
      ),
    [contacts, locale],
  );
  const shown = sorted.filter((c) => matchesFilter(c, filter));

  const openId = useCallback(
    (id: string) => {
      const c = contacts.find((x) => x.id === id);
      if (c) setOpen({ contact: c, isNew: false });
    },
    [contacts],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: a deep link opens once
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('c');
    if (id) openId(id);
  }, []);

  const startNew = () =>
    setOpen({ contact: { id: randomId(), name: '', phones: [], aliases: [] }, isNew: true });

  const save = async (contact: Contact) => {
    try {
      const doc = await ctx.userData.update('contacts', (d) => ({
        ...d,
        contacts: d.contacts.some((c) => c.id === contact.id)
          ? d.contacts.map((c) => (c.id === contact.id ? contact : c))
          : [...d.contacts, contact],
      }));
      setContacts(doc.contacts);
      setOpen((o) => (o && !o.isNew ? { contact, isNew: false } : o));
      notify({ kind: 'event', title: t('saved') });
      return true;
    } catch {
      notify({ kind: 'error', title: t('saveFailed') });
      return false;
    }
  };

  const remove = async (id: string) => {
    try {
      const doc = await ctx.userData.update('contacts', (d) => ({
        ...d,
        contacts: d.contacts.filter((c) => c.id !== id),
      }));
      setContacts(doc.contacts);
      setOpen(null);
    } catch {
      notify({ kind: 'error', title: t('saveFailed') });
    }
  };

  const importVcf = async (file: File) => {
    try {
      const cards = parseVcf(await file.text());
      let result = { imported: 0, existed: 0 };
      const doc = await ctx.userData.update('contacts', (d) => {
        const merged = mergeVcards(d.contacts, cards, region, randomId);
        result = merged;
        return { ...d, contacts: merged.contacts };
      });
      setContacts(doc.contacts);
      notify({
        kind: 'event',
        icon: BookUser,
        title:
          result.imported + result.existed === 0
            ? t('vcfNone')
            : t('imported', { n: result.imported, d: result.existed }),
      });
    } catch {
      notify({ kind: 'error', title: t('vcfFailed') });
    }
  };

  const actions = (
    <>
      <Button variant="outline" onClick={() => vcf.current?.click()}>
        <Upload className="size-4" aria-hidden />
        {t('import')}
      </Button>
      <Button variant="primary" onClick={startNew}>
        <Plus className="size-4" aria-hidden />
        {t('new')}
      </Button>
    </>
  );

  return (
    <OpenContext.Provider value={openId}>
      <Screen
        title={title}
        headerActions={<span className="flex flex-wrap gap-2">{actions}</span>}
        mobileAction={
          <Button variant="ghost" size="icon" aria-label={t('new')} onClick={startNew}>
            <Plus className="size-5" aria-hidden />
          </Button>
        }
      >
        <input
          ref={vcf}
          type="file"
          hidden
          accept=".vcf,text/vcard,text/x-vcard"
          aria-label={t('import')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importVcf(f);
            e.target.value = '';
          }}
        />
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 md:hidden">{actions}</div>
          {contacts.length === 0 ? (
            <EmptyState reason="first-use" icon={BookUser} title={t('empty')} action={actions} />
          ) : (
            <>
              <Input
                type="search"
                dir="auto"
                aria-label={t('filter')}
                placeholder={t('filter')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="max-w-96"
              />
              {shown.length === 0 ? (
                <EmptyState reason="no-results" title={t('noMatch', { q: filter })} />
              ) : (
                <Card className="overflow-hidden">
                  <ul className="m-0 p-0">
                    {shown.map((c) => (
                      <ContactRow
                        key={c.id}
                        name={c.name}
                        phones={c.phones}
                        href={`/app/contacts?c=${encodeURIComponent(c.id)}`}
                        linkAs={RowLink}
                        onEdit={() => openId(c.id)}
                        labels={{ edit: t('edit') }}
                      />
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
        <ContactPanel
          contact={open?.contact ?? null}
          isNew={open?.isNew ?? false}
          region={region}
          onClose={() => setOpen(null)}
          onSave={save}
          onDelete={remove}
        />
      </Screen>
    </OpenContext.Provider>
  );
}
