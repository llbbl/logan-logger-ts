// Bun-specific exports
// Import this module when running in Bun environments

export { createLogger, createLoggerForEnvironment } from './core/factory.ts';

// Re-export core functionality optimized for Bun
export type { ILogger, LoggerConfig, LogLevel } from './core/types.ts';
export { NodeLogger } from './runtime/node.ts';
export * from './utils/config.ts';
export * from './utils/formatting.ts';
// Bun-specific utilities
export * from './utils/runtime.ts';
export * from './utils/serialization.ts';
