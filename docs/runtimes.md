# Runtimes and entry points

The main entry detects the runtime and picks an implementation for you. The
subpath entries skip the detection, which gives a smaller bundle and a type
surface that reflects what is actually available there.

| Runtime | Import | Implementation | Notes |
|---|---|---|---|
| Auto-detect | `logan-logger` | picked at runtime | Re-exports the config file loader; bundlers must resolve its lazy Node imports |
| Next.js 13+ | `logan-logger` on the server; `logan-logger/browser` in Client Components | picked at runtime / `BrowserLogger` | Use the browser entry for client and Edge bundles |
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

## Choosing a browser-safe entry

`node:fs` is imported statically by the file transport, which is reachable only
from `logan-logger/node` and `logan-logger/bun`. Those entry points are what
register the `file` transport with the shared registry.

The main entry also re-exports `loadConfigFromFile`. That loader uses lazy
imports of `node:path` and `node:fs/promises`, guarded by runtime filesystem
capabilities. A bundler still has to resolve those imports, even when the
browser will never execute them.

Use `logan-logger/browser` in browser, client-component and Edge bundles. This
entry does not re-export the file loader and reaches no Node builtin. The root
entry remains useful for runtime detection in environments that can resolve
the loader's Node imports.

The trade-off is explicit: configure a `file` transport from the main entry and
you get a warning naming the entry point to import instead, rather than silent
failure.

---

## Next.js

Use `logan-logger` in Server Components and API Routes, and
`logan-logger/browser` in Client Components and the Edge runtime.

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

Choose `logan-logger/browser` when targeting the browser with Webpack, Vite,
Rollup, esbuild or Parcel. For Node targets, keep Node builtins external so the
runtime resolves them; there are no runtime package dependencies to externalise.
[webpack-bundler-compatibility.md](./webpack-bundler-compatibility.md) has
per-bundler configuration.
