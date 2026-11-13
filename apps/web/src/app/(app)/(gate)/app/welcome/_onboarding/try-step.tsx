'use client';

import { getCall } from '@askcalls/client-core/calls';
import { ingestCall } from '@askcalls/client-core/ingest';
import { highlightRanges, type SearchResponse, searchCalls } from '@askcalls/client-core/search';
import { CallRow } from '@askcalls/ui/components/CallRow';
import { EmptyState } from '@askcalls/ui/components/EmptyState';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { GateHeading } from '@askcalls/ui/components/Gate';
import { JobProgress } from '@askcalls/ui/components/JobProgress';
import { ResultLine } from '@askcalls/ui/components/ResultLine';
import { SearchBox } from '@askcalls/ui/components/SearchBox';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { EmbedderStatus } from '../../../../../../client/adapters/embedder/embedder';
import type { BrowserClient } from '../../../../../../client/browser-client';
import { useAppSession } from '../../../../../../client/session/session';
import { intlLocale } from '../../../../../../i18n/locales';
import { SAMPLE_CALLS, sampleStartedAt } from './sample-calls';
import { reportActivation } from './telemetry';

type Imported = { callId: string };

const DIRECTION = { in: 'incoming', out: 'outgoing', unknown: 'unknown' } as const;

/** O5: import the bundled sample call, then a guided search with a typo that still finds it. */
const MB = 1024 * 1024;

/** The model's first-load download while importing; nothing once it is cached or ready. */
function useEmbedderStatus(client: BrowserClient): EmbedderStatus | null {
  const [status, setStatus] = useState(() => client.embedderStatus());
  useEffect(() => client.onEmbedderStatus(setStatus), [client]);
  return status;
}

