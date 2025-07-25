/**
 * Log levels in ascending order of severity.
 * Used to filter which messages should be logged.
 */
export enum LogLevel {
  /** Debug messages - most verbose */
  DEBUG = 0,
  /** Informational messages */
  INFO = 1,
  /** Warning messages */
  WARN = 2,
  /** Error messages */
  ERROR = 3,
  /** No messages - silent mode */
  SILENT = 4
}

/**
 * String representation of log levels.
 */
export type LogLevelString = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Supported JavaScript runtime environments.
 */
export type RuntimeName = 'node' | 'deno' | 'bun' | 'browser' | 'webworker' | 'unknown';

/**
 * Information about the detected JavaScript runtime environment.
 */
export interface RuntimeInfo {
  /** The name of the runtime */
  name: RuntimeName;
  /** Version string of the runtime (if available) */
  version?: string;
  /** Capabilities supported by this runtime */
  capabilities: RuntimeCapabilities;
}

/**
 * Capabilities that a runtime may or may not support.
 */
export interface RuntimeCapabilities {
  /** Whether the runtime supports file system operations */
  fileSystem: boolean;
  /** Whether the runtime supports colored console output */
  colorSupport: boolean;
  /** Whether the runtime provides process information */
  processInfo: boolean;
  /** Whether the runtime supports streams */
  streams: boolean;
}

/**
 * Configuration options for creating a logger instance.
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  level: LogLevel;
  /** Output format for log messages */
  format: 'json' | 'text' | 'custom';
  /** Whether to include timestamps in log output */
  timestamp: boolean;
  /** Whether to colorize log output (if supported) */
  colorize: boolean;
  /** Default metadata to include with all log messages */
  metadata: Record<string, any>;
  /** Transport configurations for log output */
  transports?: TransportConfig[];
}

/**
 * Configuration for a specific log transport (output destination).
 */
export interface TransportConfig {
  /** Type of transport */
  type: 'console' | 'file' | 'http' | 'custom';
  /** Minimum log level for this transport */
  level?: LogLevel;
  /** Transport-specific options */
  options: Record<string, any>;
}

/**
 * A log message can be a string or a function that returns a string.
 * Functions enable lazy evaluation for expensive log message generation.
 */
export type LogMessage = string | (() => string);

/**
 * Internal representation of a log entry.
 */
export interface LogEntry {
  /** When the log entry was created */
  timestamp: Date;
  /** Log level of this entry */
  level: LogLevel;
  /** The log message */
  message: string;
  /** Additional structured data */
  metadata?: Record<string, any>;
  /** Runtime that generated this log entry */
  runtime: RuntimeName;
}

/**
 * Main logger interface providing methods for logging at different levels.
 * This interface is implemented by all logger implementations across different runtimes.
 */
export interface ILogger {
  /**
   * Log a debug message. Only shown when log level is DEBUG.
   * @param message - The message to log (string or lazy function)
   * @param metadata - Optional structured data to include
   */
  debug(message: LogMessage, metadata?: any): void;
  
  /**
   * Log an informational message.
   * @param message - The message to log (string or lazy function)
   * @param metadata - Optional structured data to include
   */
  info(message: LogMessage, metadata?: any): void;
  
  /**
   * Log a warning message.
   * @param message - The message to log (string or lazy function)
   * @param metadata - Optional structured data to include
   */
  warn(message: LogMessage, metadata?: any): void;
  
  /**
   * Log an error message.
   * @param message - The message to log (string or lazy function)
   * @param metadata - Optional structured data to include
   */
  error(message: LogMessage, metadata?: any): void;
  
  /**
   * Log a message at a specific level.
   * @param level - The log level
   * @param message - The message to log (string or lazy function)
   * @param metadata - Optional structured data to include
   */
  log(level: LogLevel, message: LogMessage, metadata?: any): void;
  
  /**
   * Set the minimum log level for this logger.
   * @param level - The minimum log level
   */
  setLevel(level: LogLevel): void;
  
  /**
   * Get the current minimum log level.
   * @returns The current log level
   */
  getLevel(): LogLevel;
  
  /**
   * Create a child logger with additional metadata.
   * @param metadata - Additional metadata to include in all child log messages
   * @returns A new logger instance with the additional metadata
   */
  child(metadata: Record<string, any>): ILogger;
}

/**
 * Interface for logger adapters that handle the actual log output.
 * This abstraction allows different implementations for different runtimes.
 */
export interface ILoggerAdapter {
  /**
   * Write a log entry to the output destination.
   * @param entry - The log entry to write
   */
  log(entry: LogEntry): void;
  
  /**
   * Set the minimum log level for this adapter.
   * @param level - The minimum log level
   */
  setLevel(level: LogLevel): void;
  
  /**
   * Get the current minimum log level.
   * @returns The current log level
   */
  getLevel(): LogLevel;
}