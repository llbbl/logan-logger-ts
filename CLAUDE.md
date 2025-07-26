# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Logan Logger TypeScript

Logan Logger (`logan-logger`) is a universal TypeScript logging library designed for all JavaScript runtimes (Node.js, Deno, Bun, browsers, WebAssembly). It provides a unified API with runtime-specific adapters and zero dependencies for core functionality.

**Package Name:** `logan-logger` (npm) / `@logan/logger` (JSR)  
**Version:** 1.1.0+  
**Runtime-Specific Imports:** Available via dedicated entry points for optimal bundling

## Development Commands

### Package Manager
- Use `pnpm` as the primary package manager
- Use `bun` for running scripts and development: `bun run src/index.ts`

### Core Development
```bash
# Install dependencies
pnpm install

# Development/testing
bun run src/index.ts          # Run development version
pnpm dev                      # Same as above

# Building
pnpm build                    # Full build (clean + lib)
pnpm build:clean              # Remove dist folder
pnpm build:lib                # Vite build only

# Testing
pnpm test                     # Watch mode
pnpm test:run                 # Single run
pnpm test:ui                  # UI interface
vitest run tests/specific.test.ts  # Single test file

# Code Quality
pnpm typecheck               # TypeScript checking
pnpm lint                    # ESLint
```

## Publishing Commands

- Manually publish the package using `deno publish --dry-run --allow-dirty` to ensure readiness before actual publication
- Package published as `logan-logger` on npm and `@logan/logger` on JSR
- Version 1.1.0+ includes runtime-specific entry points

## Architecture Overview

### Core Design Pattern
The library uses a **Factory + Adapter pattern** to provide unified logging across runtimes:

1. **Runtime Detection** (`@/utils/runtime.ts`) - Detects current JavaScript environment
2. **Factory Creation** (`@/core/factory.ts`) - Creates appropriate logger based on runtime
3. **Runtime Adapters** (`@/runtime/*`) - Runtime-specific implementations
4. **Unified Interface** (`@/core/types.ts`) - Common API across all adapters

### Key Architectural Decisions

**Runtime Adapters:**
- `NodeLogger` - Uses Winston (optional peer dependency) with console fallback
- `BrowserLogger` - Uses console API with CSS styling and performance integration
- Deno/Bun - Currently map to existing adapters, future dedicated implementations planned

**Lazy Evaluation:**
```typescript
// Messages can be functions for performance
logger.debug(() => `Expensive: ${computeHeavyValue()}`);
```

**Child Loggers:**
```typescript
// Create contextual loggers with additional metadata
const requestLogger = logger.child({ requestId: 'req-123' });
```

**Safe Serialization:**
- Handles circular references, Error objects, functions, BigInt, Symbol
- Optional sensitive data filtering for security

### Import Alias System
The codebase uses `@` aliases for cleaner imports:
```typescript
import { LogLevel } from '@/core/types.js';
import { detectRuntime } from '@/utils/runtime.js';
import { NodeLogger } from '@/runtime/node.js';
import { safeStringify } from '@/utils/serialization.js';
```

### Runtime-Specific Entry Points
Version 1.1.0+ provides dedicated entry points for optimal bundling and type safety:

```typescript
// NPM - Main entry (auto-detection)
import { createLogger } from 'logan-logger';

// NPM - Runtime-specific imports (recommended)
import { NodeLogger, createMorganStream } from 'logan-logger/node';     // Node.js + Winston
import { BrowserLogger, PerformanceLogger } from 'logan-logger/browser'; // Browser-optimized
import { createLogger } from 'logan-logger/deno';                        // Deno-optimized  
import { createLogger, NodeLogger } from 'logan-logger/bun';             // Bun-optimized

// JSR - For Deno (scoped package available)
import { createLogger } from '@logan/logger';
```

**Benefits:**
- **Webpack/Vite Safe**: Browser builds exclude Winston dependencies completely
- **Tree-shaking**: Only bundle what each runtime needs
- **Type Safety**: TypeScript knows exactly which features are available
- **Explicit**: Clear about which logger implementation you're getting

### Configuration Strategy
- **Environment-based**: `createLoggerForEnvironment()` auto-configures based on NODE_ENV
- **Manual**: `createLogger(config)` for explicit configuration
- **Environment variables**: `LOG_LEVEL`, `LOG_FORMAT`, `LOG_TIMESTAMP`, `LOG_COLOR`
- **Runtime capabilities**: Automatically enables/disables features based on runtime support

**Environment Variable Priority:**
1. Environment variables (e.g., `LOG_LEVEL`)
2. Manual configuration passed to createLogger()
3. NODE_ENV/NEXT_PUBLIC_APP_ENV/ENVIRONMENT defaults
4. Library defaults

### Testing Structure
- **Core tests**: `logger.test.ts`, `runtime.test.ts`, `serialization.test.ts`
- **Component tests**: `factory.test.ts`, `config.test.ts`
- **Runtime-specific**: `node-logger.test.ts`, `browser-logger.test.ts`
- **Integration**: `integration.test.ts` for end-to-end scenarios

### Winston Integration
Winston is an optional peer dependency:
- Available in Node.js: Full Winston features (file rotation, transports, etc.)
- Not available: Graceful fallback to console-based logging
- Zero impact on bundle size for browser environments

### Performance Considerations
- Log level filtering prevents expensive operations
- Metadata is safely serialized only when logging occurs
- Child loggers share configuration but maintain separate context
- Zero-allocation paths for disabled log levels

## Build and Distribution
- **Vite** for building with TypeScript declaration generation
- **Multiple entry points**: `index`, `node`, `browser`, `deno`, `bun`
- **Dual packages**: ESM (`.esm.js`) and CJS (`.js`) for each entry point
- **TypeScript declarations**: Full type support with declaration maps for each runtime
- **Tree-shaking friendly**: Runtime-specific exports and proper module structure
- **Webpack/bundler safe**: Browser entry points exclude Node.js dependencies