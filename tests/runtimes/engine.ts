import { Dsl } from '../conformance/dsl.ts';

export type Runtime = 'node' | 'bun' | 'deno' | 'browser';
type RecordValue = Record<string, unknown>;
type ConsoleMethod = 'debug' | 'info' | 'warn' | 'error' | 'log';
interface Logger {
  log(level: number, message: unknown, metadata?: unknown): void;
  child(metadata: RecordValue): Logger;
  getLevel(): number;
  setLevel(level: number): void;
  close?(): void;
}
export interface Library {
  createLogger(config?: RecordValue): Logger;
  LogLevel: Record<string, number | string>;
  safeStringify(value: unknown): string;
  filterSensitiveData(value: unknown, keys?: string[]): unknown;
  detectRuntime(): { name: string };
}
export interface FixtureCase {
  id: string;
  input: RecordValue;
  expect: RecordValue;
  pending?: boolean;
  suite: string;
}
export interface OutputCase {
  id: string;
  runtimes: Runtime[];
  input: RecordValue;
  expect: RecordValue;
}
export interface ConsoleCall { method: ConsoleMethod; args: unknown[] }
interface Comparison { key: string; actual: string; expected: string }
export interface CaseResult {
  id: string;
  status: 'passed' | 'failed';
  comparisons: number;
  errors: string[];
}
const METHODS: ConsoleMethod[] = ['debug', 'info', 'warn', 'error', 'log'];
const LEVEL_NAMES = ['debug', 'info', 'warn', 'error', 'silent'];
const FIXED_TIMESTAMP = '2026-08-22T04:15:30.123Z';
const INTERNALS = Symbol.for('logan-logger.internals');

function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as RecordValue;
}

