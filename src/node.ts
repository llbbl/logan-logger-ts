// Node.js-specific exports
// Import this module only in Node.js environments

export { createLogger, createLoggerForEnvironment } from './core/factory.ts';
export {
  ConsoleTransport,
  createTransports,
  registerTransport,
  type Transport,
  type TransportFactory,
} from './core/transport.ts';

// Re-export core types that are needed when using NodeLogger
export type { ILogger, LoggerConfig, LogLevel, TransportConfig } from './core/types.ts';
// Importing this module registers the 'file' transport, which is why file
// logging is available from this entry point and not from the main one.
export { FileTransport, type FileTransportOptions } from './runtime/file-transport.ts';
export { createMorganStream, NodeLogger } from './runtime/node.ts';
// The config file loader. Reachable from the main, /bun and /deno entries too;
// this entry point already carries node:fs for the file transport, so exposing
// it here costs the bundle nothing and stops /node being the one runtime entry
// that cannot read a config file.
export * from './utils/config-file.ts';
