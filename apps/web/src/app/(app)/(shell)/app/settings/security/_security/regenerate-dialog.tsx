'use client';

import { revokeKeyring } from '@askcalls/api-contract/routes/keyring';
import { createRecoveryCode, type UnlockInput, verifyUnlock } from '@askcalls/client-core/keys';
import {
  checkConfirmationGroups,
  pickConfirmationGroups,
  recoveryCodeGroups,
} from '@askcalls/crypto';
import { CodeGroupInput } from '@askcalls/ui/components/CodeGroupInput';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { PassphraseField } from '@askcalls/ui/components/PassphraseField';
import { RecoveryCodeGrid } from '@askcalls/ui/components/RecoveryCodeGrid';
import { Button } from '@askcalls/ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@askcalls/ui/primitives/dialog';
import { FileKey, KeyRound } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNotify } from '../../../../../../../client/notices/notices';
import { useUnlocked } from '../../../../../../../client/session/session';

const GROUPS = 8;

type Step =
  | { name: 'verify'; method: 'choose' | 'recovery' | 'passphrase' }
  | { name: 'show'; code: string; entryId: string; groups: readonly [number, number] }
  | { name: 'confirm'; code: string; entryId: string; groups: readonly [number, number] };

/**
 * Settings → Security → Regenerate: unlock again, show the new code once, retype two groups.
 * The new entry exists from "show" on; the old ones are revoked only on confirm, and the new
 * one is revoked again if the dialog closes first.
 */
