'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAppSession } from '../../../../../client/session/session';
import { OnboardingFlow } from './_onboarding/onboarding';

/** /app/welcome: onboarding for an account without unlock methods; anyone else goes to /app. */
export default function WelcomePage() {
  const { status } = useAppSession();
  const router = useRouter();
  const needed = useRef<boolean | null>(null);
  if (needed.current === null && status !== 'loading') needed.current = status === 'onboarding';

  useEffect(() => {
    if (needed.current === false) router.replace('/app');
  }, [router, status]);

  return needed.current ? <OnboardingFlow /> : null;
}
