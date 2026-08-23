import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, createLoggerForEnvironment } from '../src/core/factory.ts';
import { type ILogger, type LoggerConfig, LogLevel } from '../src/core/types.ts';
import { NodeLogger } from '../src/runtime/node.ts';
import { createLogger as createBrowserLogger } from '../src/browser.ts';
import { resetEnvironmentWarnings } from '../src/utils/config.ts';

/**
 * Variables these tests take ownership of for the duration.
 *
 * The four `LOG_*` names are SPEC §6.3's. The other two decide `colorize`
 * without being named by §6.3, and both would otherwise be inherited from
 * whatever shell the suite happens to run in:
 *
 * - `NO_COLOR` — SPEC §6.4.1 makes it an override that outranks every
 *   configuration source, so a developer who keeps it set would see every
 *   colorize assertion below resolve to `false`.
 * - `FORCE_COLOR` — reaches `getDefaultConfig()` through `shouldColorize()`,
 *   which every merged config is seeded from. CI providers commonly set it, and
 *   with it set this file failed on assertions about lines that never mentioned
 *   color at all.
 */
const LOG_VARIABLES = [
  'LOG_LEVEL',
  'LOG_FORMAT',
  'LOG_TIMESTAMP',
  'LOG_COLOR',
  'NO_COLOR',
  'FORCE_COLOR',
] as const;

let saved: Record<string, string | undefined>;

/** Capture whatever the logger writes to the console, whichever method it uses. */
function captureConsole() {
  const lines: string[] = [];
  const record = (value: unknown) => {
    lines.push(String(value));
  };

  for (const method of ['debug', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, method).mockImplementation(record);
  }

  return lines;
}

beforeEach(() => {
  saved = {};
  for (const name of LOG_VARIABLES) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
  resetEnvironmentWarnings();
});

afterEach(() => {
  for (const name of LOG_VARIABLES) {
    if (saved[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = saved[name];
    }
  }
  vi.restoreAllMocks();
});

describe('environment variables reach the logger', () => {
  it('should apply LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'debug';

    expect(createLogger().getLevel()).toBe(LogLevel.DEBUG);
  });

  it('should silence everything at LOG_LEVEL=silent', () => {
    process.env.LOG_LEVEL = 'silent';
    const lines = captureConsole();

    const logger = createLogger();
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(lines).toEqual([]);
  });

  it('should apply LOG_FORMAT=json', () => {
    process.env.LOG_FORMAT = 'json';
    const lines = captureConsole();

    createLogger().info('structured');

    expect(JSON.parse(lines[0]).message).toBe('structured');
  });

  it('should apply LOG_TIMESTAMP=false', () => {
    process.env.LOG_TIMESTAMP = 'false';
    const lines = captureConsole();

    createLogger().info('no clock');

    expect(lines[0]).toBe('INFO: no clock');
  });

  it('should apply LOG_COLOR in both directions', () => {
    const escape = String.fromCharCode(27);

    process.env.LOG_COLOR = 'true';
    let lines = captureConsole();
    createLogger().error('red');
    expect(lines[0]).toContain(escape);

    vi.restoreAllMocks();

    process.env.LOG_COLOR = 'false';
    lines = captureConsole();
    createLogger().error('plain');
    expect(lines[0]).not.toContain(escape);
  });
});

