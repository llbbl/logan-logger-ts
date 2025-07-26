import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/core': resolve(__dirname, './src/core'),
      '@/utils': resolve(__dirname, './src/utils'),
      '@/runtime': resolve(__dirname, './src/runtime'),
      '@/formatters': resolve(__dirname, './src/formatters'),
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        node: resolve(__dirname, 'src/node.ts'),
        deno: resolve(__dirname, 'src/deno.ts'),
        bun: resolve(__dirname, 'src/bun.ts'),
        browser: resolve(__dirname, 'src/browser.ts'),
      },
      name: 'LoganLogger',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'esm.js' : 'js'}`,
    },
    rollupOptions: {
      // External dependencies that shouldn't be bundled
      external: ['winston'],
      output: {
        exports: 'named',
        globals: {
          winston: 'winston',
        },
      },
    },
    target: 'es2020',
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
      ],
    },
  },
});