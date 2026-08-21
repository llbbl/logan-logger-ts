# Import Compatibility Guide

> ⚠️ **Known issue**: until [#43](https://github.com/llbbl/logan-logger-ts/issues/43)
> is fixed, the import shape that works depends on which tool is loading the
> module. This page documents the safe patterns for each environment.

`logan-logger@1.1.x` ships a dual-publish layout (ESM + CJS) but the published
`package.json` does not set `"type": "module"` and the ESM entry uses a `.js`
extension. This means Node and CJS-interop loaders disagree about how to load
the file, and named imports do not extract the same way in every runner.

## TL;DR

| Runner | Recommended import |
|--------|---------------------|
| Node ESM (`type: module` or `.mjs` files) | `import { logger, createLogger } from 'logan-logger'` |
| Vite / Vitest / esbuild bundle | `import { logger, createLogger } from 'logan-logger'` |
| Astro / Next.js / Remix bundled code | `import { logger, createLogger } from 'logan-logger'` |
| **tsx / ts-node** | `import loganLogger from 'logan-logger'; const { logger, createLogger } = loganLogger;` |
| **CommonJS `require`** | `const { logger, createLogger } = require('logan-logger');` |

If you are writing code that runs through `tsx` (migrations, indexers, seed
scripts, CLIs) you must use the default-import pattern. The named-import
pattern shown in the README quick-start does not work under `tsx` and will
fail with:

```
SyntaxError: The requested module 'logan-logger' does not provide an export named 'logger'
```

## Why this happens

When `tsx` evaluates `import { logger } from 'logan-logger'`, it goes through
Node's CJS interop because the published package is not declared as
`"type": "module"`. Node loads `dist/index.js` (the CJS build), runs it through
`cjs-module-lexer`, and cannot reliably extract individual named bindings from
the minified `exports.X = ...` assignments. The whole CJS `module.exports`
object is still available as the default export, so destructuring after a
default import works:

```ts
import loganLogger from 'logan-logger';
const { logger, createLogger, LogLevel } = loganLogger;
```

Under pure Node ESM (`.mjs` files or a `type: module` package), Node uses the
`exports.import` condition and loads `dist/index.esm.js` directly as ESM. The
`export { ... }` statement at the bottom of that file is parsed correctly and
named imports work.

Under Vite / Vitest / esbuild / Webpack, the bundler has its own resolver that
handles the dual layout correctly, so named imports also work.

## Recommended pattern for libraries that target multiple runners

If you are writing reusable code that may be loaded by tsx **and** by a
bundler, prefer the default-import pattern everywhere — it works in every
runner today, including pure Node ESM:

```ts
import loganLogger from 'logan-logger';
const { logger } = loganLogger;
```

The trade-off is one extra line and slightly worse tree-shaking. Once
[#43](https://github.com/llbbl/logan-logger-ts/issues/43) is fixed, you will be
able to use the standard named-import pattern everywhere and remove this
workaround.

## Related

- [#42](https://github.com/llbbl/logan-logger-ts/issues/42) — JSR distribution
  silently falls back to console logging because the bare `winston` import is
  rewritten to `./winston` during publish. The npm distribution is unaffected.
- [#43](https://github.com/llbbl/logan-logger-ts/issues/43) — npm dual-publish
  layout breaks named imports under tsx / CJS interop. This page is the
  workaround documentation until that issue is fixed.
