# Migrating to logan-logger 2.0

Two behaviour changes and one dependency removal. Most applications need no code
change at all; the ones that do are listed under **What breaks**.

## What changed

| | 1.x | 2.0 |
|---|---|---|
| Node.js backend | Winston, if installed; console otherwise | Own console + file transports |
| `winston` dependency | optional peer | **removed** |
| File logging | implicit under `NODE_ENV=production` | **opt-in** via `transports` |
| `config.transports` | declared, ignored | honored |
| `config.timestamp` / `config.colorize` | declared, ignored | honored (text form only) |
| Repeated object references | `"[Circular]"` | serialized in full |
| Child loggers | new Winston instance + file handles each | share the parent's transports |

## What breaks

### 1. Your Node.js log format changes

If you had `winston` installed, `NodeLogger` used Winston's formatters. It now
uses the library's own.

```
# 1.x, with winston, development
14:32:07 [info]: User logged in {"userId":123}

# 1.x, with winston, production
{ "level": "info", "message": "User logged in", "userId": 123, "timestamp": "..." }

# 2.0, text (default)
[2026-08-22T14:32:07.891Z] INFO: User logged in {"userId":123}

# 2.0, format: 'json'
{"timestamp":"2026-08-22T14:32:07.891Z","level":"info","message":"User logged in","runtime":"node","metadata":{"userId":123}}
```

Note that metadata is now nested under a `metadata` key rather than spread across
the top level of the record. **Check any log-shipping pipeline, grep-based alert,
or dashboard query that parses these lines.**

If you did *not* have `winston` installed, you were already on the console
fallback and the text form is unchanged apart from `colorize` now being honored.

### 2. File logging must be asked for

1.x wrote `logs/error.log` and `logs/combined.log` whenever `NODE_ENV=production`,
whether you wanted it or not. That failed in read-only containers and was the
cause of [#44](https://github.com/llbbl/logan-logger-ts/issues/44).

```typescript
// 2.0 — restore the 1.x production behaviour explicitly
import { LogLevel, NodeLogger } from 'logan-logger/node';

const logger = new NodeLogger({
  transports: [
    { type: 'console', options: {} },
    { type: 'file', level: LogLevel.ERROR, options: { filename: 'logs/error.log', maxsize: 5_242_880, maxFiles: 5 } },
    { type: 'file', options: { filename: 'logs/combined.log', maxsize: 5_242_880, maxFiles: 10 } },
  ],
});
```

The `file` transport is registered by `logan-logger/node` and `logan-logger/bun`.
Configure one from the main `logan-logger` entry point and you get a warning
naming the entry point to import instead — that separation is what keeps
`node:fs` out of browser bundles.

### 3. Repeated references now serialize in full

```typescript
const user = { id: 7, name: 'jo' };
logger.info('request', { actor: user, owner: user });

// 1.x: {"actor":{"id":7,"name":"jo"},"owner":"[Circular]"}
// 2.0: {"actor":{"id":7,"name":"jo"},"owner":{"id":7,"name":"jo"}}
```

`"[Circular]"` is now reserved for genuine cycles — a value that is its own
ancestor. This is strictly more data than before, so it is unlikely to break a
parser, but log volume can rise for payloads with heavy sharing.

Traversal is also depth-limited at 100 levels, emitting `"[MaxDepth]"` rather
than overflowing the stack. Override with
`safeStringify(value, space, { maxDepth })`.

### 4. `colorize` actually colorizes

`config.colorize` was ignored by the shared formatter in 1.x. It now applies ANSI
color to the level token in the text form — but only when stdout is a TTY, and
never in the JSON form. `NO_COLOR` and `FORCE_COLOR` are honored.

## What to remove

```bash
pnpm remove winston      # no longer a peer dependency
```

Drop `winston` from any bundler `external` / `externals` list. If you were
working around [#42](https://github.com/llbbl/logan-logger-ts/issues/42) on JSR,
that workaround can go too.

## What is unchanged

`createLogger`, `createLoggerForEnvironment`, `ILogger`, every log method, lazy
message functions, `logger.child()`, `createMorganStream`, the browser and Deno
adapters, and all environment variables.
