# Logan Logger

[![CI](https://github.com/llbbl/logan-logger-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/llbbl/logan-logger-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/logan-logger)](https://www.npmjs.com/package/logan-logger)
[![JSR](https://jsr.io/badges/@logan/logger)](https://jsr.io/@logan/logger)

A universal TypeScript logging library that works consistently across all JavaScript runtimes: Node.js, Deno, Bun, browsers, and WebAssembly environments.

> **Upgrading from 1.x?** See the [2.0 migration guide](./docs/migration-2.0.md).
> Winston is gone, file logging is opt-in, and repeated object references are no
> longer reported as `[Circular]`.

## Features

- 🌐 **Universal Runtime Support** - Works in Node.js, Deno, Bun, browsers, and WebAssembly
- ⚛️ **Next.js Ready** - Full compatibility with App Router, Server Components, and API Routes
- 🪶 **Zero Dependencies** - No dependencies at all, required or optional, on any runtime
- ⚡ **Performance First** - Lazy evaluation, zero-allocation logging, minimal memory footprint
- 🎯 **TypeScript Native** - Full type safety with comprehensive type definitions
- 🔧 **Flexible Configuration** - Environment-based auto-configuration or manual setup
- 🔒 **Safe Serialization** - Handles circular references, Error objects, and sensitive data filtering
- 🎨 **Rich Browser Support** - Console styling, performance marks, grouping
- 📊 **Structured Logging** - Rich metadata support with child loggers

## Quick Start

```bash
# NPM
npm install logan-logger
# or
pnpm add logan-logger
# or
yarn add logan-logger

# JSR (Deno/Node.js)
deno add @logan/logger
# or
npx jsr add @logan/logger
```

### Basic Usage

```typescript
import { createLogger, LogLevel } from 'logan-logger';

// Create logger with automatic environment configuration
const logger = createLogger({
  level: LogLevel.DEBUG,
  colorize: true
});

// Basic logging
logger.info('Application started');
logger.warn('Configuration missing', { file: 'config.json' });
logger.error('Database connection failed', { error: new Error('Connection failed') });

// Child loggers with additional context
const requestLogger = logger.child({ 
  requestId: 'req-123', 
  userId: 'user-456' 
});

requestLogger.info('Processing request', { endpoint: '/api/users' });
```

Use named imports from `logan-logger` and its runtime subpaths. Default imports
are not part of the public API.

### Next.js Integration

Logan Logger is fully compatible with Next.js 13+ App Router, including Server Components, Client Components, and API Routes.

#### Server Components
```typescript
import { createLogger, LogLevel } from 'logan-logger';

const logger = createLogger({
  level: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  format: 'json'
});

export default async function ServerComponent() {
  logger.info('Server component rendered');
  
  // Server-side data fetching
  const data = await fetchData();
  logger.debug('Data fetched', { recordCount: data.length });
  
  return <div>Server content</div>;
}
```

#### Client Components
```typescript
'use client';

import { createLogger, LogLevel } from 'logan-logger';

const logger = createLogger({
  level: LogLevel.INFO,
  colorize: true
});

export default function ClientComponent() {
  const handleClick = () => {
    logger.info('User interaction', { action: 'button_click' });
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

#### API Routes
```typescript
// app/api/users/route.ts
import { NextResponse } from 'next/server';
import { createLogger } from 'logan-logger';

const logger = createLogger({
  format: 'json',
  metadata: { service: 'api' }
});

export async function GET() {
  const start = Date.now();
  logger.info('API request started', { endpoint: '/api/users' });
  
  try {
    const users = await getUsers();
    const duration = Date.now() - start;
    
    logger.info('API request completed', { 
      statusCode: 200, 
      duration,
      userCount: users.length 
    });
    
    return NextResponse.json(users);
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('API request failed', { 
      statusCode: 500, 
      duration,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

> **📋 See [Next.js Compatibility Guide](./docs/nextjs-compatibility.md) for complete setup instructions, advanced patterns, and troubleshooting.**

### Advanced Features

#### Lazy Evaluation for Performance
```typescript
// Function is only called if debug level is enabled
logger.debug(() => `Expensive computation: ${computeHeavyValue()}`);
```

#### Environment-Based Configuration
```typescript
import { createLoggerForEnvironment } from 'logan-logger';

// Automatically configures based on NODE_ENV
const logger = createLoggerForEnvironment();
// Production: ERROR level, JSON format
// Development: DEBUG level, colored console
// Test: WARN level
```

#### Runtime-Specific Imports

Logan Logger provides runtime-specific entry points for optimal bundling and type safety:

**🟢 Node.js with file logging:**
```typescript
import { createLogger, LogLevel, NodeLogger, createMorganStream } from 'logan-logger/node';

const logger = new NodeLogger({
  transports: [
    { type: 'console', options: {} },
    {
      type: 'file',
      level: LogLevel.ERROR,
      options: { filename: 'logs/error.log', maxsize: 5_242_880, maxFiles: 5 }
    }
  ]
});

// Express/Morgan integration
app.use(morgan('combined', { stream: createMorganStream(logger) }));
```

File logging is **opt-in**: with no `transports` configured a logger writes to the
console and nowhere else, whatever `NODE_ENV` says. The log directory is created
lazily on the first write, so a logger that is configured but never used touches
the disk zero times.

The `file` transport is registered by the `logan-logger/node` and
`logan-logger/bun` entry points. It is deliberately absent from the main
`logan-logger` entry so that `node:fs` never reaches a browser bundle — configure
a file transport from the main entry and you get a warning telling you which
entry point to import instead.

**🌐 Browser-Optimized (Webpack/Vite-Safe):**
```typescript
import { createLogger, BrowserLogger, PerformanceLogger } from 'logan-logger/browser';

const logger = new PerformanceLogger();

logger.mark('api-start');
// ... API call
logger.measure('api-duration', 'api-start');
```

**🦕 Deno-Optimized:**
```typescript
import { createLogger, BrowserLogger } from 'logan-logger/deno';

const logger = createLogger({ colorize: true });
logger.info('Deno application started');
```

**🥟 Bun-Optimized:**
```typescript
import { createLogger, NodeLogger } from 'logan-logger/bun';

const logger = createLogger({ level: LogLevel.DEBUG });
logger.info('Bun application started');
```

**🔧 Auto-Detection (Generic):**
```typescript
import { createLogger } from 'logan-logger';

// Automatically selects appropriate logger based on runtime
const logger = createLogger();
```

#### Safe Data Handling
```typescript
import { filterSensitiveData } from 'logan-logger';

const userData = {
  name: 'John Doe',
  email: 'john@example.com',
  password: 'secret123',  // Will be filtered
  apiKey: 'sk_live_...'   // Will be filtered
};

const safeData = filterSensitiveData(userData);
logger.info('User processed', safeData);
// Logs: { name: 'John Doe', email: 'john@example.com', password: '[REDACTED]', apiKey: '[REDACTED]' }
```

## Runtime Support & Import Paths

| Runtime | Import Path | Status | Implementation | Features |
|---------|-------------|--------|----------------|----------|
| **Next.js 13+** | `logan-logger` | ✅ **Full** | **Auto-detection** | **Server/Client Components, API Routes, Edge Runtime** |
| Node.js 20+ | `logan-logger/node` | ✅ Full | Console + File transports | File logging with size rotation, custom transports, Morgan integration |
| Bun | `logan-logger/bun` | ✅ Full | NodeLogger adapter | Same as Node.js |
| Browser | `logan-logger/browser` | ✅ Full | Console API | CSS styling, performance marks, grouping |
| Deno | `@logan/logger/deno` (JSR) | ✅ Basic | BrowserLogger adapter | Console logging (native implementation planned) |
| WebWorker | `logan-logger/browser` | ✅ Basic | Console adapter | Basic console logging |
| Auto-detect | `logan-logger` | ✅ Basic | Runtime detection | Automatic adapter selection |

## Configuration

### Log Levels
```typescript
enum LogLevel {
  DEBUG = 0,    // Most verbose
  INFO = 1,     // General information  
  WARN = 2,     // Warning messages
  ERROR = 3,    // Error messages
  SILENT = 4    // No output
}
```

### Environment Variables
```bash
LOG_LEVEL=debug      # debug, info, warn, error, silent
LOG_FORMAT=json      # json, text
LOG_TIMESTAMP=true   # true/1/yes/on, false/0/no/off
LOG_COLOR=false      # true/1/yes/on, false/0/no/off
```

These sit at the **top** of the precedence chain — above configuration passed to
`createLogger()` — so an operator can change logging on a running service without
a deploy. Opt out with `createLogger({ ..., ignoreEnvironment: true })`. A value
that does not parse is ignored with a warning rather than silently resolving to a
default.

> **📋 See [Environment Variables Documentation](./docs/environment-variables.md) for complete details, examples, and runtime-specific considerations.**

### Configuration Options
```typescript
interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'text' | 'custom';
  timestamp: boolean;
  colorize: boolean;
  metadata: Record<string, any>;
  transports?: TransportConfig[];
}
```

`timestamp` and `colorize` apply to the **text** form only. The JSON envelope
always carries a timestamp and is never colorized, so a structured log stream
stays parseable. `colorize` additionally defers to the terminal: ANSI escapes are
suppressed when stdout is not a TTY, and the `NO_COLOR` / `FORCE_COLOR`
conventions are honored.

### Transports

`transports` lists exactly where records go, in order. Omit it and you get the
console alone.

```typescript
import { LogLevel, NodeLogger } from 'logan-logger/node';

const logger = new NodeLogger({
  transports: [
    { type: 'console', options: { format: 'text', colorize: true } },
    { type: 'file', level: LogLevel.ERROR, options: { filename: 'logs/error.log' } }
  ]
});
```

| Type | Available from | Options |
|---|---|---|
| `console` | everywhere | `format`, `timestamp`, `colorize` |
| `file` | `logan-logger/node`, `logan-logger/bun` | `filename`, `maxsize`, `maxFiles`, `format`, `timestamp` |
| `custom` | everywhere | `transport` — any object with a `write(entry)` method |

Each transport is constructed behind its own guard: one failing to initialize
warns and is dropped, and the rest keep working. The same applies at write time.

A child logger **shares** its parent's transport instances, so
`logger.child({ requestId })` per request costs no extra file handles.

Plug in your own destination either inline:

```typescript
const logger = new NodeLogger({
  transports: [{ type: 'custom', options: { transport: { type: 'syslog', write(entry) { /* … */ } } } }]
});
```

or by name, so it can be selected from configuration:

```typescript
import { registerTransport } from 'logan-logger';

registerTransport('syslog', (config, context) => new SyslogTransport(config.options));
```

## API Reference

### Core Methods
```typescript
interface ILogger {
  debug(message: string | (() => string), metadata?: any): void;
  info(message: string | (() => string), metadata?: any): void;
  warn(message: string | (() => string), metadata?: any): void;
  error(message: string | (() => string), metadata?: any): void;
  
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  child(metadata: Record<string, any>): ILogger;
}
```

### Factory Functions
```typescript
// Create logger with explicit configuration
createLogger(config?: Partial<LoggerConfig>): ILogger;

// Create logger based on environment
createLoggerForEnvironment(): ILogger;
```

## Development

### Setup
```bash
git clone <repository>
cd logan-logger-ts
pnpm install
```

### Commands
```bash
# Development
pnpm dev                    # Run with bun
pnpm test                   # Test watch mode
pnpm test:run              # Single test run
pnpm test:ui               # Test UI

# Building
pnpm build                 # Full build
pnpm typecheck            # Type checking
pnpm lint                  # Code linting

# Specific tests
vitest run tests/logger.test.ts
```

## Architecture

Logan Logger uses a **Factory + Adapter pattern**:

1. **Runtime Detection** - Automatically detects the current JavaScript environment
2. **Factory Creation** - Creates the appropriate logger implementation
3. **Runtime Adapters** - Optimized implementations for each environment
4. **Unified Interface** - Consistent API across all runtimes

### File Structure
```
src/
├── core/           # Core interfaces and factory
├── runtime/        # Runtime-specific implementations  
├── utils/          # Utilities (serialization, config, runtime detection)
└── index.ts        # Main exports
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass: `pnpm test:run`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Credits

Created by Logan Lindquist Land
