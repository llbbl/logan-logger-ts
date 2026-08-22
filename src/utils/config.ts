import { type LoggerConfig, LogLevel } from '../core/types.ts';
import { detectRuntime } from './runtime.ts';

/**
 * Whether colored output is appropriate right now.
 *
 * `capabilities.colorSupport` answers whether the runtime *can* colorize.
 * This answers whether it *should*: writing ANSI escapes into a redirected
 * file or a log shipper is worse than writing none, so a non-TTY stdout
 * disables color unless the caller forces it. Honors the `NO_COLOR` and
 * `FORCE_COLOR` conventions.
 * @returns True when the level token should carry ANSI color
 */
export function shouldColorize(): boolean {
  const runtime = detectRuntime();

  if (!runtime.capabilities.colorSupport) {
    return false;
  }

  // No process object means a browser, where the console applies its own
  // styling and there is no stream to pollute.
  if (typeof process === 'undefined' || !process.env) {
    return true;
  }

  if (process.env.NO_COLOR) {
    return false;
  }

  if (process.env.FORCE_COLOR) {
    return process.env.FORCE_COLOR !== '0';
  }

  return process.stdout?.isTTY === true;
}

export function getDefaultConfig(): LoggerConfig {
  return {
    level: LogLevel.INFO,
    format: 'text',
    timestamp: true,
    colorize: shouldColorize(),
    metadata: {},
    transports: [
      {
        type: 'console',
        options: {},
      },
    ],
  };
}

export function loadConfigFromEnvironment(): Partial<LoggerConfig> {
  const config: Partial<LoggerConfig> = {};

  // Check for environment variables
  if (typeof process !== 'undefined' && process.env) {
    const env = process.env;

    // Log level
    if (env.LOG_LEVEL) {
      config.level = stringToLogLevel(env.LOG_LEVEL);
    }

    // Format
    if (env.LOG_FORMAT && ['json', 'text'].includes(env.LOG_FORMAT)) {
      config.format = env.LOG_FORMAT as 'json' | 'text';
    }

    // Timestamp
    if (env.LOG_TIMESTAMP) {
      config.timestamp = env.LOG_TIMESTAMP.toLowerCase() === 'true';
    }

    // Colorize
    if (env.LOG_COLOR) {
      config.colorize = env.LOG_COLOR.toLowerCase() === 'true';
    }
  }

  return config;
}

export async function loadConfigFromFile(configPath?: string): Promise<Partial<LoggerConfig>> {
  const runtime = detectRuntime();

  if (!runtime.capabilities.fileSystem) {
    return {};
  }

  const possiblePaths = configPath
    ? [configPath]
    : [
        'logan.config.json',
        'logan.config.js',
        '.loganrc',
        'package.json', // Check for logan config in package.json
      ];

  for (const path of possiblePaths) {
    try {
      if (runtime.name === 'node') {
        return await loadNodeConfig(path);
      } else if (runtime.name === 'deno') {
        return await loadDenoConfig(path);
      } else if (runtime.name === 'bun') {
        return await loadBunConfig(path);
      }
    } catch (error) {
      // Continue to the next path if file doesn't exist or can't be loaded
      void error; // Suppress unused variable warning
    }
  }

  return {};
}

async function loadNodeConfig(path: string): Promise<Partial<LoggerConfig>> {
  try {
    const fs = await import('node:fs/promises');
    const pathModule = await import('node:path');

    if (path.endsWith('.json')) {
      const content = await fs.readFile(path, 'utf-8');
      const parsed = JSON.parse(content);

      if (path === 'package.json') {
        return parsed.logan || {};
      }
      return parsed;
    } else if (path.endsWith('.js')) {
      const fullPath = pathModule.resolve(path);
      // Use file URL for cross-platform dynamic import compatibility
      const fileUrl = `file://${fullPath}`;
      const config = await import(/* @vite-ignore */ fileUrl);
      return config.default || config;
    }
  } catch (error) {
    // File doesn't exist or can't be parsed
    void error; // Suppress unused variable warning
  }

  return {};
}

async function loadDenoConfig(path: string): Promise<Partial<LoggerConfig>> {
  try {
    if (path.endsWith('.json')) {
      // biome-ignore lint/suspicious/noExplicitAny: Deno runtime not in TS types
      const content = await (globalThis as any).Deno.readTextFile(path);
      const parsed = JSON.parse(content);

      if (path === 'package.json') {
        return parsed.logan || {};
      }
      return parsed;
    } else if (path.endsWith('.js')) {
      const config = await import(/* @vite-ignore */ `./${path}`);
      return config.default || config;
    }
  } catch (error) {
    // File doesn't exist or can't be parsed
    void error; // Suppress unused variable warning
  }

  return {};
}

async function loadBunConfig(path: string): Promise<Partial<LoggerConfig>> {
  // Bun can use Node.js-style require or ES modules
  return loadNodeConfig(path);
}

function stringToLogLevel(level: string): LogLevel {
  switch (level.toLowerCase()) {
    case 'debug':
      return LogLevel.DEBUG;
    case 'info':
      return LogLevel.INFO;
    case 'warn':
    case 'warning':
      return LogLevel.WARN;
    case 'error':
      return LogLevel.ERROR;
    case 'silent':
    case 'none':
      return LogLevel.SILENT;
    default:
      return LogLevel.INFO;
  }
}

export function mergeConfigs(...configs: Partial<LoggerConfig>[]): LoggerConfig {
  const defaultConfig = getDefaultConfig();

  return configs.reduce<LoggerConfig>(
    (merged, config) => ({
      // biome-ignore lint/performance/noAccumulatingSpread: Config merging is not performance-critical, readability preferred
      ...merged,
      ...config,
      metadata: {
        ...merged.metadata,
        ...config.metadata,
      },
      transports: config.transports || merged.transports,
    }),
    defaultConfig
  );
}
