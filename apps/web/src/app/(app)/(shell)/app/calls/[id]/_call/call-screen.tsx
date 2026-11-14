'use client';

import { ApiError } from '@askcalls/api-contract';
import {
  type DecryptedCall,
  getCall,
  readRecording,
  starCall,
  transcriptFile,
  updateCallTags,
} from '@askcalls/client-core/calls';
import { type CallMeta, callStartedAt } from '@askcalls/domain';
import { CallActions } from '@askcalls/ui/components/CallActions';
import { CallHeader } from '@askcalls/ui/components/CallHeader';
import { DecryptingPlaceholder } from '@askcalls/ui/components/DecryptingPlaceholder';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import {
  RecordingPlayer,
  type RecordingPlayerHandle,
} from '@askcalls/ui/components/RecordingPlayer';
import type { SignatureBadgeProps } from '@askcalls/ui/components/SignatureBadge';
import { TranscriptSegment } from '@askcalls/ui/components/TranscriptSegment';
import { formatClock } from '@askcalls/ui/lib/format';
import { useIsPhone } from '@askcalls/ui/lib/use-media-query';
import { Alert } from '@askcalls/ui/primitives/alert';
import { Button } from '@askcalls/ui/primitives/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@askcalls/ui/primitives/sheet';
import { ArrowLeft, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nativeName } from '../../../../../../../client/i18n/language-names';
import { useNotify } from '../../../../../../../client/notices/notices';
import { useUnlocked } from '../../../../../../../client/session/session';
import { useShortcut } from '../../../../../../../client/shortcuts/shortcuts';
import { intlLocale } from '../../../../../../../i18n/locales';
import { Screen } from '../../../../_shell/screen';
import { useAsync } from '../../../../_shell/states';
import { recalledSearch } from '../../../_calls/memory';
import { contactName, DIRECTION, downloadText, tagChips } from '../../../_calls/present';
import { TagDialog } from '../../../_calls/tag-dialog';
import { useCatalogs } from '../../../_calls/use-catalogs';
import { useDeleteCall } from '../../../_calls/use-delete';
import { LanguageBar } from './language-bar';
import { SidePanel } from './side-panel';
import { speakerLabels } from './speakers';
import { ORIGINAL, useTranscriptView } from './transcript-view';

function useBackTarget() {
  const t = useTranslations('call.backTo');
  const [search] = useState(recalledSearch);
  const href = search?.query ? `/app?${search.query}` : '/app';
  const label = search?.text.trim() ? t('results', { q: search.text.trim() }) : t('calls');
  return { href, label, search };
}

/** C3: one call, decrypted on this device, with its transcript, player, notes and ask. */
export function CallScreen({ id }: { id: string }) {
  const t = useTranslations('call');
  const tc = useTranslations('common');
  const { ctx } = useUnlocked();
  const back = useBackTarget();
  const state = useAsync(() => getCall(ctx, id), [ctx, id]);

  const topStart = (
    <Link
      href={back.href}
      className="inline-flex min-w-0 items-center gap-2 rounded-sm text-primary text-sm hover:underline"
    >
      <ArrowLeft className="icon-directional size-4 shrink-0" aria-hidden />
      <bdi className="truncate">{back.label}</bdi>
    </Link>
  );

  if (state.status === 'error') {
    const e = state.error;
    const notFound = e instanceof ApiError && e.status === 404;
    const server = e instanceof ApiError && !notFound;
    return (
      <Screen
        title={t('title')}
        back={{ href: back.href, label: t('back') }}
        topStart={topStart}
        width="reading"
      >
        <ErrorState
          scope="page"
          title={
            notFound ? tc('notFound.title') : server ? tc('error.title') : t('decryptFailed.title')
          }
          description={
            notFound
              ? t('notFound')
              : server
                ? tc('error.body')
                : t('decryptFailed.body', { id: id.slice(0, 8) })
          }
          retry={server ? { label: tc('retry'), onRetry: state.reload } : undefined}
          actions={
            <Button variant="outline" asChild>
              <Link href="/app">{tc('goToCalls')}</Link>
            </Button>
          }
        />
      </Screen>
    );
  }

  if (state.status === 'loading') {
    return (
      <Screen
        title={t('title')}
        back={{ href: back.href, label: t('back') }}
        topStart={topStart}
        width="reading"
      >
        <div aria-busy="true" className="flex flex-col gap-6">
          <CallHeader
            call="locked"
            signature={{ status: 'missing', label: '' }}
            locale="en"
            onStarredChange={() => {}}
            onAddTag={() => {}}
            actions={null}
            labels={{
              star: tc('star'),
              unstar: tc('unstar'),
              hiddenNumber: tc('hiddenNumber'),
              direction: {
                incoming: tc('incoming'),
                outgoing: tc('outgoing'),
                unknown: tc('unknownDirection'),
              },
              addTag: t('tag.add'),
              decrypting: tc('decrypting'),
            }}
          />
          {Array.from({ length: 4 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders
            <DecryptingPlaceholder key={i} shape="paragraph" />
          ))}
        </div>
      </Screen>
    );
  }

  return <CallView key={state.data.id} initial={state.data} back={back} topStart={topStart} />;
}

