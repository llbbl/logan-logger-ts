import { noColorRequested } from '../utils/config.ts';
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

/**
 * Builds the transport for `{ type: 'custom', options: { transport } }`.
 *
 * Called as a plain function, not with `new`, so pass an instance or an arrow
 * that returns one rather than a class.
 */
export type TransportBuilder = (context: TransportContext) => Transport;

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
registerTransport('custom', (config, context) => {
  const provided = config.options?.transport as Transport | TransportBuilder | undefined;

  // A function is treated as a builder so an inline custom transport can read
  // the logger's presentation settings, which a registered named transport
  // already gets. It is called plainly, never with `new`, so a class must be
  // passed as an instance or wrapped in an arrow.
  const supplied = typeof provided === 'function' ? provided(context) : provided;

  if (!supplied || typeof supplied.write !== 'function') {
    // Name which form was supplied: a builder that returned the wrong thing and
    // a plain object missing write() are different mistakes with different
    // fixes. A class constructor never reaches here — calling it plainly throws
    // "cannot be invoked without 'new'" first, which already says enough.
    const got =
      typeof provided === 'function'
        ? 'the function it was given returned no write(entry) method'
        : 'it was given no object with a write(entry) method';

    throw new Error(
      `custom transport requires options.transport to be an object with a write(entry) method, or a function returning one; ${got}`
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
 * Rewrite a transport entry's `colorize` request to `false`.
 *
 * Set rather than deleted. A factory reads `options.colorize ?? context.colorize`,
 * so deleting the key would hand the decision back to the context — correct for
 * the built-ins today, but silently wrong for any registered factory that
 * defaults to color on its own. Entries that never mentioned `colorize` are
 * rewritten too, for the same reason.
 */
function withColorDenied(entry: TransportConfig): TransportConfig {
  return { ...entry, options: { ...entry.options, colorize: false } };
}

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
  // SPEC §6.4.1's NO_COLOR veto is read a second time here, and the duplication
  // is deliberate. Two things make this the right layer rather than one more
  // scattered environment read:
  //
  // 1. `applyNoColorOverride` rewrites the top-level `config.colorize` and
  //    nothing else, so `{ type: 'console', options: { colorize: true } }` used
  //    to re-enable color underneath it. Per-transport options are resolved
  //    here and only here.
  // 2. `createLogger()` and a directly constructed `new NodeLogger(...)` both
  //    arrive here, and only the first passes through configuration
  //    resolution. This is where the two paths meet.
  //
  // Reading `NO_COLOR` in a third place would be a cost worth refusing; reading
  // it at the one join point that decides whether an escape byte is written is
  // what makes the veto true rather than merely usually true.
  const denyColor = noColorRequested();
  const context: TransportContext = {
    format: config.format ?? 'text',
    timestamp: config.timestamp ?? true,
    colorize: denyColor ? false : (config.colorize ?? false),
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
      transports.push(factory(denyColor ? withColorDenied(entry) : entry, context));
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
