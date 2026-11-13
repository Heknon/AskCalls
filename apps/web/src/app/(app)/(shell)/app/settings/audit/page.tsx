'use client';

import type { ResponseFor } from '@askcalls/api-contract/client';
import { listAudit } from '@askcalls/api-contract/routes/audit';
import { listKeyring } from '@askcalls/api-contract/routes/keyring';
import { listTokens } from '@askcalls/api-contract/routes/tokens';
import type { AuditAction } from '@askcalls/domain';
import { AuditEventRow } from '@askcalls/ui/components/AuditEventRow';
import { EmptyState } from '@askcalls/ui/components/EmptyState';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { Button } from '@askcalls/ui/primitives/button';
import { Label } from '@askcalls/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@askcalls/ui/primitives/select';
import { Table, TableHead } from '@askcalls/ui/primitives/table';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useUnlocked } from '../../../../../../client/session/session';
import { PanelSkeleton, useSkeletonDelay } from '../../../_shell/states';
import { SectionScreen } from '../_settings/section-screen';
import { type ActorKind, applyFilters, type Period } from './_audit/filter';

type AuditEvent = ResponseFor<typeof listAudit>['items'][number];

/** Every `AuditAction`, for the action filter. */
const ACTIONS = [
  'call.read',
  'call.create',
  'call.update',
  'call.delete',
  'call.search',
  'call.list',
  'recording.upload',
  'recording.read',
  'recording.orphaned',
  'keyring.add',
  'keyring.revoke',
  'keyring.read',
  'keyring.setup',
  'device.link_start',
  'device.link',
  'device.revoke',
  'token.create',
  'token.revoke',
  'inbox.upload',
  'inbox.process',
  'inbox.delete',
  'ask',
  'transcribe',
  'export',
  'ingest',
  'retention.update',
  'retention.purge',
  'account.delete',
] as const satisfies readonly AuditAction[];

const PAGE = 50;
const PERIODS: Period[] = ['all', 'day', 'week', 'month'];
const ACTORS: Array<ActorKind | 'any'> = ['any', 'session', 'token', 'agent', 'system'];

function Filter<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} className={className ?? 'w-36'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** S7 Audit log: who did what, when. Ids, actors and actions only. */
export default function AuditSettingsPage() {
  const t = useTranslations('settings.audit');
  const tc = useTranslations('common');
  const format = useFormatter();
  const { client } = useUnlocked();
  const [action, setAction] = useState<AuditAction | 'any'>('any');
  const [actor, setActor] = useState<ActorKind | 'any'>('any');
  const [period, setPeriod] = useState<Period>('all');
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [names, setNames] = useState<{ tokens: Map<string, string>; agents: Map<string, string> }>({
    tokens: new Map(),
    agents: new Map(),
  });

  useEffect(() => {
    Promise.all([client.api.request(listTokens, {}), client.api.request(listKeyring, {})]).then(
      ([tk, kr]) =>
        setNames({
          tokens: new Map(tk.items.map((x) => [x.id, x.name])),
          agents: new Map(kr.devices.map((d) => [d.id, d.label])),
        }),
      () => {},
    );
  }, [client]);

  const load = useCallback(
    async (from: string | null) => {
      setStatus('loading');
      try {
        const page = await client.api.request(listAudit, {
          query: {
            limit: PAGE,
            ...(from && { cursor: from }),
            ...(action !== 'any' && { action }),
          },
        });
        setItems((cur) => (from ? [...cur, ...page.items] : page.items));
        setCursor(page.nextCursor);
        setStatus('ready');
      } catch {
        setStatus('error');
      }
    },
    [client, action],
  );

  useEffect(() => {
    setItems([]);
    void load(null);
  }, [load]);

  const { shown, canLoadMore } = useMemo(
    () => applyFilters(items, { actor, period }, Date.now(), cursor !== null),
    [items, actor, period, cursor],
  );
  const skeleton = useSkeletonDelay(status === 'loading' && items.length === 0);

  const actorLabel = (a: string) => {
    if (a.startsWith('token:')) {
      const name = names.tokens.get(a.slice(6));
      return name ? t('actorToken', { name }) : t('actorUnknownToken');
    }
    if (a.startsWith('agent:')) {
      const name = names.agents.get(a.slice(6));
      return name ? t('actorAgent', { name }) : t('actorUnknownAgent');
    }
    return t(`actors.${a === 'system' ? 'system' : 'session'}`);
  };

  return (
    <SectionScreen section="audit">
      <SettingsSection title={t('filters')}>
        <div className="flex flex-wrap gap-3 py-3">
          <Filter
            label={t('action')}
            value={action}
            onChange={setAction}
            className="w-48"
            options={[
              { value: 'any' as const, label: t('anyAction') },
              ...ACTIONS.map((a) => ({ value: a, label: t(`actions.${a}`) })),
            ]}
          />
          <Filter
            label={t('actor')}
            value={actor}
            onChange={setActor}
            options={ACTORS.map((a) => ({
              value: a,
              label: a === 'any' ? t('anyActor') : t(`actors.${a}`),
            }))}
          />
          <Filter
            label={t('period')}
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((p) => ({ value: p, label: t(`periods.${p}`) }))}
          />
        </div>
        {status === 'error' && items.length === 0 ? (
          <div className="pb-3">
            <ErrorState
              scope="panel"
              title={tc('error.panel')}
              description={tc('error.body')}
              retry={{ label: tc('retry'), onRetry: () => void load(null) }}
            />
          </div>
        ) : status === 'loading' && items.length === 0 ? (
          <div aria-busy="true">{skeleton ? <PanelSkeleton lines={5} /> : null}</div>
        ) : shown.length === 0 && !canLoadMore ? (
          <EmptyState reason="filtered" title={t('empty')} className="py-8" />
        ) : (
          <div className="-mx-5 overflow-x-auto border-border border-t">
            <Table>
              <thead>
                <tr>
                  <TableHead className="ps-5">{t('col.time')}</TableHead>
                  <TableHead>{t('col.actor')}</TableHead>
                  <TableHead>{t('col.action')}</TableHead>
                  <TableHead className="pe-5">{t('col.call')}</TableHead>
                </tr>
              </thead>
              <tbody className="[&_td:first-child]:ps-5 [&_td:last-child]:pe-5">
                {shown.map((e) => (
                  <AuditEventRow
                    key={e.id}
                    at={{
                      label: format.dateTime(e.at, { dateStyle: 'medium', timeStyle: 'short' }),
                      iso: e.at.toISOString(),
                    }}
                    actor={actorLabel(e.actor)}
                    action={
                      (ACTIONS as readonly string[]).includes(e.action)
                        ? t(`actions.${e.action as (typeof ACTIONS)[number]}`)
                        : e.action
                    }
                    callRef={e.callId ? e.callId.slice(0, 8) : undefined}
                  />
                ))}
              </tbody>
            </Table>
          </div>
        )}
        {canLoadMore && items.length > 0 ? (
          <div className="flex flex-col gap-2 border-border border-t py-3">
            {status === 'error' ? <ErrorState scope="inline" title={tc('error.body')} /> : null}
            <div>
              <Button
                variant="outline"
                size="sm"
                loading={status === 'loading'}
                onClick={() => void load(cursor)}
              >
                {t('loadMore')}
              </Button>
            </div>
          </div>
        ) : null}
      </SettingsSection>
    </SectionScreen>
  );
}
