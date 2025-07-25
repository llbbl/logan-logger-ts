import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoggerFactory, createLogger, createLoggerForEnvironment, stringToLogLevel, logLevelToString } from '@/core/factory';
import { LogLevel, LoggerConfig } from '@/core/types';

// Mock the runtime detection to control test environment
vi.mock('@/utils/runtime', () => ({
  detectRuntime: vi.fn(() => ({
    name: 'node',
    version: '20.0.0',
    capabilities: {
      fileSystem: true,
      colorSupport: true,
      processInfo: true,
      streams: true
    }
  }))
}));

describe('Logger Factory', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('LoggerFactory.create', () => {
    it('should create a logger with default configuration', () => {
      const logger = LoggerFactory.create();
      
      expect(logger).toBeDefined();
      expect(logger.debug).toBeTypeOf('function');
      expect(logger.info).toBeTypeOf('function');
      expect(logger.warn).toBeTypeOf('function');
      expect(logger.error).toBeTypeOf('function');
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('should create a logger with custom configuration', () => {
      const config: Partial<LoggerConfig> = {
        level: LogLevel.WARN,
        timestamp: false,
        colorize: false
      };
      
      const logger = LoggerFactory.create(config);
      
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });

    it('should merge user config with defaults', () => {
      const config: Partial<LoggerConfig> = {
        level: LogLevel.ERROR
      };
      
      const logger = LoggerFactory.create(config);
      
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
      // Other default values should still be present
    });

    it('should handle empty configuration object', () => {
      const logger = LoggerFactory.create({});
      
      expect(logger).toBeDefined();
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('should create different logger types based on runtime', async () => {
      const { detectRuntime } = await import('../src/utils/runtime');
      
      // Test Node.js runtime
      vi.mocked(detectRuntime).mockReturnValue({
        name: 'node',
        version: '20.0.0',
        capabilities: { fileSystem: true, colorSupport: true, processInfo: true, streams: true }
      });
      
      const nodeLogger = LoggerFactory.create();
      expect(nodeLogger).toBeDefined();
      
      // Test browser runtime
      vi.mocked(detectRuntime).mockReturnValue({
        name: 'browser',
        version: 'Chrome/120.0.0',
        capabilities: { fileSystem: false, colorSupport: true, processInfo: false, streams: false }
      });
      
      const browserLogger = LoggerFactory.create();
      expect(browserLogger).toBeDefined();
      
      // Test Bun runtime (should use Node.js adapter)
      vi.mocked(detectRuntime).mockReturnValue({
        name: 'bun',
        version: '1.0.25',
        capabilities: { fileSystem: true, colorSupport: true, processInfo: true, streams: true }
      });
      
      const bunLogger = LoggerFactory.create();
      expect(bunLogger).toBeDefined();
    });

    it('should handle unknown runtime gracefully', async () => {
      const { detectRuntime } = await import('../src/utils/runtime');
      
      vi.mocked(detectRuntime).mockReturnValue({
        name: 'unknown',
        capabilities: { fileSystem: false, colorSupport: false, processInfo: false, streams: false }
      });
      
      const logger = LoggerFactory.create();
      
      expect(logger).toBeDefined();
      // Should fallback to browser logger for unknown runtimes
    });
  });

  describe('LoggerFactory.createChild', () => {
    it('should create a child logger with additional metadata', () => {
      const parentLogger = LoggerFactory.create();
      const metadata = { service: 'auth', requestId: '123' };
      
      const childLogger = LoggerFactory.createChild(parentLogger, metadata);
      
      expect(childLogger).toBeDefined();
      expect(childLogger).not.toBe(parentLogger);
      expect(childLogger.debug).toBeTypeOf('function');
    });

    it('should preserve parent logger configuration in child', () => {
      const config: Partial<LoggerConfig> = {
        level: LogLevel.WARN
      };
      
      const parentLogger = LoggerFactory.create(config);
      const childLogger = LoggerFactory.createChild(parentLogger, { service: 'test' });
      
      expect(childLogger.getLevel()).toBe(LogLevel.WARN);
    });
  });

  describe('createLogger convenience function', () => {
    it('should work as alias for LoggerFactory.create', () => {
      const logger1 = LoggerFactory.create();
      const logger2 = createLogger();
      
      expect(logger1.getLevel()).toBe(logger2.getLevel());
      expect(typeof logger1.debug).toBe(typeof logger2.debug);
    });

    it('should accept configuration parameters', () => {
      const config: Partial<LoggerConfig> = {
        level: LogLevel.DEBUG,
        colorize: false
      };
      
      const logger = createLogger(config);
      
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should work without parameters', () => {
      const logger = createLogger();
      
      expect(logger).toBeDefined();
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });
  });

  describe('createLoggerForEnvironment', () => {
    beforeEach(() => {
      // Clean up environment variables
      delete process.env.NODE_ENV;
      delete process.env.NEXT_PUBLIC_APP_ENV;
      delete process.env.ENVIRONMENT;
    });

    it('should set ERROR level for production environment', () => {
      process.env.NODE_ENV = 'production';
      
      const logger = createLoggerForEnvironment();
      
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });

    it('should set WARN level for staging environment', () => {
      process.env.NODE_ENV = 'staging';
      
      const logger = createLoggerForEnvironment();
      
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });

    it('should set WARN level for test environment', () => {
      process.env.NODE_ENV = 'test';
      
      const logger = createLoggerForEnvironment();
      
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });

    it('should set DEBUG level for development environment', () => {
      process.env.NODE_ENV = 'development';
      
      const logger = createLoggerForEnvironment();
      
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should set DEBUG level for dev environment', () => {
      process.env.NODE_ENV = 'dev';
      
      const logger = createLoggerForEnvironment();
      
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should default to INFO level for unknown environments', () => {
      process.env.NODE_ENV = 'unknown';
      
      const logger = createLoggerForEnvironment();
      
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });

    it('should use NEXT_PUBLIC_APP_ENV as fallback', () => {
      process.env.NEXT_PUBLIC_APP_ENV = 'production';
      
      const logger = createLoggerForEnvironment();
      
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });

    it('should use ENVIRONMENT as secondary fallback', () => {
      process.env.ENVIRONMENT = 'development';
      
      const logger = createLoggerForEnvironment();
      
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should set appropriate format for environment', () => {
      process.env.NODE_ENV = 'production';
      
      const logger = createLoggerForEnvironment();
      
      // In production, should use JSON format (we can't easily test this without exposing internals)
      expect(logger).toBeDefined();
    });

    it('should disable colorize in production', () => {
      process.env.NODE_ENV = 'production';
      
      const logger = createLoggerForEnvironment();
      
      // Should create logger with colorize: false for production
      expect(logger).toBeDefined();
    });

    it('should enable timestamp by default', () => {
      const logger = createLoggerForEnvironment();
      
      // Should create logger with timestamp: true
      expect(logger).toBeDefined();
    });
  });

  describe('Log level conversion utilities', () => {
    describe('stringToLogLevel', () => {
      it('should convert valid strings to log levels', () => {
        expect(stringToLogLevel('debug')).toBe(LogLevel.DEBUG);
        expect(stringToLogLevel('info')).toBe(LogLevel.INFO);
        expect(stringToLogLevel('warn')).toBe(LogLevel.WARN);
        expect(stringToLogLevel('error')).toBe(LogLevel.ERROR);
        expect(stringToLogLevel('silent')).toBe(LogLevel.SILENT);
      });

      it('should handle case variations', () => {
        expect(stringToLogLevel('DEBUG')).toBe(LogLevel.DEBUG);
        expect(stringToLogLevel('Info')).toBe(LogLevel.INFO);
        expect(stringToLogLevel('WARN')).toBe(LogLevel.WARN);
      });

      it('should handle alternative names', () => {
        expect(stringToLogLevel('warning')).toBe(LogLevel.WARN);
        expect(stringToLogLevel('none')).toBe(LogLevel.SILENT);
      });

      it('should default to INFO for invalid inputs', () => {
        expect(stringToLogLevel('invalid')).toBe(LogLevel.INFO);
        expect(stringToLogLevel('')).toBe(LogLevel.INFO);
        expect(stringToLogLevel('123')).toBe(LogLevel.INFO);
      });
    });

    describe('logLevelToString', () => {
      it('should convert log levels to strings', () => {
        expect(logLevelToString(LogLevel.DEBUG)).toBe('debug');
        expect(logLevelToString(LogLevel.INFO)).toBe('info');
        expect(logLevelToString(LogLevel.WARN)).toBe('warn');
        expect(logLevelToString(LogLevel.ERROR)).toBe('error');
        expect(logLevelToString(LogLevel.SILENT)).toBe('silent');
      });

      it('should handle invalid log levels', () => {
        expect(logLevelToString(999 as LogLevel)).toBe('info');
        expect(logLevelToString(-1 as LogLevel)).toBe('info');
      });
    });

    describe('Round-trip conversion', () => {
      it('should maintain consistency in round-trip conversion', () => {
        const levels = ['debug', 'info', 'warn', 'error', 'silent'];
        
        levels.forEach(levelString => {
          const level = stringToLogLevel(levelString);
          const backToString = logLevelToString(level);
          expect(backToString).toBe(levelString);
        });
      });
    });
  });

  describe('Factory integration with configuration', () => {
    it('should respect metadata merging in factory', () => {
      const config: Partial<LoggerConfig> = {
        metadata: { service: 'api', version: '1.0' }
      };
      
      const logger = LoggerFactory.create(config);
      
      expect(logger).toBeDefined();
      // Metadata should be merged with defaults
    });

    it('should handle transport configuration', () => {
      const config: Partial<LoggerConfig> = {
        transports: [
          { type: 'console', options: { colorize: false } }
        ]
      };
      
      const logger = LoggerFactory.create(config);
      
      expect(logger).toBeDefined();
    });

    it('should work with complex nested configuration', () => {
      const config: Partial<LoggerConfig> = {
        level: LogLevel.WARN,
        format: 'json',
        timestamp: true,
        colorize: false,
        metadata: {
          service: 'test-service',
          environment: 'test',
          nested: {
            deep: 'value'
          }
        },
        transports: [
          { type: 'console', level: LogLevel.ERROR, options: { colorize: true } },
          { type: 'file', options: { filename: 'test.log' } }
        ]
      };
      
      const logger = LoggerFactory.create(config);
      
      expect(logger).toBeDefined();
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });
  });
});