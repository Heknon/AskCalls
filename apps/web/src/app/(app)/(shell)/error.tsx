'use client';

import { createApiClient } from '@askcalls/api-contract';
import { reportError } from '@askcalls/api-contract/routes/telemetry';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { Button } from '@askcalls/ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

/**
 * A route under the shell failed: one sentence, Try again and Go to calls. No content. The
 * error's class name and stack frames are reported when the account opted in to error reports.
 */
export default function ShellError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('common');
  useEffect(() => {
    createApiClient()
      .request(reportError, {
        body: { errorName: error.name.slice(0, 64), stack: error.stack?.slice(0, 8_000) },
      })
      .catch(() => {});
  }, [error]);
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
