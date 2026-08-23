import { type LoggerConfig, LogLevel } from '../core/types.ts';
import { detectRuntime } from './runtime.ts';
import { resetWarnings, warnOnce } from './warn-once.ts';

/**
 * Whether colored output is appropriate by default.
 *
 * `capabilities.colorSupport` answers whether the runtime *can* colorize.
 * This answers whether it *should*: writing ANSI escapes into a redirected
 * file or a log shipper is worse than writing none, so a non-TTY stdout
 * disables color unless the caller forces it.
 *
 * This resolves the **default** only — every source in SPEC §6.2 outranks it.
 * `NO_COLOR` is deliberately not consulted here: §6.4.1 makes it an override
 * that beats every configuration source, so checking it at this layer would
 * let `LOG_COLOR=true` or an explicit `colorize: true` defeat it. It is applied
 * after the merge instead — see `noColorRequested`, `applyNoColorOverride`, and
 * `createTransports`, which applies it again to per-transport options.
 * @returns True when the level token should carry ANSI color by default
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

  if (process.env.FORCE_COLOR) {
    return process.env.FORCE_COLOR !== '0';
  }

  return process.stdout?.isTTY === true;
}

/**
 * Whether the user has asked every program in this session not to emit color.
 *
 * SPEC §6.4.1. Presence is the entire signal and the value is meaningless, so
 * `NO_COLOR=0` disables color exactly as `NO_COLOR=1` does. The value is read
 * raw — neither trimmed nor case-folded — so a single space is a non-empty
 * value and disables color.
 *
 * An empty string counts as **unset**, per no-color.org's own wording:
 * "present and not an empty string". That is the exact opposite of the rule
 * §6.3 imposes on `LOG_LEVEL`, `LOG_FORMAT`, `LOG_TIMESTAMP` and `LOG_COLOR`,
 * where an empty value is *set*, matches nothing, and must warn — which is why
 * `loadConfigFromEnvironment` below guards those with `!== undefined` rather
 * than truthiness (#84).
 *
 * The two rules are opposite deliberately and **must not be reconciled**: §6.3
 * governs variables in this library's namespace, where an empty value is a
 * mistake worth reporting, while `NO_COLOR` is defined by a standard this
 * library does not own and cannot revise. A truthiness test is correct here
 * and a bug ninety lines further down.
 * @returns True when `NO_COLOR` is set to a non-empty value
 */
