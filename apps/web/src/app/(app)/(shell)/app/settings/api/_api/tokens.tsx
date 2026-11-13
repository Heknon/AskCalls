'use client';

import type { ResponseFor } from '@askcalls/api-contract/client';
import { listTokens, revokeToken } from '@askcalls/api-contract/routes/tokens';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { TokenRow } from '@askcalls/ui/components/TokenRow';
import { Button } from '@askcalls/ui/primitives/button';
import { Plus, Unlink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useNotify } from '../../../../../../../client/notices/notices';
import { useAppSession, useUnlocked } from '../../../../../../../client/session/session';
import { AsyncView, PanelSkeleton, useAsync } from '../../../../_shell/states';
import { useDates } from '../../_settings/format';
import { CreateTokenDialog } from './create-token-dialog';

export type ApiToken = ResponseFor<typeof listTokens>['items'][number];

/** S4 Personal access tokens: list with use, create (shown once), revoke. */
export function TokensSection() {
  const t = useTranslations('settings.api');
  const tc = useTranslations('common');
  const { client, me } = useUnlocked();
  const { refreshMe } = useAppSession();
  const notify = useNotify();
  const { date, when } = useDates();
  const tokens = useAsync(() => client.api.request(listTokens, {}), [client]);
  const [fresh, setFresh] = useState<ApiToken[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);
  const max = me.limits.maxApiTokens;
  const perHour = me.limits.mcpFetchesPerTokenPerHour;

  const refresh = () => {
    client.api.request(listTokens, {}).then((r) => setFresh(r.items), tokens.reload);
    void refreshMe().catch(() => {});
  };

  const revoke = async (id: string) => {
    setFailed(false);
    try {
      await client.api.request(revokeToken, { query: { id } });
      notify({ kind: 'event', icon: Unlink, title: t('revoked') });
      refresh();
    } catch {
      setFailed(true);
    }
  };

  const active = (items: ApiToken[]) => items.filter((x) => x.revokedAt === null);
  const shown = fresh ?? (tokens.data ? tokens.data.items : null);
  const now = Date.now();
  const live = shown
    ? active(shown).filter((x) => !x.expiresAt || x.expiresAt.getTime() > now).length
    : 0;
  const full = live >= max;

  return (
    <SettingsSection
      title={t('tokens')}
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={!shown || full}
          onClick={() => setCreating(true)}
        >
          <Plus className="size-4" aria-hidden />
          {t('create')}
        </Button>
      }
    >
      <AsyncView state={tokens} loading={<PanelSkeleton lines={2} />}>
        {() => {
          const items = active(shown ?? []);
          return (
            <>
              {full ? (
                <p className="py-3 text-muted-foreground text-sm">{t('max', { n: max })}</p>
              ) : null}
              {failed ? (
                <div className="py-3">
                  <ErrorState scope="inline" title={tc('error.body')} />
                </div>
              ) : null}
              {items.length === 0 ? (
                <p className="py-3 text-muted-foreground text-sm">{t('empty')}</p>
              ) : null}
              {items.map((x) => {
                const expired = x.expiresAt !== null && x.expiresAt.getTime() <= now;
                return (
                  <TokenRow
                    key={x.id}
                    name={x.name}
                    scopes={x.scopes}
                    expired={expired ? t('expired') : undefined}
                    detail={[
                      x.expiresAt
                        ? t('detail.expires', { date: date(x.expiresAt) })
                        : t('detail.noExpiry'),
                      x.lastUsedAt
                        ? t('detail.lastUsed', { when: when(x.lastUsedAt) })
                        : t('detail.unused'),
                      t('detail.fetches', { n: x.fetchesThisHour, limit: perHour }),
                    ].join(' · ')}
                    onRevoke={() => void revoke(x.id)}
                    labels={{
                      revoke: t('revoke'),
                      revokeTitle: t('revokeTitle', { name: x.name }),
                      revokeBody: t('revokeBody'),
                      cancel: tc('cancel'),
                    }}
                  />
                );
              })}
            </>
          );
        }}
      </AsyncView>
      <CreateTokenDialog open={creating} onOpenChange={setCreating} onCreated={refresh} />
    </SettingsSection>
  );
}
