import { LoggerConfig, LogLevel } from '../core/types.ts';
import { detectRuntime } from './runtime.ts';

export function getDefaultConfig(): LoggerConfig {
  const runtime = detectRuntime();
  
  return {
    level: LogLevel.INFO,
    format: 'text',
    timestamp: true,
    colorize: runtime.capabilities.colorSupport,
    metadata: {},
    transports: [
      {
        type: 'console',
        options: {}
      }
    ]
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
  
  const possiblePaths = configPath ? [configPath] : [
    'logan.config.json',
    'logan.config.js',
    '.loganrc',
    'package.json' // Check for logan config in package.json
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
      // Continue to the next path
    }
  }
  
  return {};
}

async function loadNodeConfig(path: string): Promise<Partial<LoggerConfig>> {
  try {
    const fs = await import('fs/promises');
    const pathModule = await import('path');
    
    if (path.endsWith('.json')) {
      const content = await fs.readFile(path, 'utf-8');
      const parsed = JSON.parse(content);
      
      if (path === 'package.json') {
        return parsed.logan || {};
      }
      return parsed;
    } else if (path.endsWith('.js')) {
      const fullPath = pathModule.resolve(path);
      // Use dynamic import instead of require for Deno compatibility
      const config = await import(fullPath);
      return config.default || config;
    }
  } catch (error) {
    // File doesn't exist or can't be parsed
  }
  
  return {};
}

async function loadDenoConfig(path: string): Promise<Partial<LoggerConfig>> {
  try {
    if (path.endsWith('.json')) {
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
  
  return configs.reduce<LoggerConfig>((merged, config) => ({
    ...merged,
    ...config,
    metadata: {
      ...merged.metadata,
      ...config.metadata
    },
    transports: config.transports || merged.transports
  }), defaultConfig);
}