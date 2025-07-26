// Deno-specific exports
// Import this module when running in Deno environments

export { BrowserLogger, ConsoleGroupLogger, PerformanceLogger } from './runtime/browser.ts';

// Re-export core functionality optimized for Deno
export type { ILogger, LoggerConfig, LogLevel } from './core/types.ts';
export { createLogger, createLoggerForEnvironment } from './core/factory.ts';

// Deno-specific utilities
export * from './utils/runtime.ts';
export * from './utils/config.ts';
export * from './utils/serialization.ts';
export * from './utils/formatting.ts';