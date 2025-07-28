# Next.js Compatibility Guide

Logan Logger is fully compatible with Next.js and modern webpack-based bundlers. This guide covers setup, usage patterns, and troubleshooting for Next.js applications.

## Overview

Logan Logger v1.1.4+ includes specific fixes for Next.js webpack compatibility:
- ✅ TypeScript declaration files work with webpack bundling
- ✅ Proper tree-shaking and dead code elimination
- ✅ Server/client component separation
- ✅ API route integration
- ✅ Edge runtime support

## Quick Start

### Installation

```bash
npm install logan-logger
# or
pnpm add logan-logger
# or
yarn add logan-logger
```

### Basic Usage

#### Client Components

```tsx
'use client';

import { createLogger, LogLevel } from 'logan-logger';

const logger = createLogger({
  level: LogLevel.INFO,
  colorize: true,
  timestamp: true
});

export default function ClientComponent() {
  const handleClick = () => {
    logger.info('Button clicked!', { component: 'ClientComponent' });
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

#### Server Components

```tsx
import { createLogger, LogLevel } from 'logan-logger';

const logger = createLogger({
  level: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  format: 'json',
  timestamp: true
});

export default async function ServerComponent() {
  logger.info('Server component rendered', { 
    timestamp: new Date().toISOString() 
  });

  return <div>Server-rendered content</div>;
}
```

#### API Routes

```typescript
// app/api/example/route.ts
import { NextResponse } from 'next/server';
import { createLogger, LogLevel } from 'logan-logger';

const logger = createLogger({
  level: LogLevel.INFO,
  format: 'json',
  metadata: {
    service: 'api',
    endpoint: '/api/example'
  }
});

