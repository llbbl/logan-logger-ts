import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logLevelToString, stringToLogLevel } from '../../src/core/factory.ts';
import { withLoggerInternals } from '../../src/core/internal.ts';
import { getTransportFactory, registerTransport } from '../../src/core/transport.ts';
import type {
  ILogger,
  LogEntry,
  LoggerConfig,
  LogMessage,
  RuntimeName,
  TransportConfig,
} from '../../src/core/types.ts';
import { LogLevel } from '../../src/core/types.ts';
// The /node entry point, not the individual modules: importing it is what
// registers the 'file' transport, exactly as a consumer's import would.
import { createLogger, NodeLogger } from '../../src/node.ts';
import type { FormatOptions } from '../../src/utils/formatting.ts';
import { formatLogEntry } from '../../src/utils/formatting.ts';
import { filterSensitiveData, safeStringify } from '../../src/utils/serialization.ts';
import { Dsl } from './dsl.ts';
import type { ConformanceCase } from './fixtures.ts';

/** Every `input` key the fixtures use. An unknown one must fail, not be ignored. */
const KNOWN_INPUT_KEYS = new Set([
  'assert',
  'children',
  'config',
  'emit',
  'format',
  'keys',
  'level',
  'message',
  'metadata',
  'parse',
  'runtime',
  'then_emit_from',
  'threshold',
  'timestamp',
  'transports',
  'value',
]);

/** Every `expect` key the fixtures use. Same rule. */
const KNOWN_EXPECT_KEYS = new Set([
  'calls',
  'emitted',
  'has_silent_emit_method',
  'json',
  'omits',
  'open_handles',
  'ordinals',
  'parsed',
  'raised',
  'text',
  'transport_instances',
]);

/**
 * One expected-versus-actual pair.
 *
 * The runner produces these rather than asserting directly so every comparison
 * shows up individually and is labelled with what it was checking.
 */
export interface Comparison {
  what: string;
  expected: string;
  actual: string;
  /**
   * Which `expect` key this comparison discharges, when it discharges one.
   *
   * The caller uses these to prove every expectation was actually checked. A
   * runner that quietly drops one is indistinguishable from a passing one,
   * which is the failure this whole exercise exists to prevent.
   */
  expectKey?: string;
}

/**
 * Timestamp used by cases that emit a record but do not pin one. Any fixed
 * value works; what matters is that it is not the wall clock.
 */
const UNPINNED_CLOCK = new Date('2000-01-01T00:00:00.000Z');

const CAPTURE_TRANSPORT = 'treering-capture';

interface Captured {
  entry: LogEntry;
  /** Presentation options the library derived from the logger config. */
  options: FormatOptions;
}

// Capturing through a registered transport rather than by stubbing the console
// keeps the whole config -> createTransports -> formatLogEntry path under test:
// `context` here is what the library computed from `format`, `timestamp` and
// `colorize`, so a fixture that sets those exercises the real plumbing.
registerTransport(CAPTURE_TRANSPORT, (config, context) => {
  const sink = config.options?.sink as Captured[] | undefined;

  if (!sink) {
    throw new Error(`${CAPTURE_TRANSPORT} transport requires options.sink`);
  }

  return {
    type: CAPTURE_TRANSPORT,
    level: config.level,
    write(entry: LogEntry): void {
      sink.push({
        entry,
        options: { timestamp: context.timestamp, colorize: context.colorize },
      });
    },
  };
});

/** Name the capture transport in a `LoggerConfig`. */
function captureTransportConfig(sink: Captured[]): TransportConfig {
  return { type: CAPTURE_TRANSPORT, options: { sink } };
}

/**
 * Execute one fixture case.
 * @param testCase - The case to run
 * @param suite - Name of the suite it came from
 * @returns The comparisons the caller must assert
 */
export function executeCase(testCase: ConformanceCase, suite: string): Comparison[] {
  rejectUnknownKeys(testCase);

  const dsl = new Dsl();
  const input = testCase.input;

  switch (input.assert) {
    case 'ordinals':
      return compareOrdinals(testCase);
    case 'no_silent_emit':
      return compareSilentEmit(testCase);
    case 'resource_count':
      return compareResourceCount(testCase, dsl);
    default:
      break;
  }

  if (Array.isArray(input.parse)) {
    return compareParsing(testCase);
  }

  if (input.value !== undefined) {
    return compareValue(testCase, suite, dsl);
  }

  return compareEmission(testCase, dsl);
}

