# Webpack & Bundler Compatibility

This document covers webpack and bundler compatibility for Logan Logger, including configuration for Next.js, Vite, Webpack, Rollup, and other popular bundlers.

## Overview

Logan Logger v1.1.4+ includes specific fixes for modern bundler compatibility:
- ✅ TypeScript declaration files are webpack-safe
- ✅ Proper tree-shaking support
- ✅ No Node.js leakage in browser bundles
- ✅ Support for all major bundlers

## Bundler Support Matrix

| Bundler | Status | Configuration Required | Notes |
|---------|--------|----------------------|-------|
| **Next.js 13+** | ✅ Full | None | Automatic compatibility |
| **Vite** | ✅ Full | None | Works out of the box |
| **Webpack 5** | ✅ Full | Minimal | May need ignore-loader for .d.ts |
| **Rollup** | ✅ Full | None | Excellent tree-shaking |
| **esbuild** | ✅ Full | None | Fast bundling |
| **Parcel** | ✅ Basic | None | Basic functionality |
| **Turbopack** | ✅ Full | None | Next.js compatibility |

## Next.js Configuration

### Automatic Configuration (Recommended)

Logan Logger works out of the box with Next.js 13+. No configuration needed:

```typescript
// Just import and use
import { createLogger } from 'logan-logger';

const logger = createLogger();
```

### Manual Configuration (If Needed)

If you encounter TypeScript declaration file issues, add this to your `next.config.js`:

```javascript
// next.config.js
module.exports = {
  webpack: (config, { isServer }) => {
    // Only add if you encounter .d.ts parsing errors
    config.module.rules.push({
      test: /\.d\.ts$/,
      use: 'ignore-loader',
    });

    return config;
  },
};
```

Then install the ignore-loader:

```bash
npm install -D ignore-loader
# or
pnpm add -D ignore-loader
```

## Vite Configuration

Vite works perfectly with Logan Logger without any configuration:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  // No special configuration needed for Logan Logger
  plugins: [
    // Your existing plugins
  ],
});
```

### Tree Shaking with Vite

Logan Logger is optimized for tree shaking:

```typescript
// ✅ Good - only imports what's needed
import { createLogger, LogLevel } from 'logan-logger';

// ❌ Avoid - imports everything
import * as LoganLogger from 'logan-logger';
```

## Webpack 5 Configuration

### Basic Setup

Most Webpack 5 projects work without configuration:

```javascript
// webpack.config.js
module.exports = {
  // Standard webpack configuration
  entry: './src/index.js',
  // Logan Logger works with default settings
};
```

### Advanced Configuration

If you encounter issues with TypeScript declaration files:

```javascript
// webpack.config.js
module.exports = {
  module: {
    rules: [
      // Your existing rules
      {
        test: /\.d\.ts$/,
        use: 'ignore-loader',
      },
    ],
  },
  resolve: {
    // Ensure proper resolution of logan-logger
    alias: {
      'logan-logger': require.resolve('logan-logger'),
    },
  },
};
```

### Node.js Polyfills

If you're bundling for the browser and encounter Node.js module errors:

```javascript
// webpack.config.js
module.exports = {
  resolve: {
    fallback: {
      // Only if you see "Can't resolve 'fs'" errors
      fs: false,
      path: false,
      crypto: false,
    },
  },
};
```

## Rollup Configuration

Rollup works excellently with Logan Logger:

```javascript
// rollup.config.js
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/bundle.js',
    format: 'es',
  },
  plugins: [
    nodeResolve({
      // Logan Logger is ESM-ready
      preferBuiltins: false,
    }),
    commonjs(),
  ],
  external: [
    // Externalize winston for Node.js builds
    'winston',
  ],
};
```

### Tree Shaking with Rollup

Logan Logger has excellent tree-shaking support:

```javascript
// rollup.config.js
export default {
  output: {
    file: 'dist/bundle.js',
    format: 'es',
    // Tree shaking is automatic with Logan Logger
  },
  treeshake: {
    // Logan Logger is side-effect free
    moduleSideEffects: false,
  },
};
```

## esbuild Configuration

esbuild works seamlessly:

```javascript
// build.js
require('esbuild').build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'esm',
  // Logan Logger works with default settings
  external: ['winston'], // Only for Node.js builds
});
```

## Parcel Configuration

Parcel works with minimal configuration:

```json
// package.json
{
  "targets": {
    "default": {
      "engines": {
        "browsers": ["last 2 versions"]
      }
    }
  }
}
```

## Environment-Specific Bundling

### Browser-Only Bundle

```javascript
// webpack.config.js (browser)
module.exports = {
  resolve: {
    alias: {
      // Use browser-specific entry point
      'logan-logger': 'logan-logger/browser',
    },
    fallback: {
      // Exclude Node.js modules
      fs: false,
      path: false,
    },
  },
};
```

### Node.js-Only Bundle

```javascript
// webpack.config.js (Node.js)
module.exports = {
  target: 'node',
  resolve: {
    alias: {
      // Use Node.js-specific entry point
      'logan-logger': 'logan-logger/node',
    },
  },
  externals: {
    // Don't bundle winston
    winston: 'winston',
  },
};
```

## Common Issues and Solutions

### Issue: "Module parse failed: Unexpected token"

**Cause**: TypeScript declaration files being processed by webpack loaders.

**Solution**: Add ignore-loader for .d.ts files:

```javascript
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.d\.ts$/,
        use: 'ignore-loader',
      },
    ],
  },
};
```

### Issue: "Can't resolve 'fs'" in browser builds

**Cause**: Node.js-specific code being included in browser bundle.

**Solution**: Configure webpack fallbacks:

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

### Issue: Large bundle size

**Cause**: Entire library being included instead of tree-shaking.

**Solution**: Use named imports:

```typescript
// ✅ Good
import { createLogger, LogLevel } from 'logan-logger';

