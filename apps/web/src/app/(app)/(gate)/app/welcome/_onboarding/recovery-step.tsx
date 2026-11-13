'use client';

import type { Onboarding } from '@askcalls/client-core/keys';
import { CodeGroupInput } from '@askcalls/ui/components/CodeGroupInput';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { GateHeading, GateNote } from '@askcalls/ui/components/Gate';
import { RecoveryCodeGrid } from '@askcalls/ui/components/RecoveryCodeGrid';
import { Button } from '@askcalls/ui/primitives/button';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** The text of the downloaded and printed copy: code, account, date, where to use it. */
function recoveryText(lines: { heading: string; code: string; account: string; created: string; use: string }) {
  return [lines.heading, '', lines.code, '', lines.account, lines.created, lines.use, ''].join('\n');
}

/** O3 and O4: show the recovery code, then retype two groups; finishing uploads the keys. */
export function RecoveryStep({
  onboarding,
  email,
  onFinish,
}: {
  onboarding: Onboarding;
  email: string;
  /** Uploads the keyring and unlocks; rejects when the upload failed. */
  onFinish: () => Promise<void>;
}) {
  const t = useTranslations('onboarding');
  const format = useFormatter();
  const [view, setView] = useState<'show' | 'confirm'>('show');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [values, setValues] = useState(['', '']);
  const [error, setError] = useState<{ kind: 'short' | 'wrong'; n: number } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [printing, setPrinting] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const groups = onboarding.recoveryGroups;
  const [a, b] = onboarding.confirmationGroups;
  const code = groups.join('-');
  const text = () =>
    recoveryText({
      heading: t('rc.file.heading'),
      code,
      account: t('rc.file.account', { email }),
      created: t('rc.file.created', { date: format.dateTime(new Date(), { dateStyle: 'long' }) }),
      use: t('rc.file.use', { url: `${location.origin}/app` }),
    });

  useEffect(() => {
    if (view === 'confirm') form.current?.querySelector('input')?.focus();
  }, [view]);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    window.print();
    return () => window.removeEventListener('afterprint', done);
  }, [printing]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([text()], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = t('rc.file.name');
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    const pairs = [
      [a, values[0] ?? ''],
      [b, values[1] ?? ''],
    ] as const;
    const short = pairs.find(([, v]) => v.length !== 4);
    if (short) return setError({ kind: 'short', n: short[0] + 1 });
    const wrong = pairs.find(([g, v]) => groups[g] !== v.toUpperCase());
    if (wrong || !onboarding.confirmRecovery({ [a]: values[0]!, [b]: values[1]! })) {
      return setError({ kind: 'wrong', n: (wrong?.[0] ?? a) + 1 });
    }
    setFinishing(true);
    setFailed(false);
    try {
      await onFinish();
    } catch {
      setFailed(true);
      setFinishing(false);
    }
  };

  if (view === 'confirm') {
    return (
      <form ref={form} onSubmit={confirm} noValidate className="flex flex-col gap-6">
        <GateHeading
          title={t('confirm.title')}
          description={<p>{t('confirm.body', { a: a + 1, b: b + 1 })}</p>}
        />
        <CodeGroupInput
          values={values}
          onChange={(v) => {
            setValues(v);
            setError(null);
          }}
          groupLength={4}
          labels={[t('confirm.group', { n: a + 1 }), t('confirm.group', { n: b + 1 })]}
          error={error ? t(`confirm.${error.kind}`, { n: error.n }) : undefined}
        />
        {failed ? <ErrorState scope="panel" title={t('confirm.failed')} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" size="lg" loading={finishing}>
            {finishing ? t('confirm.finishing') : t('confirm.cta')}
          </Button>
          <Button variant="ghost" size="lg" disabled={finishing} onClick={() => setView('show')}>
            {t('confirm.back')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <>
      <GateHeading title={t('rc.title')} description={<p>{t('rc.body')}</p>} />
      <RecoveryCodeGrid
        groups={groups}
        onDownload={download}
        onPrint={() => setPrinting(true)}
        onCopy={() => {
          void navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2_000);
          });
        }}
        copiedMessage={copied ? t('rc.copied') : undefined}
        saved={saved}
        onSavedChange={setSaved}
        labels={{
          list: t('rc.list'),
          group: (n) => t('rc.group', { n }),
          copy: t('rc.copy'),
          download: t('rc.download'),
          print: t('rc.print'),
          saved: t('rc.check'),
        }}
      />
      <GateNote>{t('rc.hint')}</GateNote>
      <div>
        <Button variant="primary" size="lg" disabled={!saved} onClick={() => setView('confirm')}>
          {t('rc.continue')}
        </Button>
      </div>
      {printing
        ? createPortal(
            <div className="hidden whitespace-pre-wrap p-8 font-mono print:block">
              {text()}
              {`\n${t('rc.file.where')}\n\n______________________________\n\n______________________________\n`}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
