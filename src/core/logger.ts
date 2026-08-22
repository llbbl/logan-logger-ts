import { detectRuntime } from '../utils/runtime.ts';
import { readLoggerInternals } from './internal.ts';
import {
  type ILogger,
  type LogEntry,
  type LoggerConfig,
  LogLevel,
  type LogMessage,
  type RuntimeName,
} from './types.ts';

/** The real clock, used whenever no seam value is supplied. */
const systemClock = (): Date => new Date();

export abstract class BaseLogger implements ILogger {
  protected level: LogLevel;
  protected config: Partial<LoggerConfig>;
  protected runtime: RuntimeName;
  /**
   * Source of the `timestamp` on every record.
   *
   * A seam rather than a direct `new Date()` so conformance fixtures can pin it
   * and compare output byte for byte. See `core/internal.ts` for why it is not
   * a public config field.
   */
  protected readonly now: () => Date;
  // biome-ignore lint/suspicious/noExplicitAny: Intentional - logger accepts arbitrary metadata (see ILogger interface)
  protected childMetadata: Record<string, any> = {};

  protected constructor(config: Partial<LoggerConfig> = {}) {
    this.config = config;
    this.level = config.level ?? LogLevel.INFO;

    // Both of these are read from the surroundings rather than supplied by the
    // caller, so both are pinnable through the same seam.
    const internals = readLoggerInternals(config);
    this.now = internals.now ?? systemClock;
    this.runtime = internals.runtime ?? detectRuntime().name;

    // config.metadata is the documented "default metadata on every message".
    // Seeding childMetadata is what makes that true, and it inherits through
    // child() for free.
    this.childMetadata = { ...config.metadata };
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
      timestamp: this.now(),
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
