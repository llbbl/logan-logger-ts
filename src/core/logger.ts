import { detectRuntime } from '../utils/runtime.ts';
import {
  type ILogger,
  type LogEntry,
  type LoggerConfig,
  LogLevel,
  type LogMessage,
  type RuntimeName,
} from './types.ts';

export abstract class BaseLogger implements ILogger {
  protected level: LogLevel;
  protected config: Partial<LoggerConfig>;
  protected runtime: RuntimeName;
  // biome-ignore lint/suspicious/noExplicitAny: Intentional - logger accepts arbitrary metadata (see ILogger interface)
  protected childMetadata: Record<string, any> = {};

  protected constructor(config: Partial<LoggerConfig> = {}) {
    this.config = config;
    this.level = config.level ?? LogLevel.INFO;
    this.runtime = detectRuntime().name;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Intentional - logger accepts arbitrary metadata (see ILogger interface)
  debug(message: LogMessage, metadata?: any): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Intentional - logger accepts arbitrary metadata (see ILogger interface)
  info(message: LogMessage, metadata?: any): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Intentional - logger accepts arbitrary metadata (see ILogger interface)
  warn(message: LogMessage, metadata?: any): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Intentional - logger accepts arbitrary metadata (see ILogger interface)
  error(message: LogMessage, metadata?: any): void {
    this.log(LogLevel.ERROR, message, metadata);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Intentional - logger accepts arbitrary metadata (see ILogger interface)
  log(level: LogLevel, message: LogMessage, metadata?: any): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const resolvedMessage = typeof message === 'function' ? message() : message;
    const combinedMetadata = { ...this.childMetadata, ...metadata };

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message: resolvedMessage,
      metadata: Object.keys(combinedMetadata).length > 0 ? combinedMetadata : undefined,
      runtime: this.runtime,
    };

    this.writeLog(entry);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Intentional - logger accepts arbitrary metadata (see ILogger interface)
  child(metadata: Record<string, any>): ILogger {
    const childLogger = this.createChild();
    childLogger.childMetadata = { ...this.childMetadata, ...metadata };
    return childLogger;
  }

  protected shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  protected abstract writeLog(entry: LogEntry): void;
  protected abstract createChild(): BaseLogger;
}
