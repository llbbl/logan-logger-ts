import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transport, TransportContext } from '../src/core/transport.ts';
import { registerTransport } from '../src/core/transport.ts';
import {
  type LogEntry,
  type LoggerConfig,
  LogLevel,
  type TransportConfig,
} from '../src/core/types.ts';
import { createMorganStream, NodeLogger } from '../src/runtime/node.ts';

/** A transport that keeps what it was given, for assertions. */
function recordingTransport(): Transport & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];

  return {
    type: 'recording',
    entries,
    write(entry: LogEntry) {
      entries.push(entry);
    },
  };
}

describe('Node.js Logger', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.clearAllMocks();
  });

  describe('NodeLogger', () => {
    it('should create a Node.js logger instance', () => {
      const logger = new NodeLogger();

      expect(logger).toBeDefined();
      expect(logger.debug).toBeTypeOf('function');
      expect(logger.info).toBeTypeOf('function');
      expect(logger.warn).toBeTypeOf('function');
      expect(logger.error).toBeTypeOf('function');
    });

    it('should accept configuration options', () => {
      const config: Partial<LoggerConfig> = {
        level: LogLevel.WARN,
        timestamp: false,
      };

      const logger = new NodeLogger(config);

      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });

    it('should write to the console when no transports are configured', () => {
      const consoleSpy = {
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      };

      const logger = new NodeLogger({ level: LogLevel.DEBUG });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Should use console methods as fallback
      expect(consoleSpy.debug).toHaveBeenCalledTimes(1);
      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should handle metadata in console fallback', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const logger = new NodeLogger();
      const metadata = { userId: '123', action: 'login' };

      logger.info('User action', metadata);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('User action');
      expect(logCall).toContain('userId');
      expect(logCall).toContain('123');
    });

    it('should handle circular references in metadata', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const logger = new NodeLogger();
      const obj: any = { name: 'test' };
      obj.self = obj;

      expect(() => {
        logger.info('Testing circular reference', obj);
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('[Circular]');
    });

    it('should respect log levels', () => {
      const logger = new NodeLogger({ level: LogLevel.WARN });

      const consoleSpy = {
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      };

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      // Only warn and error should be logged
      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should allow level changes', () => {
      const logger = new NodeLogger({ level: LogLevel.INFO });

      expect(logger.getLevel()).toBe(LogLevel.INFO);

      logger.setLevel(LogLevel.ERROR);
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });

    it('should create child loggers', () => {
      const parentLogger = new NodeLogger();
      const metadata = { service: 'auth', requestId: '123' };

      const childLogger = parentLogger.child(metadata);

      expect(childLogger).toBeDefined();
      expect(childLogger).not.toBe(parentLogger);
      expect(childLogger.getLevel()).toBe(parentLogger.getLevel());
    });

    it('should format timestamps correctly', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const logger = new NodeLogger();
      logger.info('test message');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];

      // Should contain ISO timestamp
      expect(logCall).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(logCall).toContain('INFO: test message');
    });

    it('should handle Error objects correctly', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const logger = new NodeLogger();
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';

      logger.error('An error occurred', { error });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('An error occurred');
      expect(logCall).toContain('Test error');
    });

    it('should handle undefined metadata gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const logger = new NodeLogger();
      logger.info('test message', undefined);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('test message');
      expect(logCall).not.toContain('undefined');
    });

    it('should handle empty metadata gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const logger = new NodeLogger();
      logger.info('test message', {});

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('test message');
    });

    it('should support lazy message evaluation', () => {
      const logger = new NodeLogger({ level: LogLevel.ERROR });

      const expensiveFunction = vi.fn(() => 'expensive result');

      // Debug message should not be evaluated
      logger.debug(() => `Debug: ${expensiveFunction()}`);
      expect(expensiveFunction).not.toHaveBeenCalled();

      // Error message should be evaluated
      logger.error(() => `Error: ${expensiveFunction()}`);
      expect(expensiveFunction).toHaveBeenCalledTimes(1);
    });
  });

  describe('createMorganStream', () => {
    it('should create a Morgan-compatible stream', () => {
      const logger = new NodeLogger();
      const stream = createMorganStream(logger);

      expect(stream).toBeDefined();
      expect(stream.write).toBeTypeOf('function');
    });

    it('should log HTTP requests through Morgan stream', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const logger = new NodeLogger();
      const stream = createMorganStream(logger);

      const httpLogMessage = 'GET /api/users 200 15ms\n';
      stream.write(httpLogMessage);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('GET /api/users 200 15ms');
    });

    it('should trim whitespace from Morgan messages', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const logger = new NodeLogger();
      const stream = createMorganStream(logger);

      const httpLogMessage = '  GET /api/users 200 15ms  \n  ';
      stream.write(httpLogMessage);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('GET /api/users 200 15ms');
      expect(logCall).not.toMatch(/^\s+|\s+$/);
    });

    it('should respect logger level in Morgan stream', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const logger = new NodeLogger({ level: LogLevel.ERROR });
      const stream = createMorganStream(logger);

      stream.write('GET /api/users 200 15ms\n');

      // Should not log because level is ERROR and Morgan logs at INFO
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should work with child loggers', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const parentLogger = new NodeLogger();
      const childLogger = parentLogger.child({ service: 'http' });
      const stream = createMorganStream(childLogger as NodeLogger);

      stream.write('GET /api/users 200 15ms\n');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('transports', () => {
    it('should emit the very first record, with no async initialization window', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      // Regression test: the Winston implementation kicked off an un-awaited
      // dynamic import in its constructor, so records logged before it
      // resolved silently took a different path.
      new NodeLogger({ level: LogLevel.DEBUG }).info('first');

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy.mock.calls[0][0]).toContain('first');
    });

    it('should route each level to the matching console method', () => {
      const spies = {
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      };

      const logger = new NodeLogger({ level: LogLevel.DEBUG });
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      expect(spies.debug).toHaveBeenCalledTimes(1);
      expect(spies.info).toHaveBeenCalledTimes(1);
      expect(spies.warn).toHaveBeenCalledTimes(1);
      expect(spies.error).toHaveBeenCalledTimes(1);
    });

    it('should build exactly the transports listed, in order', () => {
      const first = recordingTransport();
      const second = recordingTransport();

      const logger = new NodeLogger({
        transports: [
          { type: 'custom', options: { transport: first } },
          { type: 'custom', options: { transport: second } },
        ],
      });

      expect(logger.getTransports()).toHaveLength(2);
      expect(logger.getTransports()[0]).toBe(first);
      expect(logger.getTransports()[1]).toBe(second);
    });

    it('should apply a per-transport level filter', () => {
      const quiet = recordingTransport();

      const logger = new NodeLogger({
        level: LogLevel.DEBUG,
        transports: [{ type: 'custom', level: LogLevel.ERROR, options: { transport: quiet } }],
      });

      logger.info('ignored');
      logger.error('kept');

      expect(quiet.entries.map((entry) => entry.message)).toEqual(['kept']);
    });

    it('should keep writing through healthy transports when one throws', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const healthy = recordingTransport();
      const broken = {
        type: 'broken',
        write() {
          throw new Error('destination is on fire');
        },
      };

      const logger = new NodeLogger({
        transports: [
          { type: 'custom', options: { transport: broken } },
          { type: 'custom', options: { transport: healthy } },
        ],
      });

      expect(() => logger.info('still logged')).not.toThrow();
      expect(healthy.entries).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should keep the other transports when one fails to initialize', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const healthy = recordingTransport();

      const logger = new NodeLogger({
        transports: [
          // No options.transport: the custom factory rejects this one.
          { type: 'custom', options: {} },
          { type: 'custom', options: { transport: healthy } },
        ],
      });

      expect(logger.getTransports()).toEqual([healthy]);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should warn with an actionable message for an unregistered file transport', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // tests/file-transport.test.ts imports the module that registers 'file';
      // this file deliberately does not, matching a main-entry consumer.
      const logger = new NodeLogger({
        transports: [{ type: 'file', options: { filename: 'logs/should-not-exist.log' } }],
      });

      expect(logger.getTransports()).toHaveLength(0);
      expect(consoleSpy.mock.calls[0][0]).toContain("logan-logger/node");
    });

    it('should share transports with child loggers rather than rebuilding them', () => {
      const shared = recordingTransport();
      const parent = new NodeLogger({ transports: [{ type: 'custom', options: { transport: shared } }] });

      const child = parent.child({ requestId: 'req-1' }) as NodeLogger;
      const grandchild = child.child({ span: 'a' }) as NodeLogger;

      expect(child.getTransports()[0]).toBe(shared);
      expect(grandchild.getTransports()[0]).toBe(shared);

      child.info('from child');

      expect(shared.entries).toHaveLength(1);
      expect(shared.entries[0].metadata).toEqual({ requestId: 'req-1' });
    });

    it('should accept a transport registered under a name of its own', () => {
      const received: TransportContext[] = [];
      const metrics = recordingTransport();

      registerTransport('metrics', (_config, context) => {
        received.push(context);
        return metrics;
      });

      // Annotated rather than inferred: the point of this case is that a
      // registered name type-checks as a TransportConfig without a cast.
      const transports: TransportConfig[] = [{ type: 'metrics', options: {} }];
      const logger = new NodeLogger({
        format: 'json',
        timestamp: false,
        colorize: true,
        transports,
      });

      logger.info('measured');

      expect(metrics.entries.map((entry) => entry.message)).toEqual(['measured']);
      expect(received).toEqual([{ format: 'json', timestamp: false, colorize: true }]);
    });

    it('should call options.transport as a factory and use what it returns', () => {
      const received: TransportContext[] = [];
      const built = recordingTransport();

      const logger = new NodeLogger({
        format: 'json',
        timestamp: false,
        colorize: true,
        transports: [
          {
            type: 'custom',
            options: {
              transport: (context: TransportContext) => {
                received.push(context);
                return built;
              },
            },
          },
        ],
      });

      expect(logger.getTransports()).toEqual([built]);

      logger.info('via factory');

      expect(built.entries.map((entry) => entry.message)).toEqual(['via factory']);
      expect(received).toEqual([{ format: 'json', timestamp: false, colorize: true }]);
    });

    it('should apply a per-transport level filter to a factory-built transport', () => {
      const quiet = recordingTransport();

      const logger = new NodeLogger({
        level: LogLevel.DEBUG,
        transports: [
          { type: 'custom', level: LogLevel.ERROR, options: { transport: () => quiet } },
        ],
      });

      logger.info('ignored');
      logger.error('kept');

      expect(quiet.entries.map((entry) => entry.message)).toEqual(['kept']);
    });

    it('should reject a factory that does not produce a transport', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const healthy = recordingTransport();

      const logger = new NodeLogger({
        transports: [
          { type: 'custom', options: { transport: () => ({ type: 'no-write' }) } },
          { type: 'custom', options: { transport: healthy } },
        ],
      });

      expect(logger.getTransports()).toEqual([healthy]);
      expect(consoleSpy.mock.calls[0][1]).toMatchObject({
        message: expect.stringContaining('write(entry) method'),
      });
    });

    it('should honor config.timestamp and config.colorize in the text form', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      new NodeLogger({ timestamp: false, colorize: false }).info('bare');

      expect(consoleSpy.mock.calls[0][0]).toBe('INFO: bare');
    });

    it('should emit the JSON envelope when format is json, never colorized', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      new NodeLogger({ format: 'json', colorize: true }).info('structured', { a: 1 });

      const parsed = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('structured');
      expect(parsed.metadata).toEqual({ a: 1 });
      expect(consoleSpy.mock.calls[0][0]).not.toContain('\u001b[');
    });
  });

  describe('Production environment behavior', () => {
    it('should handle production environment settings', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const logger = new NodeLogger();
        expect(logger).toBeDefined();

        // Production logger should work without issues
        expect(() => {
          logger.error('Production error');
        }).not.toThrow();

        // NODE_ENV=production must not imply file logging. The implicit file
        // transports were the cause of #44.
        expect(logger.getTransports().map((transport) => transport.type)).toEqual(['console']);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should work in development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        const logger = new NodeLogger();
        expect(logger).toBeDefined();

        expect(() => {
          logger.debug('Development debug');
        }).not.toThrow();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