export function RegenerateDialog({
  open,
  onOpenChange,
  hasPasskey,
  hasPassphrase,
  oldEntryIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPasskey: boolean;
  hasPassphrase: boolean;
  oldEntryIds: string[];
  onDone: () => void;
}) {
  const t = useTranslations('settings.sec.regen');
  const tc = useTranslations('common');
  const format = useFormatter();
  const { client, me } = useUnlocked();
  const notify = useNotify();
  const [step, setStep] = useState<Step>({ name: 'verify', method: 'choose' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string[]>(() => Array(GROUPS).fill(''));
  const [passphrase, setPassphrase] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [answers, setAnswers] = useState(['', '']);
  const [printing, setPrinting] = useState(false);
  const opts = { api: client.api, session: client.session };

  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    window.print();
    return () => window.removeEventListener('afterprint', done);
  }, [printing]);

  const reset = () => {
    setStep({ name: 'verify', method: 'choose' });
    setBusy(false);
    setError(null);
    setCode(Array(GROUPS).fill(''));
    setPassphrase('');
    setSaved(false);
    setAnswers(['', '']);
  };

  const close = () => {
    if (step.name !== 'verify') {
      void client.api.request(revokeKeyring, { params: { id: step.entryId } }).catch(() => {});
    }
    reset();
    onOpenChange(false);
  };

  const verify = async (input: UnlockInput) => {
    setBusy(true);
    setError(null);
    try {
      await verifyUnlock(input, opts);
      const created = await createRecoveryCode(opts);
      setStep({ name: 'show', ...created, groups: pickConfirmationGroups() });
    } catch {
      setError(t('wrong'));
    } finally {
      setBusy(false);
    }
  };

  const submitVerify = (e: FormEvent) => {
    e.preventDefault();
    if (step.name !== 'verify') return;
    if (step.method === 'recovery') void verify({ method: 'recovery', code: code.join('') });
    if (step.method === 'passphrase') void verify({ method: 'passphrase', passphrase });
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (step.name !== 'confirm') return;
    const [a, b] = step.groups;
    const groups = recoveryCodeGroups(step.code);
    const pairs = [
      [a, answers[0] ?? ''],
      [b, answers[1] ?? ''],
    ] as const;
    const short = pairs.find(([, v]) => v.length !== 4);
    if (short) return setError(t('short', { n: short[0] + 1 }));
    const wrong = pairs.find(([g, v]) => groups[g] !== v.toUpperCase());
    if (wrong || !checkConfirmationGroups(step.code, { [a]: answers[0]!, [b]: answers[1]! })) {
      return setError(t('mismatch', { n: (wrong?.[0] ?? a) + 1 }));
    }
    setBusy(true);
    setError(null);
    try {
      for (const id of oldEntryIds) {
        await client.api.request(revokeKeyring, { params: { id } });
      }
      notify({ kind: 'event', icon: FileKey, title: t('done') });
      reset();
      onOpenChange(false);
      onDone();
    } catch {
      setError(t('failed'));
      setBusy(false);
    }
  };

  const shownCode = step.name === 'verify' ? null : step.code;
  const fileText = (c: string) =>
    [
      t('file.heading'),
      '',
      recoveryCodeGroups(c).join('-'),
      '',
      t('file.account', { email: me.user.email ?? '' }),
      t('file.created', { date: format.dateTime(new Date(), { dateStyle: 'long' }) }),
      t('file.use', { url: `${location.origin}/app` }),
      '',
    ].join('\n');

  const download = (c: string) => {
    const url = URL.createObjectURL(new Blob([fileText(c)], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = t('file.name');
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent closeLabel={tc('close')} className="md:max-w-152">
        {step.name === 'verify' ? (
          <form onSubmit={submitVerify} noValidate className="flex flex-col">
            <DialogHeader>
              <DialogTitle>{t('verifyTitle')}</DialogTitle>
              <DialogDescription>{t('verifyBody')}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              {step.method === 'choose' ? (
                <div className="flex flex-col gap-2">
                  {hasPasskey ? (
                    <Button
                      variant="primary"
                      loading={busy}
                      onClick={() =>
                        void verify({ method: 'passkey', authenticator: client.passkeys })
                      }
                    >
                      {busy ? null : <KeyRound className="size-4" aria-hidden />}
                      {t('passkey')}
                    </Button>
                  ) : null}
                  {hasPassphrase ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setStep({ name: 'verify', method: 'passphrase' })}
                    >
                      {t('passphrase')}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setStep({ name: 'verify', method: 'recovery' })}
                  >
                    {t('recoveryCode')}
                  </Button>
                </div>
              ) : step.method === 'recovery' ? (
                <CodeGroupInput
                  values={code}
                  onChange={(v) => {
                    setCode(v);
                    setError(null);
                  }}
                  groupLength={4}
                  labels={Array.from({ length: GROUPS }, (_, i) => t('group', { n: i + 1 }))}
                />
              ) : (
                <PassphraseField
                  mode="enter"
                  label={t('passphraseLabel')}
                  value={passphrase}
                  onChange={(v) => {
                    setPassphrase(v);
                    setError(null);
                  }}
                  labels={{ show: tc('show'), hide: tc('hide') }}
                />
              )}
              {error ? <ErrorState scope="inline" title={error} /> : null}
            </DialogBody>
            {step.method !== 'choose' ? (
              <DialogFooter>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    setStep({ name: 'verify', method: 'choose' });
                  }}
                >
                  {t('back')}
                </Button>
                <Button type="submit" variant="primary" loading={busy}>
                  {t('unlock')}
                </Button>
              </DialogFooter>
            ) : null}
          </form>
        ) : step.name === 'show' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('showTitle')}</DialogTitle>
              <DialogDescription>{t('body')}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <RecoveryCodeGrid
                groups={recoveryCodeGroups(step.code)}
                onCopy={() => {
                  void navigator.clipboard
                    ?.writeText(recoveryCodeGroups(step.code).join('-'))
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2_000);
                    });
                }}
                onDownload={() => download(step.code)}
                onPrint={() => setPrinting(true)}
                copiedMessage={copied ? t('copied') : undefined}
                saved={saved}
                onSavedChange={setSaved}
                labels={{
                  list: t('list'),
                  group: (n) => t('group', { n }),
                  copy: t('copy'),
                  download: t('download'),
                  print: t('print'),
                  saved: t('check'),
                }}
              />
            </DialogBody>
            <DialogFooter>
              <Button
                variant="primary"
                disabled={!saved}
                onClick={() => setStep({ ...step, name: 'confirm' })}
              >
                {t('continue')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={confirm} noValidate className="flex flex-col">
            <DialogHeader>
              <DialogTitle>{t('confirmTitle')}</DialogTitle>
              <DialogDescription>
                {t('confirmBody', { a: step.groups[0] + 1, b: step.groups[1] + 1 })}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <CodeGroupInput
                values={answers}
                onChange={(v) => {
                  setAnswers(v);
                  setError(null);
                }}
                groupLength={4}
                labels={[
                  t('group', { n: step.groups[0] + 1 }),
                  t('group', { n: step.groups[1] + 1 }),
                ]}
                error={error ?? undefined}
              />
            </DialogBody>
            <DialogFooter>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setStep({ ...step, name: 'show' });
                }}
              >
                {t('back')}
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                {t('confirm')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
      {printing && shownCode
        ? createPortal(
            <div className="hidden whitespace-pre-wrap p-8 font-mono print:block">
              {fileText(shownCode)}
            </div>,
            document.body,
          )
        : null}
    </Dialog>
  );
}
