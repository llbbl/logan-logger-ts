// Bun-specific test file
// @ts-expect-error - Bun test framework import
import { describe, it, expect } from 'bun:test';
import { createLogger, LogLevel } from '../src/index.ts';

describe('Bun Runtime Tests', () => {
  it('should create a logger in Bun', () => {
    const logger = createLogger({
      level: LogLevel.INFO
    });
    
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('should handle log levels correctly', () => {
    const logger = createLogger({
      level: LogLevel.WARN
    });
    
    expect(logger.getLevel()).toBe(LogLevel.WARN);
  });

  it('should create child loggers', () => {
    const parentLogger = createLogger();
    const childLogger = parentLogger.child({ module: 'test' });
    
    expect(childLogger).toBeDefined();
    expect(childLogger.getLevel()).toBe(parentLogger.getLevel());
  });
});