// Main entry point for logan-logger
export * from './core/types.ts';
export * from './core/logger.ts';
export * from './core/factory.ts';

// Runtime-specific exports  
export { BrowserLogger, ConsoleGroupLogger, PerformanceLogger } from './runtime/browser.ts';

// Utilities
export * from './utils/runtime.ts';
export * from './utils/config.ts';
export * from './utils/serialization.ts';
export * from './utils/formatting.ts';

// Main factory function (available as named export)

// Convenience exports for common use cases
import { createLogger, createLoggerForEnvironment } from './core/factory.ts';
import { LogLevel, type ILogger } from './core/types.ts';

// Pre-configured loggers for different environments
export const logger: ILogger = createLoggerForEnvironment();

// Legacy compatibility - matches your existing client/server code
export const log = {
  debug: (message: string, meta?: any): void => logger.debug(message, meta),
  info: (message: string, meta?: any): void => logger.info(message, meta),
  warn: (message: string, meta?: any): void => logger.warn(message, meta),
  error: (message: string, meta?: any): void => logger.error(message, meta),
};

// Named exports for explicit imports
export {
  createLogger,
  createLoggerForEnvironment,
  LogLevel
};

// Type-only exports for better tree-shaking
export type {
  ILogger,
  LoggerConfig,
  RuntimeInfo,
  RuntimeCapabilities,
  LogEntry,
  LogMessage,
  LogLevelString,
  RuntimeName,
  TransportConfig,
  ILoggerAdapter
} from './core/types.ts';