'use client';

import {
  checkDeviceLink,
  confirmDeviceLink,
  type InitiatorLinkStatus,
  type StartedDeviceLink,
  startDeviceLink,
} from '@askcalls/client-core/device-link';
import { DeviceLinkCode } from '@askcalls/ui/components/DeviceLinkCode';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { FingerprintCode } from '@askcalls/ui/components/FingerprintCode';
import { Stepper } from '@askcalls/ui/components/Stepper';
import { Alert } from '@askcalls/ui/primitives/alert';
import { Button } from '@askcalls/ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@askcalls/ui/primitives/dialog';
import { Spinner } from '@askcalls/ui/primitives/spinner';
import { CircleCheck, Fingerprint, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useNotify } from '../../../../../../../client/notices/notices';
import { useUnlocked } from '../../../../../../../client/session/session';
import { encodeQr } from '../../_settings/qr';
import { deviceKindOf } from './device-kind';

type Waiting = Extract<InitiatorLinkStatus, { state: 'waiting_for_confirmation' }>;

type State =
  | { step: 'starting' }
  | { step: 'connect'; link: StartedDeviceLink }
  | { step: 'compare'; link: StartedDeviceLink; device: Waiting; confirming: boolean }
  | { step: 'done'; label: string }
  | { step: 'expired' }
  | { step: 'error' };

const POLL_MS = 1_500;
const STEP_INDEX = { starting: 0, connect: 0, expired: 0, error: 0, compare: 1, done: 2 };

/** "9:41" until `at`. */
function left(at: Date, now: number): string {
  const s = Math.max(0, Math.round((at.getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "eyJ2IjoxLC…Q4fQ": the code is long; the QR and the copy button carry all of it. */
const shortened = (code: string) => `${code.slice(0, 8)}…${code.slice(-4)}`;

/** D1: link an agent or another browser (spec 6.5). */
export function LinkDialog({
  open,
  onOpenChange,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}) {
  const t = useTranslations('settings.link');
  const tc = useTranslations('common');
  const { client } = useUnlocked();
  const notify = useNotify();
  const [state, setState] = useState<State>({ step: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const opts = useMemo(() => ({ api: client.api, session: client.session }), [client]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` starts a new code
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ step: 'starting' });
    startDeviceLink(opts).then(
      (link) => !cancelled && setState({ step: 'connect', link }),
      () => !cancelled && setState({ step: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [open, opts, attempt]);

  const link = state.step === 'connect' || state.step === 'compare' ? state.link : null;

  useEffect(() => {
    if (!link) return;
    const tick = setInterval(() => {
      setNow(Date.now());
      if (link.expiresAt.getTime() <= Date.now()) setState({ step: 'expired' });
    }, 1_000);
    return () => clearInterval(tick);
  }, [link]);

  useEffect(() => {
    if (state.step !== 'connect') return;
    let stop = false;
    const poll = async () => {
      try {
        const s = await checkDeviceLink(client.api, state.link);
        if (stop) return;
        if (s.state === 'waiting_for_confirmation') {
          setState({ step: 'compare', link: state.link, device: s, confirming: false });
          return;
        }
        if (s.state === 'expired') return setState({ step: 'expired' });
      } catch {
        if (!stop) return setState({ step: 'error' });
      }
      if (!stop) timer = setTimeout(poll, POLL_MS);
    };
    let timer = setTimeout(poll, POLL_MS);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [state, client]);

  const qr = useMemo(() => (link ? encodeQr(link.code).modules : []), [link]);

  const close = () => onOpenChange(false);
  const mismatch = () => {
    notify({ kind: 'event', icon: Fingerprint, title: t('cancelled') });
    close();
  };
  const confirm = async () => {
    if (state.step !== 'compare') return;
    setState({ ...state, confirming: true });
    try {
      await confirmDeviceLink(opts, state.link, state.device.devicePublicKey);
      setState({ step: 'done', label: state.device.deviceLabel ?? t('unnamed') });
      onLinked();
    } catch {
      setState({ step: 'error' });
    }
  };

  const codeLabels = {
    scan: t('scan'),
    qr: t('qr'),
    copy: t('copy'),
    connected: t('connected'),
    expired: t('expired'),
    renew: t('newCode'),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc('close')} className="md:max-w-120" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <Stepper
            className="pt-3"
            label={t('stepsLabel')}
            current={STEP_INDEX[state.step]}
            steps={(['connect', 'compare', 'done'] as const).map((key) => ({
              key,
              label: t(`steps.${key}`),
            }))}
          />
        </DialogHeader>
        <DialogBody>
          {state.step === 'starting' ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
              <Spinner className="size-4" />
              {tc('loading')}
            </div>
          ) : null}
          {state.step === 'connect' ? (
            <>
              <DeviceLinkCode
                state="waiting"
                qr={qr}
                shortCode={shortened(state.link.code)}
                expiresIn={t('expiresIn', { t: left(state.link.expiresAt, now) })}
                onCopy={() => {
                  void navigator.clipboard
                    ?.writeText(state.link.code)
                    .then(() => notify({ kind: 'event', icon: CircleCheck, title: t('copied') }));
                }}
                onRenew={() => setAttempt((a) => a + 1)}
                labels={codeLabels}
              />
              <p className="text-sm">
                {t.rich('agent', { code: (c) => <code dir="ltr">{c}</code> })}
              </p>
              <p role="status" className="flex items-center gap-2 text-muted-foreground text-sm">
                <Spinner className="size-4" />
                {t('waiting')}
              </p>
            </>
          ) : null}
          {state.step === 'compare' ? (
            <>
              <DeviceLinkCode
                state="connected"
                qr={[]}
                shortCode=""
                expiresIn={t('expiresIn', { t: left(state.link.expiresAt, now) })}
                device={{
                  label: <b dir="auto">{state.device.deviceLabel ?? t('unnamed')}</b>,
                  kind: deviceKindOf(state.device.deviceLabel ?? ''),
                }}
                onCopy={() => {}}
                onRenew={() => {}}
                labels={codeLabels}
              />
              <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-background px-4 py-6 text-center">
                <p className="font-medium">{t('question')}</p>
                <FingerprintCode digits={state.device.fingerprint} />
                <p className="text-muted-foreground text-sm">{t('agentHint')}</p>
              </div>
              <Alert tone="warning">
                <TriangleAlert aria-hidden />
                <p>{t('warning')}</p>
              </Alert>
            </>
          ) : null}
          {state.step === 'done' ? (
            <p role="status" className="flex items-center gap-2 py-4">
              <CircleCheck className="size-5 text-success" aria-hidden />
              {t('done', { device: state.label })}
            </p>
          ) : null}
          {state.step === 'expired' ? (
            <DeviceLinkCode
              state="expired"
              qr={[]}
              shortCode=""
              expiresIn=""
              onCopy={() => {}}
              onRenew={() => setAttempt((a) => a + 1)}
              labels={codeLabels}
            />
          ) : null}
          {state.step === 'error' ? (
            <ErrorState
              scope="panel"
              title={t('error')}
              retry={{ label: t('startAgain'), onRetry: () => setAttempt((a) => a + 1) }}
            />
          ) : null}
        </DialogBody>
        {state.step === 'compare' ? (
          <DialogFooter>
            <Button variant="outline" disabled={state.confirming} onClick={mismatch}>
              {t('noMatch')}
            </Button>
            <Button variant="primary" loading={state.confirming} onClick={confirm}>
              {t('match')}
            </Button>
          </DialogFooter>
        ) : null}
        {state.step === 'done' ? (
          <DialogFooter>
            <Button variant="primary" onClick={close}>
              {t('close')}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
