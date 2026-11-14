'use client';

import type { Settings } from '@askcalls/client-core/userdata';
import { randomId } from '@askcalls/client-core/userdata';
import { BUILT_IN_INTENTS, type IntentDefinition } from '@askcalls/indexing';
import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { IntentEditor } from '@askcalls/ui/components/IntentEditor';
import { Button } from '@askcalls/ui/primitives/button';
import { Lightbulb, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useUnlocked } from '../../../../../../client/session/session';
import { AsyncView, useAsync } from '../../../_shell/states';
import { SaveIndicator, useSaver } from './shared';

/** Re-indexing runs the whole indexing pipeline: loaded only where it is offered. */
const ReindexJob = lazy(() =>
  import('../../_calls/reindex-job').then((m) => ({ default: m.ReindexJob })),
);

const MIN_EXAMPLES = 3;
const SAVE_AFTER_MS = 800;

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

interface Card {
  id: string;
  builtIn: boolean;
  name: string;
  examples: string;
  threshold: number;
}

/** The user's own examples and threshold for a built-in, or a custom intent, as stored. */
function toDefinition(card: Card, globalThreshold: number): IntentDefinition | null {
  const examples = lines(card.examples);
  const threshold = card.threshold === globalThreshold ? undefined : card.threshold;
  if (card.builtIn) {
    if (examples.length === 0 && threshold === undefined) return null;
    const builtIn = BUILT_IN_INTENTS.find((b) => b.id === card.id)!;
    // The schema needs one example; a built-in's own first example adds nothing to its prototype.
    return {
      id: card.id,
      examples: examples.length ? examples : [builtIn.examples[0]!],
      ...(threshold !== undefined && { threshold }),
    };
  }
  return {
    id: card.id,
    label: card.name.trim(),
    examples,
    ...(threshold !== undefined && { threshold }),
  };
}

function cardsFor(settings: Settings, name: (id: string) => string): Card[] {
  const custom = settings.customIntents;
  const builtIns = BUILT_IN_INTENTS.map((b): Card => {
    const ext = custom.find((c) => c.id === b.id);
    const own = ext ? ext.examples.filter((e) => !b.examples.includes(e)) : [];
    return {
      id: b.id,
      builtIn: true,
      name: name(b.id),
      examples: own.join('\n'),
      threshold: ext?.threshold ?? settings.intentThreshold,
    };
  });
  const mine = custom
    .filter((c) => !BUILT_IN_INTENTS.some((b) => b.id === c.id))
    .map(
      (c): Card => ({
        id: c.id,
        builtIn: false,
        name: c.label ?? '',
        examples: c.examples.join('\n'),
        threshold: c.threshold ?? settings.intentThreshold,
      }),
    );
  return [...builtIns, ...mine];
}

/** T2: built-in intents (examples can be added) and the user's own. */
export function IntentsTab() {
  const { ctx } = useUnlocked();
  const settings = useAsync(() => ctx.userData.get('settings', { fresh: true }), [ctx]);
  return <AsyncView state={settings}>{(s) => <IntentList initial={s} />}</AsyncView>;
}

function IntentList({ initial }: { initial: Settings }) {
  const t = useTranslations('tags.intents');
  const tc = useTranslations('common');
  const { ctx } = useUnlocked();
  const saver = useSaver();
  const [cards, setCards] = useState(() =>
    cardsFor(initial, (id) => t(`names.${id}` as 'names.legal')),
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Card | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const global = initial.intentThreshold;

  const valid = (c: Card) =>
    c.builtIn || (c.name.trim() !== '' && lines(c.examples).length >= MIN_EXAMPLES);

  const persist = (next: Card[]) =>
    saver.run(() =>
      ctx.userData.update('settings', (s) => {
        const keep = s.customIntents.filter(
          (c) => !next.some((n) => n.id === c.id) && BUILT_IN_INTENTS.every((b) => b.id !== c.id),
        );
        const defs = next
          .filter(valid)
          .map((c) => toDefinition(c, global))
          .filter((d): d is IntentDefinition => d !== null);
        const pending = next
          .filter((c) => !valid(c))
          .flatMap((c) => s.customIntents.filter((x) => x.id === c.id));
        return { ...s, customIntents: [...defs, ...pending, ...keep] };
      }),
    );

  // biome-ignore lint/correctness/useExhaustiveDependencies: saves the latest cards after edits pause
  useEffect(() => {
    if (dirty.size === 0) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDirty(new Set());
      void persist(cards);
    }, SAVE_AFTER_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [cards, dirty]);

  const edit = (id: string, patch: Partial<Card>) => {
    setCards((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setDirty((d) => new Set(d).add(id));
  };

  const add = () => {
    const card: Card = {
      id: `custom_${randomId()}`,
      builtIn: false,
      name: '',
      examples: '\n\n',
      threshold: global,
    };
    setCards((list) => [...list, card]);
  };

  const remove = async (card: Card) => {
    const next = cards.filter((c) => c.id !== card.id);
    setCards(next);
    await saver.run(() =>
      ctx.userData.update('settings', (s) => ({
        ...s,
        customIntents: s.customIntents.filter((c) => c.id !== card.id),
      })),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={add}>
          <Plus className="size-4" aria-hidden />
          {t('new')}
        </Button>
        <span className="ms-auto">
          <SaveIndicator saver={saver} />
        </span>
      </div>
      <Suspense fallback={null}>
        <ReindexJob mode="intents" ns="tags.intents.reindex" icon={Lightbulb} />
      </Suspense>
      {cards.map((card) => (
        <div key={card.id} className="flex flex-col gap-2">
          <IntentEditor
            name={card.name}
            onNameChange={(name) => edit(card.id, { name })}
            builtIn={card.builtIn}
            examples={card.examples}
            onExamplesChange={(examples) => edit(card.id, { examples })}
            threshold={card.threshold}
            onThresholdChange={(threshold) => edit(card.id, { threshold })}
            saveStatus={
              card.builtIn ? undefined : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('deleteNamed', { name: card.name || t('untitled') })}
                  onClick={() => setDeleting(card)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  {t('delete')}
                </Button>
              )
            }
            labels={{
              name: t('name'),
              builtIn: t('builtin'),
              examples: t('examples'),
              examplesHint: card.builtIn ? t('extendHint') : t('examplesHint'),
              threshold: t('threshold'),
              looser: t('looser'),
              stricter: t('stricter'),
            }}
          />
          {!valid(card) && dirty.size === 0 && (card.name || lines(card.examples).length) ? (
            <ErrorState scope="inline" title={t('needThree')} />
          ) : null}
        </div>
      ))}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('deleteTitle', { name: deleting?.name || t('untitled') })}
        description={t('deleteBody')}
        confirmLabel={t('delete')}
        cancelLabel={tc('cancel')}
        onConfirm={() => deleting && void remove(deleting)}
      />
    </div>
  );
}
