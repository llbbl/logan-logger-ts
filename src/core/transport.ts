import { type FormatOptions, formatLogEntry } from '../utils/formatting.ts';
import { type LogEntry, type LoggerConfig, LogLevel, type TransportConfig } from './types.ts';

/**
 * A destination log entries are written to.
 *
 * Transports are constructed once per logger and shared with every child
 * logger, so a transport that owns a resource (a file handle, a socket) must
 * open exactly one of them however many children are created.
 */
export interface Transport {
  /** Transport type, used in diagnostics. */
  readonly type: string;
  /** Minimum level this transport accepts. Undefined means "whatever the logger allows". */
  readonly level?: LogLevel;
  /** Write one entry. */
  write(entry: LogEntry): void;
  /** Release any resources held. Safe to call more than once. */
  close?(): void;
}

/**
 * The logger-level presentation settings a transport inherits unless its own
 * options override them.
 */
export interface TransportContext {
  format: 'json' | 'text' | 'custom';
  timestamp: boolean;
  colorize: boolean;
}

/** Builds a transport from its configuration entry. */
export type TransportFactory = (config: TransportConfig, context: TransportContext) => Transport;

const transportFactories = new Map<string, TransportFactory>();

/**
 * Register a factory for a transport type so it can be named in
 * `LoggerConfig.transports`.
 *
 * Runtime-specific transports register themselves from their runtime entry
 * point — the Node file transport is registered by `logan-logger/node`, which
 * is what keeps `node:fs` out of the browser build.
 *
 * @param type - Value matched against `TransportConfig.type`
 * @param factory - Builder invoked once per configured transport
 */
export function registerTransport(type: string, factory: TransportFactory): void {
  transportFactories.set(type, factory);
}

/** Look up a registered transport factory. */
export function getTransportFactory(type: string): TransportFactory | undefined {
  return transportFactories.get(type);
}

/** Options accepted by {@link ConsoleTransport}. */
export interface ConsoleTransportOptions extends FormatOptions {
  /** Output shape. `'custom'` is treated as `'text'`. */
  format?: 'json' | 'text' | 'custom';
  /** Minimum level this transport accepts. */
  level?: LogLevel;
}

/**
 * Writes formatted entries to the runtime console, routing each level to the
 * matching console method so devtools and journald keep their severity.
 */
export class ConsoleTransport implements Transport {
  readonly type = 'console';
  readonly level?: LogLevel;

  private readonly format: 'json' | 'text';
  private readonly formatOptions: FormatOptions;

  constructor(options: ConsoleTransportOptions = {}) {
    this.level = options.level;
    this.format = options.format === 'json' ? 'json' : 'text';
    this.formatOptions = {
      timestamp: options.timestamp !== false,
      colorize: options.colorize === true,
    };
  }

  write(entry: LogEntry): void {
    const line = formatLogEntry(entry, this.format, this.formatOptions);

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(line);
        break;
      case LogLevel.WARN:
        console.warn(line);
        break;
      case LogLevel.ERROR:
        console.error(line);
        break;
      default:
        console.info(line);
        break;
    }
  }
}

registerTransport('console', (config, context) => {
  const options = config.options ?? {};

  return new ConsoleTransport({
    format: options.format ?? context.format,
    timestamp: options.timestamp ?? context.timestamp,
    colorize: options.colorize ?? context.colorize,
    level: config.level,
  });
});

// `{ type: 'custom', options: { transport } }` accepts any object satisfying
// the Transport interface, so callers can plug in their own destination
// without waiting for a built-in.
registerTransport('custom', (config) => {
  const supplied = config.options?.transport as Transport | undefined;

  if (!supplied || typeof supplied.write !== 'function') {
    throw new Error(
      "custom transport requires options.transport to be an object with a write(entry) method"
    );
  }

  if (config.level === undefined) {
    return supplied;
  }

  // Wrap rather than spread: a class instance loses its prototype methods when
  // copied into an object literal.
  return {
    type: supplied.type ?? 'custom',
    level: config.level,
    write: (entry) => supplied.write(entry),
    close: supplied.close ? () => supplied.close?.() : undefined,
  };
});

/**
 * Build the transports described by a logger configuration.
 *
 * Each transport is constructed behind its own guard so that one failing to
 * initialize cannot take the others down with it.
 *
 * @param config - The logger configuration
 * @returns The transports that were built successfully
 */
export function createTransports(config: Partial<LoggerConfig>): Transport[] {
  const context: TransportContext = {
    format: config.format ?? 'text',
    timestamp: config.timestamp ?? true,
    colorize: config.colorize ?? false,
  };

  // No transports configured at all means console only. File logging is
  // opt-in; it is never implied by NODE_ENV.
  if (config.transports === undefined) {
    return [
      new ConsoleTransport({
        format: context.format,
        timestamp: context.timestamp,
        colorize: context.colorize,
      }),
    ];
  }

  const transports: Transport[] = [];

  for (const entry of config.transports) {
    const factory = getTransportFactory(entry.type);

    if (!factory) {
      console.warn(`[logan-logger] ${describeUnknownTransport(entry.type)}`);
      continue;
    }

    try {
      transports.push(factory(entry, context));
    } catch (error) {
      console.warn(`[logan-logger] transport '${entry.type}' failed to initialize:`, error);
    }
  }

  return transports;
}

function describeUnknownTransport(type: string): string {
  if (type === 'file') {
    return "the 'file' transport is not registered; import from 'logan-logger/node' (or 'logan-logger/bun') rather than the main entry point to use file logging";
  }
  if (type === 'http') {
    return "the 'http' transport is not built in; supply one with { type: 'custom', options: { transport } }";
  }

  return `unknown transport type '${type}'; skipping`;
}
