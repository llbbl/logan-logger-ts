import { BrowserLogger } from '../runtime/browser.ts';
import { NodeLogger } from '../runtime/node.ts';
import { getDefaultConfig } from '../utils/config.ts';
import { detectRuntime } from '../utils/runtime.ts';
import { type ILogger, type LoggerConfig, LogLevel } from './types.ts';

/**
 * Factory class for creating logger instances based on the detected runtime.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Factory pattern provides namespace for related creation methods
export class LoggerFactory {
  /**
   * Create a logger instance appropriate for the current runtime.
   * @param config - Optional configuration for the logger
   * @returns A logger instance
   */
  static create(config: Partial<LoggerConfig> = {}): ILogger {
    const runtime = detectRuntime();
    const mergedConfig = LoggerFactory.mergeConfig(config);

    switch (runtime.name) {
      case 'node':
        return new NodeLogger(mergedConfig);

      case 'deno':
        // For now, use console-based logger for Deno
        // TODO: Implement Deno-specific logger
        return new BrowserLogger(mergedConfig);

      case 'bun':
        // For now, use Node.js logger for Bun (similar APIs)
        return new NodeLogger(mergedConfig);

      case 'browser':
      case 'webworker':
        return new BrowserLogger(mergedConfig);

      default:
        // Fallback to console-based logger
        return new BrowserLogger(mergedConfig);
    }
  }

  /**
   * Create a child logger with additional metadata.
   * @param parent - The parent logger instance
   * @param metadata - Additional metadata to include in all child log messages
   * @returns A new logger instance with the additional metadata
   */
  // biome-ignore lint/suspicious/noExplicitAny: Intentional - logger accepts arbitrary metadata
  static createChild(parent: ILogger, metadata: Record<string, any>): ILogger {
    return parent.child(metadata);
  }

  private static mergeConfig(userConfig: Partial<LoggerConfig>): Partial<LoggerConfig> {
    const defaultConfig = getDefaultConfig();
    return {
      ...defaultConfig,
      ...userConfig,
      metadata: {
        ...defaultConfig.metadata,
        ...userConfig.metadata,
      },
    };
  }
}

/**
 * Convenience function for creating a logger instance.
 * @param config - Optional configuration for the logger
 * @returns A logger instance appropriate for the current runtime
 * @example
 * ```typescript
 * import { createLogger, LogLevel } from 'logan-logger';
 *
 * const logger = createLogger({
 *   level: LogLevel.DEBUG,
 *   colorize: true
 * });
 *
 * logger.info('Hello world!');
 * ```
 */
export function createLogger(config?: Partial<LoggerConfig>): ILogger {
  return LoggerFactory.create(config);
}

/**
 * Create a logger with configuration based on the current environment.
 * Automatically detects production/development/test environments and
 * sets appropriate log levels and formatting.
 * @returns A logger instance configured for the current environment
 */
export function createLoggerForEnvironment(): ILogger {
  const env = getEnvironment();

  const config: Partial<LoggerConfig> = {
    level: getLogLevelForEnvironment(env),
    colorize: env !== 'production',
    timestamp: true,
    format: env === 'production' ? 'json' : 'text',
  };

  return createLogger(config);
}

function getEnvironment(): string {
  // Check various environment variables
  if (typeof process !== 'undefined' && process.env) {
    return (
      process.env.NODE_ENV ||
      process.env.NEXT_PUBLIC_APP_ENV ||
      process.env.ENVIRONMENT ||
      'development'
    );
  }

  // Browser environment detection
  if (typeof window !== 'undefined') {
    // Check for common build-time environment indicators
    // biome-ignore lint/suspicious/noExplicitAny: Build-time global variable not in TS types
    return (globalThis as any).__ENV__ || 'development';
  }

  return 'development';
}

function getLogLevelForEnvironment(env: string): LogLevel {
  switch (env) {
    case 'production':
      return LogLevel.ERROR;
    case 'staging':
    case 'test':
      return LogLevel.WARN;
    case 'development':
    case 'dev':
      return LogLevel.DEBUG;
    default:
      return LogLevel.INFO;
  }
}

// Type-safe log level conversion
export function stringToLogLevel(level: string): LogLevel {
  switch (level.toLowerCase()) {
    case 'debug':
      return LogLevel.DEBUG;
    case 'info':
      return LogLevel.INFO;
    case 'warn':
    case 'warning':
      return LogLevel.WARN;
    case 'error':
      return LogLevel.ERROR;
    case 'silent':
    case 'none':
      return LogLevel.SILENT;
    default:
      return LogLevel.INFO;
  }
}

export function logLevelToString(level: LogLevel): string {
  switch (level) {
    case LogLevel.DEBUG:
      return 'debug';
    case LogLevel.INFO:
      return 'info';
    case LogLevel.WARN:
      return 'warn';
    case LogLevel.ERROR:
      return 'error';
    case LogLevel.SILENT:
      return 'silent';
    default:
      return 'info';
  }
}