function rejectUnknownKeys(testCase: ConformanceCase): void {
  for (const key of Object.keys(testCase.input)) {
    if (!KNOWN_INPUT_KEYS.has(key)) {
      throw new Error(`unhandled fixture input key '${key}'; the runner would silently ignore it`);
    }
  }

  for (const key of Object.keys(testCase.expect)) {
    if (!KNOWN_EXPECT_KEYS.has(key)) {
      throw new Error(`unhandled fixture expect key '${key}'; the runner would silently pass it`);
    }
  }
}

/** JSON with object keys sorted, for structural expectations only. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'undefined';
}

function structural(
  what: string,
  actual: unknown,
  expected: unknown,
  expectKey: string | undefined = what
): Comparison {
  return { what, actual: canonical(actual), expected: canonical(expected), expectKey };
}

// --- assert: ordinals -------------------------------------------------------

function compareOrdinals(testCase: ConformanceCase): Comparison[] {
  const actual = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
    silent: LogLevel.SILENT,
  };

  return [structural('ordinals', actual, testCase.expect.ordinals)];
}

// --- assert: no_silent_emit -------------------------------------------------

function compareSilentEmit(testCase: ConformanceCase): Comparison[] {
  const logger = createLogger({ ignoreEnvironment: true }) as ILogger & { silent?: unknown };

  return [
    structural(
      'has_silent_emit_method',
      typeof logger.silent === 'function',
      testCase.expect.has_silent_emit_method
    ),
  ];
}

// --- assert: resource_count -------------------------------------------------

/**
 * SPEC §3.3: creating a child must not open new file handles.
 *
 * Handles are counted as "resource-owning transports constructed", which is the
 * portable proxy: a `FileTransport` opens its descriptor lazily and holds at
 * most one, so one construction bounds the process at one handle. Counting file
 * descriptors directly would mean reading `/proc/self/fd`, which does not exist
 * on macOS.
 *
 * Nothing is written, so no file is ever created — but the filename is still
 * redirected into the temp directory, because a future change to lazy opening
 * should not start littering the repository root with `out.log`.
 */
function compareResourceCount(testCase: ConformanceCase, dsl: Dsl): Comparison[] {
  const configured = (testCase.input.transports ?? []) as TransportConfig[];
  const transports: TransportConfig[] = configured.map((entry) => ({
    ...entry,
    options: {
      ...entry.options,
      ...(entry.options?.filename
        ? { filename: join(tmpdir(), 'treering-conformance', String(entry.options.filename)) }
        : {}),
    },
  }));

  const original = getTransportFactory('file');

  if (!original) {
    throw new Error("the 'file' transport is not registered; the /node entry point should have");
  }

  let constructed = 0;

  registerTransport('file', (config, context) => {
    constructed += 1;
    return original(config, context);
  });

  try {
    const parent = new NodeLogger({ transports });
    const instances = new Set(parent.getTransports());

    let current: ILogger = parent;

    for (const metadata of (testCase.input.children ?? []) as Record<string, unknown>[]) {
      current = current.child(dsl.materialize(metadata) as Record<string, unknown>);

      for (const transport of (current as NodeLogger).getTransports()) {
        instances.add(transport);
      }
    }

    return [
      structural('transport_instances', instances.size, testCase.expect.transport_instances),
      structural('open_handles', constructed, testCase.expect.open_handles),
    ];
  } finally {
    registerTransport('file', original);
  }
}

// --- parse ------------------------------------------------------------------

function compareParsing(testCase: ConformanceCase): Comparison[] {
  const comparisons: Comparison[] = [];
  let raised = false;
  const parsed: string[] = [];

  for (const value of testCase.input.parse as string[]) {
    try {
      parsed.push(logLevelToString(stringToLogLevel(value)));
    } catch {
      raised = true;
      parsed.push('<raised>');
    }
  }

  comparisons.push(structural('parsed', parsed, testCase.expect.parsed));

  if (testCase.expect.raised !== undefined) {
    comparisons.push(structural('raised', raised, testCase.expect.raised));
  }

  return comparisons;
}

// --- value (serialization, redaction) ---------------------------------------

function compareValue(testCase: ConformanceCase, suite: string, dsl: Dsl): Comparison[] {
  const value = dsl.materialize(testCase.input.value);

  // SPEC §8.3: redaction is an explicit utility, never automatic — so the
  // redaction suite calls it and the serialization suite does not.
  const subject =
    suite === 'redaction'
      ? filterSensitiveData(value, testCase.input.keys as string[] | undefined)
      : value;

  return [
    {
      what: 'json',
      expectKey: 'json',
      actual: dsl.applyStackPlaceholder(safeStringify(subject)),
      expected: String(testCase.expect.json),
    },
  ];
}