function level(value: unknown, library: Library): number {
  if (typeof value !== 'string' || !LEVEL_NAMES.includes(value)) throw new Error(`Unknown fixture level: ${String(value)}`);
  const ordinal = library.LogLevel[value.toUpperCase()];
  if (typeof ordinal !== 'number') throw new Error(`Runtime entry is missing LogLevel.${value.toUpperCase()}`);
  return ordinal;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function comparison(key: string, actual: unknown, expected: unknown, exact = false): Comparison {
  return { key, actual: exact ? String(actual) : canonical(actual), expected: exact ? String(expected) : canonical(expected) };
}

function capture<T>(body: () => T): { result: T; calls: ConsoleCall[] } {
  const saved = new Map<ConsoleMethod, typeof console.log>();
  const calls: ConsoleCall[] = [];
  try {
    for (const method of METHODS) {
      saved.set(method, console[method]);
      console[method] = (...args: unknown[]): void => { calls.push({ method, args }); };
    }
    return { result: body(), calls };
  } finally {
    for (const [method, original] of saved) console[method] = original;
  }
}

function configFor(input: RecordValue, library: Library, format: 'text' | 'json'): RecordValue {
  const supplied = input.config === undefined ? {} : { ...record(input.config, 'input.config') };
  if (typeof supplied.level === 'string') supplied.level = level(supplied.level, library);
  const config = {
    level: level(input.threshold ?? 'debug', library), format, timestamp: true, colorize: false,
    ignoreEnvironment: true, ...supplied,
  };
  Object.assign(config, { [INTERNALS]: {
    now: () => new Date(String(input.timestamp ?? FIXED_TIMESTAMP)), runtime: String(input.runtime ?? 'node'),
  } });
  return config;
}

function emit(input: RecordValue, root: Logger, library: Library, dsl: Dsl): void {
  let current = root;
  if (input.children !== undefined) {
    if (!Array.isArray(input.children)) throw new Error('input.children must be an array');
    for (const child of input.children) current = current.child(record(dsl.materialize(child), 'child metadata'));
  }
  const emitter = input.then_emit_from === 'parent' ? root : current;
  if (Array.isArray(input.emit)) {
    for (const item of input.emit) emitter.log(level(item, library), `emit ${String(item)}`);
  } else if (input.level !== undefined) {
    emitter.log(level(input.level, library), dsl.materialize(input.message), dsl.materialize(input.metadata));
  }
}

function assertKeys(value: RecordValue, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unhandled ${label} '${key}'`);
}

/** Every expected key must be discharged; a runner can never silently pass new expectations. */
export function validateComparisons(expected: RecordValue, comparisons: Comparison[]): void {
  const checked = new Set(comparisons.map(item => item.key));
  const unchecked = Object.keys(expected).filter(key => !checked.has(key));
  if (unchecked.length) throw new Error(`Unchecked fixture expectations: ${unchecked.join(', ')}`);
  if (!comparisons.length) throw new Error('Fixture produced no comparisons');
  const failed = comparisons.filter(item => item.actual !== item.expected);
  if (failed.length) throw new Error(failed.map(item => `${item.key}: expected ${item.expected}; got ${item.actual}`).join('\n'));
}

function executeTreering(testCase: FixtureCase, library: Library): Comparison[] {
  const { input, expect: expected } = testCase;
  assertKeys(input, ['assert', 'value', 'keys', 'timestamp', 'runtime', 'level', 'message', 'metadata', 'format', 'config', 'threshold', 'children', 'then_emit_from', 'emit'], 'fixture input');
  assertKeys(expected, ['json', 'text', 'omits', 'emitted', 'calls', 'ordinals', 'has_silent_emit_method'], 'fixture expectation');
  const dsl = new Dsl();
  if ('value' in input) {
    const value = dsl.materialize(input.value);
    const subject = testCase.suite === 'redaction' ? library.filterSensitiveData(value, input.keys as string[] | undefined) : value;
    return [comparison('json', dsl.applyStackPlaceholder(library.safeStringify(subject)), expected.json, true)];
  }
  if (input.assert === 'ordinals') {
    return [comparison('ordinals', Object.fromEntries(LEVEL_NAMES.map(name => [name, library.LogLevel[name.toUpperCase()]])), expected.ordinals)];
  }
  if (input.assert === 'no_silent_emit') {
    const logger = library.createLogger({ ignoreEnvironment: true, transports: [] });
    return [comparison('has_silent_emit_method', typeof (logger as unknown as RecordValue).silent === 'function', expected.has_silent_emit_method)];
  }
  if (input.assert !== undefined && input.assert !== 'no_implicit_redaction') throw new Error(`Unhandled fixture assertion '${String(input.assert)}'`);
  const comparisons: Comparison[] = [];
  // A fixture requesting both formats creates two real loggers and compares
  // their actual console writes. The harness never formats a captured record.
  const formats: ('json' | 'text')[] = [];
  if (expected.json !== undefined || expected.omits !== undefined) formats.push('json');
  if (expected.text !== undefined) formats.push('text');
  if (!formats.length) formats.push('text');
  let observed: ConsoleCall[] = [];
  for (const format of formats) {
    const { calls } = capture(() => {
      const root = library.createLogger(configFor(input, library, format));
      try { emit(input, root, library, dsl); } finally { root.close?.(); }
    });
    observed = calls;
    if (expected[format] !== undefined || (format === 'json' && expected.omits !== undefined)) {
      if (calls.length !== 1 || calls[0]?.args.length !== 1 || typeof calls[0].args[0] !== 'string') {
        throw new Error(`Expected one plain ${format} console write, got ${canonical(calls)}`);
      }
      const output = dsl.applyStackPlaceholder(calls[0].args[0]);
      if (expected[format] !== undefined) comparisons.push(comparison(format, output, expected[format], true));
      if (format === 'json' && expected.omits !== undefined) {
        const parsed = record(JSON.parse(output), 'emitted JSON');
        comparisons.push(comparison('omits', (expected.omits as string[]).filter(key => Object.hasOwn(parsed, key)), []));
      }
    }
  }
  if (expected.emitted !== undefined) comparisons.push(comparison('emitted', observed.map(call => call.method), expected.emitted));
  if (expected.calls !== undefined) {
    const calls = record(expected.calls, 'expect.calls');
    assertKeys(calls, ['lazy_invoked', 'lazy_invoke_count'], 'lazy expectation');
    const actual: RecordValue = {};
    if ('lazy_invoked' in calls) actual.lazy_invoked = dsl.lazyInvocations > 0;
    if ('lazy_invoke_count' in calls) actual.lazy_invoke_count = dsl.lazyInvocations;
    comparisons.push(comparison('calls', actual, calls));
  }
  return comparisons;
}

function localConfig(raw: RecordValue, library: Library, built: { count: number; contexts: unknown[]; writes: unknown[] }): RecordValue {
  const config = { ...raw };
  if (typeof config.level === 'string') config.level = level(config.level, library);
  if (Array.isArray(config.transports)) config.transports = config.transports.map(item => {
    const entry = { ...record(item, 'transport') };
    if (typeof entry.level === 'string') entry.level = level(entry.level, library);
    if (entry.type === 'custom') entry.options = { transport: (context: unknown) => {
      built.count += 1;
      built.contexts.push(context);
      return { type: 'runtime-fixture-capture', write: (value: unknown): void => {
        const actual = record(value, 'custom transport entry');
        // Use the public serializer only to safely expose a record's values;
        // console presentation checks remain exact argument comparisons.
        built.writes.push(JSON.parse(library.safeStringify(actual)));
      } };
    } };
    return entry;
  });
  return config;
}

function executeOutput(testCase: OutputCase, library: Library): Comparison[] {
  assertKeys(testCase.input, ['config', 'children', 'actions'], 'output fixture input');
  assertKeys(testCase.expect, ['console', 'writes', 'builds', 'contexts'], 'output fixture expectation');
  const input = testCase.input;
  const built = { count: 0, contexts: [] as unknown[], writes: [] as unknown[] };
  const dsl = new Dsl();
  const config = localConfig(record(input.config, 'output config'), library, built);
  config.ignoreEnvironment = true;
  Object.assign(config, { [INTERNALS]: { now: () => new Date(FIXED_TIMESTAMP), runtime: 'node' } });
  const { calls } = capture(() => {
    const root = library.createLogger(config);
    const loggers = [root];
    try {
      for (const metadata of (input.children ?? []) as unknown[]) {
        const parent = loggers[loggers.length - 1];
        if (!parent) throw new Error('No parent logger');
        loggers.push(parent.child(record(metadata, 'child metadata')));
      }
      if (!Array.isArray(input.actions)) throw new Error('output actions must be an array');
      for (const raw of input.actions) {
        const action = record(raw, 'output action');
        assertKeys(action, ['logger', 'level', 'message', 'metadata'], 'output action');
        const logger = loggers[Number(action.logger ?? 0)];
        if (!logger) throw new Error(`Unknown logger index ${String(action.logger)}`);
        logger.log(level(action.level, library), dsl.materialize(action.message), dsl.materialize(action.metadata));
      }
    } finally { root.close?.(); }
  });
  const actual: RecordValue = { console: calls, writes: built.writes, builds: built.count, contexts: built.contexts };
  return Object.entries(testCase.expect).map(([key, expected]) => comparison(key, actual[key], expected));
}

function runOne(id: string, expected: RecordValue, execute: () => Comparison[]): CaseResult {
  try {
    const comparisons = execute();
    validateComparisons(expected, comparisons);
    return { id, status: 'passed', comparisons: comparisons.length, errors: [] };
  } catch (error) {
    return { id, status: 'failed', comparisons: 0, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export function runFixtures(library: Library, runtime: Runtime, fixtures: FixtureCase[], outputs: OutputCase[]): CaseResult[] {
  const detected = library.detectRuntime().name;
  if (detected !== runtime) throw new Error(`Expected real runtime '${runtime}', logger detected '${detected}'`);
  if (!fixtures.length || !outputs.length) throw new Error('Runtime fixtures must include Treering and output cases');
  if (!outputs.some(testCase => testCase.runtimes.includes(runtime))) throw new Error(`No public-output fixtures apply to ${runtime}`);
  const results = fixtures.map(testCase => runOne(testCase.id, testCase.expect, () => executeTreering(testCase, library)));
  for (const testCase of outputs) {
    if (!testCase.runtimes.includes(runtime)) continue;
    results.push(runOne(testCase.id, testCase.expect, () => executeOutput(testCase, library)));
  }
  return results;
}
