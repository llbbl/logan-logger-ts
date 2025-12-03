// Main entry point for logan-logger

export * from './core/factory.ts';
export * from './core/logger.ts';
export * from './core/types.ts';

// Runtime-specific exports
export { BrowserLogger, ConsoleGroupLogger, PerformanceLogger } from './runtime/browser.ts';
export * from './utils/config.ts';
export * from './utils/formatting.ts';
// Utilities
export * from './utils/runtime.ts';
export * from './utils/serialization.ts';

// Main factory function (available as named export)

// Convenience exports for common use cases
import { createLogger, createLoggerForEnvironment } from './core/factory.ts';
import { type ILogger, LogLevel } from './core/types.ts';

// Pre-configured loggers for different environments
export const logger: ILogger = createLoggerForEnvironment();

// Legacy compatibility - matches your existing client/server code
export const log = {
  // biome-ignore lint/suspicious/noExplicitAny: Intentional - legacy API accepts arbitrary metadata
  debug: (message: string, meta?: any): void => logger.debug(message, meta),
  // biome-ignore lint/suspicious/noExplicitAny: Intentional - legacy API accepts arbitrary metadata
  info: (message: string, meta?: any): void => logger.info(message, meta),
  // biome-ignore lint/suspicious/noExplicitAny: Intentional - legacy API accepts arbitrary metadata
  warn: (message: string, meta?: any): void => logger.warn(message, meta),
  // biome-ignore lint/suspicious/noExplicitAny: Intentional - legacy API accepts arbitrary metadata
  error: (message: string, meta?: any): void => logger.error(message, meta),
};

// Named exports for explicit imports
export { createLogger, createLoggerForEnvironment, LogLevel };

// Type-only exports for better tree-shaking
export type {
  ILogger,
  ILoggerAdapter,
  LogEntry,
  LoggerConfig,
  LogLevelString,
  LogMessage,
  RuntimeCapabilities,
  RuntimeInfo,
  RuntimeName,
  TransportConfig,
} from './core/types.ts';
