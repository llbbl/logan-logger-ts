// Browser-specific exports
// Import this module when running in browser environments

export { BrowserLogger, ConsoleGroupLogger, PerformanceLogger } from './runtime/browser.ts';

// Re-export core functionality optimized for browsers  
export type { ILogger, LoggerConfig, LogLevel } from './core/types.ts';
export { createLogger, createLoggerForEnvironment } from './core/factory.ts';

// Browser-safe utilities (no Node.js dependencies)
export * from './utils/runtime.ts';
export * from './utils/serialization.ts';
export * from './utils/formatting.ts';

// Note: config utils excluded as they may include Node.js fs dependencies