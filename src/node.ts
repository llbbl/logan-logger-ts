// Node.js-specific exports
// Import this module only in Node.js environments

export { createLogger, createLoggerForEnvironment } from './core/factory.ts';

// Re-export core types that are needed when using NodeLogger
export type { ILogger, LoggerConfig, LogLevel } from './core/types.ts';
export { createMorganStream, NodeLogger } from './runtime/node.ts';
