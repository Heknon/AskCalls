'use client';

import type { SynonymEntry } from '@askcalls/indexing';
import { EmptyState } from '@askcalls/ui/components/EmptyState';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { SynonymRow } from '@askcalls/ui/components/SynonymRow';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import { Plus, Replace } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useUnlocked } from '../../../../../../client/session/session';
import { AsyncView, useAsync } from '../../../_shell/states';
import { ReindexJob } from '../../_calls/reindex-job';
import { draftKey } from './rule-draft';
import { SaveIndicator, useSaver } from './shared';
import { checkGroups, type Group } from './synonyms';

const SAVE_AFTER_MS = 800;

/** T4: words that search as one term. */
export function SynonymsTab() {
  const { ctx } = useUnlocked();
  const doc = useAsync(() => ctx.userData.get('synonyms', { fresh: true }), [ctx]);
  return <AsyncView state={doc}>{(d) => <Synonyms initial={d.entries} />}</AsyncView>;
}

function Synonyms({ initial }: { initial: SynonymEntry[] }) {
  const t = useTranslations('tags.syn');
  const { ctx } = useUnlocked();
  const saver = useSaver();
  const [groups, setGroups] = useState<Group[]>(() =>
    initial.map((e) => ({ key: draftKey(), canonical: e.canonical, variants: [...e.variants] })),
  );
  const [edited, setEdited] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { problems, entries } = checkGroups(groups);

  // biome-ignore lint/correctness/useExhaustiveDependencies: saves after edits pause
  useEffect(() => {
    if (edited === 0 || problems.size > 0) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saver.run(() => ctx.userData.update('synonyms', (d) => ({ ...d, entries })));
    }, SAVE_AFTER_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [edited]);

  const edit = (key: string, patch: Partial<Group>) => {
    setGroups((list) => list.map((g) => (g.key === key ? { ...g, ...patch } : g)));
    setEdited((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">{t('note')}</p>
      <ReindexJob mode="all" ns="tags.syn.reindex" icon={Replace} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          onClick={() =>
            setGroups((list) => [...list, { key: draftKey(), canonical: '', variants: [] }])
          }
        >
          <Plus className="size-4" aria-hidden />
          {t('new')}
        </Button>
        <span className="ms-auto">
          <SaveIndicator saver={saver} />
        </span>
      </div>
      {groups.length === 0 ? (
        <EmptyState
          reason="first-use"
          icon={Replace}
          title={t('empty')}
          action={
            <Button
              variant="primary"
              onClick={() => setGroups([{ key: draftKey(), canonical: '', variants: [] }])}
            >
              {t('new')}
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          {groups.map((g) => (
            <div key={g.key}>
              <SynonymRow
                canonical={g.canonical}
                onCanonicalChange={(canonical) => edit(g.key, { canonical })}
                forms={{
                  terms: g.variants,
                  onChange: (variants) => edit(g.key, { variants }),
                  label: t('variants'),
                  removeLabel: (term) => t('removeTerm', { term }),
                }}
                onRemove={() => {
                  setGroups((list) => list.filter((x) => x.key !== g.key));
                  setEdited((n) => n + 1);
                }}
                labels={{ canonical: t('canonical'), remove: t('remove') }}
              />
              {problems.has(g.key) ? (
                <div className="px-4 pb-3">
                  <ErrorState scope="inline" title={t(problems.get(g.key)!)} />
                </div>
              ) : null}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
