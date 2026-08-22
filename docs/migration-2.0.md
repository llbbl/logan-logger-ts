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
| `LOG_LEVEL` and friends | parsed, never applied | applied, highest precedence |
| `config.metadata` | declared, never emitted | on every record |

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

### 4. Environment variables start taking effect

`LOG_LEVEL`, `LOG_FORMAT`, `LOG_TIMESTAMP` and `LOG_COLOR` were parsed by
`loadConfigFromEnvironment()` in 1.x, but nothing ever called it — a logger built
by `createLogger()` never saw them. They are now wired in at the top of the
precedence chain.

**If any of these variables is already set in your environment, your logging
changes on upgrade** even though your code did not. A process running with
`LOG_LEVEL=debug` set — perhaps years ago, for a different tool — starts emitting
debug output.

Two other things changed with the wiring:

- **Boolean parsing is no longer strict.** 1.x resolved any value other than the
  literal `"true"` to `false`, so `LOG_TIMESTAMP=1` meant *off*. 2.0 accepts
  `true/1/yes/on` and `false/0/no/off`, case-insensitively.
- **Unparseable values are ignored with a warning** rather than silently
  resolving to a default. `LOG_LEVEL=verbose` no longer becomes `info`.

To pin your logging against the host environment:

```typescript
const logger = createLogger({ level: LogLevel.WARN, ignoreEnvironment: true });
```

Config files are still not in the precedence chain — `loadConfigFromFile()` is
async and `createLogger()` is not. That is [#58](https://github.com/llbbl/logan-logger-ts/issues/58).

### 5. `config.metadata` is now emitted

```typescript
const logger = createLogger({ metadata: { service: 'api' } });
logger.info('started');

// 1.x: [ts] INFO: started
// 2.0: [ts] INFO: started {"service":"api"}
```

`LoggerConfig.metadata` was documented as "default metadata to include with all
log messages", carefully merged across configuration sources, and never read by
the logger. It now seeds every record and is inherited by child loggers.
Call-site metadata still wins on key collisions.

### 6. `colorize` actually colorizes

`config.colorize` was ignored by the shared formatter in 1.x. It now applies ANSI
color to the level token in the text form — but only when stdout is a TTY, and
never in the JSON form. `NO_COLOR` and `FORCE_COLOR` are honored.

## What to remove

```bash
pnpm remove winston      # no longer a peer dependency
```

Also check your deployment environment for stale `LOG_*` variables, which now
have an effect for the first time.

Drop `winston` from any bundler `external` / `externals` list. If you were
working around [#42](https://github.com/llbbl/logan-logger-ts/issues/42) on JSR,
that workaround can go too.

## What is unchanged

`createLogger`, `createLoggerForEnvironment`, `ILogger`, every log method, lazy
message functions, `logger.child()`, `createMorganStream`, the browser and Deno
adapters, and all environment variables.
