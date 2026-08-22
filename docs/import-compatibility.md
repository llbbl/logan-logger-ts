# Import Compatibility Guide

This page records the import behavior around
[#43](https://github.com/llbbl/logan-logger-ts/issues/43) and the shape the
package supports after the dual-publish layout was corrected.

## TL;DR

| Runner | Recommended import |
|--------|---------------------|
| Node ESM (`type: module` or `.mjs` files) | `import { logger, createLogger } from 'logan-logger'` |
| Vite / Vitest / esbuild bundle | `import { logger, createLogger } from 'logan-logger'` |
| Astro / Next.js / Remix bundled code | `import { logger, createLogger } from 'logan-logger'` |
| `tsx` / `ts-node` | `import { logger, createLogger } from 'logan-logger'` |
| CommonJS `require` | `const { logger, createLogger } = require('logan-logger');` |

With the corrected package layout, the public API is named exports for ESM
consumers and property access on the CommonJS `require()` result.

## Historical note

Versions published before the #43 fix shipped ESM entry files ending in `.js`
while the package had no `"type": "module"`. That made Node treat the ESM
entry as CommonJS, so toolchains disagreed on which import shape worked. The
fix publishes explicit `.mjs` and `.cjs` entry points and chunks so the runtime
does not need to guess.

## Related

- [#42](https://github.com/llbbl/logan-logger-ts/issues/42) — JSR distribution
  silently falls back to console logging because the bare `winston` import is
  rewritten to `./winston` during publish. The npm distribution is unaffected.
- [#43](https://github.com/llbbl/logan-logger-ts/issues/43) — npm dual-publish
  layout previously broke named imports under tsx / CJS interop.
