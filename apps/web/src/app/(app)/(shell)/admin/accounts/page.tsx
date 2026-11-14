'use client';

import type { ResponseFor } from '@askcalls/api-contract/client';
import { listAccounts } from '@askcalls/api-contract/routes/admin';
import { AccountRow } from '@askcalls/ui/components/AccountRow';
import { EmptyState } from '@askcalls/ui/components/EmptyState';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { SearchBox } from '@askcalls/ui/components/SearchBox';
import { formatDate } from '@askcalls/ui/lib/dates';
import { Button } from '@askcalls/ui/primitives/button';
import { Table, TableHead } from '@askcalls/ui/primitives/table';
import { Users } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useUnlocked } from '../../../../../client/session/session';
import { intlLocale } from '../../../../../i18n/locales';
import { Screen } from '../../_shell/screen';
import { PanelSkeleton, useSkeletonDelay } from '../../_shell/states';
import { GB } from './_accounts/units';

type Account = ResponseFor<typeof listAccounts>['items'][number];

const PAGE = 50;
const COLUMNS = ['calls', 'recordings', 'transcription', 'asks', 'translation', 'tokens'] as const;

/** A3 Accounts: every account with its usage, newest first, searchable by email. */
export default function AccountsPage() {
  const t = useTranslations('admin.accounts');
  const tc = useTranslations('common');
  const locale = intlLocale(useLocale());
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const { client } = useUnlocked();
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [items, setItems] = useState<Account[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const id = setTimeout(() => setEmail(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);

  const load = useCallback(
    async (from: string | null) => {
      setStatus('loading');
      try {
        const page = await client.api.request(listAccounts, {
          query: { limit: PAGE, ...(email && { email }), ...(from && { cursor: from }) },
        });
        setItems((cur) => (from ? [...cur, ...page.items] : page.items));
        setCursor(page.nextCursor);
        setStatus('ready');
      } catch {
        setStatus('error');
      }
    },
    [client, email],
  );

  useEffect(() => {
    setItems([]);
    void load(null);
  }, [load]);

  const skeleton = useSkeletonDelay(status === 'loading' && items.length === 0);
  const usage = (a: Account) => [
    n.format(a.usage.calls),
    t('cell.gb', { n: n.format(a.usage.recordingBytes / GB) }),
    t('cell.min', { n: n.format(Math.ceil(a.usage.transcriptionSecondsThisMonth / 60)) }),
    n.format(a.usage.asksToday),
    n.format(a.usage.translationCharsThisMonth),
    n.format(a.usage.apiTokens),
  ];

  return (
    <Screen title={t('title')}>
      <div className="flex flex-col gap-4">
        <SearchBox
          value={text}
          onChange={setText}
          onSubmit={(v) => setEmail(v.trim())}
          placeholder={t('search')}
          labels={{ search: t('searchLabel'), clear: t('clear') }}
        />
        {status === 'error' && items.length === 0 ? (
          <ErrorState
            scope="panel"
            title={t('loadFailed')}
            retry={{ label: tc('retry'), onRetry: () => void load(null) }}
          />
        ) : status === 'loading' && items.length === 0 ? (
          <div aria-busy="true">{skeleton ? <PanelSkeleton lines={6} /> : null}</div>
        ) : items.length === 0 ? (
          <EmptyState
            reason={email ? 'no-results' : 'first-use'}
            icon={email ? undefined : Users}
            title={t('empty')}
            action={
              email ? (
                <Button variant="outline" onClick={() => setText('')}>
                  {t('clearSearch')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <TableHead>{t('col.account')}</TableHead>
                  <TableHead>{t('col.plan')}</TableHead>
                  <TableHead>{t('col.created')}</TableHead>
                  {COLUMNS.map((c) => (
                    <TableHead key={c} className="text-end">
                      {t(`col.${c}`)}
                    </TableHead>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <AccountRow
                    key={a.id}
                    href={`/admin/accounts/${a.id}`}
                    email={a.email ?? t('noEmail')}
                    name={a.name}
                    plan={t(`plan.${a.plan}`)}
                    {...(a.role === 'admin' && { admin: t('admin') })}
                    {...(a.overridden.length > 0 && { custom: t('custom') })}
                    created={{
                      label: formatDate(a.createdAt, locale),
                      iso: a.createdAt.toISOString(),
                    }}
                    usage={usage(a)}
                    linkAs={Link}
                  />
                ))}
              </tbody>
            </Table>
          </div>
        )}
        {cursor && items.length > 0 ? (
          <div className="flex justify-center">
            <Button
              variant="outline"
              loading={status === 'loading'}
              onClick={() => void load(cursor)}
            >
              {t('loadMore')}
            </Button>
          </div>
        ) : null}
      </div>
    </Screen>
  );
}
