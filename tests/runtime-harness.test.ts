import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Dsl } from './conformance/dsl.ts';
import { type FixtureCase, type Library, type OutputCase, runFixtures, validateComparisons } from './runtimes/engine.ts';
import { classifyFixtureSuites, loadRuntimeFixtures } from './runtimes/load.mjs';

const fixture: FixtureCase = {
  id: 'envelope/test', suite: 'envelope', input: { level: 'info', message: 'hello', config: { timestamp: false } }, expect: { text: 'INFO: hello' },
};
const output: OutputCase = {
  id: 'runtime-output/empty', runtimes: ['node'], input: { config: { transports: [] }, actions: [] }, expect: { console: [] },
};
const library: Library = {
  LogLevel: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, SILENT: 4 },
  safeStringify: value => JSON.stringify(value),
  filterSensitiveData: value => value,
  detectRuntime: () => ({ name: 'node' }),
  createLogger: () => ({
    log: (_level, message) => console.info(`INFO: ${String(message)}`),
    child() { return this; }, getLevel: () => 0, setLevel: () => undefined,
  }),
};

describe('runtime fixture runner failure guards', () => {
  it('shadows an inherited native stack accessor when the fixture requests no stack', () => {
    const original = Object.getOwnPropertyDescriptor(Error.prototype, 'stack');
    let reads = 0;
    Object.defineProperty(Error.prototype, 'stack', {
      get: () => { reads += 1; return 'inherited native stack'; }, configurable: true,
    });
    try {
      const error = new Dsl().materialize({ $error: { name: 'Error', message: 'no stack', props: { sourceURL: 'explicit.js' } } }) as Error & { sourceURL: string };
      expect(error).toBeInstanceOf(Error);
      expect(error.stack).toBeUndefined();
      expect(Object.getOwnPropertyDescriptor(error, 'stack')).toEqual({ value: undefined, writable: true, enumerable: false, configurable: true });
      expect(error.sourceURL).toBe('explicit.js');
      expect(reads).toBe(0);
    } finally {
      if (original) Object.defineProperty(Error.prototype, 'stack', original);
      else Reflect.deleteProperty(Error.prototype, 'stack');
    }
  });

  it('materializes canonical native Errors and preserves explicitly requested engine-like properties', () => {
    const dsl = new Dsl();
    const plain = dsl.materialize({ $error: { name: 'Error', message: 'boom', stack: '<STACK>' } }) as Error;
    expect(plain).toBeInstanceOf(Error);
    expect(Object.getOwnPropertyNames(plain).sort()).toEqual(['message', 'stack']);
    expect(plain.stack).toContain('boom');
    expect(dsl.applyStackPlaceholder(JSON.stringify(plain.stack))).toBe('"<STACK>"');
    const custom = dsl.materialize({ $error: { name: 'Error', message: 'custom', props: { line: 7, sourceURL: 'caller-supplied.js' }, non_enumerable: ['line'] } }) as Error & { line: number; sourceURL: string };
    expect(custom.line).toBe(7);
    expect(custom.sourceURL).toBe('caller-supplied.js');
    expect(Object.getOwnPropertyDescriptor(custom, 'line')?.enumerable).toBe(false);
    expect(Object.hasOwn(custom, 'stack')).toBe(false);
  });
  it('rejects missing and empty fixture directories instead of skipping', async () => {
    await expect(loadRuntimeFixtures()).rejects.toThrow('missing fixtures must fail');
    const directory = await mkdtemp(join(tmpdir(), 'logan-runtime-fixtures-'));
    try { await expect(loadRuntimeFixtures(directory)).rejects.toThrow('fixture file set differs'); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('rejects added, removed, duplicate, or pending Treering fixture IDs', () => {
    const known = { 'envelope/test': { scope: 'shared' } };
    const suite = { suite: 'envelope', cases: [fixture] };
    expect(() => classifyFixtureSuites([{ ...suite, cases: [{ ...fixture, id: 'new' }] }], known)).toThrow('Unclassified fixture new');
    expect(() => classifyFixtureSuites([{ ...suite, cases: [] }], known)).toThrow('Pinned fixture IDs missing');
    expect(() => classifyFixtureSuites([{ ...suite, cases: [fixture, fixture] }], known)).toThrow('duplicate fixture id');
    expect(() => classifyFixtureSuites([{ ...suite, cases: [{ ...fixture, pending: true }] }], known)).toThrow('Unexpected pending fixture');
  });

  it('rejects unknown expectation keys and comparisons that check nothing', () => {
    expect(() => validateComparisons({ text: 'expected' }, [])).toThrow('Unchecked fixture expectations');
    const result = runFixtures(library, 'node', [{ ...fixture, expect: { text: 'INFO: hello', unchecked: true } }], [output]);
    expect(result[0]?.status).toBe('failed');
    expect(result[0]?.errors.join()).toContain("Unhandled fixture expectation 'unchecked'");
  });

  it('fails incorrect real console output and restores the console afterward', () => {
    const original = console.info;
    const results = runFixtures(library, 'node', [{ ...fixture, expect: { text: 'wrong' } }], [output]);
    expect(results[0]?.status).toBe('failed');
    expect(results[0]?.errors.join()).toContain('got INFO: hello');
    expect(console.info).toBe(original);
  });

  it('rejects a fake runtime and an empty applicable output suite', () => {
    expect(() => runFixtures(library, 'browser', [fixture], [output])).toThrow("logger detected 'node'");
    expect(() => runFixtures(library, 'node', [fixture], [{ ...output, runtimes: ['browser'] }])).toThrow('No public-output fixtures apply');
  });

  it('passes only when the actual console write and every expectation match', () => {
    const results = runFixtures(library, 'node', [fixture], [output]);
    expect(results.map(result => result.status)).toEqual(['passed', 'passed']);
    expect(results.every(result => result.comparisons > 0)).toBe(true);
  });
});
