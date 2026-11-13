'use client';

import { getRetention, putRetention } from '@askcalls/api-contract/routes/settings';
import { knownStores } from '@askcalls/client-core/recording-stores/refs';
import { ChoiceCard } from '@askcalls/ui/components/ChoiceCard';
import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { Button } from '@askcalls/ui/primitives/button';
import { Input } from '@askcalls/ui/primitives/input';
import { Label } from '@askcalls/ui/primitives/label';
import { RadioGroup } from '@askcalls/ui/primitives/radio-group';
import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useNotify } from '../../../../../../client/notices/notices';
import { useAppSession, useUnlocked } from '../../../../../../client/session/session';
import { AsyncView, useAsync } from '../../../_shell/states';
import { SectionScreen } from '../_settings/section-screen';
import { countOlderThan } from './count';

const MIN_DAYS = 30;
const MAX_DAYS = 3650;

/** S3 Retention: keep forever, or delete calls older than N days every night. */
export default function RetentionSettingsPage() {
  const { client, ctx } = useUnlocked();
  const data = useAsync(
    () =>
      Promise.all([
        client.api.request(getRetention, {}),
        ctx.userData.get('providers').then((p) => knownStores(p).length > 0),
      ]),
    [client, ctx],
  );
  return (
    <SectionScreen section="retention">
      <AsyncView state={data}>
        {([r, ownBucket]) => <RetentionForm initial={r.retentionDays} ownBucket={ownBucket} />}
      </AsyncView>
    </SectionScreen>
  );
}

function RetentionForm({ initial, ownBucket }: { initial: number | null; ownBucket: boolean }) {
  const t = useTranslations('settings.ret');
  const ts = useTranslations('settings');
  const tc = useTranslations('common');
  const { client } = useUnlocked();
  const { refreshMe } = useAppSession();
  const notify = useNotify();
  const id = useId();
  const [saved, setSaved] = useState(initial);
  const [mode, setMode] = useState<'forever' | 'days'>(initial === null ? 'forever' : 'days');
  const [days, setDays] = useState(String(initial ?? 365));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'range' | 'failed' | null>(null);
  const [confirm, setConfirm] = useState<{ n: number; count: number } | null>(null);

  const write = async (value: number | null) => {
    setBusy(true);
    setError(null);
    try {
      const r = await client.api.request(putRetention, { body: { retentionDays: value } });
      setSaved(r.retentionDays);
      notify({ kind: 'event', icon: History, title: t('saved') });
      void refreshMe().catch(() => {});
    } catch {
      setError('failed');
    } finally {
      setBusy(false);
    }
  };

  const saveDays = async () => {
    const n = Number(days);
    if (!Number.isInteger(n) || n < MIN_DAYS || n > MAX_DAYS) return setError('range');
    if (saved !== null && n >= saved) return write(n);
    setBusy(true);
    try {
      const count = await countOlderThan(client.api, new Date(), n);
      setBusy(false);
      if (count === 0) return write(n);
      setConfirm({ n, count });
    } catch {
      setBusy(false);
      setError('failed');
    }
  };

  const dirty = mode === 'forever' ? saved !== null : String(saved) !== days;

  return (
    <SettingsSection title={t('label')}>
      <form
        className="flex flex-col gap-3 py-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === 'forever') void write(null);
          else void saveDays();
        }}
      >
        <RadioGroup
          aria-label={t('label')}
          value={mode}
          onValueChange={(v) => {
            setMode(v as 'forever' | 'days');
            setError(null);
          }}
          className="flex flex-col gap-2"
        >
          <ChoiceCard value="forever" title={t('forever')} description={t('foreverDetail')} />
          <ChoiceCard
            value="days"
            title={t('days')}
            description={t('daysDetail')}
            details={
              <div className="relative z-10 flex flex-col gap-1.5">
                <Label htmlFor={id}>{t('daysLabel')}</Label>
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={MIN_DAYS}
                  max={MAX_DAYS}
                  value={days}
                  onChange={(e) => {
                    setDays(e.target.value);
                    setError(null);
                  }}
                  aria-invalid={error === 'range' || undefined}
                  aria-describedby={`${id}-range`}
                  className="w-32"
                />
                <p
                  id={`${id}-range`}
                  className={
                    error === 'range' ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'
                  }
                >
                  {t('range')}
                </p>
              </div>
            }
          />
        </RadioGroup>
        {ownBucket && mode === 'days' ? (
          <p className="text-muted-foreground text-sm">{t('bucket')}</p>
        ) : null}
        {error === 'failed' ? <ErrorState scope="inline" title={ts('saveFailed')} /> : null}
        <div>
          <Button type="submit" variant="primary" disabled={!dirty} loading={busy}>
            {busy ? ts('saving') : ts('save')}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('confirmTitle', { n: confirm?.n ?? 0 })}
        description={t('confirm', { count: confirm?.count ?? 0 })}
        confirmLabel={t('confirmAction', { n: confirm?.n ?? 0 })}
        cancelLabel={tc('cancel')}
        onConfirm={() => confirm && void write(confirm.n)}
      />
    </SettingsSection>
  );
}
