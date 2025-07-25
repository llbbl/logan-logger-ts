import { 
  ILogger, 
  LogLevel, 
  LogMessage, 
  LogEntry,
  RuntimeName,
  LoggerConfig 
} from '@/core/types';
import { detectRuntime } from '@/utils/runtime';
import { safeStringify } from '@/utils/serialization';

export abstract class BaseLogger implements ILogger {
  protected level: LogLevel;
  protected config: Partial<LoggerConfig>;
  protected runtime: RuntimeName;
  protected childMetadata: Record<string, any> = {};

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = config;
    this.level = config.level ?? LogLevel.INFO;
    this.runtime = detectRuntime().name;
  }

  debug(message: LogMessage, metadata?: any): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  info(message: LogMessage, metadata?: any): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  warn(message: LogMessage, metadata?: any): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  error(message: LogMessage, metadata?: any): void {
    this.log(LogLevel.ERROR, message, metadata);
  }

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
      runtime: this.runtime
    };

    this.writeLog(entry);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

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

export function serializeError(error: any): any {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error as any) // Include any additional properties
    };
  }
  return error;
}

export function formatLogEntry(entry: LogEntry, format: 'json' | 'text' = 'text'): string {
  if (format === 'json') {
    return safeStringify({
      timestamp: entry.timestamp.toISOString(),
      level: LogLevel[entry.level].toLowerCase(),
      message: entry.message,
      metadata: entry.metadata,
      runtime: entry.runtime
    });
  }

  // Text format
  const timestamp = entry.timestamp.toISOString();
  const level = LogLevel[entry.level].toUpperCase();
  const metaStr = entry.metadata ? ` ${safeStringify(entry.metadata)}` : '';
  
  return `[${timestamp}] ${level}: ${entry.message}${metaStr}`;
}