import { describe, expect, it } from 'vitest';
import { type LogEntry, LogLevel } from '../src/core/types.ts';
import { formatLevel, formatLogEntry } from '../src/utils/formatting.ts';

describe('Formatting utilities', () => {
  describe('formatLogEntry', () => {
    const mockEntry: LogEntry = {
      timestamp: new Date('2024-01-01T12:00:00.000Z'),
      level: LogLevel.INFO,
      message: 'Test message',
      metadata: { userId: 123, action: 'login' },
      runtime: 'node',
    };

    it('should format entry as text by default', () => {
      const result = formatLogEntry(mockEntry);

      expect(result).toBe(
        '[2024-01-01T12:00:00.000Z] INFO: Test message {"userId":123,"action":"login"}'
      );
    });

    it('should format entry as text when explicitly specified', () => {
      const result = formatLogEntry(mockEntry, 'text');

      expect(result).toBe(
        '[2024-01-01T12:00:00.000Z] INFO: Test message {"userId":123,"action":"login"}'
      );
    });

    it('should format entry as JSON', () => {
      const result = formatLogEntry(mockEntry, 'json');
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({
        timestamp: '2024-01-01T12:00:00.000Z',
        level: 'info',
        message: 'Test message',
        metadata: { userId: 123, action: 'login' },
        runtime: 'node',
      });
    });

    it('should handle entry without metadata', () => {
      const entryWithoutMeta: LogEntry = {
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        level: LogLevel.WARN,
        message: 'Warning message',
        runtime: 'browser',
      };

      const textResult = formatLogEntry(entryWithoutMeta, 'text');
      expect(textResult).toBe('[2024-01-01T12:00:00.000Z] WARN: Warning message');

      const jsonResult = formatLogEntry(entryWithoutMeta, 'json');
      const parsed = JSON.parse(jsonResult);
      expect(parsed.metadata).toBeUndefined();
    });

    it('should handle different log levels', () => {
      const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
      const expectedNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      const expectedLowercase = ['debug', 'info', 'warn', 'error'];

      levels.forEach((level, index) => {
        const entry: LogEntry = {
          timestamp: new Date('2024-01-01T12:00:00.000Z'),
          level,
          message: 'Test',
          runtime: 'node',
        };

        const textResult = formatLogEntry(entry, 'text');
        expect(textResult).toContain(expectedNames[index]);

        const jsonResult = formatLogEntry(entry, 'json');
        const parsed = JSON.parse(jsonResult);
        expect(parsed.level).toBe(expectedLowercase[index]);
      });
    });
  });

  describe('formatLevel', () => {
    it('should format level names without colors', () => {
      expect(formatLevel(LogLevel.DEBUG)).toBe('DEBUG');
      expect(formatLevel(LogLevel.INFO)).toBe('INFO');
      expect(formatLevel(LogLevel.WARN)).toBe('WARN');
      expect(formatLevel(LogLevel.ERROR)).toBe('ERROR');
      expect(formatLevel(LogLevel.SILENT)).toBe('SILENT');
    });

    it('should format level names without colors when colorize is false', () => {
      expect(formatLevel(LogLevel.INFO, false)).toBe('INFO');
      expect(formatLevel(LogLevel.ERROR, false)).toBe('ERROR');
    });

    it('should format level names with colors when colorize is true', () => {
      const coloredInfo = formatLevel(LogLevel.INFO, true);
      const coloredError = formatLevel(LogLevel.ERROR, true);

      expect(coloredInfo).toContain('INFO');
      expect(coloredError).toContain('ERROR');

      // Should contain ANSI color codes
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Testing ANSI escape codes for terminal colors
      expect(coloredInfo).toMatch(/\x1b\[\d+m.*INFO.*\x1b\[0m/);
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Testing ANSI escape codes for terminal colors
      expect(coloredError).toMatch(/\x1b\[\d+m.*ERROR.*\x1b\[0m/);
    });

    it('should use different colors for different levels', () => {
      const debug = formatLevel(LogLevel.DEBUG, true);
      const info = formatLevel(LogLevel.INFO, true);
      const warn = formatLevel(LogLevel.WARN, true);
      const error = formatLevel(LogLevel.ERROR, true);

      // Each should have different color codes
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Testing ANSI escape codes for terminal colors
      const debugColor = debug.match(/\x1b\[(\d+)m/)?.[1];
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Testing ANSI escape codes for terminal colors
      const infoColor = info.match(/\x1b\[(\d+)m/)?.[1];
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Testing ANSI escape codes for terminal colors
      const warnColor = warn.match(/\x1b\[(\d+)m/)?.[1];
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Testing ANSI escape codes for terminal colors
      const errorColor = error.match(/\x1b\[(\d+)m/)?.[1];

      expect(debugColor).toBe('36'); // Cyan
      expect(infoColor).toBe('32'); // Green
      expect(warnColor).toBe('33'); // Yellow
      expect(errorColor).toBe('31'); // Red
    });
  });
});
