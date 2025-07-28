# Troubleshooting Guide

This guide covers common issues, error messages, and solutions when using Logan Logger across different environments and bundlers.

## Quick Diagnostic

Use this checklist to quickly identify your issue:

1. **Which environment?** (Next.js, Node.js, Browser, Deno, Bun)
2. **Which bundler?** (Webpack, Vite, Rollup, esbuild, Parcel)
3. **Error category?** (Build-time, Runtime, TypeScript, Import)
4. **Logan Logger version?** (Check with `npm list logan-logger`)

## Common Error Categories

### 🔧 Build-Time Errors

#### Error: "Module parse failed: Unexpected token"

**Full Error:**
```
Module parse failed: Unexpected token (3:7)
File was processed with these loaders:
...
> export type { ILogger, LoggerConfig } from './core/types';
```

**Cause:** TypeScript declaration files being processed by webpack loaders.

**Solution:**
```javascript
// next.config.js or webpack.config.js
module.exports = {
  webpack: (config) => {
    config.module.rules.push({
      test: /\.d\.ts$/,
      use: 'ignore-loader',
    });
    return config;
  },
};
```

**Install ignore-loader:**
```bash
npm install -D ignore-loader
```

#### Error: "Can't resolve 'fs'"

**Full Error:**
```
Module not found: Can't resolve 'fs'
Import trace for requested module:
./node_modules/winston/dist/winston/transports/file.js
```

**Cause:** Server-side code (winston) being imported in browser context.

**Solutions:**

1. **For Next.js** - Use proper component separation:
   ```typescript
   // ❌ Don't import server logger in client components
   'use client';
   import serverLogger from '@/utils/serverLogger'; // Contains winston

   // ✅ Use browser-safe logger in client components
   'use client';
   import { createLogger } from 'logan-logger';
   ```

2. **For Webpack** - Configure fallbacks:
   ```javascript
   // webpack.config.js
   module.exports = {
     resolve: {
       fallback: {
         fs: false,
         path: false,
         crypto: false,
       },
     },
   };
   ```

3. **For Vite** - Configure define:
   ```javascript
   // vite.config.js
   export default defineConfig({
     define: {
       global: 'globalThis',
     },
   });
   ```

#### Error: "Cannot use import statement outside a module"

**Cause:** ESM/CommonJS module mismatch.

**Solution:**
```javascript
// If using CommonJS, use require
const { createLogger } = require('logan-logger');

// If using ESM, ensure package.json has:
{
  "type": "module"
}
```

### 🚀 Runtime Errors

#### Error: "logger.debug is not a function"

**Cause:** Logger not properly initialized or wrong import.

**Check:**
```typescript
// ✅ Correct
import { createLogger } from 'logan-logger';
const logger = createLogger();

// ❌ Wrong
import LoganLogger from 'logan-logger'; // Default import doesn't exist
```

#### Error: "Cannot read properties of undefined"

**Cause:** Logger creation failed or environment detection issues.

**Debug:**
```typescript
import { createLogger, detectRuntime } from 'logan-logger';

// Debug runtime detection
console.log('Runtime:', detectRuntime());

// Create logger with explicit config
const logger = createLogger({
  level: LogLevel.DEBUG,
  format: 'text'
});

console.log('Logger created:', !!logger);
```

### 📝 TypeScript Errors

#### Error: "Module 'logan-logger' has no exported member 'X'"

**Cause:** Outdated type definitions or wrong import.

**Check version:**
```bash
npm list logan-logger
```

**Update if needed:**
```bash
npm update logan-logger
```

**Use correct imports:**
```typescript
// ✅ Available exports
import { 
  createLogger, 
  LogLevel, 
  ILogger, 
  LoggerConfig 
} from 'logan-logger';

// ❌ Not available
import { Logger } from 'logan-logger'; // Use createLogger() instead
```

#### Error: "Type 'X' is not assignable to type 'Y'"

**Cause:** Type mismatch in configuration or metadata.

**Solution:**
```typescript
import { LogLevel, LoggerConfig } from 'logan-logger';

// ✅ Proper typing
const config: LoggerConfig = {
  level: LogLevel.INFO,
  format: 'json',
  timestamp: true,
  colorize: false,
  metadata: {}
};

// ✅ Proper metadata typing
const metadata: Record<string, any> = {
  userId: '123',
  requestId: 'req-456'
};
```

### 🌐 Environment-Specific Issues

#### Next.js Issues

**Error: "You're importing a component that needs 'styled-jsx'"**

**Solution:** Add `'use client'` directive:
```typescript
'use client';
import { createLogger } from 'logan-logger';
```

**Error: "Server Error: Cannot access 'process' before initialization"**

**Solution:** Use environment detection:
```typescript
const logger = createLogger({
  level: typeof process !== 'undefined' && process.env.NODE_ENV === 'development' 
    ? LogLevel.DEBUG 
    : LogLevel.INFO
});
```

#### Browser Issues

**Error: "winston is not defined"**

**Cause:** Server-specific logger used in browser.

**Solution:**
```typescript
// ✅ Browser-safe
import { createLogger } from 'logan-logger/browser';

// ✅ Universal (auto-detects environment)
import { createLogger } from 'logan-logger';
```

**Console not showing logs**

**Check log level:**
```typescript
const logger = createLogger({
  level: LogLevel.DEBUG, // Make sure level allows your messages
  colorize: true
});

// Verify level
console.log('Current level:', logger.getLevel());
```

