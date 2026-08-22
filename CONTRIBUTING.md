# Contributing

## Setup

```bash
git clone https://github.com/llbbl/logan-logger-ts.git
cd logan-logger-ts
pnpm install
```

`pnpm` is required — the repo pins it via `packageManager`, and `pnpm-workspace.yaml`
carries supply-chain settings (`minimumReleaseAge`, `blockExoticSubdeps`,
`strictDepBuilds`) that npm and yarn will not honour. pnpm 11 needs Node ≥ 22.13
for the toolchain, even though the package's own floor is Node 22.12 — 22.12.0
is where `require(esm)` shipped unflagged, which is the boundary that matters
for a dual ESM/CJS package, so the floor is not raised to suit pnpm.

## Commands

```bash
pnpm test              # vitest, single run
pnpm test:watch        # watch mode
pnpm test:coverage

pnpm typecheck         # tsc --noEmit
pnpm lint              # biome
pnpm lint:fix

deno task check        # type check all five entry points under Deno

pnpm build             # vite build + declaration generation
pnpm lint:package      # publint + are-the-types-wrong
pnpm test:package      # build a real consumer against the packed tarball
```

`deno task check` matters more than it looks: **JSR publishes `src/`, not a build
output**, so that is the code Deno consumers type-check against. It runs in CI.

## Architecture

A factory picks a runtime adapter; the adapter writes through transports.

```
detectRuntime()  ->  LoggerFactory  ->  NodeLogger | BrowserLogger  ->  Transport[]
```

```
src/
├── core/
│   ├── types.ts        LoggerConfig, LogEntry, ILogger, LogLevel
│   ├── logger.ts       BaseLogger — level filtering, child context, lazy messages
│   ├── factory.ts      runtime detection and config assembly
│   └── transport.ts    Transport interface, registry, ConsoleTransport
├── runtime/
│   ├── node.ts         NodeLogger
│   ├── browser.ts      BrowserLogger, PerformanceLogger, ConsoleGroupLogger
│   └── file-transport.ts   node:fs — reachable only from the node/bun entries
├── utils/
│   ├── config.ts       defaults, environment, merging (no node: specifiers)
│   ├── config-file.ts  file-based config loading (Node/Deno)
│   ├── formatting.ts   text and JSON envelopes
│   ├── runtime.ts      runtime detection and capabilities
│   └── serialization.ts safeStringify, serializeError, filterSensitiveData
└── index.ts, node.ts, browser.ts, deno.ts, bun.ts   entry points
```

Two invariants worth preserving:

- **No `node:` specifier may become reachable from `src/index.ts` or
  `src/browser.ts`.** The file transport registers itself from the node and bun
  entry points precisely so the main entry stays bundleable for the browser. If
  you add anything Node-only, register it the same way. Check with
  `pnpm build && grep -r "node:" dist/browser.mjs`.
- **A config field that nothing reads is indistinguishable from a working one.**
  Four separate fields shipped declared-but-ignored before anyone noticed
  (#44, #58, #60, #65, #67). `tests/config-environment.test.ts` has a guard test
  asserting every `LoggerConfig` field measurably changes output — extend it when
  you add a field.

## Tests

```
tests/
├── logger.test.ts, runtime.test.ts, serialization.test.ts   core
├── factory.test.ts, config.test.ts, config-environment.test.ts
├── node-logger.test.ts, browser-logger.test.ts, file-transport.test.ts
└── integration.test.ts
```

New behaviour needs a test that would fail without it. Prefer asserting on
observable output over asserting on internals — the Winston-era tests asserted
against a mock and so passed while the real code path was broken.

## Conformance

This library is the reference implementation of
[Treering](https://github.com/llbbl/treering), a language-neutral logging spec
with a JSON conformance suite. Behaviour changes to levels, the record envelope,
context propagation, serialization or redaction should be checked against it,
and may need a spec change first.

## Pull requests

1. Branch from `main` (or from `1.x` for a maintenance fix).
2. Make sure `pnpm test`, `pnpm typecheck`, `pnpm lint` and `deno task check` all pass.
3. Open the PR. CI runs Node 22.12 / 24 / 26, Bun, Deno, a build test and a security scan.

### Commit messages drive releases

Every merge to `main` publishes. The version is computed from the commit
messages since the last tag:

| Message | Bump |
|---|---|
| `fix:`, `chore:`, `docs:`, anything else | patch |
| `feat:` | minor |
| any type with `!:`, or a `BREAKING CHANGE:` footer | **major** |

Squash-merge concatenates every commit in the PR, so a marker anywhere in the
range counts. Simulate before merging:

```bash
git log "$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1)"..HEAD \
  --pretty=format:"%s%n%b" | grep -nE "^[a-zA-Z]+(\(.+\))?!:|^BREAKING[ -]CHANGE:"
```

Changes confined to `.github/**` or `docs/**` do not cut a release — neither can
reach a consumer. Anything touching `src/` or `README.md` does.

Maintenance branches (`<major>.x`) publish under a `v<major>-lts` dist-tag and
refuse breaking markers outright. See
[docs/maintenance-releases.md](./docs/maintenance-releases.md).

## License

MIT. By contributing you agree your contributions are licensed under it.
