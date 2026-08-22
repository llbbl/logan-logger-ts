# Runtimes and entry points

The main entry detects the runtime and picks an implementation for you. The
subpath entries skip the detection, which gives a smaller bundle and a type
surface that reflects what is actually available there.

| Runtime | Import | Implementation | Notes |
|---|---|---|---|
| Auto-detect | `logan-logger` | picked at runtime | Safe in a browser bundle; no `node:` specifier |
| Next.js 13+ | `logan-logger` | picked at runtime | Server and Client Components, API Routes, Edge |
| Node.js 22.12+ | `logan-logger/node` | `NodeLogger` | File transport, Morgan integration |
| Bun | `logan-logger/bun` | `NodeLogger` | Same as Node |
| Browser | `logan-logger/browser` | `BrowserLogger` | CSS styling, performance marks, grouping |
| Deno | `jsr:@logan/logger` | `BrowserLogger` | Console only; native implementation planned |
| WebWorker | `logan-logger/browser` | `BrowserLogger` | Console only |

Use named imports throughout. **There is no default export** on any entry point.

---

## Node.js

```ts
import { createLogger, LogLevel, NodeLogger, createMorganStream } from 'logan-logger/node';

const logger = new NodeLogger({
  transports: [
    { type: 'console', options: {} },
    {
      type: 'file',
      level: LogLevel.ERROR,
      options: { filename: 'logs/error.log', maxsize: 5_242_880, maxFiles: 5 },
    },
  ],
});

// Express / Morgan
app.use(morgan('combined', { stream: createMorganStream(logger) }));
```

This entry point is what registers the `file` transport — see
[configuration.md](./configuration.md#the-file-transport) for its options and
guarantees. File logging is opt-in and never implied by `NODE_ENV`.

`NodeLogger` also exposes `getTransports()` and `close()`, the latter releasing
every transport's resources.

`loadConfigFromFile` is exported here too, so a Node application never needs to
reach back into the main entry point for it:

```ts
import { createLogger, loadConfigFromFile } from 'logan-logger/node';

const logger = createLogger(await loadConfigFromFile(undefined, { cwd: packageRoot }));
```

## Browser

```ts
import { createLogger, BrowserLogger, PerformanceLogger } from 'logan-logger/browser';

const logger = new PerformanceLogger();
logger.mark('api-start');
// ... work
logger.measure('api-duration', 'api-start');
```

Also exports `ConsoleGroupLogger` for grouped output. `colorize` here applies CSS
through the console's `%c` mechanism rather than ANSI.

## Deno

```ts
import { createLogger } from 'jsr:@logan/logger';

createLogger({ colorize: true }).info('Deno application started');
```

JSR publishes `src/` rather than a build output, so Deno consumers type-check
against the library's actual source. `deno task check` runs in CI to keep that
honest.

## Bun

```ts
import { createLogger, LogLevel, NodeLogger } from 'logan-logger/bun';

createLogger({ level: LogLevel.DEBUG }).info('Bun application started');
```

Bun implements `node:fs`, so the file transport works exactly as it does on Node.

---

## Why the main entry stays browser-safe

`node:fs` is imported statically by the file transport, which is reachable only
from `logan-logger/node` and `logan-logger/bun`. Those entry points are what
register the `file` transport with the shared registry.

The consequence is a genuinely universal main entry: `dist/browser.mjs` and the
chunks reachable from `dist/index.mjs` contain **no `node:` specifier at all**,
so bundling `logan-logger` for the browser cannot fail on an unresolvable
built-in. That matters most for isomorphic frameworks, where the same import
gets bundled for both sides.

The trade-off is explicit: configure a `file` transport from the main entry and
you get a warning naming the entry point to import instead, rather than silent
failure.

---

## Next.js

Works in Server Components, Client Components, API Routes and the Edge runtime
from the single `logan-logger` import.

```ts
// app/api/users/route.ts
import { createLogger } from 'logan-logger';

const logger = createLogger({ format: 'json', metadata: { service: 'api' } });

export async function GET() {
  logger.info('API request started', { endpoint: '/api/users' });
  // ...
}
```

Full setup, advanced patterns and troubleshooting:
[nextjs-compatibility.md](./nextjs-compatibility.md).

## Bundlers

Webpack, Vite, Rollup, esbuild and Parcel all work without configuration. If you
are externalising anything, externalise `node:*` rather than naming packages —
there are no dependencies to externalise.
[webpack-bundler-compatibility.md](./webpack-bundler-compatibility.md) has
per-bundler configuration.