#### Node.js Issues

**Error: "winston.createLogger is not a function"**

**Install winston:**
```bash
npm install winston
```

**Or use generic logger:**
```typescript
// ✅ No winston dependency
import { createLogger } from 'logan-logger';

// ✅ Explicit winston usage
import { createLogger } from 'logan-logger/node';
```

#### Deno Issues

**Error: "Module not found"**

**Use JSR import:**
```typescript
// ✅ For Deno
import { createLogger } from "@logan/logger";

// ❌ npm import won't work in Deno
import { createLogger } from "logan-logger";
```

### 📦 Bundle Size Issues

#### Large Bundle Size

**Check imports:**
```typescript
// ✅ Tree-shakeable
import { createLogger, LogLevel } from 'logan-logger';

// ❌ Imports everything
import * as LoganLogger from 'logan-logger';
```

**Analyze bundle:**
```bash
# Webpack Bundle Analyzer
npx webpack-bundle-analyzer dist/static/js/*.js

# Next.js Bundle Analyzer
npm install @next/bundle-analyzer
```

#### Duplicate Dependencies

**Check for multiple versions:**
```bash
npm ls logan-logger
```

**Resolve conflicts:**
```json
// package.json
{
  "resolutions": {
    "logan-logger": "^1.1.4"
  }
}
```

## Debugging Steps

### 1. Enable Debug Logging

```typescript
import { createLogger, LogLevel } from 'logan-logger';

const logger = createLogger({
  level: LogLevel.DEBUG,
  format: 'text',
  colorize: true
});

logger.debug('Debug logging enabled');
```

### 2. Check Runtime Detection

```typescript
import { detectRuntime } from 'logan-logger';

const runtime = detectRuntime();
console.log('Detected runtime:', runtime);
```

### 3. Verify Configuration

```typescript
const logger = createLogger({
  level: LogLevel.DEBUG,
  format: 'text'
});

console.log('Logger level:', logger.getLevel());
console.log('Logger config test');
logger.debug('Debug message');
logger.info('Info message');
```

### 4. Test Environment Variables

```bash
# Test different log levels
LOG_LEVEL=debug npm start
LOG_LEVEL=info npm start
LOG_LEVEL=error npm start
```

### 5. Isolate the Issue

Create a minimal reproduction:

```typescript
// minimal-test.js
import { createLogger, LogLevel } from 'logan-logger';

const logger = createLogger({
  level: LogLevel.DEBUG
});

logger.info('Test message');
console.log('Test completed');
```

## Performance Issues

### Slow Logging

**Use lazy evaluation:**
```typescript
// ✅ Only computed if debug enabled
logger.debug(() => `Expensive: ${computeExpensiveValue()}`);

// ❌ Always computed
logger.debug(`Expensive: ${computeExpensiveValue()}`);
```

### Memory Leaks

**Avoid circular references:**
```typescript
import { filterSensitiveData } from 'logan-logger';

const obj = { /* potentially circular */ };
const safe = filterSensitiveData(obj);
logger.info('Safe object', safe);
```

## Version-Specific Issues

### Upgrading from v1.1.3 to v1.1.4+

**Breaking changes:** None - fully backward compatible.

**New features:**
- Improved webpack compatibility
- Better TypeScript declarations
- Enhanced Next.js support

**Migration:**
```bash
npm update logan-logger
```

## Getting Help

### 1. Check Documentation

- [Next.js Compatibility Guide](./nextjs-compatibility.md)
- [Webpack Bundler Compatibility](./webpack-bundler-compatibility.md)
- [Environment Variables](./environment-variables.md)

### 2. Search Existing Issues

- [GitHub Issues](https://github.com/loganlindquist/logan-logger-ts/issues)
- [GitHub Discussions](https://github.com/loganlindquist/logan-logger-ts/discussions)

### 3. Create a Reproduction

Use this template for bug reports:

```typescript
// Environment
// - OS: 
// - Node.js version:
// - Logan Logger version:
// - Bundler: 

// Minimal reproduction
import { createLogger } from 'logan-logger';

const logger = createLogger();
logger.info('Test');

// Expected behavior:
// Actual behavior:
// Error message:
```

### 4. Provide Context

Include:
- Complete error message
- Stack trace
- Build configuration
- Package.json dependencies
- Environment details

## Quick Fixes

### Reset to Defaults

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Clear build cache (Next.js)
rm -rf .next

# Clear build cache (Vite)
rm -rf dist node_modules/.vite
```

### Use Specific Imports

```typescript
// If auto-detection fails, use specific imports
import { createLogger } from 'logan-logger/node';     // Node.js
import { createLogger } from 'logan-logger/browser';  // Browser
import { createLogger } from 'logan-logger/deno';     // Deno
import { createLogger } from 'logan-logger/bun';      // Bun
```

### Minimal Configuration

```typescript
// Start with minimal config
import { createLogger } from 'logan-logger';

const logger = createLogger(); // Uses defaults
logger.info('Test message');
```

## Still Having Issues?

1. **Update to latest version:** `npm update logan-logger`
2. **Check compatibility matrix** in documentation
3. **Review similar issues** in GitHub
4. **Create minimal reproduction** and open an issue
5. **Join community discussions** for help

Remember to include your environment details, error messages, and a minimal reproduction when seeking help!