export async function GET() {
  const startTime = Date.now();
  
  logger.info('API request received');
  
  try {
    // Your API logic here
    const data = { message: 'Hello World' };
    
    const duration = Date.now() - startTime;
    logger.info('API request completed', { 
      statusCode: 200, 
      duration 
    });
    
    return NextResponse.json(data);
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('API request failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      statusCode: 500,
      duration
    });
    
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
```

## Advanced Configuration

### Environment-Based Configuration

Create a logger utility that adapts to your environment:

```typescript
// lib/logger.ts
import { createLogger, LogLevel, ILogger } from 'logan-logger';

function createAppLogger(): ILogger {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isServer = typeof window === 'undefined';

  return createLogger({
    level: isDevelopment ? LogLevel.DEBUG : LogLevel.INFO,
    format: isDevelopment ? 'text' : 'json',
    colorize: isDevelopment && isServer,
    timestamp: true,
    metadata: {
      environment: process.env.NODE_ENV,
      runtime: isServer ? 'server' : 'client'
    }
  });
}

export const logger = createAppLogger();
```

### Structured Logging with Context

```typescript
// lib/contextLogger.ts
import { logger } from './logger';

export const apiLogger = logger.child({ 
  service: 'api',
  version: process.env.npm_package_version 
});

export const dbLogger = logger.child({ 
  service: 'database',
  component: 'queries' 
});

export const authLogger = logger.child({ 
  service: 'auth',
  component: 'middleware' 
});
```

### Request Logging Middleware

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createLogger } from 'logan-logger';

const logger = createLogger({
  format: 'json',
  metadata: { service: 'middleware' }
});

export function middleware(request: NextRequest) {
  const start = Date.now();
  
  logger.info('Request started', {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent')
  });

  const response = NextResponse.next();

  // Log response (Note: actual duration logging would need a different approach)
  response.headers.set('x-request-id', crypto.randomUUID());
  
  return response;
}

export const config = {
  matcher: '/api/:path*'
};
```

## Server vs Client Separation

### Best Practices

1. **Use different loggers for server and client**:
   ```typescript
   // Server logger with file transports, detailed metadata
   const serverLogger = createLogger({
     level: LogLevel.DEBUG,
     format: 'json',
     metadata: { service: 'api' }
   });

   // Client logger with console output, user-friendly format
   const clientLogger = createLogger({
     level: LogLevel.WARN, // Less verbose on client
     format: 'text',
     colorize: true
   });
   ```

2. **Avoid importing server-only code on client**:
   ```typescript
   // ❌ Don't do this - imports Node.js dependencies
   import { createLogger } from 'logan-logger/node';

   // ✅ Do this - works in both environments
   import { createLogger } from 'logan-logger';
   ```

3. **Use dynamic imports for server-only logging**:
   ```typescript
   // utils/conditionalLogger.ts
   export async function getServerLogger() {
     if (typeof window !== 'undefined') {
       throw new Error('Server logger cannot be used on client');
     }
     
     const { createLogger } = await import('logan-logger');
     return createLogger({
       level: LogLevel.DEBUG,
       format: 'json'
     });
   }
   ```

## Performance Considerations

### Tree Shaking

Logan Logger is optimized for tree shaking. Import only what you need:

```typescript
// ✅ Good - only imports what's needed
import { createLogger, LogLevel } from 'logan-logger';

// ❌ Avoid - imports everything
import * as LoganLogger from 'logan-logger';
```

### Lazy Evaluation

Use function-based messages for expensive operations:

```typescript
import { logger } from './lib/logger';

// ✅ Good - only serialized if debug level is enabled
logger.debug(() => `Complex data: ${JSON.stringify(expensiveObject)}`);

// ❌ Avoid - always serializes even if debug is disabled
logger.debug(`Complex data: ${JSON.stringify(expensiveObject)}`);
```

### Production Optimizations

```typescript
const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? LogLevel.ERROR : LogLevel.DEBUG,
  format: process.env.NODE_ENV === 'production' ? 'json' : 'text'
});
```

## Webpack Configuration (If Needed)

Most users won't need additional webpack configuration, but if you encounter issues:

```javascript
// next.config.js
module.exports = {
  webpack: (config, { isServer }) => {
    // Only needed if you encounter TypeScript declaration file issues
    config.module.rules.push({
      test: /\.d\.ts$/,
      use: 'ignore-loader',
    });

    return config;
  },
};
```

## Edge Runtime Support

Logan Logger works with Vercel Edge Runtime:

```typescript
// app/api/edge/route.ts
import { createLogger } from 'logan-logger';

export const runtime = 'edge';

const logger = createLogger({
  level: LogLevel.INFO,
  format: 'json'
});

export async function GET() {
  logger.info('Edge function executed');
  return new Response('Hello from Edge!');
}
```

## Common Patterns

### Database Query Logging

```typescript
import { logger } from '@/lib/logger';

export async function getUserById(id: string) {
  const start = Date.now();
  
  try {
    logger.debug('Database query started', { operation: 'getUserById', userId: id });
    
    const user = await db.user.findUnique({ where: { id } });
    
    const duration = Date.now() - start;
    logger.info('Database query completed', {
      operation: 'getUserById',
      userId: id,
      duration,
      found: !!user
    });
    
    return user;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Database query failed', {
      operation: 'getUserById',
      userId: id,
      duration,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}
```

### Authentication Logging

```typescript
export async function loginUser(email: string, password: string) {
  const authLogger = logger.child({ operation: 'login', email });
  
  authLogger.info('Login attempt started');
  
  try {
    // Authentication logic
    const user = await authenticate(email, password);
    
    authLogger.info('Login successful', { userId: user.id });
    return user;
  } catch (error) {
    authLogger.warn('Login failed', { 
      reason: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}
```

## TypeScript Support

Logan Logger provides full TypeScript support:

```typescript
import { ILogger, LogLevel, LoggerConfig } from 'logan-logger';

// Custom logger factory with typed configuration
function createTypedLogger(config: Partial<LoggerConfig>): ILogger {
  return createLogger({
    level: LogLevel.INFO,
    format: 'json',
    ...config
  });
}

// Typed metadata
interface ApiLogMetadata {
  requestId: string;
  userId?: string;
  endpoint: string;
  method: string;
}

const apiLogger = logger.child({} as ApiLogMetadata);
```

## Error Handling

```typescript
import { logger } from '@/lib/logger';

export async function withErrorLogging<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  const operationLogger = logger.child({ operation });
  
  try {
    operationLogger.debug('Operation started');
    const result = await fn();
    
    const duration = Date.now() - start;
    operationLogger.info('Operation completed', { duration });
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    operationLogger.error('Operation failed', {
      duration,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    });
    throw error;
  }
}

// Usage
const user = await withErrorLogging('fetchUser', () => getUserById(id));
```

## Troubleshooting

### Common Issues

1. **"Module not found: Can't resolve 'fs'"**
   - This happens when server-only code is imported on the client
   - Solution: Use dynamic imports or separate client/server loggers

2. **TypeScript declaration file errors**
   - Update to logan-logger v1.1.4+ which includes webpack fixes
   - Add webpack configuration if needed (see above)

3. **Performance issues in development**
   - Reduce log level in production
   - Use lazy evaluation for expensive log messages

4. **Missing logs in production**
   - Check log level configuration
   - Ensure proper environment variable setup

### Debug Mode

Enable debug logging to troubleshoot issues:

```typescript
const logger = createLogger({
  level: LogLevel.DEBUG,
  format: 'text',
  colorize: true
});

logger.debug('Debug mode enabled');
```

## Migration from Other Loggers

### From console.log

```typescript
// Before
console.log('User logged in:', userId);
console.error('Login failed:', error);

// After
import { logger } from '@/lib/logger';

logger.info('User logged in', { userId });
logger.error('Login failed', { error: error.message });
```

### From Winston

```typescript
// Before (Winston)
import winston from 'winston';
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

// After (Logan Logger)
import { createLogger, LogLevel } from 'logan-logger';
const logger = createLogger({
  level: LogLevel.INFO,
  format: 'json'
});
```

### From Pino

```typescript
// Before (Pino)
import pino from 'pino';
const logger = pino({ level: 'info' });

// After (Logan Logger)
import { createLogger, LogLevel } from 'logan-logger';
const logger = createLogger({ level: LogLevel.INFO });
```

## Examples Repository

For complete working examples, see the [examples directory](../examples) in the Logan Logger repository.

## Support

- **Issues**: [GitHub Issues](https://github.com/loganlindquist/logan-logger-ts/issues)
- **Discussions**: [GitHub Discussions](https://github.com/loganlindquist/logan-logger-ts/discussions)
- **Documentation**: [Full Documentation](../README.md)