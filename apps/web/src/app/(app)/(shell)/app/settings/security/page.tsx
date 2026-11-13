'use client';

import { listKeyring } from '@askcalls/api-contract/routes/keyring';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { useAppSession, useUnlocked } from '../../../../../../client/session/session';
import { AsyncView, useAsync } from '../../../_shell/states';
import { SectionScreen } from '../_settings/section-screen';
import { AutoLockSection } from './_security/auto-lock';
import { DevicesSection } from './_security/devices';
import { PasskeysSection } from './_security/passkeys';
import { RecoverySection } from './_security/recovery';
import type { Keyring } from './_security/types';

/** S1 Security: passkeys, recovery code and passphrase, linked devices, auto-lock. */
export default function SecuritySettingsPage() {
  const t = useTranslations('settings.sec');
  const { client } = useUnlocked();
  const { refreshMe } = useAppSession();
  const keyring = useAsync(() => client.api.request(listKeyring, {}), [client]);
  // Refreshes keep the sections (and their open dialogs) mounted.
  const [fresh, setFresh] = useState<Keyring | null>(null);
  const changed = useCallback(() => {
    client.api.request(listKeyring, {}).then(setFresh, keyring.reload);
    void refreshMe().catch(() => {});
    void client.ctx.devices({ refresh: true }).catch(() => {});
  }, [keyring.reload, refreshMe, client]);

  return (
    <SectionScreen section="security" description={t('subtitle')}>
      <AsyncView state={keyring}>
        {(loaded) => {
          const k = fresh ?? loaded;
          return (
            <div className="flex flex-col gap-6">
              <PasskeysSection keyring={k} onChanged={changed} />
              <RecoverySection keyring={k} onChanged={changed} />
              <DevicesSection keyring={k} onChanged={changed} />
              <AutoLockSection />
            </div>
          );
        }}
      </AsyncView>
    </SectionScreen>
  );
}
