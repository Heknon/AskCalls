import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import messages from '../../../i18n/messages/en/marketing.json';
import { OG_IMAGE } from '../_data/routes';

export const dynamic = 'force-static';

const size = { width: OG_IMAGE.width, height: OG_IMAGE.height };

const FONTS = join(process.cwd(), '../../packages/ui/node_modules/@ibm');

/**
 * The share card, generated at build time: the home page hero in small, its headline over the
 * search box with the demo's first query and the call it finds by meaning.
 */
export async function GET() {
  const [regular, medium, mono] = await Promise.all([
    readFile(join(FONTS, 'plex-sans/fonts/complete/woff/IBMPlexSans-Regular.woff')),
    readFile(join(FONTS, 'plex-sans/fonts/complete/woff/IBMPlexSans-Medium.woff')),
    readFile(join(FONTS, 'plex-mono/fonts/complete/woff/IBMPlexMono-Regular.woff')),
  ]);
  const { demo } = messages.home;
  const { query, rows } = demo.queries.first;
  const row = rows.a;
  const bars = [
    [9, 13, 19],
    [13, 10, 22],
    [17, 12.5, 19.5],
    [21, 9, 23],
  ];
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '52px 72px',
        backgroundColor: '#070B0C',
        backgroundImage:
          'radial-gradient(circle at 70% 75%, rgba(59,191,174,0.16), rgba(7,11,12,0) 55%)',
        color: '#ECF1F2',
        fontFamily: 'Plex',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 28, fontWeight: 500 }}
      >
        <svg width="34" height="34" viewBox="6 4 24 24" aria-hidden>
          {bars.map(([x, y1, y2]) => (
            <line
              key={x}
              x1={x}
              x2={x}
              y1={y1}
              y2={y2}
              stroke="#3BBFAE"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          ))}
          <rect x="23.6" y="5" width="4.4" height="4.4" rx="1.2" fill="#3BBFAE" />
        </svg>
        AskCalls
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginTop: 40,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 100,
            fontWeight: 500,
            lineHeight: 0.92,
            letterSpacing: -4.5,
          }}
        >
          <span>Ask your calls</span>
          <span>anything.</span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 26,
            lineHeight: 1.35,
            paddingBottom: 8,
          }}
        >
          <span>End-to-end encrypted.</span>
          <span style={{ color: '#8E9B9E' }}>We can&apos;t read your calls.</span>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          marginTop: 44,
          height: 76,
          padding: '0 26px',
          borderRadius: 18,
          border: '1px solid rgba(236,241,242,0.14)',
          backgroundColor: 'rgba(236,241,242,0.05)',
          fontSize: 30,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="#8E9B9E" strokeWidth="2" />
          <line
            x1="16.5"
            y1="16.5"
            x2="21"
            y2="21"
            stroke="#8E9B9E"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span style={{ flex: 1 }}>{query}</span>
        <span style={{ fontSize: 20, color: '#C6D0D2' }}>{demo.meaning}</span>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            width: 46,
            height: 26,
            padding: 3,
            borderRadius: 13,
            backgroundColor: '#3BBFAE',
          }}
        >
          <div style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#0B2A27' }} />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginTop: 26,
          padding: '0 26px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontSize: 22, fontWeight: 500 }}>{row.name}</span>
          <span style={{ fontFamily: 'Mono', fontSize: 17, color: '#7D898C' }}>{row.phone}</span>
          <span style={{ marginLeft: 'auto', fontSize: 17, color: '#7D898C' }}>{row.when}</span>
        </div>
        <div style={{ display: 'flex', fontSize: 25 }}>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: 4,
              backgroundColor: 'rgba(214,170,60,0.28)',
              color: '#F4E6C0',
            }}
          >
            {row.hit}
          </span>
          <span style={{ marginLeft: 6 }}>{row.after.trim()}</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 6,
            fontFamily: 'Mono',
            fontSize: 16,
            color: '#7D898C',
          }}
        >
          <div style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#3BBFAE' }} />
          {`${demo.matched} · ${demo.decrypted.replace('{ms}', '31')}`}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Plex', data: regular, weight: 400, style: 'normal' },
        { name: 'Plex', data: medium, weight: 500, style: 'normal' },
        { name: 'Mono', data: mono, weight: 400, style: 'normal' },
      ],
    },
  );
}
