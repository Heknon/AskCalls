import '@askcalls/ui/marketing.css';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { preload } from 'react-dom';

const DISPLAY_FONT = '/fonts/plex-sans-500-latin1-1.1.0.woff2';

/**
 * The public site. Rendered per request: middleware puts a CSP nonce on Next.js's bootstrap
 * scripts, and the language comes from the cookie or Accept-Language. The pages read no data,
 * and the root layout leaves out the app's client providers here (see middleware), so the only
 * component script is the home page's search demo.
 */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  await headers();
  preload(DISPLAY_FONT, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  return <div className="mk mk-page">{children}</div>;
}
