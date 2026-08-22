import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logLevelToString, stringToLogLevel } from '../../src/core/factory.ts';
import { withLoggerInternals } from '../../src/core/internal.ts';
import {
  getTransportFactory,
  registerTransport,
  type TransportContext,
} from '../../src/core/transport.ts';
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
import { createLogger, loadConfigFromFile, NodeLogger } from '../../src/node.ts';
import { mergeConfigs } from '../../src/utils/config.ts';
import type { FormatOptions } from '../../src/utils/formatting.ts';
import { formatLogEntry } from '../../src/utils/formatting.ts';
import { filterSensitiveData, safeStringify } from '../../src/utils/serialization.ts';
import {
  captureDiagnostics,
  type EnvironmentRequest,
  withEnvironment,
  withFiles,
} from './ambient.ts';
import { Dsl } from './dsl.ts';
import type { ConformanceCase } from './fixtures.ts';

/** Every `input` key the fixtures use. An unknown one must fail, not be ignored. */
const KNOWN_INPUT_KEYS = new Set([
  'assert',
  'children',
  'config',
  'emit',
  'env',
  'files',
  'format',
  'keys',
  'level',
  'message',
  'metadata',
  'parse',
  'runtime',
  'sources',
  'then_emit_from',
  'threshold',
  'timestamp',
  'transports',
  'value',
]);

