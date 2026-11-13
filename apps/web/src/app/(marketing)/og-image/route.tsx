import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import data from '../_data/diagram.generated.json';
import { OG_IMAGE } from '../_data/routes';

export const dynamic = 'force-static';

const size = { width: OG_IMAGE.width, height: OG_IMAGE.height };

const FONTS = join(process.cwd(), '../../packages/ui/node_modules/@ibm');

/**
 * The share card, generated at build time: the hero's headline on the ink ground, over the first
 * bytes of the sample call's real ciphertext.
 */
export async function GET() {
  const [medium, mono] = await Promise.all([
    readFile(join(FONTS, 'plex-sans/fonts/complete/woff/IBMPlexSans-Medium.woff')),
    readFile(join(FONTS, 'plex-mono/fonts/complete/woff/IBMPlexMono-Regular.woff')),
  ]);
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
        justifyContent: 'space-between',
        padding: '72px 80px',
        backgroundColor: '#070B0C',
        backgroundImage:
          'radial-gradient(circle at 75% 110%, rgba(59,191,174,0.20), rgba(7,11,12,0) 55%)',
        color: '#ECF1F2',
        fontFamily: 'Plex',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 34 }}>
        <svg width="40" height="40" viewBox="6 4 24 24" aria-hidden>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ fontSize: 112, lineHeight: 0.95, letterSpacing: -5, display: 'flex' }}>
          Ask your calls anything.
        </div>
        <div style={{ fontSize: 34, color: '#8E9B9E', display: 'flex' }}>
          End-to-end encrypted. We can't read your calls.
        </div>
      </div>
      <div style={{ fontFamily: 'Mono', fontSize: 22, color: '#7D898C', display: 'flex' }}>
        {data.en.transcriptCt
          .slice(0, 42)
          .replace(/^(..)(.{8})(.{8})(.{8})(.{8})(.{8})$/, '$1 $2 $3 $4 $5 $6')}{' '}
        · askcalls.com
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Plex', data: medium, weight: 500, style: 'normal' },
        { name: 'Mono', data: mono, weight: 400, style: 'normal' },
      ],
    },
  );
}
