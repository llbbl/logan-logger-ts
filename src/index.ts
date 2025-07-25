// Main entry point for logan-logger
export * from '@/core/types';
export * from '@/core/logger';
export * from '@/core/factory';

// Runtime-specific exports
export { NodeLogger, createMorganStream } from '@/runtime/node';
export { BrowserLogger, ConsoleGroupLogger, PerformanceLogger } from '@/runtime/browser';

// Utilities
export * from '@/utils/runtime';
export * from '@/utils/config';
export * from '@/utils/serialization';

// Main factory function (available as named export)

// Convenience exports for common use cases
import { createLogger, createLoggerForEnvironment } from '@/core/factory';
import { LogLevel, ILogger } from '@/core/types';

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
} from '@/core/types';