/** Every `expect` key the fixtures use. Same rule. */
const KNOWN_EXPECT_KEYS = new Set([
  'calls',
  'config',
  'context',
  'diagnostics',
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
  'transports',
  'writes',
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

/**
 * The name `fixtures/README.md` reserves for proving §7.1.1: the set of
 * transport type names is open, so a runner registers one of its own and the
 * fixtures name it from configuration like a built-in.
 *
 * Registered through the same public `registerTransport` an application would
 * use — a fixture that reached past that would prove nothing about the
 * registry.
 */
const PROBE_TRANSPORT = 'fixture-registry-probe';

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

// Records the presentation context it was constructed with, which is what
// `transport_context` reads. Discards everything written to it: §7.1.1 and
// §7.1.2 are about construction, not delivery.
registerTransport(PROBE_TRANSPORT, (config, context) => {
  (config.options?.record as TransportContext[] | undefined)?.push(context);

  return { type: PROBE_TRANSPORT, level: config.level, write: (): void => undefined };
});

/** Name the capture transport in a `LoggerConfig`. */
function captureTransportConfig(sink: Captured[]): TransportConfig {
  return { type: CAPTURE_TRANSPORT, options: { sink } };
}

/**
 * Execute one fixture case.
 *
 * Ambient state is layered outside the case body so every teardown runs in a
 * `finally`, including when the body throws — `fixtures/README.md` requires
 * that, because one leaked variable or temp directory silently corrupts every
 * case after it.
 * @param testCase - The case to run
 * @param suite - Name of the suite it came from
 * @returns The comparisons the caller must assert
 */
export async function executeCase(testCase: ConformanceCase, suite: string): Promise<Comparison[]> {
  rejectUnknownKeys(testCase);

  const files = testCase.input.files as Record<string, string> | undefined;
  const environment = testCase.input.env as EnvironmentRequest | undefined;

  const inDirectory = (): Promise<Comparison[]> =>
    files
      ? withFiles(files, (directory) => dispatch(testCase, suite, directory))
      : dispatch(testCase, suite, undefined);

  const withAmbientState = (): Promise<Comparison[]> =>
    environment ? withEnvironment(environment, inDirectory) : inDirectory();

  if (testCase.expect.diagnostics === undefined) {
    return withAmbientState();
  }

  const { result, diagnostics } = await captureDiagnostics(withAmbientState);

  return [...result, ...compareDiagnostics(testCase, diagnostics)];
}

async function dispatch(
  testCase: ConformanceCase,
  suite: string,
  directory: string | undefined
): Promise<Comparison[]> {
  const dsl = new Dsl();
  const input = testCase.input;

  switch (input.assert) {
    case 'ordinals':
      return compareOrdinals(testCase);
    case 'no_silent_emit':
      return compareSilentEmit(testCase);
    case 'resource_count':
      return compareResourceCount(testCase, dsl);
    case 'effective_config':
      return compareEffectiveConfig(testCase, await explicitConfig(testCase, directory));
    case 'transport_list':
      return compareTransportList(testCase, await explicitConfig(testCase, directory));
    case 'transport_context':
      return compareTransportContext(testCase, await explicitConfig(testCase, directory));
    case 'transport_writes':
      return compareTransportWrites(testCase, await explicitConfig(testCase, directory));
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

// --- configuration layers ---------------------------------------------------

/**
 * Build the explicit-config tier from the case's `files`, `sources`, `config`,
 * `transports` and `threshold`, lowest precedence first.
 *
 * The layers are combined with the library's own `mergeConfigs`, not with a
 * merge written here: §6.2's rules — `metadata` shallow, `transports` wholesale
 * — are the thing under test, and a runner that reimplements them is only
 * testing its own arithmetic. A single layer is passed through untouched so a
 * case that omits `transports` really does hand the implementation an absent
 * one rather than a defaulted list.
 * @param testCase - The case being run
 * @param directory - Where `input.files` was written, when the case has any
 * @returns The configuration to construct the logger with
 */
async function explicitConfig(
  testCase: ConformanceCase,
  directory: string | undefined
): Promise<Partial<LoggerConfig>> {
  const input = testCase.input;
  const layers: Partial<LoggerConfig>[] = [];

  if (directory !== undefined) {
    // §6.2: file contents enter as explicit config, below whatever the caller
    // passes alongside them — so this is the bottom layer, not a tier of its own.
    layers.push(await loadConfigFromFile(undefined, { cwd: directory }));
  }

  for (const source of (input.sources ?? []) as Record<string, unknown>[]) {
    layers.push(materializeLayer(source));
  }

  if (input.config !== undefined) {
    layers.push(materializeLayer(input.config as Record<string, unknown>));
  }

  if (input.transports !== undefined) {
    layers.push({ transports: materializeTransports(input.transports as unknown[]) });
  }

  if (input.threshold !== undefined) {
    layers.push({ level: stringToLogLevel(String(input.threshold)) });
  }

  const combined =
    layers.length === 0
      ? {}
      : layers.length === 1
        ? (layers[0] as Partial<LoggerConfig>)
        : mergeConfigs(...layers);

  // A case that is not about the environment must not be decided by one: an
  // operator's LOG_LEVEL would otherwise change the answer.
  return input.env === undefined ? { ...combined, ignoreEnvironment: true } : combined;
}

/**
 * Turn one fixture configuration object into a native one.
 *
 * Only `level` needs work, and only because JSON has no level type. This is
 * not the §6.5 normalization rule in disguise — `config` and `sources` stand in
 * for values a caller builds in code, where a statically typed implementation
 * would reject a string outright. Everything §6.5 governs arrives through
 * `input.files` instead, where the JSON reaches the loader verbatim.
 */
function materializeLayer(source: Record<string, unknown>): Partial<LoggerConfig> {
  const layer = { ...source } as Partial<LoggerConfig> & { level?: unknown };

  if (typeof layer.level === 'string') {
    layer.level = stringToLogLevel(layer.level);
  }

  if (Array.isArray(source.transports)) {
    layer.transports = materializeTransports(source.transports);
  }

  return layer as Partial<LoggerConfig>;
}

function materializeTransports(entries: unknown[]): TransportConfig[] {
  return entries.map((raw) => {
    const entry = { ...(raw as TransportConfig & { level?: unknown }) };

    if (typeof entry.level === 'string') {
      entry.level = stringToLogLevel(entry.level);
    }

    return entry as TransportConfig;
  });
}

/**
 * Point every configured `filename` at the temp directory.
 *
 * Nothing here writes, and `FileTransport` opens lazily, so no file is created
 * either way — but a future change to that laziness should not start littering
 * the repository root with `ordered.log`.
 */
function redirectFilenames(config: Partial<LoggerConfig>): Partial<LoggerConfig> {
  if (!config.transports) {
    return config;
  }

  return {
    ...config,
    transports: config.transports.map((entry) => ({
      ...entry,
      options: {
        ...entry.options,
        ...(entry.options?.filename
          ? { filename: join(tmpdir(), 'treering-conformance', String(entry.options.filename)) }
          : {}),
      },
    })),
  };
}

/**
 * The configuration the implementation actually resolved.
 *
 * Read off the constructed logger rather than recomputed here, so what is
 * compared is the end of the real precedence chain. `config` is protected
 * because it is not public API; a conformance runner observing it is the same
 * bargain as the clock seam in `core/internal.ts`.
 */
function resolvedConfig(logger: ILogger): Partial<LoggerConfig> {
  return (logger as unknown as { config: Partial<LoggerConfig> }).config;
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

// --- assert: effective_config -----------------------------------------------

/**
 * SPEC §6.1–§6.5: what the configuration resolves to once defaults, explicit
 * config, files and the environment have all had their say.
 *
 * `expect.config` is a projection — only the fields the case names are read, so
 * one fixture pins one field. `level` is compared as its ordinal, which is what
 * makes the §6.5 normalization failure visible: a level left as the string
 * `"debug"` does not equal `0`.
 */
function compareEffectiveConfig(
  testCase: ConformanceCase,
  explicit: Partial<LoggerConfig>
): Comparison[] {
  const logger = createLogger(explicit);
  const resolved = resolvedConfig(logger);
  const expected = testCase.expect.config as Record<string, unknown>;
  const actual: Record<string, unknown> = {};

  for (const field of Object.keys(expected)) {
    // getLevel() is the public reading of the threshold, and the one an
    // application would be filtered by.
    actual[field] = field === 'level' ? logger.getLevel() : resolved[field as keyof LoggerConfig];
  }

  return [structural('config', actual, expected)];
}

// --- assert: transport_list -------------------------------------------------

/**
 * SPEC §7.1 and §7.2: which transports got built, in order.
 *
 * Names only. What each one does is other sections' business; this is the
 * selection step, where an unrecognized type is skipped and a failing one is
 * isolated without taking its neighbours down.
 */
function compareTransportList(
  testCase: ConformanceCase,
  explicit: Partial<LoggerConfig>
): Comparison[] {
  const logger = createLogger(redirectFilenames(explicit)) as NodeLogger;
  const types = logger.getTransports().map((transport) => transport.type);

  return [structural('transports', types, testCase.expect.transports)];
}

// --- assert: transport_context ----------------------------------------------

/**
 * SPEC §7.1.2: a transport is handed the logger's `format`, `timestamp` and
 * `colorize` when it is constructed.
 *
 * Observed through the reserved probe transport, which records the context it
 * was given. A transport that cannot see these has to duplicate or hardcode
 * them, and the two then drift.
 */
function compareTransportContext(
  testCase: ConformanceCase,
  explicit: Partial<LoggerConfig>
): Comparison[] {
  const seen: TransportContext[] = [];
  const transports = (explicit.transports ?? []).map((entry) =>
    entry.type === PROBE_TRANSPORT
      ? { ...entry, options: { ...entry.options, record: seen } }
      : entry
  );

  createLogger(redirectFilenames({ ...explicit, transports }));

  if (seen.length === 0) {
    throw new Error(`${testCase.id}: no '${PROBE_TRANSPORT}' transport was constructed`);
  }

  return [structural('context', seen[0], testCase.expect.context)];
}

// --- assert: transport_writes -----------------------------------------------

/**
 * SPEC §7.3: a record reaches a transport only if it passes both the logger
 * threshold and the transport threshold.
 *
 * Each configured transport is swapped for a recording one keyed by its
 * `options.name`. The declared `level` is carried across **exactly as
 * configuration produced it**, string or ordinal — substituting the destination
 * is what makes delivery observable, and leaving the level untouched is what
 * keeps §6.5's normalization rule under test. A string level here is precisely
 * the bug: `entry.level < "error"` is neither true nor false, so the transport
 * filters nothing and receives every debug record.
 */
function compareTransportWrites(
  testCase: ConformanceCase,
  explicit: Partial<LoggerConfig>
): Comparison[] {
  const captures = new Map<string, Captured[]>();

  const transports = (explicit.transports ?? []).map((entry) => {
    const sink: Captured[] = [];
    captures.set(String(entry.options?.name ?? entry.type), sink);

    const replacement = captureTransportConfig(sink) as TransportConfig & { level?: unknown };

    if (entry.level !== undefined) {
      replacement.level = entry.level;
    }

    return replacement as TransportConfig;
  });

  const logger = createLogger({ ...explicit, transports });

  for (const level of (testCase.input.emit ?? []) as string[]) {
    logger.log(stringToLogLevel(level), `emit ${level}`);
  }

  const actual: Record<string, string[]> = {};

  for (const [name, sink] of captures) {
    actual[name] = sink.map((record) => logLevelToString(record.entry.level));
  }

  return [structural('writes', actual, testCase.expect.writes)];
}

// --- expect: diagnostics ----------------------------------------------------

/**
 * `fixtures/README.md`: diagnostics are matched as **substrings**, deliberately
 * not exactly. Wording is where implementations legitimately differ — an
 * absolute path, a language's own error text, a library prefix — and what the
 * spec actually requires is that a diagnostic names the thing that was wrong.
 *
 * An empty list is the opposite assertion and is just as load-bearing: §6.3
 * requires a clean parse to warn about nothing.
 */
function compareDiagnostics(testCase: ConformanceCase, emitted: string[]): Comparison[] {
  const wanted = testCase.expect.diagnostics as string[];
  const combined = emitted.join('\n');

  if (wanted.length === 0) {
    return [
      {
        what: 'diagnostics (silence required)',
        expectKey: 'diagnostics',
        expected: '',
        actual: combined,
      },
    ];
  }

  return wanted.map((substring) => ({
    what: `diagnostics mention '${substring}'`,
    expectKey: 'diagnostics',
    expected: 'mentioned',
    actual: combined.includes(substring)
      ? 'mentioned'
      : `not mentioned; diagnostics were: ${combined || '(none emitted)'}`,
  }));
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
  const { transports } = redirectFilenames({ transports: configured }) as {
    transports: TransportConfig[];
  };

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
    ...materializeLayer((input.config ?? {}) as Record<string, unknown>),
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
