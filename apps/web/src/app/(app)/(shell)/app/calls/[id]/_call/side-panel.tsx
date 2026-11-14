'use client';

import { type DecryptedCall, transcriptFile, updateCallMeta } from '@askcalls/client-core/calls';
import type { ClientContext } from '@askcalls/client-core/context';
import type { CallMeta } from '@askcalls/domain';
import { AskPanel } from '@askcalls/ui/components/AskPanel';
import { ConsentSheet } from '@askcalls/ui/components/ConsentSheet';
import { DataFlowNote } from '@askcalls/ui/components/DataFlowNote';
import { NotesEditor } from '@askcalls/ui/components/NotesEditor';
import { Button } from '@askcalls/ui/primitives/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@askcalls/ui/primitives/tabs';
import { MessageSquareText, NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Me } from '../../../../../../../client/session/session';
import { hasConsent, rememberConsent } from '../../../_calls/memory';
import { parseCitations } from './citations';
import { consentKeyOf, providerName, useAsk, useAskRoute } from './use-ask';

export type SidePanelProps = {
  ctx: ClientContext;
  me: Me;
  call: DecryptedCall;
  onSeek: (seconds: number) => void;
  onMetaChange: (meta: CallMeta) => void;
  tab: 'ask' | 'notes';
  onTabChange: (tab: 'ask' | 'notes') => void;
};

const NOTES_DELAY = 800;

/** Asks count per UTC day; the next one starts at the coming UTC midnight. */
function quotaReset() {
  const at = new Date();
  at.setUTCHours(24, 0, 0, 0);
  return at;
}
const RESET_TIME = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const;

