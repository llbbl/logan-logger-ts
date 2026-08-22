import type { LoggerConfig } from '../core/types.ts';
import { detectRuntime } from './runtime.ts';

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
