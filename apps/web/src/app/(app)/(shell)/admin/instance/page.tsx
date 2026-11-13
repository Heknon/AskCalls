'use client';

import { getInstance } from '@askcalls/api-contract/routes/admin';
import { Alert } from '@askcalls/ui/primitives/alert';
import { Badge } from '@askcalls/ui/primitives/badge';
import { RotateCcw, Server } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useUnlocked } from '../../../../../client/session/session';
import { Screen } from '../../_shell/screen';
import { AsyncView, PanelSkeleton, useAsync } from '../../_shell/states';
import {
  BlobCard,
  DatabaseCard,
  EmbeddingsCard,
  LimitsCard,
  LlmCard,
  SignInCard,
  TelemetryCard,
  TranscriptionCard,
  UsersCard,
} from './_instance/cards';
import { InstanceProvider, type View } from './_instance/form';
import { OfflineCard } from './_instance/offline-card';

export default function InstancePage() {
  const t = useTranslations('admin');
  const { client } = useUnlocked();
  const loaded = useAsync(() => client.api.request(getInstance, {}), [client]);
  const [view, setView] = useState<View | null>(null);
  useEffect(() => {
    if (loaded.status === 'ready') setView(loaded.data);
  }, [loaded]);

  return (
    <Screen
      title={t('title')}
      headerActions={
        view ? (
          <Badge variant="neutral" className="tabular">
            {t('version', { v: view.version })}
          </Badge>
        ) : null
      }
    >
      <AsyncView
        state={loaded}
        loading={<PanelSkeleton lines={6} />}
        error={{ title: t('loadFailed') }}
      >
        {() =>
          view ? (
            <InstanceProvider value={{ view, api: client.api, apply: setView }}>
              <Instance view={view} />
            </InstanceProvider>
          ) : null
        }
      </AsyncView>
    </Screen>
  );
}

function Instance({ view }: { view: View }) {
  const t = useTranslations('admin');
  const showOffline = !view.hosted && !view.offline.locked;
  const offlineFirst = showOffline && !view.offline.enabled && view.offline.blockers.length > 0;
  return (
    <div className="flex flex-col gap-6">
      {view.hosted ? (
        <Alert tone="neutral" role="note">
          <Server aria-hidden />
          <p>{t('hosted')}</p>
        </Alert>
      ) : null}
      {view.restartRequired.length ? (
        <Alert tone="warning" role="status">
          <RotateCcw aria-hidden />
          <p>{t('restartBanner')}</p>
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        {offlineFirst ? <OfflineCard /> : null}
        <DatabaseCard />
        <BlobCard />
        <SignInCard />
        <TranscriptionCard />
        <LlmCard />
        <EmbeddingsCard />
        <TelemetryCard />
        <LimitsCard />
        <UsersCard />
        {showOffline && !offlineFirst ? <OfflineCard /> : null}
      </div>
    </div>
  );
}
