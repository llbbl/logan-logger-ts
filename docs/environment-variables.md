# Environment Variables

Logan Logger supports configuration through environment variables, allowing you to control logging behavior without changing code.

## Available Environment Variables

### Log Level

**Controls the minimum log level that will be output.**

**Variable:** `LOG_LEVEL`  
**Values:** `debug`, `info`, `warn`, `error`, `silent`  
**Default:** Based on `NODE_ENV` (see Environment-Based Configuration below)

```bash
# Only show error messages and above
LOG_LEVEL=error

# Show all messages including debug
LOG_LEVEL=debug

# Completely disable logging
LOG_LEVEL=silent
```

### Log Format

**Sets the output format for log messages.**

**Variable:** `LOG_FORMAT`  
**Values:** `json`, `text`  
**Default:** `text`

```bash
# JSON format (good for production/log aggregation)
LOG_FORMAT=json

# Human-readable text format (good for development)
LOG_FORMAT=text
```

**Example outputs:**
```bash
# text format
[2025-01-01T12:00:00.000Z] INFO: User logged in {"userId":"123","ip":"192.168.1.1"}

# json format
{"timestamp":"2025-01-01T12:00:00.000Z","level":"info","message":"User logged in","metadata":{"userId":"123","ip":"192.168.1.1"},"runtime":"node"}
```

### Timestamp

**Controls whether timestamps are included in log output.**

**Variable:** `LOG_TIMESTAMP`  
**Values:** `true`, `1`, `yes`, `on` / `false`, `0`, `no`, `off` (case-insensitive)  
**Default:** `true`

```bash
# Include timestamps (recommended)
LOG_TIMESTAMP=true

# Disable timestamps
LOG_TIMESTAMP=false
```

### Color

**Controls whether colored output is used (when supported by runtime).**

**Variable:** `LOG_COLOR`  
**Values:** `true`, `1`, `yes`, `on` / `false`, `0`, `no`, `off` (case-insensitive)  
**Default:** Colored only when stdout is a terminal. `FORCE_COLOR` is honored.

```bash
# Force colored output
LOG_COLOR=true

# Disable colored output (useful for log files)
LOG_COLOR=false
```

### `NO_COLOR`

**Variable:** `NO_COLOR`  
**Values:** any non-empty value disables color; the value itself is ignored  
**Default:** unset

