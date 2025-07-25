import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDefaultConfig, loadConfigFromEnvironment, mergeConfigs, loadConfigFromFile } from '../src/utils/config.ts';
import { stringToLogLevel, logLevelToString } from '../src/core/factory.ts';
import { LogLevel, LoggerConfig } from '../src/core/types.ts';

describe('Configuration System', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FORMAT;
    delete process.env.LOG_TIMESTAMP;
    delete process.env.LOG_COLOR;
  });

  describe('getDefaultConfig', () => {
    it('should return a valid default configuration', () => {
      const config = getDefaultConfig();
      
      expect(config.level).toBe(LogLevel.INFO);
      expect(config.format).toBe('text');
      expect(config.timestamp).toBe(true);
      expect(typeof config.colorize).toBe('boolean');
      expect(config.metadata).toEqual({});
      expect(Array.isArray(config.transports)).toBe(true);
      expect(config.transports?.length).toBeGreaterThan(0);
    });

    it('should include console transport by default', () => {
      const config = getDefaultConfig();
      
      expect(config.transports?.[0].type).toBe('console');
      expect(config.transports?.[0].options).toEqual({});
    });

    it('should set colorize based on runtime capabilities', () => {
      const config = getDefaultConfig();
      
      // Should be a boolean value
      expect(typeof config.colorize).toBe('boolean');
    });
  });

  describe('loadConfigFromEnvironment', () => {
    it('should load log level from environment', () => {
      process.env.LOG_LEVEL = 'debug';
      
      const config = loadConfigFromEnvironment();
      
      expect(config.level).toBe(LogLevel.DEBUG);
    });

    it('should load format from environment', () => {
      process.env.LOG_FORMAT = 'json';
      
      const config = loadConfigFromEnvironment();
      
      expect(config.format).toBe('json');
    });

    it('should ignore invalid format values', () => {
      process.env.LOG_FORMAT = 'invalid';
      
      const config = loadConfigFromEnvironment();
      
      expect(config.format).toBeUndefined();
    });

    it('should load timestamp setting from environment', () => {
      process.env.LOG_TIMESTAMP = 'false';
      
      const config = loadConfigFromEnvironment();
      
      expect(config.timestamp).toBe(false);
    });

    it('should load colorize setting from environment', () => {
      process.env.LOG_COLOR = 'true';
      
      const config = loadConfigFromEnvironment();
      
      expect(config.colorize).toBe(true);
    });

    it('should handle multiple environment variables', () => {
      process.env.LOG_LEVEL = 'warn';
      process.env.LOG_FORMAT = 'json';
      process.env.LOG_TIMESTAMP = 'false';
      process.env.LOG_COLOR = 'true';
      
      const config = loadConfigFromEnvironment();
      
      expect(config.level).toBe(LogLevel.WARN);
      expect(config.format).toBe('json');
      expect(config.timestamp).toBe(false);
      expect(config.colorize).toBe(true);
    });

    it('should return empty config when no environment variables set', () => {
      const config = loadConfigFromEnvironment();
      
      expect(Object.keys(config).length).toBe(0);
    });

    it('should handle case variations in boolean values', () => {
      process.env.LOG_TIMESTAMP = 'TRUE';
      process.env.LOG_COLOR = 'False';
      
      const config = loadConfigFromEnvironment();
      
      expect(config.timestamp).toBe(true);
      expect(config.colorize).toBe(false);
    });
  });

  describe('mergeConfigs', () => {
    it('should merge multiple configurations', () => {
      const config1: Partial<LoggerConfig> = {
        level: LogLevel.DEBUG,
        format: 'json'
      };
      
      const config2: Partial<LoggerConfig> = {
        timestamp: false,
        colorize: true
      };
      
      const merged = mergeConfigs(config1, config2);
      
      expect(merged.level).toBe(LogLevel.DEBUG);
      expect(merged.format).toBe('json');
      expect(merged.timestamp).toBe(false);
      expect(merged.colorize).toBe(true);
    });

    it('should override earlier configs with later ones', () => {
      const config1: Partial<LoggerConfig> = {
        level: LogLevel.DEBUG,
        format: 'json'
      };
      
      const config2: Partial<LoggerConfig> = {
        level: LogLevel.ERROR,
        timestamp: false
      };
      
      const merged = mergeConfigs(config1, config2);
      
      expect(merged.level).toBe(LogLevel.ERROR);
      expect(merged.format).toBe('json');
      expect(merged.timestamp).toBe(false);
    });

    it('should merge metadata objects', () => {
      const config1: Partial<LoggerConfig> = {
        metadata: { service: 'api', version: '1.0' }
      };
      
      const config2: Partial<LoggerConfig> = {
        metadata: { environment: 'production', version: '2.0' }
      };
      
      const merged = mergeConfigs(config1, config2);
      
      expect(merged.metadata).toEqual({
        service: 'api',
        version: '2.0',
        environment: 'production'
      });
    });

    it('should use default config as base', () => {
      const config: Partial<LoggerConfig> = {
        level: LogLevel.ERROR
      };
      
      const merged = mergeConfigs(config);
      
      expect(merged.level).toBe(LogLevel.ERROR);
      expect(merged.format).toBe('text'); // from default
      expect(merged.timestamp).toBe(true); // from default
    });

    it('should handle empty config arrays', () => {
      const merged = mergeConfigs();
      
      // Should return default config
      expect(merged.level).toBe(LogLevel.INFO);
      expect(merged.format).toBe('text');
      expect(merged.timestamp).toBe(true);
    });

    it('should handle transport configuration', () => {
      const config: Partial<LoggerConfig> = {
        transports: [
          { type: 'file', options: { filename: 'app.log' } }
        ]
      };
      
      const merged = mergeConfigs(config);
      
      expect(merged.transports).toEqual([
        { type: 'file', options: { filename: 'app.log' } }
      ]);
    });
  });

  describe('stringToLogLevel', () => {
    it('should convert valid log level strings', () => {
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

    it('should handle alternative spellings', () => {
      expect(stringToLogLevel('warning')).toBe(LogLevel.WARN);
      expect(stringToLogLevel('none')).toBe(LogLevel.SILENT);
    });

    it('should default to INFO for invalid strings', () => {
      expect(stringToLogLevel('invalid')).toBe(LogLevel.INFO);
      expect(stringToLogLevel('')).toBe(LogLevel.INFO);
      expect(stringToLogLevel('random')).toBe(LogLevel.INFO);
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

  describe('Configuration Integration', () => {
    it('should work with environment and explicit config merging', () => {
      process.env.LOG_LEVEL = 'warn';
      process.env.LOG_FORMAT = 'json';
      
      const envConfig = loadConfigFromEnvironment();
      const userConfig: Partial<LoggerConfig> = {
        timestamp: false,
        metadata: { service: 'test' }
      };
      
      const merged = mergeConfigs(envConfig, userConfig);
      
      expect(merged.level).toBe(LogLevel.WARN);
      expect(merged.format).toBe('json');
      expect(merged.timestamp).toBe(false);
      expect(merged.metadata.service).toBe('test');
    });

    it('should maintain type safety throughout merging', () => {
      const config1: Partial<LoggerConfig> = {
        level: LogLevel.DEBUG
      };
      
      const config2: Partial<LoggerConfig> = {
        format: 'json'
      };
      
      const merged: LoggerConfig = mergeConfigs(config1, config2);
      
      // All required properties should be present
      expect(typeof merged.level).toBe('number');
      expect(typeof merged.format).toBe('string');
      expect(typeof merged.timestamp).toBe('boolean');
      expect(typeof merged.colorize).toBe('boolean');
      expect(typeof merged.metadata).toBe('object');
      expect(Array.isArray(merged.transports)).toBe(true);
    });
  });

  describe('loadConfigFromFile', () => {
    it('should return empty config when no file system support', async () => {
      // Mock runtime detection to simulate browser environment
      vi.doMock('../src/utils/runtime', () => ({
        detectRuntime: () => ({
          name: 'browser',
          capabilities: {
            fileSystem: false
          }
        })
      }));

      const config = await loadConfigFromFile();
      expect(config).toEqual({});
    });

    it('should return empty config when files do not exist', async () => {
      // This test will naturally return empty config since config files don't exist
      const config = await loadConfigFromFile('non-existent-config.json');
      expect(config).toEqual({});
    });

    it('should search default config file paths', async () => {
      // Test that the function attempts to load from default paths
      const config = await loadConfigFromFile();
      expect(config).toEqual({});
    });
  });
});