import { type LoggerConfig, LogLevel } from '../core/types.ts';
import { detectRuntime } from './runtime.ts';

/**
 * Whether colored output is appropriate right now.
 *
 * `capabilities.colorSupport` answers whether the runtime *can* colorize.
 * This answers whether it *should*: writing ANSI escapes into a redirected
 * file or a log shipper is worse than writing none, so a non-TTY stdout
 * disables color unless the caller forces it. Honors the `NO_COLOR` and
 * `FORCE_COLOR` conventions.
 * @returns True when the level token should carry ANSI color
 */
export function shouldColorize(): boolean {
  const runtime = detectRuntime();

  if (!runtime.capabilities.colorSupport) {
    return false;
  }

  // No process object means a browser, where the console applies its own
  // styling and there is no stream to pollute.
  if (typeof process === 'undefined' || !process.env) {
    return true;
  }

  if (process.env.NO_COLOR) {
    return false;
  }

  if (process.env.FORCE_COLOR) {
    return process.env.FORCE_COLOR !== '0';
  }

  return process.stdout?.isTTY === true;
}

export function getDefaultConfig(): LoggerConfig {
  return {
    level: LogLevel.INFO,
    format: 'text',
    timestamp: true,
    colorize: shouldColorize(),
    metadata: {},
    transports: [
      {
        type: 'console',
        options: {},
      },
    ],
  };
}

/** Environment variable values accepted as `true`. */
const TRUTHY = ['true', '1', 'yes', 'on'];

/** Environment variable values accepted as `false`. */
const FALSY = ['false', '0', 'no', 'off'];

/**
 * Messages already emitted, so a misconfigured variable warns once rather than
 * once per logger constructed.
 */
const warned = new Set<string>();

function warnOnce(message: string): void {
  if (warned.has(message)) {
    return;
  }

  warned.add(message);
  console.warn(message);
}

/**
 * Reset the warn-once state. Exposed for tests; not part of the public contract.
 */
export function resetEnvironmentWarnings(): void {
  warned.clear();
}

/**
 * Parse a log level string, reporting failure rather than guessing.
 * @param level - The value to parse
 * @returns The matching level, or undefined if the value is not recognized
 */
export function tryParseLogLevel(level: string): LogLevel | undefined {
  switch (level.trim().toLowerCase()) {
    case 'debug':
      return LogLevel.DEBUG;
    case 'info':
      return LogLevel.INFO;
    case 'warn':
    case 'warning':
      return LogLevel.WARN;
    case 'error':
      return LogLevel.ERROR;
    case 'silent':
    case 'none':
      return LogLevel.SILENT;
    default:
      return undefined;
  }
}

/**
 * Parse a boolean environment variable.
 *
 * An unrecognized value yields `undefined` rather than `false`, so a typo falls
 * through to the next configuration source instead of silently turning the
 * option off. `LOG_TIMESTAMP=1` disabling timestamps was the previous behavior.
 */
function parseBooleanEnvironment(name: string, raw: string): boolean | undefined {
  const value = raw.trim().toLowerCase();

  if (TRUTHY.includes(value)) {
    return true;
  }
  if (FALSY.includes(value)) {
    return false;
  }

  warnOnce(
    `[logan-logger] ${name}="${raw}" is not a recognized boolean and was ignored. ` +
      `Accepted: ${TRUTHY.join(', ')} / ${FALSY.join(', ')}.`
  );

  return undefined;
}

/**
 * Read logger configuration from `LOG_LEVEL`, `LOG_FORMAT`, `LOG_TIMESTAMP`
 * and `LOG_COLOR`.
 *
 * Only variables that are set and parse successfully appear in the result, so
 * an absent or malformed variable leaves lower-precedence sources untouched.
 *
 * In a browser these values exist only if the bundler inlined them at build
 * time; otherwise this returns an empty object.
 * @returns The subset of configuration the environment specifies
 */
export function loadConfigFromEnvironment(): Partial<LoggerConfig> {
  const config: Partial<LoggerConfig> = {};

  if (typeof process === 'undefined' || !process.env) {
    return config;
  }

  const env = process.env;

  if (env.LOG_LEVEL) {
    const level = tryParseLogLevel(env.LOG_LEVEL);

    if (level === undefined) {
      warnOnce(
        `[logan-logger] LOG_LEVEL="${env.LOG_LEVEL}" is not a recognized level and was ` +
          'ignored. Accepted: debug, info, warn, error, silent.'
      );
    } else {
      config.level = level;
    }
  }

  if (env.LOG_FORMAT) {
    const format = env.LOG_FORMAT.trim().toLowerCase();

    if (format === 'json' || format === 'text') {
      config.format = format;
    } else {
      warnOnce(
        `[logan-logger] LOG_FORMAT="${env.LOG_FORMAT}" is not a recognized format and was ` +
          'ignored. Accepted: json, text.'
      );
    }
  }

  if (env.LOG_TIMESTAMP) {
    const timestamp = parseBooleanEnvironment('LOG_TIMESTAMP', env.LOG_TIMESTAMP);

    if (timestamp !== undefined) {
      config.timestamp = timestamp;
    }
  }

  if (env.LOG_COLOR) {
    const colorize = parseBooleanEnvironment('LOG_COLOR', env.LOG_COLOR);

    if (colorize !== undefined) {
      config.colorize = colorize;
    }
  }

  return config;
}

export function mergeConfigs(...configs: Partial<LoggerConfig>[]): LoggerConfig {
  const defaultConfig = getDefaultConfig();

  return configs.reduce<LoggerConfig>(
    (merged, config) => ({
      // biome-ignore lint/performance/noAccumulatingSpread: Config merging is not performance-critical, readability preferred
      ...merged,
      ...config,
      metadata: {
        ...merged.metadata,
        ...config.metadata,
      },
      transports: config.transports || merged.transports,
    }),
    defaultConfig
  );
}
