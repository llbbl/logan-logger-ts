// Deno-specific exports
// Import this module when running in Deno environments

export { createLogger, createLoggerForEnvironment } from './core/factory.ts';

// Re-export core functionality optimized for Deno
export {
  ConsoleTransport,
  createTransports,
  registerTransport,
  type Transport,
  type TransportFactory,
} from './core/transport.ts';
export type { ILogger, LoggerConfig, LogLevel, TransportConfig } from './core/types.ts';
export { BrowserLogger, ConsoleGroupLogger, PerformanceLogger } from './runtime/browser.ts';
export * from './utils/config.ts';
export * from './utils/formatting.ts';
// Deno-specific utilities
export * from './utils/runtime.ts';
export * from './utils/serialization.ts';
