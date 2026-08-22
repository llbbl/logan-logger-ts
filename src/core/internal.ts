import type { LoggerConfig, RuntimeName } from './types.ts';

/**
 * Key under which a caller may freeze the two values a record takes from its
 * surroundings rather than from its caller: the wall clock and the detected
 * runtime.
 *
 * This is a **test seam**, not configuration. It rides on the config object
 * under a symbol instead of becoming a named `LoggerConfig` field because a
 * named field would be public API — permanently documented, permanently
 * supported — for something whose only caller is a conformance harness. The
 * treering fixtures supply a frozen `timestamp` and `runtime` on every case
 * that emits a record, and `fixtures/README.md` requires the runner to inject
 * them rather than let the implementation read a real clock.
 *
 * Carrying it on the config also makes inheritance free: `BaseLogger.child()`
 * hands `this.config` to the child it builds, so every descendant sees the same
 * frozen values. A constructor argument or a protected member would each need
 * `child()` to be taught about them separately.
 *
 * `Symbol.for` rather than `Symbol()`: a test runner that isolates module
 * graphs can end up holding two instances of this file, and a per-instance
 * symbol would not match across them.
 */
export const LOGGER_INTERNALS: unique symbol = Symbol.for('logan-logger.internals');

/** Environment-derived values a caller may pin. */
export interface LoggerInternals {
  /** Supplies the record timestamp. Defaults to the real clock. */
  now?: () => Date;
  /** Stands in for `detectRuntime().name` on the `runtime` field. */
  runtime?: RuntimeName;
}

type ConfigWithInternals = Partial<LoggerConfig> & {
  [LOGGER_INTERNALS]?: LoggerInternals;
};

/** Read whatever internals a config carries; an empty object when it carries none. */
export function readLoggerInternals(config: Partial<LoggerConfig>): LoggerInternals {
  return (config as ConfigWithInternals)[LOGGER_INTERNALS] ?? {};
}

/**
 * Attach internals to a copy of `config`.
 *
 * The property is enumerable, which is what lets `mergeConfigs` carry it
 * through: object spread copies own enumerable symbol-keyed properties.
 * @param config - Configuration to copy
 * @param internals - Values to pin
 * @returns A new config object carrying the internals
 */
export function withLoggerInternals<T extends Partial<LoggerConfig>>(
  config: T,
  internals: LoggerInternals
): T & ConfigWithInternals {
  return Object.assign({}, config, { [LOGGER_INTERNALS]: internals });
}
