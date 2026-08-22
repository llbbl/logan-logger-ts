import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, createLoggerForEnvironment } from '../src/core/factory.ts';
import { type LoggerConfig, LogLevel } from '../src/core/types.ts';
import { createLogger as createBrowserLogger } from '../src/browser.ts';
import { resetEnvironmentWarnings } from '../src/utils/config.ts';

const LOG_VARIABLES = ['LOG_LEVEL', 'LOG_FORMAT', 'LOG_TIMESTAMP', 'LOG_COLOR'] as const;

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
