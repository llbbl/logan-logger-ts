# Logan Logger TypeScript - Application Specification

## Overview

Logan Logger is a universal TypeScript logging library designed to provide consistent logging functionality across all JavaScript runtimes including Node.js, Deno, Bun, browsers, and WebAssembly environments. The library prioritizes minimal dependencies, runtime adaptability, and a unified API surface.

## Design Principles

### 1. Runtime Agnostic
- Single API that works across all JavaScript runtimes
- Automatic runtime detection and adapter selection
- Graceful fallbacks for unsupported features

### 2. Minimal Dependencies
- Zero dependencies for core functionality
- Optional runtime-specific dependencies (e.g., Winston for Node.js)
- Dependency injection pattern for extensibility

### 3. Performance First
- Zero-allocation logging in production
- Lazy evaluation of log messages
- Efficient serialization and formatting
- Minimal memory footprint

### 4. Developer Experience
- TypeScript-first with comprehensive type definitions
- Intuitive API similar to standard console methods
- Rich metadata and structured logging support
- Clear error messages and debugging information

## Core Architecture

### Logger Interface

```typescript
interface ILogger {
  // Core logging methods
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  
  // Structured logging
  log(level: LogLevel, message: string, metadata?: Record<string, any>): void;
  
  // Configuration
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
  
  // Context management
  child(metadata: Record<string, any>): ILogger;
}
```

### Log Levels

```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}
```

### Runtime Detection

```typescript
interface RuntimeInfo {
  name: 'node' | 'deno' | 'bun' | 'browser' | 'webworker' | 'unknown';
  version?: string;
  capabilities: RuntimeCapabilities;
}

interface RuntimeCapabilities {
  fileSystem: boolean;
  colorSupport: boolean;
  processInfo: boolean;
  streams: boolean;
}
```

## Runtime-Specific Implementations

### Node.js Logger
- **Primary**: Winston-based implementation with file rotation, transports
- **Fallback**: Console-based logger with formatting
- **Features**: File system logging, process info, color support, streams

### Deno Logger
- **Primary**: Native Deno logging APIs
- **Fallback**: Console-based logger
- **Features**: Structured logging, color support, permission-aware file logging

### Bun Logger
- **Primary**: Bun-optimized implementation using native APIs
- **Fallback**: Console-based logger
- **Features**: High-performance logging, color support

### Browser Logger
- **Primary**: Console API with styling and grouping
- **Fallback**: Basic console methods
- **Features**: Browser dev tools integration, styling, performance marks

### WebAssembly Logger
- **Primary**: Message passing to host environment
- **Fallback**: Console API (if available)
- **Features**: Minimal overhead, host communication

## Configuration System

### Configuration Schema

```typescript
interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'text' | 'custom';
  timestamp: boolean;
  colorize: boolean;
  metadata: Record<string, any>;
  transports?: TransportConfig[];
}

interface TransportConfig {
  type: 'console' | 'file' | 'http' | 'custom';
  level?: LogLevel;
  options: Record<string, any>;
}
```

### Environment-Based Configuration

```typescript
// Environment variables
LOG_LEVEL=info
LOG_FORMAT=json
LOG_TIMESTAMP=true
LOG_COLOR=false

// Configuration file support
// logan.config.json, logan.config.js
```

## Factory Pattern

```typescript
class LoggerFactory {
  static create(config?: Partial<LoggerConfig>): ILogger {
    const runtime = detectRuntime();
    const adapter = this.getAdapter(runtime);
    return new adapter(this.mergeConfig(config));
  }
  
  static createChild(parent: ILogger, metadata: Record<string, any>): ILogger {
    return parent.child(metadata);
  }
}
```

## Message Formatting

### Structured Logging

```typescript
// Key-value pairs
logger.info('User login', { userId: '123', ip: '192.168.1.1' });

// Error objects
logger.error('Database connection failed', { error: dbError });

// Performance metrics
logger.info('API response', { endpoint: '/api/users', duration: 150 });
```

### Output Formats

