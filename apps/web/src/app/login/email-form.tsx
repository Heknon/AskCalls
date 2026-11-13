'use client';

import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { GateHeading } from '@askcalls/ui/components/Gate';
import { Button } from '@askcalls/ui/primitives/button';
import { Input } from '@askcalls/ui/primitives/input';
import { Label } from '@askcalls/ui/primitives/label';
import { Mail } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

/** The address shown on "Check your email"; this tab only, removed once shown. */
const SENT_TO = 'askcalls:sign-in-email';

function Submit({ kind }: { kind: 'email' | 'test' }) {
  const t = useTranslations('auth');
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={kind === 'email' ? 'secondary' : 'outline'}
      size="lg"
      className="w-full"
      loading={pending}
    >
      {kind === 'email' ? <Mail className="size-4" aria-hidden /> : null}
      {pending ? t('sending') : kind === 'email' ? t('emailLink') : t('test.submit')}
    </Button>
  );
}

/** Email magic link (and, in tests only, the test sign-in), with the empty-field error inline. */
export function EmailSignIn({
  action,
  redirectTo,
  kind,
}: {
  action: (formData: FormData) => Promise<void>;
  redirectTo: string;
  kind: 'email' | 'test';
}) {
  const t = useTranslations('auth');
  const id = useId();
  const [error, setError] = useState(false);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    if (!email) {
      e.preventDefault();
      setError(true);
      return;
    }
    if (kind === 'email') {
      try {
        sessionStorage.setItem(SENT_TO, email);
      } catch {}
    }
  };
  return (
    <form action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{kind === 'email' ? t('email') : t('test.label')}</Label>
        <Input
          id={id}
          type="email"
          name="email"
          dir="ltr"
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          aria-invalid={error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={() => setError(false)}
        />
        {error ? (
          <span id={`${id}-error`}>
            <ErrorState scope="inline" title={t('error.email')} />
          </span>
        ) : null}
      </div>
      <Submit kind={kind} />
    </form>
  );
}

/** "Check your email", which replaces the form after a link was sent. */
export function SentNotice() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    try {
      setEmail(sessionStorage.getItem(SENT_TO));
      sessionStorage.removeItem(SENT_TO);
    } catch {}
  }, []);
  return (
    <>
      <GateHeading
        title={t('sent.title')}
        description={
          <p role="status">
            {email
              ? t.rich('sent.body', { email: () => <bdi>{email}</bdi> })
              : t('sent.bodyNoEmail')}
          </p>
        }
      />
      <div>
        <Button variant="outline" asChild>
          <Link href="/login">{t('sent.change')}</Link>
        </Button>
      </div>
    </>
  );
}