// ❌ Bad
import * as LoganLogger from 'logan-logger';
```

### Issue: Winston errors in browser

**Cause**: Server-side logger being used in browser context.

**Solution**: Use environment-specific imports:

```typescript
// For universal code
import { createLogger } from 'logan-logger';

// For browser-specific code
import { createLogger } from 'logan-logger/browser';

// For Node.js-specific code
import { createLogger } from 'logan-logger/node';
```

## Performance Optimization

### Bundle Analysis

Use bundle analyzers to verify Logan Logger integration:

```bash
# Webpack Bundle Analyzer
npm install -D webpack-bundle-analyzer

# Rollup Plugin Visualizer
npm install -D rollup-plugin-visualizer

# Vite Bundle Analyzer
npm install -D vite-bundle-analyzer
```

### Tree Shaking Verification

Verify tree shaking is working:

```javascript
// webpack.config.js
module.exports = {
  optimization: {
    usedExports: true,
    sideEffects: false,
  },
};
```

Logan Logger is marked as side-effect free in package.json:

```json
{
  "sideEffects": false
}
```

### Code Splitting

Split Logan Logger into separate chunks:

```javascript
// webpack.config.js
module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        logger: {
          test: /[\\/]node_modules[\\/]logan-logger[\\/]/,
          name: 'logger',
          chunks: 'all',
        },
      },
    },
  },
};
```

## Testing Configuration

### Jest with Webpack

```javascript
// jest.config.js
module.exports = {
  moduleNameMapping: {
    '^logan-logger$': 'logan-logger',
  },
  transformIgnorePatterns: [
    'node_modules/(?!logan-logger)',
  ],
};
```

### Vitest

```javascript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Logan Logger works with default Vitest settings
  },
});
```

## TypeScript Configuration

### tsconfig.json

Ensure proper TypeScript configuration:

```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true
  }
}
```

### Type Declarations

Logan Logger provides full TypeScript support:

```typescript
import type { ILogger, LoggerConfig, LogLevel } from 'logan-logger';

const config: LoggerConfig = {
  level: LogLevel.INFO,
  format: 'json',
  timestamp: true,
  colorize: false,
  metadata: {}
};
```

## Migration Guide

### From Other Loggers

Most bundler configurations for other loggers work with Logan Logger:

```javascript
// Before (with other logger)
module.exports = {
  resolve: {
    alias: {
      'old-logger': 'other-logger/browser',
    },
  },
};

// After (with Logan Logger)
module.exports = {
  resolve: {
    alias: {
      'old-logger': 'logan-logger/browser',
    },
  },
};
```

### Gradual Migration

Migrate gradually by aliasing:

```javascript
// webpack.config.js
module.exports = {
  resolve: {
    alias: {
      // Gradually replace old logger
      '@/logger': 'logan-logger',
    },
  },
};
```

## Support

For bundler-specific issues:

1. **Check the compatibility matrix** above
2. **Review common issues** and solutions
3. **Open an issue** with your bundler configuration
4. **Join discussions** for community support

## Examples

Complete working examples for each bundler can be found in the [examples directory](../examples) of the Logan Logger repository.

- [Next.js Example](../examples/nextjs)
- [Vite Example](../examples/vite)
- [Webpack Example](../examples/webpack)
- [Rollup Example](../examples/rollup)