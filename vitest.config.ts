import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'vmThreads',
    include: [
      'src/**/*.{test,spec}.{js,ts}',
      'tests/**/*.{test,spec}.{js,ts}'
    ],
    exclude: [
      'node_modules',
      'dist',
      'tests/deno-integration.test.ts',
      'tests/bun.test.ts',
      'tests/deno-simple.test.ts'
    ],
    testTimeout: 10000,
    hookTimeout: 10000
  }
});