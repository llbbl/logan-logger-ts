import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type LoggerConfig, LogLevel } from '../src/core/types.ts';
import { createMorganStream, NodeLogger } from '../src/runtime/node.ts';

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

    it('should fall back to console when Winston is not available', () => {
      // Mock Winston import failure
      vi.mock('winston', () => {
        throw new Error('Winston not found');
      });

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

  describe('Winston integration', () => {
    it('should handle Winston initialization gracefully', async () => {
      // This test mainly ensures the async Winston loading doesn't break
      const logger = new NodeLogger();

      // Give time for async Winston initialization
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(logger).toBeDefined();
    });

    it('should map log levels correctly for Winston', () => {
      const logger = new NodeLogger();

      // Test that all log levels work (even if Winston isn't available)
      expect(() => {
        logger.debug('debug');
        logger.info('info');
        logger.warn('warn');
        logger.error('error');
      }).not.toThrow();
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
