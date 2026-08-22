import { type LogEntry, LogLevel } from '../core/types.ts';
import { safeStringify } from './serialization.ts';

/**
 * Presentation options for {@link formatLogEntry}, drawn from `LoggerConfig`.
 */
export interface FormatOptions {
  /** Include the timestamp in the text form. Defaults to `true`. */
  timestamp?: boolean;
  /** Apply ANSI colour to the level token in the text form. Defaults to `false`. */
  colorize?: boolean;
}

/**
 * Format a log entry for output in different formats.
 * @param entry - The log entry to format
 * @param format - Output format ('json' or 'text')
 * @param options - Presentation options; they affect the text form only
 * @returns Formatted log string
 * @example
 * ```typescript
 * const entry: LogEntry = {
 *   timestamp: new Date(),
 *   level: LogLevel.INFO,
 *   message: 'User logged in',
 *   metadata: { userId: 123 },
 *   runtime: 'node'
 * };
 *
 * const textFormat = formatLogEntry(entry, 'text');
 * // Result: "[2024-01-01T12:00:00.000Z] INFO: User logged in {\"userId\":123}"
 *
 * const bare = formatLogEntry(entry, 'text', { timestamp: false });
 * // Result: "INFO: User logged in {\"userId\":123}"
 *
 * const jsonFormat = formatLogEntry(entry, 'json');
 * // Result: {"timestamp":"2024-01-01T12:00:00.000Z","level":"info","message":"User logged in","metadata":{"userId":123},"runtime":"node"}
 * ```
 */
export function formatLogEntry(
  entry: LogEntry,
  format: 'json' | 'text' = 'text',
  options: FormatOptions = {}
): string {
  if (format === 'json') {
    // The JSON envelope is machine-readable: it always carries the timestamp
    // and is never colorized, whatever the config says.
    // biome-ignore lint/suspicious/noExplicitAny: Building dynamic JSON object with optional metadata
    const jsonEntry: any = {
      timestamp: entry.timestamp.toISOString(),
      level: LogLevel[entry.level].toLowerCase(),
      message: entry.message,
      runtime: entry.runtime,
    };

    // Only include metadata if it exists
    if (entry.metadata !== undefined) {
      jsonEntry.metadata = entry.metadata;
    }

    return safeStringify(jsonEntry);
  }

  // Text format
  const prefix = options.timestamp === false ? '' : `[${entry.timestamp.toISOString()}] `;
  const level = formatLevel(entry.level, options.colorize === true);
  const metaStr = entry.metadata ? ` ${safeStringify(entry.metadata)}` : '';

  return `${prefix}${level}: ${entry.message}${metaStr}`;
}

/**
 * Format log level as a colored string for terminal output.
 * @param level - The log level to format
 * @param colorize - Whether to apply ANSI color codes
 * @returns Formatted level string with optional colors
 */
export function formatLevel(level: LogLevel, colorize = false): string {
  const levelName = LogLevel[level].toUpperCase();

  if (!colorize) {
    return levelName;
  }

  // ANSI color codes for different log levels
  const colors = {
    [LogLevel.DEBUG]: '\x1b[36m', // Cyan
    [LogLevel.INFO]: '\x1b[32m', // Green
    [LogLevel.WARN]: '\x1b[33m', // Yellow
    [LogLevel.ERROR]: '\x1b[31m', // Red
    [LogLevel.SILENT]: '\x1b[37m', // White
  };

  const reset = '\x1b[0m';
  const color = colors[level] || colors[LogLevel.INFO];

  return `${color}${levelName}${reset}`;
}
