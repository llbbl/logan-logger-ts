import { BaseLogger } from '@/core/logger';
import { LogEntry, LogLevel, LoggerConfig } from '@/core/types';
import { safeStringify } from '@/utils/serialization';

export class BrowserLogger extends BaseLogger {
  constructor(config: Partial<LoggerConfig> = {}) {
    super(config);
  }

  protected writeLog(entry: LogEntry): void {
    const message = this.formatMessage(entry);
    const style = this.getConsoleStyle(entry.level);

    // Use safeStringify for metadata to handle circular references
    const metaStr = entry.metadata ? ` ${safeStringify(entry.metadata)}` : '';
    const fullMessage = `%c${message}${metaStr}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        if (console.debug) {
          console.debug(fullMessage, style);
        } else {
          console.log(fullMessage, style);
        }
        break;
      case LogLevel.INFO:
        console.info(fullMessage, style);
        break;
      case LogLevel.WARN:
        console.warn(fullMessage, style);
        break;
      case LogLevel.ERROR:
        console.error(fullMessage, style);
        break;
    }
  }

  protected createChild(): BaseLogger {
    return new BrowserLogger(this.config);
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = LogLevel[entry.level].toUpperCase();
    return `[${timestamp}] ${level}: ${entry.message}`;
  }

  private getConsoleStyle(level: LogLevel): string {
    if (!this.config.colorize) {
      return '';
    }

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

  private shouldLogInProduction(): boolean {
    // Check various environment indicators
    const env = 
      (globalThis as any).process?.env?.NODE_ENV ||
      (globalThis as any).process?.env?.NEXT_PUBLIC_APP_ENV ||
      'development';
    
    return env !== 'production' || this.level <= LogLevel.ERROR;
  }

  protected shouldLog(level: LogLevel): boolean {
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

  time(label: string): void {
    console.time(label);
  }

  timeEnd(label: string): void {
    console.timeEnd(label);
  }

  trace(message: string, metadata?: any): void {
    console.trace(message, metadata);
  }

  count(label?: string): void {
    console.count(label);
  }

  countReset(label?: string): void {
    console.countReset(label);
  }

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
            startTime: entry.startTime
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