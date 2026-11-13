import { getTranslations } from 'next-intl/server';
import type { Locale } from '../../../i18n/locales';
import { MARKETING_CALL } from '../_data/sample-call';

const clock = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** 120 bars of a made-up waveform, the first half played. SVG attributes, so no inline style. */
function Waveform() {
  const bars = Array.from({ length: 120 }, (_, i) => {
    const a =
      Math.abs(Math.sin(i * 0.37) * 0.6 + Math.sin(i * 0.11) * 0.3) + ((i * 7919) % 13) / 37;
    return Math.round(8 + a * 26);
  });
  return (
    <svg className="wave" viewBox="0 0 600 36" preserveAspectRatio="none" aria-hidden>
      {bars.map((h, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed bars, never reordered
          key={i}
          x={i * 5}
          y={(36 - h) / 2}
          width="3"
          height={h}
          rx="1.5"
          className={i < 61 ? 'fill-[var(--fg)] opacity-55' : 'fill-[var(--line-2)]'}
        />
      ))}
    </svg>
  );
}

/**
 * The call view at full container width, cropped at the end edge: the transcript with the
 * cited turn and the Ask panel answering from it. Static markup in the app's layout.
 */
export async function CallViewCrop({ locale }: { locale: Locale }) {
  const t = await getTranslations('marketing.home.callView');
  const call = MARKETING_CALL[locale];
  const cited = call.segments[call.cited]!;
  return (
    <div className="crop">
      <section className="app" data-component="CallView" aria-label={t('label')}>
        <div className="tr">
          <div className="tr-h">
            <span className="nm">{call.contactName}</span>
            <span className="meta">
              <bdi className="tab">{call.phone}</bdi> · {t('when')} · {t('duration')}
            </span>
            <span className="tags">
              <span className="tag">{call.tag}</span>
              <span className="tag">{t('tagQuote')}</span>
            </span>
          </div>
          <div className="turns" data-component="Transcript">
            {call.segments.map((s, i) => (
              <div key={s.start} className={i === call.cited ? 'turn cited' : 'turn'}>
                <span className="ts">{clock(s.start)}</span>
                <div>
                  <div className="sp">{s.speaker}</div>
                  <p dir="auto">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="player" data-component="RecordingPlayer">
            <span className="play" aria-hidden>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
              </svg>
            </span>
            <span className="tm">{clock(cited.start)}</span>
            <Waveform />
            <span className="tm">{clock(call.durationSec)}</span>
          </div>
        </div>
        <aside className="ask" data-component="AskPanel">
          <div className="ask-h">{t('askTitle')}</div>
          <div className="ask-b">
            <div className="bub" dir="auto">
              {t('question')}
            </div>
            <p className="ans" dir="auto">
              {t('answer')}
              <span className="cite">
                <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
                  <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
                </svg>
                <bdi>{clock(cited.start)}</bdi>
              </span>
            </p>
            <p className="flow" data-component="DataFlowNote">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>{t('flow')}</span>
            </p>
          </div>
          <div className="ask-in">{t('followUp')}</div>
        </aside>
      </section>
    </div>
  );
}