export function TryStep({ client, onNext }: { client: BrowserClient; onNext: () => void }) {
  const { ctx } = client;
  const model = useEmbedderStatus(client);
  const { refreshMe } = useAppSession();
  const t = useTranslations('onboarding.try');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [lang, setLang] = useState<'en' | 'he'>(locale === 'he' ? 'he' : 'en');
  const sample = SAMPLE_CALLS[lang];
  const [importing, setImporting] = useState(false);
  const [importFailed, setImportFailed] = useState(false);
  const [imported, setImported] = useState<Imported | null>(null);
  const [text, setText] = useState(sample.query);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [passage, setPassage] = useState<{ id: string; text: string; hits: string[] } | null>(null);

  const importSample = async () => {
    setImporting(true);
    setImportFailed(false);
    const r = await ingestCall(ctx, {
      source: 'app',
      transcript: { segments: sample.segments, language: sample.language },
      meta: {
        phone: sample.phone,
        contactName: sample.contactName,
        direction: sample.direction,
        startedAt: sampleStartedAt(sample),
      },
    });
    setImporting(false);
    if (r.status === 'failed') return setImportFailed(true);
    refreshMe().catch(() => {});
    setText(sample.query);
    setImported({ callId: r.status === 'done' ? r.callId : r.existingId });
  };

  useEffect(() => {
    if (!imported) return;
    let stale = false;
    const timer = setTimeout(() => {
      searchCalls(ctx, { text, limit: 5 }).then(
        (r) => {
          if (stale) return;
          setSearchFailed(false);
          setExcluded([]);
          setResult(r);
          if (r.items.length > 0) reportActivation();
        },
        () => !stale && setSearchFailed(true),
      );
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [ctx, imported, text]);

  const item = result?.items.find((i) => i.id === imported?.callId) ?? result?.items[0];

  // A keyword search returns no passage (the server can't see words): take the first turn of
  // the decrypted transcript that holds a searched form.
  useEffect(() => {
    if (!item || !result) return setPassage(null);
    if (item.snippet) {
      const text = item.snippet;
      return setPassage({
        id: item.id,
        text,
        hits: item.highlights.map((h) => text.slice(h.start, h.end)),
      });
    }
    let stale = false;
    const forms = new Set(result.alsoMatched.map((w) => w.toLowerCase()));
    getCall(ctx, item.id).then(
      (call) => {
        if (stale) return;
        for (const seg of call.transcript.segments) {
          const ranges = highlightRanges(seg.text, forms);
          if (ranges.length) {
            return setPassage({
              id: item.id,
              text: seg.text,
              hits: ranges.map((r) => seg.text.slice(r.start, r.end)),
            });
          }
        }
        setPassage(null);
      },
      () => !stale && setPassage(null),
    );
    return () => {
      stale = true;
    };
  }, [ctx, item, result]);

  const intl = intlLocale(locale);

  return (
    <>
      <GateHeading
        title={t('title')}
        description={
          <>
            <p>{t('body')}</p>
            <p data-slot="translation-note">
              {t.rich('translation', {
                link: (c) => <Link href="/app/settings/providers">{c}</Link>,
              })}
            </p>
          </>
        }
      />
      {!imported ? (
        <div className="flex flex-col gap-3">
          {importFailed ? (
            <ErrorState
              scope="inline"
              title={model?.state === 'failed' ? t('modelFailed') : t('failed')}
            />
          ) : null}
          {importing && model?.state === 'loading' ? (
            <JobProgress
              done={model.progress.loaded}
              total={model.progress.total}
              label={t('loadingModel', {
                loaded: Math.round(model.progress.loaded / MB),
                total: Math.round(model.progress.total / MB),
              })}
              labels={{ pause: '', resume: '', stop: '', progress: t('loadingModelLabel') }}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="lg"
              autoFocus
              loading={importing}
              onClick={importSample}
            >
              {importing ? t('importing') : t('import')}
            </Button>
            <Button
              variant="link"
              disabled={importing}
              onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
            >
              {lang === 'he' ? t('useEnglish') : t('useHebrew')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p role="status">{lang === 'he' ? t('searchHintHe') : t('searchHintEn')}</p>
          <search>
            <SearchBox
              value={text}
              onChange={setText}
              placeholder={t('searchPlaceholder')}
              labels={{ search: t('search'), clear: t('clear') }}
              slashShortcut={false}
            />
          </search>
          {searchFailed ? (
            <ErrorState scope="inline" title={t('searchFailed')} />
          ) : (
            <ResultLine
              total={result?.items.length}
              formatTotal={(n) => t('total', { n })}
              variants={(result?.alsoMatched ?? [])
                .filter((v) => !excluded.includes(v))
                .map((term) => ({ term, onExclude: () => setExcluded((x) => [...x, term]) }))}
              labels={{
                alsoMatched: t('alsoMatched'),
                exclude: (term) => t('exclude', { term }),
                sort: t('sort'),
              }}
              sort={{
                value: 'best',
                options: [{ value: 'best', label: t('sortBest') }],
                onChange: () => {},
              }}
            />
          )}
          {item ? (
            <Card className="overflow-hidden">
              <CallRow
                context="search"
                href={`/app/calls/${item.id}`}
                linkAs={Link}
                locale={intl}
                call={{
                  name: item.meta.contactName ?? undefined,
                  phone: item.meta.phoneE164 ?? undefined,
                  direction: DIRECTION[item.meta.direction],
                  startedAt: new Date(item.meta.startedAt ?? Date.now()),
                  durationSec: item.meta.durationSec ?? 0,
                  starred: item.starred,
                  tags: [],
                  ...(passage?.id === item.id && {
                    snippet: { text: passage.text, hits: passage.hits },
                  }),
                }}
                labels={{
                  star: tc('star'),
                  unstar: tc('unstar'),
                  hiddenNumber: tc('hiddenNumber'),
                  moreActions: tc('moreActions'),
                  direction: {
                    incoming: tc('incoming'),
                    outgoing: tc('outgoing'),
                    unknown: tc('unknownDirection'),
                  },
                }}
              />
            </Card>
          ) : result ? (
            <EmptyState reason="no-results" title={t('noMatch')} />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="lg" onClick={onNext}>
              {t('next')}
            </Button>
            {item ? (
              <Button variant="ghost" size="lg" asChild>
                <Link href={`/app/calls/${item.id}`}>{t('open')}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