#### JSON Format
```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "level": "info",
  "message": "User login",
  "metadata": {
    "userId": "123",
    "ip": "192.168.1.1"
  },
  "runtime": "node",
  "pid": 1234
}
```

#### Text Format
```
2024-01-01T00:00:00.000Z [INFO] User login userId=123 ip=192.168.1.1
```

## Error Handling

### Error Serialization
- Safe serialization of Error objects
- Stack trace preservation
- Circular reference handling
- Sensitive data filtering

### Graceful Degradation
- Fallback to console methods if runtime adapter fails
- Silent failure mode for production environments
- Error reporting to configured error handlers

## Performance Optimizations

### Lazy Evaluation
```typescript
logger.debug(() => `Expensive operation result: ${computeExpensiveValue()}`);
```

### Message Pooling
- Object pooling for log message structures
- String interning for repeated messages
- Memory-efficient metadata handling

### Batching (where supported)
- Batch log writes for improved I/O performance
- Configurable batch sizes and flush intervals
- Automatic flushing on process exit

## API Examples

### Basic Usage
```typescript
import { createLogger } from 'logan-logger';

const logger = createLogger();

logger.info('Application started');
logger.warn('Configuration file not found, using defaults');
logger.error('Failed to connect to database', { error: dbError });
```

### Advanced Usage
```typescript
import { createLogger, LogLevel } from 'logan-logger';

const logger = createLogger({
  level: LogLevel.DEBUG,
  format: 'json',
  metadata: { service: 'api-server', version: '1.0.0' }
});

// Child logger with additional context
const requestLogger = logger.child({ requestId: '12345' });
requestLogger.info('Processing request');

// Structured logging
logger.info('User action', {
  action: 'purchase',
  userId: '123',
  amount: 99.99,
  timestamp: new Date()
});
```

## Package Structure

```
logan-logger-ts/
├── src/
│   ├── core/
│   │   ├── logger.ts          # Main logger interface
│   │   ├── factory.ts         # Logger factory
│   │   └── types.ts           # TypeScript definitions
│   ├── runtime/
│   │   ├── detector.ts        # Runtime detection
│   │   ├── node.ts            # Node.js implementation
│   │   ├── deno.ts            # Deno implementation
│   │   ├── bun.ts             # Bun implementation
│   │   ├── browser.ts         # Browser implementation
│   │   └── wasm.ts            # WebAssembly implementation
│   ├── formatters/
│   │   ├── json.ts            # JSON formatter
│   │   ├── text.ts            # Text formatter
│   │   └── custom.ts          # Custom formatter support
│   └── utils/
│       ├── config.ts          # Configuration handling
│       ├── errors.ts          # Error serialization
│       └── performance.ts     # Performance utilities
├── tests/
├── docs/
├── examples/
└── dist/
```

## Distribution Strategy

### NPM Package
- ES modules and CommonJS support
- TypeScript declarations included
- Tree-shaking friendly exports

### Deno Module
- Direct TypeScript imports
- Deno-specific optimizations
- No build step required

### CDN Distribution
- UMD builds for browser usage
- Minified production builds
- Source maps included

## Compatibility Matrix

| Runtime | Version | Status | Implementation | Dependencies |
|---------|---------|--------|----------------|--------------|
| Node.js | 20+     | ✅ Full | Winston wrapper | winston (optional) |
| Deno | 1.0+    | 🟡 Planned | Native APIs | None |
| Bun | 0.5+    | 🟡 Planned | Native APIs | None |
| Browser | Modern  | 🟡 Planned | Console API | None |
| WebWorker | Modern  | 🟡 Planned | Console API | None |
| WASM | Any     | 🟡 Planned | Message passing | None |

## Success Metrics

### Performance Targets
- < 1ms log message processing time
- < 10MB memory usage for typical applications
- < 100KB bundle size (core functionality)

### Compatibility Goals
- 100% API compatibility across runtimes
- Zero breaking changes in patch versions
- Comprehensive test coverage (>95%)

### Developer Experience
- Complete TypeScript support
- Rich IDE integration
- Clear documentation and examples
- Responsive issue resolution