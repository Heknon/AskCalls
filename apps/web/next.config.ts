import type { NextConfig } from 'next';

/**
 * Strict CSP for app routes (spec 2.4). Blob-storage and own-key provider origins are added at
 * runtime by middleware once the config service knows them; this is the static baseline.
 */
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    '@askcalls/domain',
    '@askcalls/api-contract',
    '@askcalls/client-core',
    '@askcalls/crypto',
    '@askcalls/indexing',
    '@askcalls/transcript-formats',
    '@askcalls/ui',
    '@askcalls/adapter-mocks',
    '@askcalls/adapter-runtime',
    '@askcalls/adapter-blob-fs',
    '@askcalls/adapter-blob-s3',
    '@askcalls/adapter-transcription-elevenlabs',
    '@askcalls/adapter-transcription-openai',
    '@askcalls/adapter-transcription-deepgram',
    '@askcalls/adapter-transcription-soniox',
    '@askcalls/adapter-transcription-openai-compatible',
    '@askcalls/adapter-llm-ai-sdk',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
        ],
      },
      { source: '/app/:path*', headers: [{ key: 'Content-Security-Policy', value: APP_CSP }] },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default config;
