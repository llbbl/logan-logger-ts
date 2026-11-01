import { BaseLogger } from '../core/logger.ts';
import {
  type ConsoleTransportOptions,
  createTransports,
  type Transport,
  type TransportFactory,
} from '../core/transport.ts';
import { type LogEntry, type LoggerConfig, LogLevel } from '../core/types.ts';
import { formatLogEntry } from '../utils/formatting.ts';
import { detectRuntime } from '../utils/runtime.ts';

/** Browser console presentation without leaking CSS into JSON or plain text. */
class BrowserConsoleTransport implements Transport {
  readonly type = 'console';
  readonly level?: LogLevel;
  private readonly format: 'json' | 'text';
  private readonly timestamp: boolean;
  private readonly colorize: boolean;

  constructor(options: ConsoleTransportOptions) {
    this.level = options.level;
    this.format = options.format === 'json' ? 'json' : 'text';
    this.timestamp = options.timestamp !== false;
    this.colorize = options.colorize === true;
  }

  write(entry: LogEntry): void {
    const message = formatLogEntry(entry, this.format, {
      timestamp: this.timestamp,
      colorize: false,
    });
    const args: [string] | [string, string] =
      this.format === 'text' && this.colorize
        ? [`%c${message}`, getConsoleStyle(entry.level)]
        : [message];

    switch (entry.level) {
      case LogLevel.DEBUG:
        if (console.debug) {
          console.debug(...args);
        } else {
          console.log(...args);
        }
        break;
      case LogLevel.INFO:
        console.info(...args);
        break;
      case LogLevel.WARN:
        console.warn(...args);
        break;
      case LogLevel.ERROR:
        console.error(...args);
        break;
    }
  }
}

function getConsoleStyle(level: LogLevel): string {
  switch (level) {
    case LogLevel.DEBUG:
      return 'color: #888; font-weight: normal;';
    case LogLevel.INFO:
      return 'color: #007acc; font-weight: normal;';
    case LogLevel.WARN:
      return 'color: #ff8c00; font-weight: bold;';
    case LogLevel.ERROR:
      return 'color: #dc3545; font-weight: bold;';
    default:
      return '';
  }
}

const createBrowserConsoleTransport: TransportFactory = (config, context) => {
  const options = config.options ?? {};
  return new BrowserConsoleTransport({
    format: options.format ?? context.format,
    timestamp: options.timestamp ?? context.timestamp,
    colorize: options.colorize ?? context.colorize,
    level: config.level,
  });
};

export class BrowserLogger extends BaseLogger {
  private readonly transports: Transport[];

  /** Pre-built transports are adopted internally when a child is created. */
  constructor(config: Partial<LoggerConfig> = {}, transports?: Transport[]) {
    super(config);
    // Deno reuses this adapter but writes to a terminal, which understands ANSI
    // rather than browser CSS. Choose from the actual platform, not the
    // overridable runtime label carried on a record by conformance fixtures.
    this.transports =
      transports ??
      createTransports(
        config,
        detectRuntime().name === 'deno' ? undefined : createBrowserConsoleTransport
      );
  }

  getTransports(): readonly Transport[] {
    return this.transports;
  }

  close(): void {
    for (const transport of this.transports) {
      transport.close?.();
    }
  }

  protected writeLog(entry: LogEntry): void {
    for (const transport of this.transports) {
      if (transport.level !== undefined && entry.level < transport.level) {
        continue;
      }

      try {
        transport.write(entry);
      } catch (error) {
        console.warn(`[logan-logger] transport '${transport.type}' failed to write:`, error);
      }
    }
  }

  protected createChild(): BaseLogger {
    return new BrowserLogger(this.config, this.transports);
  }

  private shouldLogInProduction(): boolean {
    // Check various environment indicators
    const env =
      // biome-ignore lint/suspicious/noExplicitAny: Browser environment may have process global from bundler
      (globalThis as any).process?.env?.NODE_ENV ||
      // biome-ignore lint/suspicious/noExplicitAny: Browser environment may have process global from bundler
      (globalThis as any).process?.env?.NEXT_PUBLIC_APP_ENV ||
      'development';

    return env !== 'production' || this.level <= LogLevel.ERROR;
  }

  protected override shouldLog(level: LogLevel): boolean {
    // In browser, respect production environment
    if (!this.shouldLogInProduction() && level < LogLevel.ERROR) {
      return false;
    }

    return super.shouldLog(level);
  }
}

// Browser-specific utilities
export class ConsoleGroupLogger extends BrowserLogger {
  private groupStack: string[] = [];

  group(label: string): void {
    console.group(label);
    this.groupStack.push(label);
  }

  groupCollapsed(label: string): void {
    console.groupCollapsed(label);
    this.groupStack.push(label);
  }

  groupEnd(): void {
    console.groupEnd();
    this.groupStack.pop();
  }

  getCurrentGroupStack(): string[] {
    return [...this.groupStack];
  }

  getCurrentGroupPath(): string {
    return this.groupStack.join(' > ');
  }

  time(label: string): void {
    console.time(label);
  }

  timeEnd(label: string): void {
    console.timeEnd(label);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Console method accepts arbitrary metadata
  trace(message: string, metadata?: any): void {
    console.trace(message, metadata);
  }

  count(label?: string): void {
    console.count(label);
  }

  countReset(label?: string): void {
    console.countReset(label);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Console.table accepts arbitrary tabular data
  table(data: any): void {
    console.table(data);
  }
}

// Performance logging for browser
export class PerformanceLogger extends BrowserLogger {
  mark(name: string): void {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(name);
    }
  }

  measure(name: string, startMark?: string, endMark?: string): void {
    if (typeof performance !== 'undefined' && performance.measure) {
      try {
        performance.measure(name, startMark, endMark);
        const entries = performance.getEntriesByName(name, 'measure');
        if (entries.length > 0) {
          const entry = entries[entries.length - 1];
          this.info(`Performance: ${name}`, {
            duration: entry.duration,
            startTime: entry.startTime,
          });
        }
      } catch (error) {
        this.warn('Failed to measure performance', { name, error });
      }
    }
  }

  clearMarks(name?: string): void {
    if (typeof performance !== 'undefined' && performance.clearMarks) {
      performance.clearMarks(name);
    }
  }

  clearMeasures(name?: string): void {
    if (typeof performance !== 'undefined' && performance.clearMeasures) {
      performance.clearMeasures(name);
    }
  }
}