// --- emission (envelope, context, levels filtering, redaction/not-automatic) --

function compareEmission(testCase: ConformanceCase, dsl: Dsl): Comparison[] {
  const input = testCase.input;
  const captured: Captured[] = [];

  const config: Partial<LoggerConfig> = {
    // Nothing is filtered unless the case asks for a threshold.
    level: input.threshold ? stringToLogLevel(String(input.threshold)) : LogLevel.DEBUG,
    format: input.format === 'json' ? 'json' : 'text',
    timestamp: true,
    // SPEC §6.1 makes the colorize default runtime-dependent, so a fixture that
    // does not name it cannot depend on it. Pin it off; `input.config` below
    // still wins for the case that does name it.
    colorize: false,
    // An operator's LOG_LEVEL must not decide whether a conformance case passes.
    ignoreEnvironment: true,
    transports: [captureTransportConfig(captured)],
    ...((input.config ?? {}) as Partial<LoggerConfig>),
  };

  const root: ILogger = createLogger(
    withLoggerInternals(config, {
      now: () => (input.timestamp ? new Date(String(input.timestamp)) : UNPINNED_CLOCK),
      ...(input.runtime ? { runtime: input.runtime as RuntimeName } : {}),
    })
  );

  let current = root;

  for (const metadata of (input.children ?? []) as Record<string, unknown>[]) {
    current = current.child(dsl.materialize(metadata) as Record<string, unknown>);
  }

  const emitter = input.then_emit_from === 'parent' ? root : current;

  if (Array.isArray(input.emit)) {
    for (const level of input.emit as string[]) {
      emitter.log(stringToLogLevel(level), `emit ${level}`);
    }
  } else if (input.level !== undefined) {
    emitter.log(
      stringToLogLevel(String(input.level)),
      dsl.materialize(input.message) as LogMessage,
      input.metadata === undefined ? undefined : dsl.materialize(input.metadata)
    );
  }

  return collectEmissionComparisons(testCase, dsl, captured);
}

function collectEmissionComparisons(
  testCase: ConformanceCase,
  dsl: Dsl,
  captured: Captured[]
): Comparison[] {
  const expected = testCase.expect;
  const comparisons: Comparison[] = [];

  const rendered = (format: 'json' | 'text'): string => {
    if (captured.length !== 1) {
      throw new Error(`expected exactly one emitted record, got ${captured.length}`);
    }

    const only = captured[0] as Captured;

    return dsl.applyStackPlaceholder(formatLogEntry(only.entry, format, only.options));
  };

  if (expected.json !== undefined) {
    comparisons.push({
      what: 'json',
      expectKey: 'json',
      actual: rendered('json'),
      expected: String(expected.json),
    });
  }

  if (expected.text !== undefined) {
    comparisons.push({
      what: 'text',
      expectKey: 'text',
      actual: rendered('text'),
      expected: String(expected.text),
    });
  }

  if (expected.emitted !== undefined) {
    const emitted = captured.map((record) => logLevelToString(record.entry.level));
    comparisons.push(structural('emitted', emitted, expected.emitted));
  }

  if (expected.omits !== undefined) {
    const output = JSON.parse(rendered('json')) as Record<string, unknown>;

    for (const key of expected.omits as string[]) {
      comparisons.push(
        structural(`omits:${key}`, key in output ? 'present' : 'absent', 'absent', 'omits')
      );
    }
  }

  if (expected.calls !== undefined) {
    const expectedCalls = expected.calls as Record<string, unknown>;
    const actualCalls: Record<string, unknown> = {};

    if ('lazy_invoked' in expectedCalls) {
      actualCalls.lazy_invoked = dsl.lazyInvocations > 0;
    }
    if ('lazy_invoke_count' in expectedCalls) {
      actualCalls.lazy_invoke_count = dsl.lazyInvocations;
    }

    comparisons.push(structural('calls', actualCalls, expectedCalls));
  }

  // SPEC §8.3. The json comparison above already pins the value, but stating
  // the assertion the fixture names keeps the failure legible.
  if (testCase.input.assert === 'no_implicit_redaction') {
    comparisons.push(
      structural(
        'no_implicit_redaction',
        !rendered('json').includes('[REDACTED]'),
        true,
        // Driven by an `input.assert`, so it discharges no `expect` key.
        undefined
      )
    );
  }

  return comparisons;
}
