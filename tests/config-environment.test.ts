import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger as createBrowserLogger } from '../src/browser.ts';
import { createLogger, createLoggerForEnvironment } from '../src/core/factory.ts';
import { LogLevel } from '../src/core/types.ts';
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

  it.each([
    ['warning', LogLevel.WARN],
    ['none', LogLevel.SILENT],
    ['ERROR', LogLevel.ERROR],
    ['  info  ', LogLevel.INFO],
  ])('should accept LOG_LEVEL=%s', (value, expected) => {
    process.env.LOG_LEVEL = value;

    expect(createLogger().getLevel()).toBe(expected);
  });
});

/**
 * On the 1.x line the formatter never receives the config, so `format`,
 * `timestamp` and `colorize` change nothing about Node output. That is #60,
 * fixed in 2.0 and deliberately **not** backported: honoring them means
 * rewriting NodeLogger's output path, which is the 2.0 transport work.
 *
 * These tests pin the limitation rather than leaving it to be rediscovered. If
 * one of them starts failing, the formatter has gained config awareness and the
 * docs need updating to match.
 */
describe('variables that are parsed but not honored on 1.x', () => {
  it('should not change Node output for LOG_FORMAT', () => {
    process.env.LOG_FORMAT = 'json';
    const lines = captureConsole();

    createLogger().info('still text');

    expect(lines[0]).toMatch(/^\[\d{4}-/);
    expect(() => JSON.parse(lines[0])).toThrow();
  });

  it('should not change Node output for LOG_TIMESTAMP', () => {
    process.env.LOG_TIMESTAMP = 'false';
    const lines = captureConsole();

    createLogger().info('still stamped');

    expect(lines[0]).toMatch(/^\[\d{4}-/);
  });

  it('should still reach the resolved config, so a fix to #60 picks them up', () => {
    process.env.LOG_FORMAT = 'json';
    process.env.LOG_TIMESTAMP = 'false';

    // The values are parsed and merged; only the formatter ignores them.
    const logger = createLogger() as unknown as { config: Record<string, unknown> };

    expect(logger.config.format).toBe('json');
    expect(logger.config.timestamp).toBe(false);
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

    expect(createLogger({ level: LogLevel.ERROR, ignoreEnvironment: true }).getLevel()).toBe(
      LogLevel.ERROR
    );
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

    // The strict `=== 'true'` rule made every non-"true" value mean false.
    const logger = createLogger() as unknown as { config: Record<string, unknown> };

    expect(logger.config.timestamp).toBe(true);
  });

  it.each([
    ['yes', true],
    ['on', true],
    ['TRUE', true],
    [' true ', true],
    ['no', false],
    ['off', false],
    ['0', false],
    ['FALSE', false],
  ])('should parse LOG_COLOR=%s as %s', (value, expected) => {
    process.env.LOG_COLOR = value;

    const logger = createLogger() as unknown as { config: Record<string, unknown> };

    expect(logger.config.colorize).toBe(expected);
  });

  it('should warn and fall through to explicit config rather than choosing a side', () => {
    process.env.LOG_TIMESTAMP = 'banana';
    const lines = captureConsole();

    const logger = createLogger({ timestamp: false }) as unknown as {
      config: Record<string, unknown>;
    };

    expect(lines.some((line) => line.includes('LOG_TIMESTAMP="banana"'))).toBe(true);
    // The explicit timestamp:false survives; the bad value does not flip it.
    expect(logger.config.timestamp).toBe(false);
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

    createLogger();

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

describe('config.metadata is emitted', () => {
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

  it('should inherit config.metadata through child loggers', () => {
    const lines = captureConsole();

    createLogger({ metadata: { service: 'api' }, ignoreEnvironment: true })
      .child({ requestId: 'req-1' })
      .info('child');

    expect(lines[0]).toContain('"service":"api"');
    expect(lines[0]).toContain('"requestId":"req-1"');
  });

  it('should not leak a parent mutation back into config.metadata', () => {
    const metadata = { service: 'api' };
    const logger = createLogger({ metadata, ignoreEnvironment: true });
    const lines = captureConsole();

    logger.child({ extra: 1 });
    logger.info('parent unchanged');

    expect(lines[0]).toContain('"service":"api"');
    expect(lines[0]).not.toContain('extra');
    expect(metadata).toEqual({ service: 'api' });
  });
});
