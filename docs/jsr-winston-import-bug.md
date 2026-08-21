# JSR Winston Import Bug

## Symptom

Consumers installing `@logan/logger` from JSR (e.g., `pnpm add jsr:@logan/logger`)
see this warning at runtime, even when `winston` is installed as a peer dep:

```
[logan-logger] Winston not found, falling back to console logging:
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/path/to/node_modules/.pnpm/@jsr+logan__logger@1.1.x/node_modules/@jsr/logan__logger/src/runtime/winston'
imported from .../@jsr/logan__logger/src/runtime/node.js
```

The logger silently falls back to console output even though Winston is
available, so file transports / production formatting are lost.

## Root Cause

`src/runtime/node.ts` did this:

```ts
const winston = await import('winston');
```

JSR's publish pipeline statically analyzes ESM imports. Bare specifiers must be
explicitly mapped to a known JSR/npm specifier (e.g., `npm:winston`). Because
`winston` was not declared in `jsr.json` / `deno.json` `imports`, JSR rewrote
the bare specifier `'winston'` to a relative file path `'./winston'` during
publish. Verified by inspecting the published tarball at
`https://npm.jsr.io/~/11/@jsr/logan__logger/1.1.16.tgz`:

```ts
// inside the published src/runtime/node.ts
const winston = await import('./winston');
```

At runtime Node tries to resolve `./winston` relative to the package, finds no
such file, throws `ERR_MODULE_NOT_FOUND`, and the catch block triggers the
console fallback.

The npm distribution (`logan-logger`) is unaffected because Vite externalizes
`winston` correctly during the bundler build. The bug only impacts the JSR
distribution.

## Affected Versions

All published JSR versions through **1.1.16** at minimum. The
`fix(node): handle optional Winston dependency with TypeScript ignore` commit
(`2a18f6f`, 2025-12-03) only added `// @ts-ignore` comments — it did not change
the import statement and so did not address this bug.

## Fix

Use a dynamic specifier so JSR's static analyzer cannot rewrite the import:

```ts
private async initializeWinston(): Promise<void> {
  try {
    // Dynamic specifier prevents JSR from rewriting the bare 'winston'
    // import to a relative './winston' path during publish.
    const winstonModule = 'winston';
    const winston = await import(winstonModule);
    this.winston = this.createWinstonLogger(winston);
  } catch (error) {
    console.warn('[logan-logger] Winston not found, falling back to console logging:', error);
  }
}
```

This works in every supported runtime:

| Runtime | Behavior |
|---------|----------|
| Node + winston installed | Resolves normally via npm package lookup |
| Node without winston | Throws `ERR_MODULE_NOT_FOUND`, caught, falls back to console |
| Deno / Bun (no winston) | Throws unknown specifier, caught, falls back to console |
| JSR publish pipeline | Cannot statically analyze the dynamic specifier — leaves it alone |

An alternative fix would be to declare `winston` as an `npm:` specifier in
`deno.json` / `jsr.json` `imports`, but that ties JSR consumers to a specific
npm package and breaks the "optional peer" semantics.

## Verification Steps

1. Apply the fix to `src/runtime/node.ts`.
2. Run `pnpm test` — all 170+ tests should still pass (the existing
   `node-logger` tests cover the winston-detection path).
3. Bump version (e.g., `make bump-patch`) so JSR publishes a new tarball.
4. Tag and push to trigger the auto-publish workflow.
5. In a consumer project that installs from JSR + has `winston` in
   `dependencies`, confirm no `[logan-logger] Winston not found` warning at
   runtime.
