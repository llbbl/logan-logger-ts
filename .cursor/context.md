# Logan Logger - Context for Cursor

## Project Overview
Logan Logger is a universal TypeScript logging library that works consistently across all JavaScript runtimes: Node.js, Deno, Bun, browsers, and WebAssembly environments.

## Key Characteristics
- **Universal Runtime Support**: Works in Node.js, Deno, Bun, browsers, and WebAssembly
- **Zero Dependencies**: Core functionality with no required dependencies
- **Performance First**: Lazy evaluation, zero-allocation logging, minimal memory footprint
- **TypeScript Native**: Full type safety with comprehensive type definitions
- **Factory + Adapter Pattern**: Runtime detection with optimized implementations

## Project Structure

```
logan-logger/
├── src/
│   ├── core/                 # Core interfaces and factory
│   │   ├── types.ts         # Core type definitions and enums
│   │   ├── logger.ts        # Base logger interface and implementation
│   │   └── factory.ts       # Logger factory with runtime detection
│   ├── runtime/             # Runtime-specific implementations
│   │   ├── node.ts         # Node.js implementation (Winston integration)
│   │   └── browser.ts      # Browser implementation (Console API)
│   ├── utils/              # Utilities and helpers
│   │   ├── config.ts       # Configuration parsing and environment
│   │   ├── runtime.ts      # Runtime detection logic
│   │   └── serialization.ts # Safe serialization with circular refs
│   └── index.ts            # Main exports
├── tests/                  # Test files
├── docs/                   # Documentation
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Build configuration
└── vitest.config.ts       # Test configuration
```

## Core Architecture

### 1. Log Levels (Ascending Severity)
```typescript
enum LogLevel {
  DEBUG = 0,    // Most verbose
  INFO = 1,     // General information
  WARN = 2,     // Warning messages
  ERROR = 3,    // Error messages
  SILENT = 4    // No output
}
```

### 2. Runtime Detection
The library automatically detects the runtime environment:
- **Node.js**: Uses Winston for advanced features
- **Bun**: Uses Node.js adapter
- **Browser**: Uses Console API with styling
- **Deno**: Console adapter (native implementation planned)
- **WebWorker**: Basic console logging
- **WebAssembly**: Message passing to host

### 3. Key Interfaces
- `ILogger`: Main logger interface with debug/info/warn/error methods
- `LoggerConfig`: Configuration options (level, format, colorize, etc.)
- `RuntimeInfo`: Information about detected runtime and capabilities

## Important Design Patterns

### Factory Pattern
- `createLogger()`: Creates logger with explicit configuration
- `createLoggerForEnvironment()`: Auto-configures based on NODE_ENV

### Adapter Pattern
- Each runtime has its own optimized implementation
- Unified interface across all runtimes
- Runtime-specific features (file logging, performance marks, etc.)

### Lazy Evaluation
```typescript
// Function only called if debug level is enabled
logger.debug(() => `Expensive computation: ${computeHeavyValue()}`);
```

## Environment Configuration
Supports environment-based auto-configuration:
- `LOG_LEVEL`: debug, info, warn, error, silent
- `LOG_FORMAT`: json, text
- `LOG_TIMESTAMP`: true, false
- `LOG_COLOR`: true, false

## Build and Development

### Key Scripts
- `pnpm dev`: Run with bun
- `pnpm build`: Full build (clean + lib)
- `pnpm test`: Test watch mode
- `pnpm test:run`: Single test run
- `pnpm lint`: ESLint checking
- `pnpm typecheck`: TypeScript checking

### Build Tools
- **Vite**: For building and bundling
- **Vitest**: For testing
- **TypeScript**: Primary language
- **ESLint**: Code linting

## Key Features to Remember

1. **Child Loggers**: Support for creating child loggers with additional context
2. **Safe Serialization**: Handles circular references and sensitive data filtering
3. **Performance Optimized**: Zero-allocation logging, lazy evaluation
4. **Browser Features**: CSS styling, performance marks, console grouping
5. **Morgan Integration**: Express/Morgan stream support for Node.js

## Common Patterns

### Creating Loggers
```typescript
// Basic logger
const logger = createLogger({ level: LogLevel.DEBUG });

// Environment-based
const logger = createLoggerForEnvironment();

// Child logger with context
const requestLogger = logger.child({ requestId: 'req-123' });
```

### Runtime-Specific Features
```typescript
// Node.js with file transports
const nodeLogger = new NodeLogger({
  transports: [{ type: 'file', options: { filename: 'app.log' } }]
});

// Browser with performance
const browserLogger = new PerformanceLogger();
browserLogger.mark('api-start');
```

## Testing Strategy
- Uses Vitest for unit testing
- Tests cover all runtime environments
- Performance benchmarks for lazy evaluation
- Error handling and edge cases

## Dependencies
- **Dev Dependencies**: TypeScript, Vite, Vitest, ESLint
- **Peer Dependencies**: Winston (optional, for Node.js features)
- **Target**: Node.js 20+, modern browsers, Deno, Bun

This context should help you understand the codebase structure, key patterns, and architectural decisions when working with this universal logging library.