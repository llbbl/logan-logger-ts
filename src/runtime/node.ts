import { BaseLogger } from '../core/logger.ts';
import { LogEntry, LogLevel, LoggerConfig } from '../core/types.ts';
import { safeStringify } from '../utils/serialization.ts';

export class NodeLogger extends BaseLogger {
  private winston?: any;

  constructor(config: Partial<LoggerConfig> = {}) {
    super(config);
    this.initializeWinston();
  }

  private async initializeWinston(): Promise<void> {
    try {
      // Try to load Winston if available
      // @ts-ignore - Optional peer dependency
      const winston = await import('winston');
      this.winston = this.createWinstonLogger(winston);
    } catch (error) {
      // Winston not available, will fall back to console
      console.warn('[logan-logger] Winston not found, falling back to console logging');
    }
  }

  private createWinstonLogger(winston: any): any {
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.prettyPrint()
    );

    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }: any) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      })
    );

    const logger = winston.createLogger({
      level: this.getWinstonLevel(this.level),
      format: logFormat,
      transports: [
        new winston.transports.Console({
          format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
        }),
      ],
    });

    // Add file transports for production
    if (process.env.NODE_ENV === 'production') {
      logger.add(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        })
      );

      logger.add(
        new winston.transports.File({
          filename: 'logs/combined.log',
          maxsize: 5242880, // 5MB
          maxFiles: 10,
        })
      );
    }

    return logger;
  }

  protected writeLog(entry: LogEntry): void {
    if (this.winston) {
      this.winston.log({
        level: this.getWinstonLevel(entry.level),
        message: entry.message,
        timestamp: entry.timestamp,
        ...entry.metadata,
      });
    } else {
      // Fallback to console
      this.writeToConsole(entry);
    }
  }

  protected createChild(): BaseLogger {
    return new NodeLogger(this.config);
  }

  private writeToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const level = LogLevel[entry.level].toLowerCase();
    const metaStr = entry.metadata ? ` ${safeStringify(entry.metadata)}` : '';
    const message = `[${timestamp}] ${level.toUpperCase()}: ${entry.message}${metaStr}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.ERROR:
        console.error(message);
        break;
    }
  }

  private getWinstonLevel(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return 'debug';
      case LogLevel.INFO:
        return 'info';
      case LogLevel.WARN:
        return 'warn';
      case LogLevel.ERROR:
        return 'error';
      default:
        return 'info';
    }
  }

  setLevel(level: LogLevel): void {
    super.setLevel(level);
    if (this.winston) {
      this.winston.level = this.getWinstonLevel(level);
    }
  }
}

// Create Morgan-compatible stream
export function createMorganStream(logger: NodeLogger): { write: (message: string) => void } {
  return {
    write: (message: string) => {
      logger.info(message.trim());
    },
  };
}