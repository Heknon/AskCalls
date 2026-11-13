import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['{apps,packages}/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/*.int.test.ts', 'apps/web/e2e/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['{apps,packages}/**/*.int.test.ts'],
          exclude: ['**/node_modules/**'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