function signatureOf(
  call: DecryptedCall,
  t: ReturnType<typeof useTranslations<'call'>>,
): SignatureBadgeProps {
  const s = call.signature;
  switch (s.status) {
    case 'valid':
      return s.deviceRevoked
        ? { status: 'unknown-device', label: t('sig.unknown') }
        : { status: 'verified', label: t('sig.verified', { device: s.deviceLabel }) };
    case 'unknown_device':
      return { status: 'unknown-device', label: t('sig.unknown') };
    case 'invalid':
      return { status: 'invalid', label: t('sig.invalid') };
    default:
      return { status: 'missing', label: t('sig.missing') };
  }
}

function CallView({
  initial,
  back,
  topStart,
}: {
  initial: DecryptedCall;
  back: ReturnType<typeof useBackTarget>;
  topStart: ReactNode;
}) {
  const t = useTranslations('call');
  const tc = useTranslations('common');
  const tk = useTranslations('shell.shortcuts.keys');
  const { ctx, client, me } = useUnlocked();
  const notify = useNotify();
  const router = useRouter();
  const locale = intlLocale(useLocale());
  const isPhone = useIsPhone();
  const catalogs = useCatalogs(ctx);
  const deleteCall = useDeleteCall(ctx);
  const [call, setCall] = useState(initial);
  const [tagging, setTagging] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<'ask' | 'notes'>('ask');
  const [time, setTime] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  const [follow, setFollow] = useState(true);
  const [recording, setRecording] = useState<{
    state: 'decrypting' | 'ready' | 'error';
    src?: string;
  }>(initial.recording ? { state: 'decrypting' } : { state: 'ready' });
  const player = useRef<RecordingPlayerHandle>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const meta = call.meta;
  const segments = call.transcript.segments;
  const duration = meta.durationSec ?? segments.at(-1)?.end ?? 0;
  const hasRecording = initial.recording !== null;

  useEffect(() => {
    if (!initial.recording) return;
    let url: string | undefined;
    let stale = false;
    readRecording(ctx, initial).then(
      (bytes) => {
        if (stale) return;
        url = client.blobUrls.create(new Blob([bytes as BlobPart], { type: 'audio/ogg' }));
        bytes.fill(0);
        setRecording({ state: 'ready', src: url });
      },
      () => !stale && setRecording({ state: 'error' }),
    );
    return () => {
      stale = true;
      if (url) client.blobUrls.revoke(url);
    };
  }, [ctx, client, initial]);

  const forms = back.search?.forms ?? [];
  const tv = useTranscriptView(
    call,
    forms,
    back.search?.matched?.[call.id],
    catalogs.contacts.map((c) => c.name),
  );
  const cols = tv.shown.length;
  const hitSegments = useMemo(
    () => segments.flatMap((_, i) => (tv.shown.some((c) => c.hits[i]?.length) ? [i] : [])),
    [segments, tv.shown],
  );
  const [hitIndex, setHitIndex] = useState(0);

  const scrollToSegment = useCallback(
    (index: number) => {
      const el = listRef.current?.children[index * cols] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    [cols],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on the matched passage
  useEffect(() => {
    const at = tv.startSegment ?? hitSegments[0];
    if (at !== undefined) scrollToSegment(at);
  }, []);

  const gotoHit = (by: number) => {
    if (!hitSegments.length) return;
    const next = (hitIndex + by + hitSegments.length) % hitSegments.length;
    setHitIndex(next);
    scrollToSegment(hitSegments[next]!);
  };

  const playingIndex =
    hasRecording && time > 0 ? segments.findLastIndex((s) => s.start <= time) : -1;

  useEffect(() => {
    if (follow && playingIndex >= 0 && time > 0) {
      const el = listRef.current?.children[playingIndex * cols] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [playingIndex, follow, time, cols]);

  useEffect(() => {
    const stop = () => setFollow(false);
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchmove', stop, { passive: true });
    return () => {
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchmove', stop);
    };
  }, []);

  const seek = (seconds: number) => {
    const index = segments.findIndex((s) => s.start === seconds);
    if (hasRecording && recording.state === 'ready') {
      setFollow(true);
      player.current?.seek(seconds, true);
    } else {
      const at = index >= 0 ? index : segments.findIndex((s) => s.end > seconds);
      if (at >= 0) {
        setFocused(at);
        scrollToSegment(at);
      }
    }
  };

  const audio = () =>
    document.querySelector<HTMLAudioElement>('[data-component="RecordingPlayer"] audio');

  const star = async (starred: boolean) => {
    const before = call;
    setCall((c) => ({ ...c, starred }));
    try {
      const tagToks = await starCall(ctx, call, starred);
      const directory = await ctx.tagDirectory();
      setCall((c) => ({ ...c, starred, tagToks, tags: directory.resolve(tagToks) }));
    } catch {
      setCall(before);
      notify({ kind: 'error', title: t('starFailed') });
    }
  };

  const setTags = async (tagToks: bigint[]) => {
    const directory = await ctx.tagDirectory();
    setCall((c) => ({ ...c, tagToks, tags: directory.resolve(tagToks) }));
  };

  const removeTag = async (tagId: string) => {
    try {
      await setTags(await updateCallTags(ctx, call, { remove: [tagId] }));
    } catch {
      notify({ kind: 'error', title: t('tags.failed') });
    }
  };

  const onMetaChange = useCallback((m: CallMeta) => setCall((c) => ({ ...c, meta: m })), []);

  const results = back.search?.ids ?? [];
  const position = results.indexOf(call.id);
  const neighbour = (by: number) => {
    const next = results[position + by];
    if (position >= 0 && next) router.push(`/app/calls/${next}`);
  };

  const focusAsk = () => {
    setTab('ask');
    if (isPhone) setPanelOpen(true);
    setTimeout(
      () =>
        document
          .querySelector<HTMLTextAreaElement>('[data-component="AskPanel"] textarea')
          ?.focus(),
      50,
    );
  };

  useShortcut({
    keys: [' '],
    group: 'callView',
    label: tk('playPause'),
    enabled: hasRecording && recording.state === 'ready',
    run: (e) => {
      e.preventDefault();
      const a = audio();
      if (!a) return;
      if (a.paused) void a.play();
      else a.pause();
    },
  });
  useShortcut({
    keys: ['ArrowLeft'],
    displayKeys: ['←', '→'],
    group: 'callView',
    label: tk('seek'),
    enabled: hasRecording && recording.state === 'ready',
    run: () => player.current?.seek(time - 5),
  });
  useShortcut({
    keys: ['ArrowRight'],
    enabled: hasRecording && recording.state === 'ready',
    run: () => player.current?.seek(time + 5),
  });
  useShortcut({
    keys: ['n'],
    displayKeys: ['n', '⇧N'],
    group: 'callView',
    label: tk('nextHit'),
    enabled: hitSegments.length > 0,
    run: () => gotoHit(1),
  });
  useShortcut({ keys: ['N'], enabled: hitSegments.length > 0, run: () => gotoHit(-1) });
  useShortcut({
    keys: ['s'],
    group: 'callView',
    label: tk('star'),
    run: () => void star(!call.starred),
  });
  useShortcut({ keys: ['t'], group: 'callView', label: tk('tags'), run: () => setTagging(true) });
  useShortcut({ keys: ['a'], group: 'callView', label: tk('ask'), run: focusAsk });
  useShortcut({
    keys: ['j'],
    displayKeys: ['j', 'k'],
    group: 'callView',
    label: tk('nextPrevious'),
    enabled: position >= 0,
    run: () => neighbour(1),
  });
  useShortcut({ keys: ['k'], enabled: position >= 0, run: () => neighbour(-1) });
  useShortcut({ keys: ['Escape'], run: () => router.push(back.href) });

  const name = contactName(meta, catalogs.contacts);
  const signature = signatureOf(call, t);
  const labels = speakerLabels(segments, {
    you: t('you'),
    speaker: (n) => t('speaker', { n }),
  });
  const noRecording = hasRecording ? undefined : t('noRecording');

  const panel = (
    <SidePanel
      ctx={ctx}
      me={me}
      call={call}
      onSeek={(s) => {
        if (isPhone) setPanelOpen(false);
        seek(s);
      }}
      onMetaChange={onMetaChange}
      tab={tab}
      onTabChange={setTab}
    />
  );

  return (
    <Screen
      title={t('title')}
      back={{ href: back.href, label: t('back') }}
      topStart={topStart}
      width="reading"
      titleHidden
      aside={
        isPhone ? undefined : (
          <aside
            aria-label={t('panel')}
            className="sticky top-(--header-height) flex h-[calc(100dvh-var(--header-height))] w-80 shrink-0 flex-col border-border border-s bg-card xl:w-(--panel-width)"
          >
            {panel}
          </aside>
        )
      }
    >
      <div className="flex min-h-[calc(100dvh-10rem)] flex-col gap-4">
        <CallHeader
          call={{
            name,
            phone: meta.phoneE164 ?? undefined,
            direction: DIRECTION[meta.direction],
            startedAt: callStartedAt(call, meta.startedAt),
            durationSec: duration,
            starred: call.starred,
            tags: tagChips(call.tags, catalogs.intentLabel).map((chip) => ({
              ...chip,
              onRemove: () => void removeTag(chip.id),
              removeLabel: t('tags.remove', { name: chip.name }),
            })),
          }}
          signature={signature}
          locale={locale}
          onStarredChange={(v) => void star(v)}
          onAddTag={() => setTagging(true)}
          labels={{
            star: tc('star'),
            unstar: tc('unstar'),
            hiddenNumber: tc('hiddenNumber'),
            direction: {
              incoming: tc('incoming'),
              outgoing: tc('outgoing'),
              unknown: tc('unknownDirection'),
            },
            addTag: t('tag.add'),
          }}
          actions={
            <CallActions
              phone={meta.phoneE164 ?? undefined}
              downloadFormats={[
                { key: 'txt', label: t('downloadTxt') },
                { key: 'srt', label: t('downloadSrt') },
              ]}
              onDownload={(f) => downloadText(transcriptFile(call, f === 'srt' ? 'srt' : 'txt'))}
              onDelete={() => {
                deleteCall(call.id, {
                  decrypted: call,
                  onUndo: () => router.push(`/app/calls/${call.id}`),
                });
                router.push(back.href);
              }}
              hits={
                hitSegments.length && !isPhone
                  ? {
                      index: hitIndex + 1,
                      count: hitSegments.length,
                      onPrevious: () => gotoHit(-1),
                      onNext: () => gotoHit(1),
                    }
                  : undefined
              }
              askButton={
                <Button variant="secondary" size="sm" onClick={() => setPanelOpen(true)}>
                  <MessageSquareText className="size-4" aria-hidden />
                  {t('ask.button')}
                </Button>
              }
              labels={{
                whatsapp: t('whatsapp'),
                callBack: t('callBack'),
                noNumber: t('noNumber'),
                download: t('download'),
                more: t('more'),
                delete: t('delete.action'),
                deleteTitle: t('delete.title'),
                deleteBody: t('delete.body'),
                cancel: tc('cancel'),
                hit: (i, n) => t('hit', { i, n }),
                previousHit: t('hitPrevious'),
                nextHit: t('hitNext'),
              }}
            />
          }
        />
        {call.signature.status === 'invalid' ? (
          <Alert tone="destructive">{t('sig.invalidBanner')}</Alert>
        ) : null}
        <LanguageBar
          tv={tv}
          originalLanguage={meta.language}
          providers={Object.fromEntries(
            Object.entries(call.transcript.translations ?? {}).map(([l, x]) => [l, x.provider]),
          )}
        />
        {cols > 1 ? (
          <div aria-hidden className="grid grid-cols-2 gap-x-4 border-border border-b pb-1">
            {tv.shown.map((c) => (
              <p key={c.view} className="px-3.5 font-medium text-muted-foreground text-xs">
                {c.view === ORIGINAL
                  ? t('lang.original')
                  : t('lang.column', { language: nativeName(c.view) })}
              </p>
            ))}
          </div>
        ) : null}
        {segments.length === 0 ? (
          <p className="py-6 text-muted-foreground">{t('noSpeech')}</p>
        ) : null}
        <ol
          ref={listRef}
          data-columns={cols}
          className={
            cols > 1
              ? 'm-0 grid list-none grid-cols-2 gap-x-4 gap-y-1 p-0'
              : 'm-0 flex list-none flex-col gap-1 p-0'
          }
        >
          {segments.flatMap((s, i) =>
            tv.shown.map((c) => {
              const seg = c.segments[i] ?? s;
              return (
                <TranscriptSegment
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments are fixed for the call
                  key={`${c.view}-${i}`}
                  speaker={labels[i]!.name}
                  isYou={labels[i]!.isYou}
                  start={s.start}
                  text={seg.text}
                  hits={c.hits[i]}
                  playing={i === playingIndex || i === focused}
                  groupedWithPrevious={
                    cols === 1 && i > 0 && s.speaker === segments[i - 1]!.speaker
                  }
                  onSeek={seek}
                  playFromLabel={t('playFrom', { t: formatClock(s.start) })}
                  noRecordingHint={noRecording}
                />
              );
            }),
          )}
        </ol>
        {hasRecording ? (
          <div className="sticky bottom-0 z-10 mt-auto -mx-4 border-border border-t bg-card px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:-mx-6 md:px-6">
            {!follow && playingIndex >= 0 ? (
              <Button
                variant="secondary"
                size="sm"
                className="absolute -top-11 start-1/2 rounded-full shadow-md ltr:-translate-x-1/2 rtl:translate-x-1/2"
                onClick={() => setFollow(true)}
              >
                {t('backToPlayback')}
              </Button>
            ) : null}
            <RecordingPlayer
              ref={player}
              src={recording.src}
              state={recording.state}
              durationSec={duration}
              hits={hitSegments.map((i) => segments[i]!.start)}
              onTimeUpdate={setTime}
              locale={locale}
              labels={{
                play: t('player.play'),
                pause: t('player.pause'),
                back: t('player.back'),
                forward: t('player.forward'),
                position: t('player.position'),
                speed: t('player.speed'),
                of: (current, total) => t('player.of', { current, total }),
                error: t('player.error'),
              }}
            />
          </div>
        ) : null}
      </div>
      {isPhone ? (
        <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
          <SheetContent side="bottom" className="h-[88dvh] max-h-[88dvh]">
            <SheetTitle className="sr-only">{t('panel')}</SheetTitle>
            <SheetDescription className="sr-only">{t('ask.placeholder')}</SheetDescription>
            {panel}
          </SheetContent>
        </Sheet>
      ) : null}
      {tagging ? (
        <TagDialog
          open
          onOpenChange={setTagging}
          ctx={ctx}
          call={call}
          selected={call.tags.filter((x) => x.kind === 'tag').map((x) => x.id)}
          catalog={catalogs.tags}
          onCatalogChange={catalogs.reload}
          onChange={(toks) => void setTags(toks)}
        />
      ) : null}
    </Screen>
  );
}
