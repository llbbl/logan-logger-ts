# Logan Logger

[![CI](https://github.com/llbbl/logan-logger-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/llbbl/logan-logger-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/logan-logger)](https://www.npmjs.com/package/logan-logger)
[![JSR](https://jsr.io/badges/@logan/logger)](https://jsr.io/@logan/logger)

One logging API for Node.js, Deno, Bun and the browser. No dependencies.

```ts
import { createLogger, LogLevel } from 'logan-logger';

const logger = createLogger({ level: LogLevel.DEBUG });

logger.info('Application started');
logger.warn('Config missing', { file: 'config.json' });
logger.error('Query failed', { err: new Error('timeout') });

// Context that follows every record, without threading it through your code
const request = logger.child({ requestId: 'req-123' });
request.info('Processing', { endpoint: '/api/users' });

// Costs nothing when the level filters it out - the function is never called
logger.debug(() => `Expensive: ${computeHeavyValue()}`);
```

```
[2026-08-22T16:31:25.870Z] INFO: Application started
[2026-08-22T16:31:25.871Z] WARN: Config missing {"file":"config.json"}
[2026-08-22T16:31:25.872Z] ERROR: Query failed {"err":{"name":"Error","message":"timeout","stack":"..."}}
[2026-08-22T16:31:25.873Z] INFO: Processing {"requestId":"req-123","endpoint":"/api/users"}
```

Switch to `format: 'json'` and the same calls emit a structured envelope your log
aggregator can parse.

## Why this one

- **No dependencies.** Not "few" — `dependencies` and `peerDependencies` are both
  empty in the published package.
- **The same code runs everywhere.** One import, one API. The library detects
  Node, Deno, Bun, the browser or a web worker and picks an implementation.
- **Browser-safe by construction.** The main entry contains no `node:` specifier
  at all, so bundling it for the browser cannot fail on an unresolvable built-in.
  That is enforced by where the code lives, not by a bundler shim.
- **Serialization that does not lose your data.** Circular references, `Error`
  objects with their own properties, `BigInt`, `Symbol`, functions and deep
  nesting all survive — as markers where they must, in full where they can.
- **TypeScript native**, with correct ESM and CJS types on every entry point.

## Install

```bash
npm install logan-logger      # or pnpm add / yarn add
deno add jsr:@logan/logger    # or npx jsr add @logan/logger
```

Use named imports. There is no default export.

> **Upgrading from 1.x?** See the [migration guide](./docs/migration-2.0.md).
> Winston is gone, file logging is opt-in, and repeated object references are no
> longer reported as `[Circular]`.

## Runtimes

| Runtime | Import | Notes |
|---|---|---|
| Auto-detect | `logan-logger` | Also the right choice for Next.js and other isomorphic frameworks |
| Node.js 20+ | `logan-logger/node` | Adds the file transport and Morgan integration |
| Bun | `logan-logger/bun` | Same as Node |
| Browser / WebWorker | `logan-logger/browser` | CSS-styled console, performance marks, grouping |
| Deno | `jsr:@logan/logger` | Console; native implementation planned |

Details and examples: [docs/runtimes.md](./docs/runtimes.md).

## Configuring

```ts
createLogger({
  level: LogLevel.INFO,
  format: 'json',                    // or 'text'
  timestamp: true,                   // text form only
  colorize: false,                   // text form only, and only on a TTY
  metadata: { service: 'api' },      // attached to every record
  transports: [                      // omit for console only
    { type: 'console', options: {} },
    { type: 'file', level: LogLevel.ERROR, options: { filename: 'logs/error.log' } },
  ],
});
```

`LOG_LEVEL`, `LOG_FORMAT`, `LOG_TIMESTAMP` and `LOG_COLOR` override this at
runtime, so an operator can turn up verbosity without a deploy. Libraries that
need to pin their own logging set `ignoreEnvironment: true`.

Every field, every transport option, and the serialization rules:
[docs/configuration.md](./docs/configuration.md).

## Documentation

[**Full documentation index**](./docs/README.md)

- [Configuration reference](./docs/configuration.md)
- [Runtimes and entry points](./docs/runtimes.md)
- [Environment variables](./docs/environment-variables.md)
- [Next.js](./docs/nextjs-compatibility.md) · [Bundlers](./docs/webpack-bundler-compatibility.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Migrating from 1.x](./docs/migration-2.0.md)

API documentation is generated from source on [JSR](https://jsr.io/@logan/logger/doc).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, architecture and the release
process.

This library is the reference implementation of
[Treering](https://github.com/llbbl/treering), a language-neutral logging
specification with a conformance suite.

## License

MIT © Logan Lindquist Land
