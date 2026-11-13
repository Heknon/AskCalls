'use client';

import { setTelemetryConsent } from '@askcalls/api-contract/routes/settings';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { Label } from '@askcalls/ui/primitives/label';
import { Switch } from '@askcalls/ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useAppSession, useUnlocked } from '../../../../../../client/session/session';
import { SectionScreen } from '../_settings/section-screen';
import { ShortcutsSetting } from '../_settings/shortcuts-setting';

type Consent = { productEvents: boolean; errorReports: boolean };

function ConsentRow({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-4 border-border border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-d`} className="text-muted-foreground text-sm">
          {detail}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-d`} />
    </div>
  );
}

/** S6 Privacy: telemetry opt-ins stored on the account (off by default), keyboard. */
export default function PrivacySettingsPage() {
  const t = useTranslations('settings.priv');
  const ts = useTranslations('settings');
  const { client, me } = useUnlocked();
  const { refreshMe } = useAppSession();
  const [consent, setConsent] = useState<Consent>(me.telemetryConsent);
  const [failed, setFailed] = useState(false);

  const save = async (next: Consent) => {
    const before = consent;
    setConsent(next);
    setFailed(false);
    try {
      setConsent(await client.api.request(setTelemetryConsent, { body: next }));
      void refreshMe().catch(() => {});
    } catch {
      setConsent(before);
      setFailed(true);
    }
  };

  return (
    <SectionScreen section="privacy">
      <div className="flex flex-col gap-6">
        <SettingsSection title={t('telemetry')}>
          <ConsentRow
            label={t('analytics')}
            detail={t('whatIsSent')}
            checked={consent.productEvents}
            onChange={(on) => void save({ ...consent, productEvents: on })}
          />
          <ConsentRow
            label={t('errors')}
            detail={t('errorsSent')}
            checked={consent.errorReports}
            onChange={(on) => void save({ ...consent, errorReports: on })}
          />
          {failed ? (
            <div className="pb-3">
              <ErrorState scope="inline" title={ts('saveFailed')} />
            </div>
          ) : null}
        </SettingsSection>
        <ShortcutsSetting />
      </div>
    </SectionScreen>
  );
}
