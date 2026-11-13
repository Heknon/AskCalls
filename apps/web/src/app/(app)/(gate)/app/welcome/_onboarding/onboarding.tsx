'use client';

import { Onboarding } from '@askcalls/client-core/keys';
import { DEFAULT_TRANSLATION_RULES } from '@askcalls/client-core/userdata';
import { GateHeading } from '@askcalls/ui/components/Gate';
import { Stepper } from '@askcalls/ui/components/Stepper';
import { Button } from '@askcalls/ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { describeDevice } from '../../../../../../client/session/device-label';
import { useAppSession } from '../../../../../../client/session/session';
import { GateFrame } from '../../../../../_gate/gate-frame';
import { AiStep } from './ai-step';
import { PasskeyStep } from './passkey-step';
import { RecoveryStep } from './recovery-step';
import { report } from './telemetry';
import { TryStep } from './try-step';

const STEPS = ['welcome', 'passkey', 'recovery', 'try', 'ai'] as const;
type Step = (typeof STEPS)[number];

/**
 * Onboarding (spec 6.2, 11.3; screens.md O1–O6). Keys are generated on this device when the
 * user starts, nothing is uploaded until the recovery code is confirmed, and there is no app
 * navigation until then. Back is possible until the keys are uploaded.
 */
export function OnboardingFlow() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const { me, client, refreshMe } = useAppSession();
  const [step, setStep] = useState<Step>('welcome');
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [starting, setStarting] = useState(false);
  const main = useRef<HTMLDivElement>(null);
  const index = STEPS.indexOf(step);

  useEffect(() => {
    report({ name: 'onboarding_step', step });
    main.current?.querySelector('h1')?.focus();
  }, [step]);
  useEffect(() => () => onboarding?.discard(), [onboarding]);

  if (!me || !client) return null;
  const { browser, os } = describeDevice(navigator.userAgent);
  const deviceLabel = `${browser} · ${os}`;

  const start = async () => {
    setStarting(true);
    setOnboarding(onboarding ?? (await Onboarding.begin(me.user.id)));
    setStarting(false);
    setStep('passkey');
  };

  const finish = async () => {
    if (!onboarding) return;
    await onboarding.finish({
      api: client.api,
      session: client.session,
      deviceKeys: client.deviceKeys,
      deviceLabel,
    });
    await client.ctx.userData
      .update('providers', (p) =>
        p.translation.rules.length
          ? p
          : { ...p, translation: { rules: DEFAULT_TRANSLATION_RULES } },
      )
      .catch(() => {});
    await refreshMe().catch(() => {});
    setStep('try');
  };

  return (
    <div className="print:hidden">
      <GateFrame
        width="wide"
        end={t('stepCount', { n: index + 1, total: STEPS.length })}
        top={
          <Stepper
            label={t('stepsLabel')}
            current={index}
            steps={STEPS.map((key) => ({ key, label: t(`steps.${key}`) }))}
          />
        }
      >
        <div ref={main} className="flex flex-col gap-6">
          {step === 'welcome' ? (
            <>
              <GateHeading
                title={t('welcome.title')}
                description={
                  <>
                    <p>{t('welcome.body')}</p>
                    <p>{t('welcome.body2')}</p>
                  </>
                }
              />
              <div>
                <Button variant="primary" size="lg" autoFocus loading={starting} onClick={start}>
                  {t('welcome.cta')}
                </Button>
              </div>
            </>
          ) : null}
          {step === 'passkey' && onboarding ? (
            <PasskeyStep
              onboarding={onboarding}
              client={client}
              userName={me.user.email ?? me.user.name ?? 'AskCalls'}
              deviceLabel={deviceLabel}
              onDone={() => setStep('recovery')}
            />
          ) : null}
          {step === 'recovery' && onboarding ? (
            <RecoveryStep onboarding={onboarding} email={me.user.email ?? ''} onFinish={finish} />
          ) : null}
          {step === 'try' ? (
            <>
              <TryStep client={client} onNext={() => setStep('ai')} />
              <div>
                <Button variant="link" onClick={() => setStep('ai')}>
                  {t('skip')}
                </Button>
              </div>
            </>
          ) : null}
          {step === 'ai' ? <AiStep onDone={() => router.push('/app')} /> : null}
        </div>
      </GateFrame>
    </div>
  );
}
