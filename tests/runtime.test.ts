import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectRuntime, isNode, isBrowser, isDeno, isBun } from '../src/utils/runtime.ts';

describe('Runtime Detection', () => {
  beforeEach(() => {
    // Reset global state
    vi.resetAllMocks();
  });

  describe('detectRuntime', () => {
    it('should detect Node.js environment', () => {
      // Mock Node.js environment
      const mockProcess = {
        versions: { node: '20.0.0' },
        version: 'v20.0.0'
      };
      
      vi.stubGlobal('process', mockProcess);
      vi.stubGlobal('window', undefined);
      vi.stubGlobal('Deno', undefined);
      vi.stubGlobal('Bun', undefined);

      const runtime = detectRuntime();
      
      expect(runtime.name).toBe('node');
      expect(runtime.version).toBe('v20.0.0');
      expect(runtime.capabilities.fileSystem).toBe(true);
      expect(runtime.capabilities.colorSupport).toBe(true);
      expect(runtime.capabilities.processInfo).toBe(true);
      expect(runtime.capabilities.streams).toBe(true);
    });

    it('should detect browser environment', () => {
      // Mock browser environment
      vi.stubGlobal('window', { location: { href: 'https://example.com' } });
      vi.stubGlobal('document', { createElement: vi.fn() });
      vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/120.0.0' });
      vi.stubGlobal('process', undefined);
      vi.stubGlobal('Deno', undefined);
      vi.stubGlobal('Bun', undefined);

      const runtime = detectRuntime();
      
      expect(runtime.name).toBe('browser');
      expect(runtime.version).toBe('Mozilla/5.0 Chrome/120.0.0');
      expect(runtime.capabilities.fileSystem).toBe(false);
      expect(runtime.capabilities.colorSupport).toBe(true);
      expect(runtime.capabilities.processInfo).toBe(false);
      expect(runtime.capabilities.streams).toBe(false);
    });

    it('should detect Deno environment', () => {
      // Mock Deno environment
      const mockDeno = {
        version: { deno: '1.40.0' }
      };
      
      vi.stubGlobal('Deno', mockDeno);
      vi.stubGlobal('window', undefined);
      vi.stubGlobal('process', undefined);
      vi.stubGlobal('Bun', undefined);

      const runtime = detectRuntime();
      
      expect(runtime.name).toBe('deno');
      expect(runtime.version).toBe('1.40.0');
      expect(runtime.capabilities.fileSystem).toBe(true);
    });

    it('should detect Bun environment', () => {
      // Mock Bun environment
      const mockBun = {
        version: '1.0.25'
      };
      
      vi.stubGlobal('Bun', mockBun);
      vi.stubGlobal('window', undefined);
      vi.stubGlobal('process', undefined);
      vi.stubGlobal('Deno', undefined);

      const runtime = detectRuntime();
      
      expect(runtime.name).toBe('bun');
      expect(runtime.version).toBe('1.0.25');
      expect(runtime.capabilities.fileSystem).toBe(true);
    });

    it('should detect Web Worker environment', () => {
      // Mock Web Worker environment
      vi.stubGlobal('importScripts', vi.fn());
      vi.stubGlobal('window', undefined);
      vi.stubGlobal('document', undefined);
      vi.stubGlobal('process', undefined);
      vi.stubGlobal('Deno', undefined);
      vi.stubGlobal('Bun', undefined);

      const runtime = detectRuntime();
      
      expect(runtime.name).toBe('webworker');
      expect(runtime.capabilities.fileSystem).toBe(false);
      expect(runtime.capabilities.colorSupport).toBe(false);
    });

    it('should return unknown for unrecognized environments', () => {
      // Clear all globals
      vi.stubGlobal('window', undefined);
      vi.stubGlobal('document', undefined);
      vi.stubGlobal('process', undefined);
      vi.stubGlobal('Deno', undefined);
      vi.stubGlobal('Bun', undefined);
      vi.stubGlobal('importScripts', undefined);

      const runtime = detectRuntime();
      
      expect(runtime.name).toBe('unknown');
      expect(runtime.capabilities.fileSystem).toBe(false);
      expect(runtime.capabilities.colorSupport).toBe(false);
      expect(runtime.capabilities.processInfo).toBe(false);
      expect(runtime.capabilities.streams).toBe(false);
    });
  });

  describe('Runtime helper functions', () => {
    it('should correctly identify Node.js', () => {
      vi.stubGlobal('process', { versions: { node: '20.0.0' } });
      vi.stubGlobal('window', undefined);
      vi.stubGlobal('Deno', undefined);
      vi.stubGlobal('Bun', undefined);

      expect(isNode()).toBe(true);
      expect(isBrowser()).toBe(false);
      expect(isDeno()).toBe(false);
      expect(isBun()).toBe(false);
    });

    it('should correctly identify browser', () => {
      vi.stubGlobal('window', {});
      vi.stubGlobal('document', {});
      vi.stubGlobal('process', undefined);
      vi.stubGlobal('Deno', undefined);
      vi.stubGlobal('Bun', undefined);

      expect(isNode()).toBe(false);
      expect(isBrowser()).toBe(true);
      expect(isDeno()).toBe(false);
      expect(isBun()).toBe(false);
    });
  });
});