import { BaseLogger } from '../core/logger.ts';
import { createTransports, type Transport } from '../core/transport.ts';
import type { LogEntry, LoggerConfig } from '../core/types.ts';

/**
 * Logger for Node.js and Bun.
 *
 * Writes through an explicit list of transports built from
 * `LoggerConfig.transports`. With no transports configured it writes to the
 * console and nowhere else — file logging is opt-in, never implied by
 * `NODE_ENV`.
 *
 * @example
 * ```typescript
 * import { NodeLogger, LogLevel } from 'logan-logger/node';
 *
 * const logger = new NodeLogger({
 *   level: LogLevel.INFO,
 *   transports: [
 *     { type: 'console', options: {} },
 *     { type: 'file', level: LogLevel.ERROR, options: { filename: 'logs/error.log' } },
 *   ],
 * });
 * ```
 */
export class NodeLogger extends BaseLogger {
  private readonly transports: Transport[];

  /**
   * @param config - Logger configuration
   * @param transports - Pre-built transports to adopt instead of building new
   * ones. Used internally so a child logger shares its parent's destinations.
   */
  constructor(config: Partial<LoggerConfig> = {}, transports?: Transport[]) {
    super(config);
    this.transports = transports ?? createTransports(config);
  }

  /** The transports this logger writes through. */
  getTransports(): readonly Transport[] {
    return this.transports;
  }

  /** Release every transport's resources. */
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
        // One broken destination must not silence the others.
        console.warn(`[logan-logger] transport '${transport.type}' failed to write:`, error);
      }
    }
  }

  protected createChild(): BaseLogger {
    // Share the transport instances. A per-request child logger must not open
    // a second handle on the same file.
    return new NodeLogger(this.config, this.transports);
  }
}

/**
 * Create a Morgan-compatible stream that forwards HTTP access logs to a logger.
 * @param logger - The logger to write through
 * @returns An object with a `write` method Morgan can use
 */
export function createMorganStream(logger: NodeLogger): { write: (message: string) => void } {
  return {
    write: (message: string) => {
      logger.info(message.trim());
    },
  };
}
