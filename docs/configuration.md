# Configuration reference

Every field of `LoggerConfig`: what it changes, where it applies, how its default
is resolved, and what overrides it.

```ts
interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'text' | 'custom';
  timestamp: boolean;
  colorize: boolean;
  metadata: Record<string, any>;
  transports?: TransportConfig[];
  ignoreEnvironment?: boolean;
}
```

Every example below is real output, captured from the library rather than
written by hand.

---

## Precedence

Highest wins:

```
library defaults  <  explicit config  <  environment variables
```

Environment variables sit on top so an operator can change logging on a running
service without a deploy. A library that must pin its own logging regardless of
the host application's environment sets [`ignoreEnvironment`](#ignoreenvironment).

**Config files are not in this chain.** `loadConfigFromFile()` is exported and
usable directly, but `createLogger()` is synchronous and cannot await it — see
[#58](https://github.com/llbbl/logan-logger-ts/issues/58).

---

## `level`

Minimum severity to emit. Anything below it is discarded before the message is
resolved, so a [lazy message](#lazy-messages) costs nothing when filtered.

```ts
enum LogLevel {
  DEBUG = 0,   // most verbose
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,  // a threshold, not a level anything is logged at
}
```

`SILENT` exists only as a filter value. No call emits at it; setting
`level: LogLevel.SILENT` discards everything.

**Default** `INFO`, or derived from the environment when you use
`createLoggerForEnvironment()`:

| `NODE_ENV` | Level |
|---|---|
| `production` | `ERROR` |
| `staging`, `test` | `WARN` |
| `development`, `dev` | `DEBUG` |
| anything else | `INFO` |

**Overridden by** `LOG_LEVEL`. Changeable at runtime with `logger.setLevel()`.

---

## `format`

Selects the record shape. `'custom'` is accepted by the type and currently
behaves as `'text'`.

```
format: 'text'   [2026-08-22T16:31:25.870Z] INFO: User logged in {"userId":123}
format: 'json'   {"timestamp":"2026-08-22T16:31:25.870Z","level":"info","message":"User logged in","runtime":"node","metadata":{"userId":123}}
```

Two asymmetries are deliberate:

- **Text uppercases the level, JSON lowercases it.**
- **JSON nests metadata** under a `metadata` key rather than spreading it at the
  top level, so a field called `level` or `message` in your metadata cannot
  collide with the envelope.

JSON omits `metadata` entirely when there is none, rather than emitting `null`
or `{}`.

**Default** `'text'`. **Overridden by** `LOG_FORMAT`.

---

## `timestamp`

Whether the **text** form carries a timestamp.

```
timestamp: true    [2026-08-22T16:31:25.870Z] INFO: User logged in {"userId":123}
timestamp: false   INFO: User logged in {"userId":123}
```

**It does not affect JSON.** The structured envelope always carries a
timestamp — a record without one is not much use to a log aggregator, and
omitting it would make the envelope shape conditional.

Set it to `false` when something downstream already stamps each line: systemd,
Docker's log driver, and most hosted log collectors all do.

**Default** `true`. **Overridden by** `LOG_TIMESTAMP`.

---

## `colorize`

ANSI colour on the level token in the **text** form. Nothing else in the line is
coloured, and the JSON form is never coloured at all.

```
colorize: false   [2026-08-22T16:31:25.870Z] INFO: User logged in
colorize: true    [2026-08-22T16:31:25.870Z] \x1b[32mINFO\x1b[0m: User logged in
```

`\x1b[32m` starts green, `\x1b[0m` resets. Per level: DEBUG cyan, INFO green,
WARN yellow, ERROR red. In the browser the same setting applies CSS through the
console's `%c` mechanism instead — `color: #dc3545; font-weight: bold` for
errors — since terminals and devtools have no shared colour mechanism.

**The default is not simply "on".** `capabilities.colorSupport` says whether the
runtime *can* colourize; the default additionally asks whether it *should*:

1. runtime cannot colourize → `false`
2. no `process` object, i.e. a browser → `true`; the console styles its own output and there is no stream to pollute
3. `NO_COLOR` set to any non-empty value → `false`
4. `FORCE_COLOR` set → `true` unless the value is exactly `"0"`
5. otherwise → whether `process.stdout` is a TTY

That gate matters more than the feature. Escape bytes written into a redirected
file or a log shipper break grep patterns and render as literal `[32m` in most
log UIs. This is why `colorize` is usually the wrong thing to force on in
production.

Note the gate resolves the **default only**. An explicit `colorize: true` still
wins over a non-TTY stdout.

**Default** as resolved above. **Overridden by** `LOG_COLOR`.

---

## `metadata`

Default metadata merged into every record the logger emits, and inherited by its
children.

```ts
createLogger({ metadata: { service: 'api' } }).info('User logged in', { userId: 123 });
// [2026-08-22T16:31:25.871Z] INFO: User logged in {"service":"api","userId":123}
```

Merging is **shallow**, and call-site metadata wins on a key collision:

```ts
const logger = createLogger({ metadata: { stage: 'default' } });
logger.info('x', { stage: 'override' });   // {"stage":"override"}
```

A nested object is replaced wholesale rather than deep-merged. `{ ctx: {a:1,b:2} }`
overridden by `{ ctx: {b:3} }` yields `{ ctx: {b:3} }`, not `{ ctx: {a:1,b:3} }`.

Use it for values constant across the process — service name, version, region,
instance id — and `logger.child()` for values constant across a unit of work.

**Default** `{}`. Not settable from the environment.

---

## `transports`

Where records go, in order. See [Transports in detail](#transports-in-detail) below.

**Default** a single console transport. Omitting the field entirely gives the
same result.

---

## `ignoreEnvironment`

Opts out of `LOG_LEVEL`, `LOG_FORMAT`, `LOG_TIMESTAMP` and `LOG_COLOR`.

```ts
createLogger({ level: LogLevel.WARN, ignoreEnvironment: true });
```

Environment-as-override is right for an application, and wrong for a library: a
host process that exports `LOG_LEVEL=debug` for its own logger would otherwise
turn on debug output for every dependency using logan-logger. If you are
shipping a library, set this.

**Default** `false`.

---

## Environment variables

| Variable | Accepts |
|---|---|
| `LOG_LEVEL` | `debug`, `info`, `warn`, `warning`, `error`, `silent`, `none` |
| `LOG_FORMAT` | `json`, `text` |
| `LOG_TIMESTAMP` | `true`/`1`/`yes`/`on`, `false`/`0`/`no`/`off` |
| `LOG_COLOR` | as above |

Case-insensitive, whitespace trimmed. **A value that does not parse is ignored
with a one-time warning**, falling through to the next configuration source
rather than resolving to a default — `LOG_LEVEL=verbose` does not silently
become `info`.

In a browser these exist only if your bundler inlined them at build time, and
bundlers only inline their own prefixed names by default. Map them explicitly
(Vite's `define`, for instance) if you want them.

Full detail in [environment-variables.md](./environment-variables.md).

---

## Transports in detail

A transport is anything with a `write(entry)` method. `LoggerConfig.transports`
lists them in order; omit it and you get the console alone.

```ts
import { LogLevel, NodeLogger } from 'logan-logger/node';

const logger = new NodeLogger({
  transports: [
    { type: 'console', options: { format: 'text', colorize: true } },
    { type: 'file', level: LogLevel.ERROR, options: { filename: 'logs/error.log' } },
  ],
});
```

| Type | Available from | Options |
|---|---|---|
| `console` | everywhere | `format`, `timestamp`, `colorize` |
| `file` | `logan-logger/node`, `logan-logger/bun` | `filename`, `maxsize`, `maxFiles`, `format`, `timestamp` |
| `custom` | everywhere | `transport` — any object with `write(entry)` |

`TransportConfig.level` filters per destination, independently of the logger's
own level. The example above sends everything to the console and only errors to
the file.

### Guarantees

- **Each transport is guarded independently.** One that throws while being
  constructed warns and is dropped; the rest are still built. The same applies
  at write time, so a broken destination cannot silence a working one.
- **Child loggers share transport instances.** `logger.child({ requestId })` per
  request opens no additional file handles.
- **Transport options override the logger's presentation settings**, so a
  console transport can be `text` while a file transport is `json`.

### The file transport

Node and Bun only, and **opt-in** — file logging is never implied by `NODE_ENV`.

```ts
{ type: 'file', options: { filename: 'logs/app.log', maxsize: 5_242_880, maxFiles: 5 } }
```

| Option | Default | |
|---|---|---|
| `filename` | required | Relative paths resolve against `process.cwd()` |
| `maxsize` | `5242880` (5 MiB) | `0` disables rotation |
| `maxFiles` | `5` | Archives kept as `app.log.1` … `app.log.N`, newest first |
| `format` | `'json'` | Deliberately **not** inherited from the logger — files are read by machines |
| `timestamp` | inherited | |

Behaviour worth knowing:

- **The directory and file handle are created lazily, on first write.** A logger
  that is configured but never writes touches the disk zero times, which is what
  makes a file transport safe to declare in a read-only container.
- **Writes are synchronous** `writeSync` calls against a held descriptor. One
  syscall per line, and nothing sits in a userland buffer waiting to be lost at
  exit.
- **Failures warn once and never throw.** A logging destination going away must
  not take the application with it, nor spam the console on every line after.
- The warning names the resolved absolute path and the underlying syscall.

It is registered by the `logan-logger/node` and `logan-logger/bun` entry points,
not by the main entry. That separation is what keeps `node:fs` out of browser
bundles. Configure a `file` transport from `logan-logger` and you get a warning
naming the entry point to import instead.

### Custom transports

Inline:

```ts
const logger = new NodeLogger({
  transports: [{
    type: 'custom',
    options: { transport: { type: 'syslog', write(entry) { /* … */ } } },
  }],
});
```

Or registered by name, so it can be selected from configuration:

```ts
import { registerTransport } from 'logan-logger';

registerTransport('syslog', (config, context) => new SyslogTransport(config.options));
```

`entry` is a `LogEntry`: `{ timestamp: Date, level: LogLevel, message: string,
metadata?: Record<string, any>, runtime: RuntimeName }`. Use `formatLogEntry`
from the package if you want the standard text or JSON shape.

---

## Lazy messages

A message can be a function, evaluated only if the record survives the level
filter:

```ts
logger.debug(() => `Expensive: ${computeHeavyValue()}`);
```

Below the threshold the function is never called. Above it, exactly once.

---

## Serialization

Metadata is serialized with `safeStringify`, which substitutes what JSON cannot
represent:

| Value | Rendered |
|---|---|
| `undefined` | `"[undefined]"` |
| `function foo(){}` | `"[Function: foo]"` |
| an anonymous function | `"[Function: anonymous]"` |
| `123n` | `"[BigInt: 123]"` |
| `Symbol('x')` | `"[Symbol: Symbol(x)]"` |
| a genuine cycle | `"[Circular]"` |
| deeper than 100 levels | `"[MaxDepth]"` |
| `Error` | `{ name, message, stack, ...own properties }` |
| `Date` and anything with `toJSON` | its `toJSON()` result |

**`[Circular]` means a genuine cycle** — a value that is its own ancestor. The
same object referenced twice as siblings is a DAG, not a cycle, and serializes
in full at each occurrence. (Before 2.0 it did not; see the
[migration guide](./migration-2.0.md).)

Errors include **all own properties**, enumerable or not, in the order
`name, message, stack, rest`. `stack` is omitted when undefined, an accessor
that throws yields `"[Throws]"`, and an ES2022 `cause` is followed.

### Redaction

Redaction is never automatic. Apply it yourself:

```ts
import { filterSensitiveData } from 'logan-logger';

logger.info('User processed', filterSensitiveData({
  name: 'John Doe',
  password: 'secret123',   // -> "[REDACTED]"
  apiKey: 'sk_live_...',   // -> "[REDACTED]"
}));
```

Default keys: `password`, `token`, `secret`, `key`, `auth`. Matching is
case-insensitive and recurses into nested objects and arrays. Passing your own
list **replaces** the defaults rather than extending them.

> **Matching is by substring, so it over-matches.** `monkey`, `keyboard` and
> `tokenizer` are all redacted today because they contain `key` or `token`.
> Tracked in [#61](https://github.com/llbbl/logan-logger-ts/issues/61).

---

## Related

- [environment-variables.md](./environment-variables.md) — the variables in full
- [runtimes.md](./runtimes.md) — entry points and per-runtime behaviour
- [migration-2.0.md](./migration-2.0.md) — what changed in 2.0
- [troubleshooting.md](./troubleshooting.md)
