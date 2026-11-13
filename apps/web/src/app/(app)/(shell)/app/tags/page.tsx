'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@askcalls/ui/primitives/tabs';
import { Lightbulb, Replace, Tag, WandSparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Screen } from '../../_shell/screen';
import { IntentsTab } from './_tags/intents-tab';
import { RulesTab } from './_tags/rules-tab';
import { SynonymsTab } from './_tags/synonyms-tab';
import { TagsTab } from './_tags/tags-tab';

const TABS = [
  { value: 'tags', icon: Tag },
  { value: 'intents', icon: Lightbulb },
  { value: 'rules', icon: WandSparkles },
  { value: 'synonyms', icon: Replace },
] as const;

type TabValue = (typeof TABS)[number]['value'];

export default function TagsPage() {
  const t = useTranslations('tags');
  const [tab, setTab] = useState<TabValue>('tags');
  return (
    <Screen title={t('title')}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList className="mb-6 overflow-x-auto">
          {TABS.map(({ value, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="whitespace-nowrap">
              <Icon aria-hidden />
              {t(`tab.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="tags">
          <TagsTab />
        </TabsContent>
        <TabsContent value="intents">
          <IntentsTab />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTab />
        </TabsContent>
        <TabsContent value="synonyms">
          <SynonymsTab />
        </TabsContent>
      </Tabs>
    </Screen>
  );
}
