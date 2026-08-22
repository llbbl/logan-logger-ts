// Bun-specific exports
// Import this module when running in Bun environments

export { createLogger, createLoggerForEnvironment } from './core/factory.ts';
export {
  ConsoleTransport,
  createTransports,
  registerTransport,
  type Transport,
  type TransportFactory,
} from './core/transport.ts';

// Re-export core functionality optimized for Bun
export type { ILogger, LoggerConfig, LogLevel, TransportConfig } from './core/types.ts';
// Registers the 'file' transport for Bun, which implements node:fs.
export { FileTransport, type FileTransportOptions } from './runtime/file-transport.ts';
export { NodeLogger } from './runtime/node.ts';
export * from './utils/config-file.ts';
export * from './utils/config.ts';
export * from './utils/formatting.ts';
// Bun-specific utilities
export * from './utils/runtime.ts';
export * from './utils/serialization.ts';
