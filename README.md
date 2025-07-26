# Logan Logger

[![CI](https://github.com/llbbl/logan-logger-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/llbbl/logan-logger-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@logan/logger)](https://www.npmjs.com/package/@logan/logger)
[![JSR](https://jsr.io/badges/@logan/logger)](https://jsr.io/@logan/logger)

A universal TypeScript logging library that works consistently across all JavaScript runtimes: Node.js, Deno, Bun, browsers, and WebAssembly environments.

## Features

- 🌐 **Universal Runtime Support** - Works in Node.js, Deno, Bun, browsers, and WebAssembly
- 🪶 **Zero Dependencies** - Core functionality with no required dependencies
- ⚡ **Performance First** - Lazy evaluation, zero-allocation logging, minimal memory footprint
- 🎯 **TypeScript Native** - Full type safety with comprehensive type definitions
- 🔧 **Flexible Configuration** - Environment-based auto-configuration or manual setup
- 🔒 **Safe Serialization** - Handles circular references, Error objects, and sensitive data filtering
- 🎨 **Rich Browser Support** - Console styling, performance marks, grouping
- 📊 **Structured Logging** - Rich metadata support with child loggers

## Quick Start

```bash
npm install @logan/logger
# or
pnpm add @logan/logger
# or
yarn add @logan/logger
```

### Basic Usage

```typescript
import { createLogger, LogLevel } from '@logan/logger';

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

### Advanced Features

#### Lazy Evaluation for Performance
```typescript
// Function is only called if debug level is enabled
logger.debug(() => `Expensive computation: ${computeHeavyValue()}`);
```

#### Environment-Based Configuration
```typescript
import { createLoggerForEnvironment } from '@logan/logger';

// Automatically configures based on NODE_ENV
const logger = createLoggerForEnvironment();
// Production: ERROR level, JSON format
// Development: DEBUG level, colored console
// Test: WARN level
```

#### Runtime-Specific Imports

Logan Logger provides runtime-specific entry points for optimal bundling and type safety:

**🟢 Node.js with Winston Support:**
```typescript
import { createLogger, NodeLogger, createMorganStream } from '@logan/logger/node';

const logger = new NodeLogger({
  transports: [
    { type: 'file', options: { filename: 'app.log' } }
  ]
});

// Express/Morgan integration
app.use(morgan('combined', { stream: createMorganStream(logger) }));
```

**🌐 Browser-Optimized (Webpack/Vite-Safe):**
```typescript
import { createLogger, BrowserLogger, PerformanceLogger } from '@logan/logger/browser';

const logger = new PerformanceLogger();

logger.mark('api-start');
// ... API call
logger.measure('api-duration', 'api-start');
```

**🦕 Deno-Optimized:**
```typescript
import { createLogger, BrowserLogger } from '@logan/logger/deno';

const logger = createLogger({ colorize: true });
logger.info('Deno application started');
```

**🥟 Bun-Optimized:**
```typescript
import { createLogger, NodeLogger } from '@logan/logger/bun';

const logger = createLogger({ level: LogLevel.DEBUG });
logger.info('Bun application started');
```

**🔧 Auto-Detection (Generic):**
```typescript
import { createLogger } from '@logan/logger';

// Automatically selects appropriate logger based on runtime
const logger = createLogger();
```

#### Safe Data Handling
```typescript
import { filterSensitiveData } from '@logan/logger';

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
| Node.js 20+ | `@logan/logger/node` | ✅ Full | Winston + Console | File logging, transports, Morgan integration |
| Bun | `@logan/logger/bun` | ✅ Full | NodeLogger adapter | Same as Node.js |
| Browser | `@logan/logger/browser` | ✅ Full | Console API | CSS styling, performance marks, grouping |
| Deno | `@logan/logger/deno` | ✅ Basic | BrowserLogger adapter | Console logging (native implementation planned) |
| WebWorker | `@logan/logger/browser` | ✅ Basic | Console adapter | Basic console logging |
| Auto-detect | `@logan/logger` | ✅ Basic | Runtime detection | Automatic adapter selection |

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
LOG_TIMESTAMP=true   # true, false
LOG_COLOR=false      # true, false
```

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