function Notes({ ctx, call, onMetaChange }: Pick<SidePanelProps, 'ctx' | 'call' | 'onMetaChange'>) {
  const t = useTranslations('call.notes');
  const [value, setValue] = useState(call.meta.notes ?? '');
  const [save, setSave] = useState<'saving' | 'saved' | 'error' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(call);
  latest.current = call;
  const dirty = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` retries the same value
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => {
      setSave('saving');
      updateCallMeta(ctx, latest.current, { notes: value || null }).then(
        (meta) => {
          onMetaChange(meta);
          setSave('saved');
        },
        () => setSave('error'),
      );
    }, NOTES_DELAY);
    return () => clearTimeout(timer);
  }, [ctx, value, attempt, onMetaChange]);

  return (
    <div className="p-4">
      <NotesEditor
        value={value}
        onChange={(v) => {
          dirty.current = true;
          setValue(v);
        }}
        label={t('placeholder')}
        save={save ? { state: save, onRetry: () => setAttempt((a) => a + 1) } : undefined}
        saveLabels={{
          saving: t('saving'),
          saved: t('saved'),
          error: t('error'),
          retry: t('retry'),
        }}
      />
    </div>
  );
}

function Ask({ ctx, me, call, onSeek }: Pick<SidePanelProps, 'ctx' | 'me' | 'call' | 'onSeek'>) {
  const t = useTranslations('call');
  const tc = useTranslations('common');
  const tf = useTranslations('dataFlow');
  const format = useFormatter();
  const route = useAskRoute(ctx, me);
  const transcriptText = useMemo(() => transcriptFile(call, 'txt').content, [call]);
  const quota = me.usage.asksToday >= me.limits.asksPerDay;
  const conversation = useAsk(ctx, call.id, transcriptText, route, quota);
  const [value, setValue] = useState('');
  const [consenting, setConsenting] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const duration = call.meta.durationSec ?? call.transcript.segments.at(-1)?.end ?? 0;

  if (!route) return null;
  if (route.kind === 'off') {
    return (
      <AskPanel
        enabled={false}
        messages={[]}
        onSeek={onSeek}
        value=""
        onChange={() => {}}
        onSend={() => {}}
        dataFlow={null}
        labels={{
          placeholder: t('ask.placeholder'),
          send: t('ask.send'),
          playFrom: (clock) => t('playFrom', { t: clock }),
          error: '',
          quota: '',
          off: t('ask.off'),
          retry: tc('retry'),
        }}
        offAction={
          <Button variant="outline" asChild>
            <Link href="/app/settings/providers">{t('ask.offAction')}</Link>
          </Button>
        }
      />
    );
  }

  const provider = providerName(route);
  const key = consentKeyOf(route);
  const send = (question: string) => {
    if (hasConsent(key)) {
      setValue('');
      void conversation.send(question);
    } else setConsenting(question);
  };
  const flow = route.kind === 'managed' ? 'managed' : 'direct';

  return (
    <AskPanel
      enabled
      messages={conversation.messages.map((m) => ({
        id: m.id,
        kind: m.kind,
        parts: m.kind === 'answer' ? parseCitations(m.text, duration) : [m.text],
        streaming: m.streaming,
        ...(m.kind === 'answer' && { author: route.model }),
      }))}
      onSeek={onSeek}
      suggestions={
        conversation.messages.length === 0
          ? [t('ask.suggest.summary'), t('ask.suggest.promises'), t('ask.suggest.next')]
          : []
      }
      value={value}
      onChange={setValue}
      onSend={send}
      state={conversation.state}
      onRetry={conversation.retry}
      dataFlow={
        <DataFlowNote
          size="compact"
          route={flow}
          nodes={{ device: tf('nodes.device'), server: tf('nodes.server'), provider }}
        >
          {t(`ask.route.${flow}`, { model: route.model, provider })}
        </DataFlowNote>
      }
      consent={
        <ConsentSheet
          open={consenting !== null}
          onOpenChange={(o) => !o && setConsenting(null)}
          title={t('consent.title', { provider })}
          route={flow}
          dataFlow={t(`consent.${flow}`, { provider, model: route.model })}
          nodes={{ device: tf('nodes.device'), server: tf('nodes.server'), provider }}
          facts={[t('consent.scope'), t('consent.names'), t('consent.retention', { provider })]}
          remember={remember}
          onRememberChange={setRemember}
          onSend={() => {
            const question = consenting;
            setConsenting(null);
            if (remember) rememberConsent(ctx.session, key);
            if (question) {
              setValue('');
              void conversation.send(question);
            }
          }}
          labels={{
            remember: t('consent.remember'),
            change: t('consent.change'),
            cancel: t('consent.cancel'),
            send: t('consent.send'),
          }}
        />
      }
      labels={{
        placeholder: t('ask.placeholder'),
        send: t('ask.send'),
        playFrom: (clock) => t('playFrom', { t: clock }),
        error: t('ask.error', { provider }),
        quota: t('ask.quota', {
          n: me.limits.asksPerDay,
          time: format.dateTime(quotaReset(), RESET_TIME),
        }),
        off: t('ask.off'),
        retry: tc('retry'),
      }}
    />
  );
}

/** Ask and Notes: the call view's side panel, and the phone sheet's content. */
export function SidePanel({
  ctx,
  me,
  call,
  onSeek,
  onMetaChange,
  tab,
  onTabChange,
}: SidePanelProps) {
  const t = useTranslations('call');
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => onTabChange(v as 'ask' | 'notes')}
      className="h-full min-h-0"
    >
      <TabsList className="shrink-0 px-3">
        <TabsTrigger value="ask">
          <MessageSquareText aria-hidden />
          {t('ask.tab')}
        </TabsTrigger>
        <TabsTrigger value="notes">
          <NotebookPen aria-hidden />
          {t('notes.tab')}
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="ask"
        forceMount
        className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
      >
        <Ask ctx={ctx} me={me} call={call} onSeek={onSeek} />
      </TabsContent>
      <TabsContent
        value="notes"
        forceMount
        className="min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden"
      >
        <Notes ctx={ctx} call={call} onMetaChange={onMetaChange} />
      </TabsContent>
    </Tabs>
  );
}