`NO_COLOR` is not one of this library's variables — it is a
[cross-tool convention](https://no-color.org/) by which a user tells *every*
program in their session not to emit color. It is honored as an **override**, so
it outranks everything in [Priority Order](#priority-order) below, including
`LOG_COLOR` and an explicit `colorize: true`.

```bash
# Disables color regardless of what anything else asks for
NO_COLOR=1

# Also disables color: presence is the signal, the value means nothing
NO_COLOR=0

# Ignored: an empty value counts as unset, unlike the LOG_* variables
NO_COLOR=
```

Set alongside `LOG_COLOR=true` it wins, and you get one diagnostic:

```
[logan-logger] NO_COLOR is set and LOG_COLOR=true asks for color. NO_COLOR takes precedence: defaulting to no color.
```

`ignoreEnvironment: true` does **not** turn it off, though it does suppress that
diagnostic — see [configuration.md](./configuration.md#no_color-beats-all-of-it)
for both.

## Environment-Based Configuration

When using `createLoggerForEnvironment()`, Logan Logger automatically configures itself based on standard environment variables:

### `NODE_ENV`
**Primary environment indicator**

- `production` → Level: `ERROR`, Format: `json`, Color: `false`
- `staging` → Level: `WARN`, Format: `json`, Color: `false`  
- `test` → Level: `WARN`, Format: `text`, Color: `false`
- `development` → Level: `DEBUG`, Format: `text`, Color: `true`
- `dev` → Level: `DEBUG`, Format: `text`, Color: `true`
- *default* → Level: `INFO`, Format: `text`, Color: auto

### `NEXT_PUBLIC_APP_ENV`
**Fallback environment indicator** (used if `NODE_ENV` is not set)

Same logic as `NODE_ENV` above.

### `ENVIRONMENT`
**Secondary fallback** (used if neither `NODE_ENV` nor `NEXT_PUBLIC_APP_ENV` are set)

Same logic as `NODE_ENV` above.

## Usage Examples

### Basic Environment Configuration
```bash
# .env file
NODE_ENV=production
LOG_LEVEL=warn
LOG_FORMAT=json
LOG_COLOR=false
```

```typescript
import { createLoggerForEnvironment } from 'logan-logger';

// Automatically uses environment variables
const logger = createLoggerForEnvironment();
```

### Override Specific Settings
```bash
# Keep production defaults but enable debug logging temporarily
NODE_ENV=production
LOG_LEVEL=debug
```

### Development Setup
```bash
# .env.development
NODE_ENV=development
LOG_LEVEL=debug
LOG_FORMAT=text
LOG_COLOR=true
LOG_TIMESTAMP=true
```

### Production Setup
```bash
# .env.production
NODE_ENV=production
LOG_LEVEL=error
LOG_FORMAT=json
LOG_COLOR=false
LOG_TIMESTAMP=true
```

### Docker Environment
```dockerfile
# Dockerfile
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV LOG_FORMAT=json
ENV LOG_COLOR=false
```

### CI/CD Pipeline
```yaml
# GitHub Actions example
env:
  NODE_ENV: test
  LOG_LEVEL: warn
  LOG_FORMAT: text
  LOG_COLOR: false
```

## Priority Order

Highest to lowest:

0. **[`NO_COLOR`](#no_color)** — above the chain entirely, and only for `colorize`
1. **Environment variables** (e.g. `LOG_LEVEL`)
2. **Manual configuration** passed to `createLogger(config)`
3. **Environment-based defaults** from `NODE_ENV`, `NEXT_PUBLIC_APP_ENV`, `ENVIRONMENT`
4. **Library defaults**

`NO_COLOR` is numbered zero because it is not a tier of this list — it is a veto
that nothing below can outrank, not even `ignoreEnvironment`. Everything else
here belongs to this library; `NO_COLOR` belongs to the user.

Environment variables sit at the top deliberately, so an operator can change
logging on a running service without a deploy. A library that must pin its own
logging regardless of the host application's environment opts out:

```typescript
const logger = createLogger({ level: LogLevel.WARN, ignoreEnvironment: true });
```

**Config files are applied explicitly.** `createLogger()` is synchronous and
`loadConfigFromFile()` is not, so opt in by awaiting it:
`createLogger(await loadConfigFromFile())`. It then sits below both explicit
config and the environment. See
[configuration.md](./configuration.md#config-files).

### Unrecognized values

A variable that does not parse is **ignored with a warning**, falling through to
the next source rather than resolving to a default. `LOG_LEVEL=verbose` does not
silently become `info`, and `LOG_TIMESTAMP=maybe` does not silently turn
timestamps off. Each distinct problem warns once per process.

## Runtime Considerations

### Node.js
All environment variables are supported through `process.env`.

### Browser
`LOG_*` variables are **build-time** in browsers, not runtime — there is no
`process.env` to read. Your bundler must inline them, and by default bundlers
only inline their own prefixed names, so an unprefixed `LOG_LEVEL` will not be
picked up unless you map it explicitly (for example via `define` in Vite).

Environment variables must be made available at build time:
- **Vite**: Variables prefixed with `VITE_`
- **Next.js**: Variables prefixed with `NEXT_PUBLIC_`
- **Create React App**: Variables prefixed with `REACT_APP_`

```bash
# For browser applications
VITE_LOG_LEVEL=warn
NEXT_PUBLIC_LOG_LEVEL=warn
REACT_APP_LOG_LEVEL=warn
```

### Deno
Environment variables work with appropriate permissions:
```bash
deno run --allow-env your-app.ts
```

### Bun
Full environment variable support like Node.js.

## Validation

Invalid values are handled gracefully:
- **Invalid log levels** → Falls back to `INFO`
- **Invalid formats** → Falls back to `text`
- **Invalid booleans** → Uses default value
- **Missing variables** → Uses default configuration