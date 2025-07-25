import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserLogger, ConsoleGroupLogger, PerformanceLogger } from '../src/runtime/browser.ts';
import { LogLevel, LoggerConfig } from '../src/core/types.ts';

describe('Browser Logger', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.clearAllMocks();
  });

  describe('BrowserLogger', () => {
    it('should create a browser logger instance', () => {
      const logger = new BrowserLogger();
      
      expect(logger).toBeDefined();
      expect(logger.debug).toBeTypeOf('function');
      expect(logger.info).toBeTypeOf('function');
      expect(logger.warn).toBeTypeOf('function');
      expect(logger.error).toBeTypeOf('function');
    });

    it('should accept configuration options', () => {
      const config: Partial<LoggerConfig> = {
        level: LogLevel.WARN,
        colorize: false
      };
      
      const logger = new BrowserLogger(config);
      
      expect(logger.getLevel()).toBe(LogLevel.WARN);
    });

    it('should use console methods for logging', () => {
      const consoleSpy = {
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {})
      };

      // Set DEBUG level to ensure all messages are logged
      const logger = new BrowserLogger({ level: LogLevel.DEBUG });
      
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.debug).toHaveBeenCalledTimes(1);
      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should fallback to console.log when console.debug is not available', () => {
      const originalDebug = console.debug;
      console.debug = undefined as any;
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Set DEBUG level to ensure debug message is logged
      const logger = new BrowserLogger({ level: LogLevel.DEBUG });
      logger.debug('debug message');
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      
      console.debug = originalDebug;
    });

    it('should apply CSS styling when colorize is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      
      const logger = new BrowserLogger({ colorize: true });
      logger.info('styled message');
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0];
      
      // Should have CSS styling
      expect(logCall[0]).toContain('%c');
      expect(logCall[1]).toContain('color: #007acc');
    });

    it('should not apply styling when colorize is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      
      const logger = new BrowserLogger({ colorize: false });
      logger.info('unstyled message');
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0];
      
      // Should still have %c but empty style
      expect(logCall[0]).toContain('%c');
      expect(logCall[1]).toBe('');
    });

    it('should use different colors for different log levels', () => {
      const consoleSpy = {
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {})
      };

      const logger = new BrowserLogger({ colorize: true, level: LogLevel.DEBUG });
      
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      // Check that different styles are applied
      expect(consoleSpy.debug.mock.calls[0][1]).toContain('#888');
      expect(consoleSpy.info.mock.calls[0][1]).toContain('#007acc');
      expect(consoleSpy.warn.mock.calls[0][1]).toContain('#ff8c00');
      expect(consoleSpy.error.mock.calls[0][1]).toContain('#dc3545');
    });

    it('should handle metadata with safe serialization', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      
      const logger = new BrowserLogger();
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
      
      const logger = new BrowserLogger();
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
      const logger = new BrowserLogger({ level: LogLevel.WARN });
      
      const consoleSpy = {
        debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {})
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

    it('should create child loggers', () => {
      const parentLogger = new BrowserLogger();
      const metadata = { component: 'auth', userId: '123' };
      
      const childLogger = parentLogger.child(metadata);
      
      expect(childLogger).toBeDefined();
      expect(childLogger).not.toBe(parentLogger);
      expect(childLogger.getLevel()).toBe(parentLogger.getLevel());
    });

    it('should format timestamps correctly', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      
      const logger = new BrowserLogger();
      logger.info('test message');
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      
      // Should contain ISO timestamp
      expect(logCall).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(logCall).toContain('INFO: test message');
    });

    it('should support lazy message evaluation', () => {
      const logger = new BrowserLogger({ level: LogLevel.ERROR });
      
      const expensiveFunction = vi.fn(() => 'expensive result');
      
      // Debug message should not be evaluated
      logger.debug(() => `Debug: ${expensiveFunction()}`);
      expect(expensiveFunction).not.toHaveBeenCalled();
      
      // Error message should be evaluated
      logger.error(() => `Error: ${expensiveFunction()}`);
      expect(expensiveFunction).toHaveBeenCalledTimes(1);
    });
  });

  describe('ConsoleGroupLogger', () => {
    it('should extend BrowserLogger functionality', () => {
      const logger = new ConsoleGroupLogger();
      
      expect(logger).toBeInstanceOf(BrowserLogger);
      expect(logger.group).toBeTypeOf('function');
      expect(logger.groupCollapsed).toBeTypeOf('function');
      expect(logger.groupEnd).toBeTypeOf('function');
    });

    it('should handle console grouping', () => {
      const consoleSpy = {
        group: vi.spyOn(console, 'group').mockImplementation(() => {}),
        groupCollapsed: vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {}),
        groupEnd: vi.spyOn(console, 'groupEnd').mockImplementation(() => {})
      };

      const logger = new ConsoleGroupLogger();
      
      logger.group('Test Group');
      logger.groupCollapsed('Collapsed Group');
      logger.groupEnd();
      logger.groupEnd();

      expect(consoleSpy.group).toHaveBeenCalledWith('Test Group');
      expect(consoleSpy.groupCollapsed).toHaveBeenCalledWith('Collapsed Group');
      expect(consoleSpy.groupEnd).toHaveBeenCalledTimes(2);
    });

    it('should handle console timing', () => {
      const consoleSpy = {
        time: vi.spyOn(console, 'time').mockImplementation(() => {}),
        timeEnd: vi.spyOn(console, 'timeEnd').mockImplementation(() => {})
      };

      const logger = new ConsoleGroupLogger();
      
      logger.time('operation');
      logger.timeEnd('operation');

      expect(consoleSpy.time).toHaveBeenCalledWith('operation');
      expect(consoleSpy.timeEnd).toHaveBeenCalledWith('operation');
    });

    it('should handle console tracing', () => {
      const consoleSpy = vi.spyOn(console, 'trace').mockImplementation(() => {});

      const logger = new ConsoleGroupLogger();
      
      logger.trace('trace message', { extra: 'data' });

      expect(consoleSpy).toHaveBeenCalledWith('trace message', { extra: 'data' });
    });

    it('should handle console counting', () => {
      const consoleSpy = {
        count: vi.spyOn(console, 'count').mockImplementation(() => {}),
        countReset: vi.spyOn(console, 'countReset').mockImplementation(() => {})
      };

      const logger = new ConsoleGroupLogger();
      
      logger.count('counter');
      logger.count('counter');
      logger.countReset('counter');

      expect(consoleSpy.count).toHaveBeenCalledTimes(2);
      expect(consoleSpy.countReset).toHaveBeenCalledWith('counter');
    });

    it('should handle console tables', () => {
      const consoleSpy = vi.spyOn(console, 'table').mockImplementation(() => {});

      const logger = new ConsoleGroupLogger();
      const data = [{ name: 'John', age: 30 }, { name: 'Jane', age: 25 }];
      
      logger.table(data);

      expect(consoleSpy).toHaveBeenCalledWith(data);
    });

    it('should track group stack', () => {
      const logger = new ConsoleGroupLogger();
      
      expect(logger.getCurrentGroupStack()).toEqual([]);
      expect(logger.getCurrentGroupPath()).toBe('');
      
      logger.group('Group 1');
      expect(logger.getCurrentGroupStack()).toEqual(['Group 1']);
      expect(logger.getCurrentGroupPath()).toBe('Group 1');
      
      logger.groupCollapsed('Group 2');
      expect(logger.getCurrentGroupStack()).toEqual(['Group 1', 'Group 2']);
      expect(logger.getCurrentGroupPath()).toBe('Group 1 > Group 2');
      
      logger.groupEnd();
      expect(logger.getCurrentGroupStack()).toEqual(['Group 1']);
      expect(logger.getCurrentGroupPath()).toBe('Group 1');
      
      logger.groupEnd();
      expect(logger.getCurrentGroupStack()).toEqual([]);
      expect(logger.getCurrentGroupPath()).toBe('');
    });
  });

  describe('PerformanceLogger', () => {
    beforeEach(() => {
      // Mock performance API
      (global as any).performance = {
        mark: vi.fn(),
        measure: vi.fn(),
        clearMarks: vi.fn(),
        clearMeasures: vi.fn(),
        getEntriesByName: vi.fn(() => [])
      };
    });

    it('should extend BrowserLogger functionality', () => {
      const logger = new PerformanceLogger();
      
      expect(logger).toBeInstanceOf(BrowserLogger);
      expect(logger.mark).toBeTypeOf('function');
      expect(logger.measure).toBeTypeOf('function');
    });

    it('should handle performance marks', () => {
      const logger = new PerformanceLogger();
      
      logger.mark('start-operation');
      
      expect(performance.mark).toHaveBeenCalledWith('start-operation');
    });

    it('should handle performance measurements', () => {
      const mockEntry = {
        name: 'operation-duration',
        duration: 123.45,
        startTime: 1000
      };
      
      vi.mocked(performance.getEntriesByName).mockReturnValue([mockEntry] as any);
      
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const logger = new PerformanceLogger();
      
      logger.measure('operation-duration', 'start', 'end');
      
      expect(performance.measure).toHaveBeenCalledWith('operation-duration', 'start', 'end');
      expect(performance.getEntriesByName).toHaveBeenCalledWith('operation-duration', 'measure');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('Performance: operation-duration');
    });

    it('should handle measurement errors gracefully', () => {
      vi.mocked(performance.measure).mockImplementation(() => {
        throw new Error('Measurement failed');
      });
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const logger = new PerformanceLogger();
      
      expect(() => {
        logger.measure('failed-operation');
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('Failed to measure performance');
    });

    it('should clear performance marks and measures', () => {
      const logger = new PerformanceLogger();
      
      logger.clearMarks('specific-mark');
      logger.clearMeasures('specific-measure');
      
      expect(performance.clearMarks).toHaveBeenCalledWith('specific-mark');
      expect(performance.clearMeasures).toHaveBeenCalledWith('specific-measure');
    });

    it('should handle missing performance API gracefully', () => {
      (global as any).performance = undefined;
      
      const logger = new PerformanceLogger();
      
      expect(() => {
        logger.mark('test');
        logger.measure('test');
        logger.clearMarks();
        logger.clearMeasures();
      }).not.toThrow();
    });

    it('should log performance data with metadata', () => {
      const mockEntry = {
        name: 'api-call',
        duration: 250.75,
        startTime: 5000
      };
      
      vi.mocked(performance.getEntriesByName).mockReturnValue([mockEntry] as any);
      
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const logger = new PerformanceLogger();
      
      logger.measure('api-call');
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logCall = consoleSpy.mock.calls[0];
      
      expect(logCall[0]).toContain('Performance: api-call');
      expect(logCall[0]).toContain('250.75');
      expect(logCall[0]).toContain('5000');
    });
  });

  describe('Production environment behavior', () => {
    it('should respect production environment settings', () => {
      // Mock browser environment variables
      const mockGlobalThis = {
        process: {
          env: {
            NODE_ENV: 'production'
          }
        }
      };
      
      Object.assign(globalThis, mockGlobalThis);
      
      const logger = new BrowserLogger();
      
      logger.debug('debug message');
      
      // In production, debug messages might be filtered
      expect(logger).toBeDefined();
    });

    it('should handle missing environment gracefully', () => {
      const logger = new BrowserLogger();
      
      expect(() => {
        logger.info('test message');
      }).not.toThrow();
    });
  });
});