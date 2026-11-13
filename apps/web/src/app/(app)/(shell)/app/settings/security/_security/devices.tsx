'use client';

import { revokeKeyring } from '@askcalls/api-contract/routes/keyring';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { UnlockMethodRow } from '@askcalls/ui/components/UnlockMethodRow';
import { Button } from '@askcalls/ui/primitives/button';
import { Plus, Unlink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useNotify } from '../../../../../../../client/notices/notices';
import { useUnlocked } from '../../../../../../../client/session/session';
import { useDates } from '../../_settings/format';
import { deviceKindOf } from './device-kind';
import { LinkDialog } from './link-dialog';
import { activeOf, type Keyring } from './types';

/**
 * S1 Linked devices: every registered device key. A device linked with D1 has a `device`
 * keyring row, which is what Revoke removes; this browser can't revoke itself.
 */
export function DevicesSection({
  keyring,
  onChanged,
}: {
  keyring: Keyring;
  onChanged: () => void;
}) {
  const t = useTranslations('settings.sec');
  const tc = useTranslations('common');
  const { client } = useUnlocked();
  const notify = useNotify();
  const { date, when } = useDates();
  const [linking, setLinking] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = client.session.device?.deviceKeyId ?? null;
  const links = activeOf(keyring, 'device');
  const devices = keyring.devices
    .filter((d) => d.revokedAt === null)
    .sort((a, b) => Number(b.id === current) - Number(a.id === current));

  const revoke = async (entryId: string, label: string) => {
    setFailed(false);
    try {
      await client.api.request(revokeKeyring, { params: { id: entryId } });
      notify({ kind: 'event', icon: Unlink, title: t('devices.revoked', { device: label }) });
      onChanged();
    } catch {
      setFailed(true);
    }
  };

  return (
    <SettingsSection
      title={t('devices.title')}
      actions={
        <Button variant="primary" size="sm" onClick={() => setLinking(true)}>
          <Plus className="size-4" aria-hidden />
          {t('devices.link')}
        </Button>
      }
    >
      {failed ? (
        <div className="py-3">
          <ErrorState scope="inline" title={tc('error.body')} />
        </div>
      ) : null}
      {devices.length === 0 ? (
        <p className="py-3 text-muted-foreground text-sm">{t('devices.empty')}</p>
      ) : null}
      {devices.map((d) => {
        const entry = links.find((e) => e.kdfParams.deviceKeyId === d.id);
        const isCurrent = d.id === current;
        const used = entry?.lastUsedAt;
        return (
          <UnlockMethodRow
            key={d.id}
            kind="device"
            deviceKind={deviceKindOf(d.label)}
            label={d.label}
            current={isCurrent}
            detail={[
              t('devices.linked', { date: date(d.createdAt) }),
              isCurrent ? t('devices.active') : used ? t('lastUsed', { when: when(used) }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {...(entry && !isCurrent
              ? {
                  action: {
                    kind: 'revoke' as const,
                    label: t('devices.revoke'),
                    onAction: () => void revoke(entry.id, d.label),
                  },
                  confirm: {
                    title: t('devices.revokeTitle', { device: d.label }),
                    body: t('devices.revokeBody'),
                    cancel: tc('cancel'),
                  },
                }
              : {})}
            labels={{ thisDevice: t('thisDevice') }}
          />
        );
      })}
      <LinkDialog open={linking} onOpenChange={setLinking} onLinked={onChanged} />
    </SettingsSection>
  );
}
