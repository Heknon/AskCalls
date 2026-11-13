'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@askcalls/ui/primitives/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useUnlocked } from '../../../../../client/session/session';
import { Screen } from '../../_shell/screen';
import { AsyncView, useAsync } from '../../_shell/states';
import { BulkUpload } from './_upload/bulk-upload';
import { transcriptionFlow, translationFlow } from './_upload/plan';
import { SingleUpload } from './_upload/single-upload';

type Tab = 'single' | 'bulk';

export default function UploadPage() {
  const t = useTranslations('upload');
  const { ctx, me, client } = useUnlocked();
  const data = useAsync(async () => {
    const [providers, settings, contacts, bulk] = await Promise.all([
      ctx.userData.get('providers'),
      ctx.userData.get('settings'),
      ctx.userData.get('contacts'),
      client.bulkState.load().catch(() => null),
    ]);
    return { providers, settings, contacts: contacts.contacts, bulk: !!bulk?.items.length };
  }, [ctx, client]);
  const [tab, setTab] = useState<Tab | null>(null);

  return (
    <Screen title={t('title')}>
      <AsyncView state={data}>
        {({ providers, settings, contacts, bulk }) => {
          const flow = transcriptionFlow(providers, me);
          const translation = translationFlow(providers, me);
          const recordingsOff = providers.recordings.mode === 'off';
          return (
            <Tabs value={tab ?? (bulk ? 'bulk' : 'single')} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList className="mb-6">
                <TabsTrigger value="single">{t('tab.single')}</TabsTrigger>
                <TabsTrigger value="bulk">{t('tab.bulk')}</TabsTrigger>
              </TabsList>
              <TabsContent value="single" className="max-w-180">
                <SingleUpload
                  flow={flow}
                  translation={translation}
                  settings={settings}
                  contacts={contacts}
                  recordingsOff={recordingsOff}
                />
              </TabsContent>
              <TabsContent value="bulk">
                <BulkUpload
                  flow={flow}
                  translation={translation}
                  settings={settings}
                  contacts={contacts}
                  recordingsOff={recordingsOff}
                />
              </TabsContent>
            </Tabs>
          );
        }}
      </AsyncView>
    </Screen>
  );
}
