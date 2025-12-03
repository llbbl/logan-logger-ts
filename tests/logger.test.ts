import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, createLoggerForEnvironment, LogLevel } from '../src/index.ts';

describe('Logger', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.clearAllMocks();
  });

  describe('Basic logging functionality', () => {
    it('should create a logger with default configuration', () => {
      const logger = createLogger();

      expect(logger).toBeDefined();
      expect(logger.debug).toBeTypeOf('function');
      expect(logger.info).toBeTypeOf('function');
      expect(logger.warn).toBeTypeOf('function');
      expect(logger.error).toBeTypeOf('function');
    });

    it('should respect log levels', () => {
      const logger = createLogger({
        level: LogLevel.WARN,
      });

      // Mock console methods
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

    it('should handle metadata correctly', () => {
      const logger = createLogger();
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const metadata = { userId: '123', action: 'login' };
      logger.info('User logged in', metadata);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0];
      expect(logCall[0]).toContain('User logged in');
    });

    it('should support lazy evaluation of messages', () => {
      const logger = createLogger({
        level: LogLevel.ERROR, // Only errors will be logged
      });

      const expensiveFunction = vi.fn(() => 'expensive result');

      // This should not call the expensive function
      logger.debug(() => `Debug: ${expensiveFunction()}`);
      expect(expensiveFunction).not.toHaveBeenCalled();

      // This should call the expensive function
      logger.error(() => `Error: ${expensiveFunction()}`);
      expect(expensiveFunction).toHaveBeenCalledTimes(1);
    });

    it('should create child loggers with additional metadata', () => {
      const parentLogger = createLogger();
      const childLogger = parentLogger.child({ service: 'auth' });

      expect(childLogger).toBeDefined();
      expect(childLogger).not.toBe(parentLogger);

      // Child logger should have same methods
      expect(childLogger.debug).toBeTypeOf('function');
      expect(childLogger.info).toBeTypeOf('function');
      expect(childLogger.warn).toBeTypeOf('function');
      expect(childLogger.error).toBeTypeOf('function');
    });

    it('should allow level changes', () => {
      const logger = createLogger({
        level: LogLevel.INFO,
      });

      expect(logger.getLevel()).toBe(LogLevel.INFO);

      logger.setLevel(LogLevel.ERROR);
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe('Environment-based configuration', () => {
    it('should use environment variables for configuration', () => {
      // Mock environment variable
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        // Use createLoggerForEnvironment instead of createLogger for environment-based config
        const logger = createLoggerForEnvironment();
        // In production, should default to higher log level
        expect(logger.getLevel()).toBeGreaterThanOrEqual(LogLevel.WARN);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('Error handling', () => {
    it('should serialize Error objects correctly', () => {
      const logger = createLogger();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1';

      logger.error('An error occurred', { error });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      // Verify error was logged (exact format may vary by implementation)
      expect(consoleSpy.mock.calls[0][0]).toContain('An error occurred');
    });

    it('should handle circular references in metadata', () => {
      const logger = createLogger();
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      // Create circular reference
      const obj: any = { name: 'test' };
      obj.self = obj;

      expect(() => {
        logger.info('Testing circular reference', obj);
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });
  });
});
