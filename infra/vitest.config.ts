import { defineConfig } from 'vitest/config';

// Synthesizing a stack takes a few seconds the first time (aws-cdk-lib is large).
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 60_000 },
});
