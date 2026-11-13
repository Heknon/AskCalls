'use client';

import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { UnlockMethodRow } from '@askcalls/ui/components/UnlockMethodRow';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useDates } from '../../_settings/format';
import { PassphraseDialog, RemovePassphrase } from './passphrase-dialog';
import { RegenerateDialog } from './regenerate-dialog';
import { activeOf, type Keyring } from './types';

/** S1 Recovery code and passphrase. */
export function RecoverySection({
  keyring,
  onChanged,
}: {
  keyring: Keyring;
  onChanged: () => void;
}) {
  const t = useTranslations('settings.sec');
  const { date } = useDates();
  const [regen, setRegen] = useState(false);
  const [editPass, setEditPass] = useState(false);
  const [removePass, setRemovePass] = useState(false);
  const [failed, setFailed] = useState(false);
  const recovery = activeOf(keyring, 'recovery');
  const passphrases = activeOf(keyring, 'passphrase');
  const newest = (xs: typeof recovery) =>
    xs.reduce<(typeof xs)[number] | null>(
      (a, b) => (!a || b.createdAt > a.createdAt ? b : a),
      null,
    );
  const code = newest(recovery);
  const pass = newest(passphrases);

  return (
    <SettingsSection title={t('recovery.title')}>
      {failed ? (
        <div className="py-3">
          <ErrorState scope="inline" title={t('pass.failed')} />
        </div>
      ) : null}
      <UnlockMethodRow
        kind="recovery"
        label={t('recovery.code')}
        detail={code ? t('created', { date: date(code.createdAt) }) : t('pass.notSet')}
        action={{ kind: 'other', label: t('recovery.regenerate'), onAction: () => setRegen(true) }}
        labels={{ thisDevice: t('thisDevice') }}
      />
      <UnlockMethodRow
        kind="passphrase"
        label={t('pass.title')}
        detail={pass ? t('pass.setOn', { date: date(pass.createdAt) }) : t('pass.notSet')}
        action={{
          kind: 'other',
          label: pass ? t('pass.change') : t('pass.set'),
          onAction: () => setEditPass(true),
        }}
        labels={{ thisDevice: t('thisDevice') }}
      />
      <RegenerateDialog
        open={regen}
        onOpenChange={setRegen}
        hasPasskey={activeOf(keyring, 'passkey').length > 0}
        hasPassphrase={passphrases.length > 0}
        oldEntryIds={recovery.map((e) => e.id)}
        onDone={onChanged}
      />
      <PassphraseDialog
        open={editPass}
        onOpenChange={setEditPass}
        existingIds={passphrases.map((e) => e.id)}
        onDone={onChanged}
        onRemove={() => setRemovePass(true)}
      />
      <RemovePassphrase
        open={removePass}
        onOpenChange={setRemovePass}
        ids={passphrases.map((e) => e.id)}
        onDone={(ok) => {
          setFailed(!ok);
          if (ok) onChanged();
        }}
      />
    </SettingsSection>
  );
}
