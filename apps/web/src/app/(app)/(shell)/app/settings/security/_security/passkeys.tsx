'use client';

import { revokeKeyring } from '@askcalls/api-contract/routes/keyring';
import { addUnlockMethod } from '@askcalls/client-core/keys';
import { isDomainError } from '@askcalls/domain';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { UnlockMethodRow } from '@askcalls/ui/components/UnlockMethodRow';
import { Button } from '@askcalls/ui/primitives/button';
import { KeyRound, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { detectPrfSupport } from '../../../../../../../client/adapters/passkey';
import { useNotify } from '../../../../../../../client/notices/notices';
import { describeDevice } from '../../../../../../../client/session/device-label';
import { useUnlocked } from '../../../../../../../client/session/session';
import { useDates } from '../../_settings/format';
import { activeOf, type Keyring } from './types';

type AddError = 'cancelled' | 'exists' | 'noPrf' | 'passwordManager' | 'failed';

/** S1 Passkeys: one row per passkey, Add passkey (PRF), Remove. */
export function PasskeysSection({
  keyring,
  onChanged,
}: {
  keyring: Keyring;
  onChanged: () => void;
}) {
  const t = useTranslations('settings.sec');
  const tc = useTranslations('common');
  const { client, me } = useUnlocked();
  const notify = useNotify();
  const { date, when } = useDates();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<AddError | null>(null);
  const [removeFailed, setRemoveFailed] = useState(false);
  const passkeys = activeOf(keyring, 'passkey');
  const onlyWay = passkeys.length === 1 && activeOf(keyring, 'passphrase').length === 0;

  const add = async () => {
    setAdding(true);
    setError(null);
    try {
      if ((await detectPrfSupport()) === 'unsupported') return setError('noPrf');
      const { browser, os } = describeDevice(navigator.userAgent);
      const result = await addUnlockMethod(
        { api: client.api, session: client.session },
        {
          method: 'passkey',
          authenticator: client.passkeys,
          userName: me.user.email ?? me.user.name ?? 'AskCalls',
          label: t('passkeys.label', { browser, os }),
        },
      );
      if (!result.added) {
        return setError(result.reason === 'passwordManager' ? 'passwordManager' : 'noPrf');
      }
      notify({ kind: 'event', icon: KeyRound, title: t('passkeys.added') });
      onChanged();
    } catch (e) {
      const code = isDomainError(e) ? e.code : null;
      setError(
        code === 'forbidden'
          ? 'cancelled'
          : code === 'conflict'
            ? 'exists'
            : code === 'unsupported'
              ? 'noPrf'
              : 'failed',
      );
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    setRemoveFailed(false);
    try {
      await client.api.request(revokeKeyring, { params: { id } });
      notify({ kind: 'event', icon: KeyRound, title: t('passkeys.removed') });
      onChanged();
    } catch {
      setRemoveFailed(true);
    }
  };

  return (
    <SettingsSection
      title={t('passkeys.title')}
      actions={
        <Button variant="outline" size="sm" loading={adding} onClick={add}>
          {adding ? null : <Plus className="size-4" aria-hidden />}
          {t('passkeys.add')}
        </Button>
      }
    >
      {error ? (
        <div className="py-3">
          <ErrorState scope="inline" title={t(`passkeys.${error}`)} />
        </div>
      ) : null}
      {removeFailed ? (
        <div className="py-3">
          <ErrorState scope="inline" title={t('passkeys.failed')} />
        </div>
      ) : null}
      {passkeys.length === 0 ? (
        <p className="py-3 text-muted-foreground text-sm">{t('passkeys.empty')}</p>
      ) : null}
      {passkeys.map((p) => (
        <UnlockMethodRow
          key={p.id}
          kind="passkey"
          label={p.label}
          detail={[
            t('created', { date: date(p.createdAt) }),
            p.lastUsedAt ? t('lastUsed', { when: when(p.lastUsedAt) }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          action={{ kind: 'remove', label: t('remove'), onAction: () => void remove(p.id) }}
          confirm={{
            title: t('passkeys.removeTitle', { label: p.label }),
            body: onlyWay ? t('passkeys.removeLast') : t('passkeys.removeBody'),
            cancel: tc('cancel'),
          }}
          labels={{ thisDevice: t('thisDevice') }}
        />
      ))}
    </SettingsSection>
  );
}