describe('precedence', () => {
  it('should let the environment override explicit config', () => {
    process.env.LOG_LEVEL = 'debug';

    expect(createLogger({ level: LogLevel.ERROR }).getLevel()).toBe(LogLevel.DEBUG);
  });

  it('should leave explicit config alone when the variable is unset', () => {
    expect(createLogger({ level: LogLevel.ERROR }).getLevel()).toBe(LogLevel.ERROR);
  });

  it('should honor ignoreEnvironment', () => {
    process.env.LOG_LEVEL = 'debug';

    expect(
      createLogger({ level: LogLevel.ERROR, ignoreEnvironment: true }).getLevel()
    ).toBe(LogLevel.ERROR);
  });

  it('should let LOG_LEVEL override the NODE_ENV-derived level', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'debug';

    try {
      expect(createLoggerForEnvironment().getLevel()).toBe(LogLevel.DEBUG);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('should apply the same rules from the browser entry point', () => {
    process.env.LOG_LEVEL = 'error';

    expect(createBrowserLogger().getLevel()).toBe(LogLevel.ERROR);
    expect(createBrowserLogger({ ignoreEnvironment: true }).getLevel()).toBe(LogLevel.INFO);
  });
});

describe('malformed values', () => {
  it('should treat LOG_TIMESTAMP=1 as true rather than false', () => {
    process.env.LOG_TIMESTAMP = '1';
    const lines = captureConsole();

    createLogger().info('kept');

    // The strict `=== 'true'` rule made every non-"true" value mean false, so
    // LOG_TIMESTAMP=1 silently removed timestamps.
    expect(lines[0]).toMatch(/^\[\d{4}-/);
  });

  it.each(['yes', 'on', 'TRUE', ' true '])('should accept %s as true', (value) => {
    process.env.LOG_COLOR = value;
    const lines = captureConsole();

    createLogger().error('colored');

    expect(lines[0]).toContain(String.fromCharCode(27));
  });

  it.each(['no', 'off', '0', 'FALSE'])('should accept %s as false', (value) => {
    process.env.LOG_COLOR = value;
    const lines = captureConsole();

    createLogger().error('plain');

    expect(lines[0]).not.toContain(String.fromCharCode(27));
  });

  it('should warn and fall through to explicit config rather than choosing a side', () => {
    process.env.LOG_TIMESTAMP = 'banana';
    const lines = captureConsole();

    createLogger({ timestamp: false }).info('x');

    expect(lines.some((line) => line.includes('LOG_TIMESTAMP="banana"'))).toBe(true);
    // The explicit timestamp:false survives; the bad value does not flip it.
    expect(lines).toContain('INFO: x');
  });

  it('should warn and ignore an unrecognized LOG_LEVEL rather than defaulting to INFO', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.LOG_LEVEL = 'verbose';

    expect(createLogger({ level: LogLevel.ERROR }).getLevel()).toBe(LogLevel.ERROR);
    expect(warn.mock.calls[0][0]).toContain('LOG_LEVEL="verbose"');
  });

  it('should warn and ignore an unrecognized LOG_FORMAT', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.LOG_FORMAT = 'yaml';

    createLogger().info('x');

    expect(warn.mock.calls[0][0]).toContain('LOG_FORMAT="yaml"');
  });

  it('should warn once, not once per logger', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.LOG_LEVEL = 'verbose';

    createLogger();
    createLogger();
    createLogger();

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

/**
 * The guard #60 asked for: a declared config field that nothing reads is
 * indistinguishable from a working one. Every field must move the output.
 *
 * `transports` and `ignoreEnvironment` are covered by their own suites
 * (tests/node-logger.test.ts and the precedence block above) because their
 * effect is not a change to a single emitted line.
 */
describe('every LoggerConfig field measurably changes output', () => {
  const cases: Array<{
    field: keyof LoggerConfig;
    baseline: Partial<LoggerConfig>;
    changed: Partial<LoggerConfig>;
  }> = [
    { field: 'level', baseline: { level: LogLevel.DEBUG }, changed: { level: LogLevel.ERROR } },
    { field: 'format', baseline: { format: 'text' }, changed: { format: 'json' } },
    { field: 'timestamp', baseline: { timestamp: true }, changed: { timestamp: false } },
    { field: 'colorize', baseline: { colorize: false }, changed: { colorize: true } },
    { field: 'metadata', baseline: { metadata: {} }, changed: { metadata: { service: 'api' } } },
  ];

  it.each(cases)('$field', ({ baseline, changed }) => {
    const emit = (config: Partial<LoggerConfig>) => {
      const lines = captureConsole();
      const logger = createLogger({ level: LogLevel.DEBUG, ...config, ignoreEnvironment: true });
      logger.debug('probe');
      vi.restoreAllMocks();
      return lines.join('\n');
    };

    expect(emit(baseline)).not.toBe(emit(changed));
  });

  it('should include config.metadata on every record', () => {
    const lines = captureConsole();

    createLogger({ metadata: { service: 'api' }, ignoreEnvironment: true }).info('with defaults');

    expect(lines[0]).toContain('"service":"api"');
  });

  it('should let call-site metadata override config.metadata', () => {
    const lines = captureConsole();

    createLogger({ metadata: { stage: 'default' }, ignoreEnvironment: true }).info('x', {
      stage: 'override',
    });

    expect(lines[0]).toContain('"stage":"override"');
    expect(lines[0]).not.toContain('default');
  });
});

describe('NO_COLOR (SPEC 6.4.1)', () => {
  // An escape byte followed by "[". Built with String.fromCharCode rather than
  // written as a regex literal: a control character in a regex trips Biome's
  // noControlCharactersInRegex, and the rest of this file already reaches for
  // the same idiom. Text records carry a literal "[" in the timestamp, so
  // matching on that alone would pass for uncolored output.
  const ANSI = `${String.fromCharCode(27)}[`;

  /** Emit one line through `emit` and report whether it carried color, plus diagnostics. */
  function observe(emit: () => void, colored: (lines: string[], styles: unknown[]) => boolean) {
    const lines: string[] = [];
    const styles: unknown[] = [];
    const warnings: string[] = [];

    const record = (value: unknown, style?: unknown) => {
      lines.push(String(value));
      styles.push(style);
    };

    // `console.warn` stays reserved for diagnostics, so nothing here emits at
    // WARN. ERROR is captured because `createLoggerForEnvironment()` resolves
    // NODE_ENV=test to WARN, which filters an info-level probe out entirely —
    // and an empty transcript reads as "not colored" no matter what.
    vi.spyOn(console, 'info').mockImplementation(record);
    vi.spyOn(console, 'error').mockImplementation(record);
    vi.spyOn(console, 'warn').mockImplementation((value: unknown) => {
      warnings.push(String(value));
    });

    try {
      emit();
    } finally {
      // finally, not inline after emit(): a logger that throws mid-probe would
      // otherwise leak these spies into every later test in the file, and the
      // failure would surface somewhere unrelated.
      vi.restoreAllMocks();
    }

    return { colored: colored(lines, styles), warnings };
  }

  /** Emit one line and report whether it carried ANSI, plus any diagnostics. */
  function probe(config: Partial<LoggerConfig> = {}) {
    return observe(
      () => createLogger({ level: LogLevel.DEBUG, ...config }).info('probe'),
      (lines) => lines.join('\n').includes(ANSI)
    );
  }

  /** As `probe`, but for an arbitrary logger built by the caller. */
  function probeLogger(logger: ILogger) {
    return observe(
      () => logger.info('probe'),
      (lines) => lines.join('\n').includes(ANSI)
    );
  }

  /**
   * As `probe`, but through the browser entry point.
   *
   * BrowserLogger colors with the console's `%c` mechanism rather than ANSI, so
   * the signal is the style argument: a non-empty CSS string means colored.
   * Asserting on escape bytes here would pass no matter what the browser entry
   * does, since it never emits any.
   */
  function probeBrowser(config: Partial<LoggerConfig> = {}) {
    return observe(
      () => createBrowserLogger({ level: LogLevel.DEBUG, ...config }).info('probe'),
      (_lines, styles) => styles.some((style) => typeof style === 'string' && style.length > 0)
    );
  }

  it('colorizes when LOG_COLOR asks for it and NO_COLOR is absent', () => {
    process.env.LOG_COLOR = 'true';

    // The baseline the rest of this block depends on: without it, a test
    // asserting "no color" would pass even if the override did nothing.
    expect(probe().colored).toBe(true);
  });

  it('overrides LOG_COLOR=true and reports the disagreement', () => {
    process.env.NO_COLOR = '1';
    process.env.LOG_COLOR = 'true';

    const { colored, warnings } = probe();

    expect(colored).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('NO_COLOR');
    expect(warnings[0]).toContain('LOG_COLOR');
    expect(warnings[0]).toContain('defaulting to no color');
  });

  it('overrides an explicit colorize: true without reporting anything', () => {
    process.env.NO_COLOR = '1';

    // Beating the program's own choice is the convention working as intended,
    // so there is nothing to report. Only two environment variables in conflict
    // are worth a diagnostic.
    const { colored, warnings } = probe({ colorize: true });

    expect(colored).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('treats an empty NO_COLOR as unset, unlike the LOG_* variables', () => {
    process.env.NO_COLOR = '';

    // The opposite of #84's rule for LOG_*, and deliberately so: no-color.org
    // says "present and not an empty string".
    const { colored, warnings } = probe({ colorize: true });

    expect(colored).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('disables color for NO_COLOR=0, because presence is the whole signal', () => {
    process.env.NO_COLOR = '0';

    expect(probe({ colorize: true }).colored).toBe(false);
  });

  it('disables color for a whitespace-only value, which is not empty', () => {
    process.env.NO_COLOR = ' ';

    expect(probe({ colorize: true }).colored).toBe(false);
  });

  it('stays silent when NO_COLOR and LOG_COLOR=false agree', () => {
    process.env.NO_COLOR = '1';
    process.env.LOG_COLOR = 'false';

    const { colored, warnings } = probe();

    expect(colored).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('stays silent when NO_COLOR is set alone', () => {
    process.env.NO_COLOR = '1';

    expect(probe().warnings).toEqual([]);
  });

  it('is not suppressed by ignoreEnvironment, which opts out of LOG_* only', () => {
    process.env.NO_COLOR = '1';

    // `ignoreEnvironment` is documented as opting out of LOG_LEVEL, LOG_FORMAT,
    // LOG_TIMESTAMP and LOG_COLOR by name, so a library is not hijacked by the
    // host application's operational settings. NO_COLOR is the end user's
    // preference rather than the host's setting, and the flag is settable from
    // a config file — honoring it here would let a file checked into a
    // repository defeat NO_COLOR for every user of that project.
    const { colored, warnings } = probe({ colorize: true, ignoreEnvironment: true });

    expect(colored).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('reports no disagreement under ignoreEnvironment, which discarded LOG_COLOR first', () => {
    process.env.NO_COLOR = '1';
    process.env.LOG_COLOR = 'true';

    // The diagnostic lives in `loadConfigFromEnvironment`, which
    // `ignoreEnvironment` skips entirely, so the veto still applies but nothing
    // is reported. That is the right silence rather than a missed warning:
    // LOG_COLOR was already discarded before NO_COLOR entered, so the two never
    // disagreed about anything that was going to be honored. The same flag
    // silences LOG_COLOR="bogus" for the same reason. Pinned so the coupling
    // cannot drift unnoticed.
    //
    // `colorize: true` is what keeps the first assertion honest: without it the
    // default under a non-TTY runner is already false, and "not colored" would
    // hold with the veto deleted.
    const { colored, warnings } = probe({ colorize: true, ignoreEnvironment: true });

    expect(colored).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('reports the disagreement once, not once per logger', () => {
    process.env.NO_COLOR = '1';
    process.env.LOG_COLOR = 'true';

    expect(probe().warnings).toHaveLength(1);
    expect(probe().warnings).toEqual([]);
  });

  describe('per-transport options', () => {
    const colorizingConsole = [{ type: 'console', options: { colorize: true } }];

    it('colorizes from options.colorize when NO_COLOR is absent', () => {
      // Baseline. Without it every assertion below would pass just as well if
      // options.colorize had stopped working altogether.
      expect(probe({ transports: colorizingConsole }).colored).toBe(true);
    });

    it('overrides options.colorize, which the config-layer override cannot reach', () => {
      process.env.NO_COLOR = '1';

      // `applyNoColorOverride` rewrites the top-level `colorize` only, and the
      // console factory resolves `options.colorize ?? context.colorize`. Before
      // the veto moved into `createTransports`, this one line re-enabled color
      // through the sanctioned createLogger() path.
      const { colored, warnings } = probe({ transports: colorizingConsole });

      expect(colored).toBe(false);
      expect(warnings).toEqual([]);
    });

    it('overrides options.colorize on a directly constructed NodeLogger', () => {
      process.env.NO_COLOR = '1';

      // `new NodeLogger(...)` skips the factory and every configuration source
      // with it. `createTransports` is where that path and createLogger()'s
      // meet, which is why the veto is resolved there.
      const logger = new NodeLogger({ level: LogLevel.DEBUG, transports: colorizingConsole });

      expect(probeLogger(logger).colored).toBe(false);
    });

    it('overrides a top-level colorize on a directly constructed NodeLogger', () => {
      process.env.NO_COLOR = '1';

      const logger = new NodeLogger({ level: LogLevel.DEBUG, colorize: true });

      expect(probeLogger(logger).colored).toBe(false);
    });
  });

  describe('other entry points', () => {
    it('applies to the browser entry point, which styles with %c rather than ANSI', () => {
      // Baseline first: the assertion below is only meaningful if the browser
      // logger colorizes at all when asked.
      expect(probeBrowser({ colorize: true }).colored).toBe(true);

      process.env.NO_COLOR = '1';

      expect(probeBrowser({ colorize: true }).colored).toBe(false);
    });

    it('applies to the browser entry point over LOG_COLOR=true', () => {
      process.env.NO_COLOR = '1';
      process.env.LOG_COLOR = 'true';

      const { colored, warnings } = probeBrowser();

      expect(colored).toBe(false);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('NO_COLOR');
    });

    /** The module-level `logger` singleton is built this way, so it is the path most reach. */
    const probeEnvironment = () =>
      observe(
        () => createLoggerForEnvironment().error('probe'),
        (lines) => lines.join('\n').includes(ANSI)
      );

    it('applies to createLoggerForEnvironment, which most consumers reach first', () => {
      // FORCE_COLOR is what makes this test say something: without it
      // `shouldColorize()` reads a non-TTY stdout under the runner, the default
      // resolves to false, and "not colored" would prove nothing.
      process.env.FORCE_COLOR = '1';

      expect(probeEnvironment().colored).toBe(true);

      process.env.NO_COLOR = '1';

      expect(probeEnvironment().colored).toBe(false);
    });
  });
});
