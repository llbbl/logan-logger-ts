// Browser-specific exports
// Import this module when running in browser environments

export { BrowserLogger, ConsoleGroupLogger, PerformanceLogger } from './runtime/browser.ts';

// Re-export core types (no implementations that could pull in Node.js deps)
export type { ILogger, LoggerConfig } from './core/types.ts';
export { LogLevel } from './core/types.ts';

// Browser-safe utilities (no Node.js dependencies)
export * from './utils/runtime.ts';
export * from './utils/serialization.ts';
export * from './utils/formatting.ts';

// Browser-specific factory functions (avoid importing Node.js factory)
import { BrowserLogger } from './runtime/browser.ts';
import { type LoggerConfig, LogLevel, type ILogger } from './core/types.ts';
import { detectRuntime } from './utils/runtime.ts';

function getDefaultBrowserConfig(): LoggerConfig {
  const runtime = detectRuntime();
  
  return {
    level: LogLevel.INFO,
    format: 'text',
    timestamp: true,
    colorize: runtime.capabilities.colorSupport,
    metadata: {},
    transports: [
      {
        type: 'console',
        options: {}
      }
    ]
  };
}

function getBrowserEnvironment(): string {
  // Check various environment variables
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV || 
           process.env.NEXT_PUBLIC_APP_ENV || 
           process.env.ENVIRONMENT || 
           'development';
  }
  
  // Browser environment detection
  if (typeof window !== 'undefined') {
    // Check for common build-time environment indicators
    // biome-ignore lint/suspicious/noExplicitAny: Build-time global variable not in TS types
    return (globalThis as any).__ENV__ || 'development';
  }
  
  return 'development';
}

function getLogLevelForBrowserEnvironment(env: string): LogLevel {
  switch (env) {
    case 'production':
      return LogLevel.ERROR;
    case 'staging':
    case 'test':
      return LogLevel.WARN;
    case 'development':
    case 'dev':
      return LogLevel.DEBUG;
    default:
      return LogLevel.INFO;
  }
}

/**
 * Browser-specific logger factory function.
 * Creates a BrowserLogger instance without importing Node.js dependencies.
 */
export function createLogger(config: Partial<LoggerConfig> = {}): ILogger {
  const defaultConfig = getDefaultBrowserConfig();
  const mergedConfig = {
    ...defaultConfig,
    ...config,
    metadata: {
      ...defaultConfig.metadata,
      ...config.metadata
    }
  };
  
  return new BrowserLogger(mergedConfig);
}

/**
 * Create a browser logger with configuration based on the current environment.
 * Automatically detects production/development/test environments and
 * sets appropriate log levels and formatting.
 */
export function createLoggerForEnvironment(): ILogger {
  const env = getBrowserEnvironment();
  
  const config: Partial<LoggerConfig> = {
    level: getLogLevelForBrowserEnvironment(env),
    colorize: env !== 'production',
    timestamp: true,
    format: env === 'production' ? 'json' : 'text'
  };

  return createLogger(config);
}

// Pre-configured logger instances for convenience
export const logger = createLoggerForEnvironment();

// Legacy compatibility exports
export const log = {
  debug: (message: string, meta?: any) => logger.debug(message, meta),
  info: (message: string, meta?: any) => logger.info(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  error: (message: string, meta?: any) => logger.error(message, meta)
};