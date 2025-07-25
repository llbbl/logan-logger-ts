### Logan Logger TypeScript - Development Guidelines

This document provides essential information for developers working on the logan-logger-ts project.

### Build/Configuration Instructions

#### Project Setup

1. **Install Dependencies**:
   ```bash
   pnpm install
   ```

2. **Development Environment**:
    - Node.js v20+ is required (as specified in package.json)
    - TypeScript 5.0+
    - Vite 5.0+ for building

#### Build Process

1. **Build the Library**:
   ```bash
   pnpm build
   ```
   This runs the following steps:
    - Cleans the dist directory (`pnpm build:clean`)
    - Builds the library using Vite (`pnpm build:lib`)

2. **Development Mode**:
   ```bash
   pnpm dev
   ```
   This runs the project using Bun for faster development.

3. **Type Checking**:
   ```bash
   pnpm typecheck
   ```
   Runs TypeScript compiler in check-only mode without emitting files.

4. **Linting**:
   ```bash
   pnpm lint
   ```
   Runs ESLint on the source files.

### Testing Information

#### Running Tests

1. **Run All Tests**:
   ```bash
   pnpm test
   ```
   This runs Vitest in watch mode.

2. **Run Tests Once**:
   ```bash
   pnpm test:run
   ```
   Runs all tests once and exits.

3. **Visual Test UI**:
   ```bash
   pnpm test:ui
   ```
   Opens the Vitest UI for visual test exploration.

#### Test Configuration

- Tests are configured in `vitest.config.ts`
- Coverage thresholds are set to 80% for branches, functions, lines, and statements
- Test files should be named with `.test.ts` or `.spec.ts` extensions
- Tests are located in the `tests` directory or alongside source files

#### Adding New Tests

1. Create a new test file with `.test.ts` or `.spec.ts` extension
2. Import the necessary components and Vitest functions
3. Write your tests using the Vitest API
4. Run the tests to verify they pass

Example test structure:
```typescript
import { describe, it, expect } from 'vitest';
import { createLogger, LogLevel } from '@/index';

describe('Logger', () => {
  it('should create a logger with default settings', () => {
    const logger = createLogger();
    expect(logger.getLevel()).toBe(LogLevel.INFO);
  });
});
```

### Additional Development Information

#### Project Structure

- **src/core/**: Core logger interfaces and base implementations
- **src/runtime/**: Runtime-specific logger implementations
- **src/utils/**: Utility functions for runtime detection, serialization, etc.
- **src/formatters/**: Log formatting utilities

#### Runtime Support

The library is designed to work across multiple JavaScript runtimes:
- Node.js: Full support with Winston integration (optional)
- Deno: Currently uses browser adapter (planned for native implementation)
- Bun: Currently uses Node.js adapter (planned for native implementation)
- Browser: Supported via BrowserLogger implementation
- WebWorker: Supported via BrowserLogger implementation

#### Key Design Patterns

1. **Factory Pattern**: `LoggerFactory` creates the appropriate logger for the current runtime
2. **Adapter Pattern**: Runtime-specific adapters implement the common `ILogger` interface
3. **Decorator Pattern**: Child loggers decorate parent loggers with additional metadata

#### Configuration System

- Configuration can be provided via:
    - Direct configuration object to `createLogger()`
    - Environment variables (LOGAN_LOG_LEVEL, etc.)
    - Configuration files (logan.config.json, package.json)

#### Winston Integration

- Winston is an optional peer dependency
- The NodeLogger will use Winston if available, falling back to console logging
- In production mode, Winston is configured with file transports for error.log and combined.log

#### Performance Considerations

- Use lazy evaluation for expensive log messages:
  ```typescript
  logger.debug(() => `Expensive calculation: ${calculateExpensiveValue()}`);
  ```
- Child loggers share the same underlying transport to minimize overhead
- Log level filtering happens early to avoid unnecessary processing

#### Build Output

The build process generates:
- CommonJS module (index.js)
- ES module (index.esm.js)
- TypeScript declarations (index.d.ts)

#### Code Style and Conventions

- Use TypeScript strict mode
- Follow ESLint rules defined in .eslintrc.json
- Use JSDoc comments for public APIs
- Use named exports rather than default exports
- Use .js extension in imports (for ESM compatibility)