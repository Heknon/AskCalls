import type { NextConfig } from 'next';

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
  // The CSP for /app/** and /admin/** is set per request by middleware (nonce for Next.js
  // bootstrap scripts).
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
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default config;