export function noColorRequested(): boolean {
  if (typeof process === 'undefined' || !process.env) {
    return false;
  }

  return Boolean(process.env.NO_COLOR);
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
 * Reset the warn-once state, config file warnings included. Exposed for tests;
 * not part of the public contract.
 */
export function resetEnvironmentWarnings(): void {
  resetWarnings();
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
 *
 * **This reads the environment; it does not apply SPEC §6.4.1's `NO_COLOR`
 * veto.** Called on its own under `NO_COLOR=1 LOG_COLOR=true` it emits the
 * disagreement diagnostic and still returns `{ colorize: true }`: the message
 * describes what the *resolved* configuration will do, not what this function
 * did. `applyNoColorOverride` is what actually forces `colorize` off, and
 * `createTransports` enforces it per transport. A caller assembling a
 * configuration by hand from this function must apply the former, or let
 * `createLogger()` do both.
 * @returns The subset of configuration the environment specifies
 */
export function loadConfigFromEnvironment(): Partial<LoggerConfig> {
  const config: Partial<LoggerConfig> = {};

  if (typeof process === 'undefined' || !process.env) {
    return config;
  }

  const env = process.env;

  // Presence, not truthiness. An empty string is set, matches no accepted value,
  // and so takes the unrecognized path including its diagnostic (SPEC 6.3). A
  // truthy guard skips it silently: the resulting value stays accidentally right
  // while the required warning disappears.
  if (env.LOG_LEVEL !== undefined) {
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

  if (env.LOG_FORMAT !== undefined) {
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

  if (env.LOG_TIMESTAMP !== undefined) {
    const timestamp = parseBooleanEnvironment('LOG_TIMESTAMP', env.LOG_TIMESTAMP);

    if (timestamp !== undefined) {
      config.timestamp = timestamp;
    }
  }

  if (env.LOG_COLOR !== undefined) {
    const colorize = parseBooleanEnvironment('LOG_COLOR', env.LOG_COLOR);

    if (colorize !== undefined) {
      config.colorize = colorize;
    }

    // SPEC §6.4.1. Two environment variables asking for opposite things is the
    // one conflict worth reporting: the user contradicted themselves, and
    // whichever way it resolves, half of what they asked for is discarded.
    //
    // NO_COLOR overriding a non-environment source stays silent by design —
    // beating the program's own choice is the convention working as intended,
    // not a mistake to report. `colorize` is still recorded above so the
    // resolved value reflects LOG_COLOR for anything that inspects the
    // environment layer alone; this function warns but applies nothing —
    // `applyNoColorOverride` is what forces the value off.
    if (colorize === true && noColorRequested()) {
      warnOnce(
        '[logan-logger] NO_COLOR is set and LOG_COLOR=true asks for color. ' +
          'NO_COLOR takes precedence: defaulting to no color.'
      );
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

/**
 * Apply SPEC §6.4.1's `NO_COLOR` override to an already-merged configuration.
 *
 * `NO_COLOR` is not another tier of §6.2's chain — it outranks all of it — so
 * it cannot be expressed as one more argument to `mergeConfigs`, where anything
 * later would beat it. That is precisely the bug this replaces: `shouldColorize()`
 * consulted `NO_COLOR` at the defaults layer, so `LOG_COLOR=true` and an explicit
 * `colorize: true` both silently defeated it.
 *
 * Precedence is the whole reason it is a separate step, and the only one. It is
 * *not* that `mergeConfigs` must be kept clear of the environment: that function
 * seeds itself with `getDefaultConfig()`, which calls `shouldColorize()`, which
 * reads `FORCE_COLOR` and `process.stdout.isTTY`. It has always read the
 * environment, and a purity argument here would be false.
 *
 * **`ignoreEnvironment` does not suppress this**, deliberately. That flag is
 * documented as opting out of `LOG_LEVEL`, `LOG_FORMAT`, `LOG_TIMESTAMP` and
 * `LOG_COLOR` by name, and it exists so a library is not hijacked by the *host
 * application's* operational settings. `NO_COLOR` is a different kind of thing:
 * the *end user's* preference, expressed to every program in their session. A
 * library author who sets the flag for the documented reason must not silently
 * also acquire "and ignore the user's `NO_COLOR`" — least of all because
 * `ignoreEnvironment` is settable from a config file, which would let a file
 * checked into a repository defeat every one of that project's users.
 *
 * **This is not the only place the veto is applied, and it must not be.** It
 * rewrites the top-level `colorize` and nothing else, so a per-transport
 * `options: { colorize: true }` sails straight past it — the console transport
 * factory resolves `options.colorize ?? context.colorize`. `createTransports`
 * therefore resolves `NO_COLOR` again when it builds each transport, which also
 * covers a directly constructed `new NodeLogger(...)` that never reached this
 * function. Between the two, no configuration source defeats `NO_COLOR`:
 * neither `LOG_COLOR`, nor an explicit `colorize: true`, nor a config file, nor
 * a per-transport option, nor `ignoreEnvironment`.
 *
 * What still does: bypassing configuration resolution entirely. `new
 * BrowserLogger({ colorize: true })` reads `config.colorize` and consults no
 * environment at all, so it honors neither `NO_COLOR` nor `LOG_COLOR` nor a
 * config file. That is a property of constructing an adapter by hand rather
 * than a hole in the veto, and `docs/configuration.md` says so where a reader
 * meets `NO_COLOR`.
 * @param config - The configuration after the whole precedence chain
 * @returns The configuration with color forced off when `NO_COLOR` applies
 */
export function applyNoColorOverride(config: LoggerConfig): LoggerConfig {
  if (!noColorRequested()) {
    return config;
  }

  return { ...config, colorize: false };
}
