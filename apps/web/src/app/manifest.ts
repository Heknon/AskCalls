import type { MetadataRoute } from 'next';

/** The installable app (spec 11.4): opens at /app, icons from the Logo's tile mark. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AskCalls',
    short_name: 'AskCalls',
    description: 'Ask your calls anything. End-to-end encrypted.',
    id: '/app',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#0E1213',
    theme_color: '#0E1213',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
