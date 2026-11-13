'use client';

import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { Button } from '@askcalls/ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** A route under the shell failed: one sentence, Try again and Go to calls. No content. */
export default function ShellError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('common');
  return (
    <main id="main" className="mx-auto w-full max-w-280 px-4 py-4 md:px-6 md:py-6">
      <ErrorState
        scope="page"
        title={t('error.title')}
        description={t('error.body')}
        retry={{ label: t('retry'), onRetry: reset }}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/app">{t('goToCalls')}</Link>
          </Button>
        }
      />
    </main>
  );
}
