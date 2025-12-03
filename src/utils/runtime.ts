import type { RuntimeCapabilities, RuntimeInfo, RuntimeName } from '../core/types.ts';

/**
 * Detects the current JavaScript runtime environment and its capabilities.
 * @returns Information about the detected runtime
 * @example
 * ```typescript
 * const runtime = detectRuntime();
 * console.log(`Running on: ${runtime.name} ${runtime.version}`);
 * ```
 */
export function detectRuntime(): RuntimeInfo {
  const name = detectRuntimeName();
  const version = getRuntimeVersion(name);
  const capabilities = getRuntimeCapabilities(name);

  return {
    name,
    version,
    capabilities,
  };
}

function detectRuntimeName(): RuntimeName {
  // Check for Deno
  // biome-ignore lint/suspicious/noExplicitAny: Runtime-specific global not in TS types
  if (typeof (globalThis as any).Deno !== 'undefined') {
    return 'deno';
  }

  // Check for Bun
  // biome-ignore lint/suspicious/noExplicitAny: Runtime-specific global not in TS types
  if (typeof (globalThis as any).Bun !== 'undefined') {
    return 'bun';
  }

  // Check for browser environment
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser';
  }

  // Check for Web Worker
  // biome-ignore lint/suspicious/noExplicitAny: Runtime-specific global not in TS types
  if (typeof (globalThis as any).importScripts === 'function' && typeof window === 'undefined') {
    return 'webworker';
  }

  // Check for Node.js
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return 'node';
  }

  return 'unknown';
}

function getRuntimeVersion(runtime: RuntimeName): string | undefined {
  switch (runtime) {
    case 'node':
      return typeof process !== 'undefined' ? process.version : undefined;

    case 'deno':
      // biome-ignore lint/suspicious/noExplicitAny: Runtime-specific global not in TS types
      return typeof (globalThis as any).Deno !== 'undefined'
        ? // biome-ignore lint/suspicious/noExplicitAny: Runtime-specific global not in TS types
          (globalThis as any).Deno.version?.deno
        : undefined;

    case 'bun':
      // biome-ignore lint/suspicious/noExplicitAny: Runtime-specific global not in TS types
      return typeof (globalThis as any).Bun !== 'undefined'
        ? // biome-ignore lint/suspicious/noExplicitAny: Runtime-specific global not in TS types
          (globalThis as any).Bun.version
        : undefined;

    case 'browser':
      return typeof navigator !== 'undefined' ? navigator.userAgent : undefined;

    default:
      return undefined;
  }
}

function getRuntimeCapabilities(runtime: RuntimeName): RuntimeCapabilities {
  switch (runtime) {
    case 'node':
      return {
        fileSystem: true,
        colorSupport: true,
        processInfo: true,
        streams: true,
      };

    case 'deno':
      return {
        fileSystem: true,
        colorSupport: true,
        processInfo: true,
        streams: true,
      };

    case 'bun':
      return {
        fileSystem: true,
        colorSupport: true,
        processInfo: true,
        streams: true,
      };

    case 'browser':
      return {
        fileSystem: false,
        colorSupport: true, // CSS styling in console
        processInfo: false,
        streams: false,
      };

    case 'webworker':
      return {
        fileSystem: false,
        colorSupport: false,
        processInfo: false,
        streams: false,
      };

    default:
      return {
        fileSystem: false,
        colorSupport: false,
        processInfo: false,
        streams: false,
      };
  }
}

/**
 * Check if the current runtime is Node.js.
 * @returns True if running in Node.js
 */
export function isNode(): boolean {
  return detectRuntimeName() === 'node';
}

/**
 * Check if the current runtime is a browser.
 * @returns True if running in a browser
 */
export function isBrowser(): boolean {
  return detectRuntimeName() === 'browser';
}

/**
 * Check if the current runtime is Deno.
 * @returns True if running in Deno
 */
export function isDeno(): boolean {
  return detectRuntimeName() === 'deno';
}

/**
 * Check if the current runtime is Bun.
 * @returns True if running in Bun
 */
export function isBun(): boolean {
  return detectRuntimeName() === 'bun';
}
