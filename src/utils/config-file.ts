import { type LoggerConfig, LogLevel, type TransportConfig } from '../core/types.ts';
import { tryParseLogLevel } from './config.ts';
import { detectRuntime } from './runtime.ts';
import { warnOnce } from './warn-once.ts';

/**
 * A config file candidate.
 *
 * `key` extracts a sub-object, so a `package.json` without a `logan` key reads
 * as absent rather than as an empty config that would stop the search.
 */
interface Candidate {
  path: string;
  key?: string;
}

/** Options accepted by {@link loadConfigFromFile}. */
export interface LoadConfigFileOptions {
  /**
   * Directory the search runs in, and the base a relative `configPath` resolves
   * against. Defaults to the process working directory, which an empty string
   * also falls back to.
   *
   * The working directory is not the package root in a monorepo, under
   * pm2/systemd, or behind `pnpm -C`, and a search rooted there silently finds
   * nothing. Pass the directory you actually mean.
   */
  cwd?: string;
}

/**
 * Searched in order when no explicit path is given. All are JSON.
 *
 * `logan.config.js` used to be on this list. It was unreachable in practice,
 * and supporting it meant dynamically importing and executing a file from the
 * working directory during logger construction. Nothing in `LoggerConfig` needs
 * to be computed, so JSON covers the whole surface without that.
 */
const CANDIDATES: Candidate[] = [
  { path: 'logan.config.json' },
  { path: '.loganrc' },
  { path: 'package.json', key: 'logan' },
];

/** Fields `normalize()` understands. Anything else is a typo worth reporting. */
const KNOWN_FIELDS = new Set([
  'level',
  'format',
  'timestamp',
  'colorize',
  'ignoreEnvironment',
  'metadata',
  'transports',
  // Not a setting: editors write it in so they can offer completion.
  '$schema',
]);

/**
 * What a candidate turned out to be.
 *
 * `invalid` and `unreadable` are deliberately separate. Malformed content in a
 * file that is clearly meant to be config is a mistake to surface, so it stops
 * the search; a path that turned out not to be a readable file at all is not
 * config in the first place, so the search continues past it. `denied` is
 * neither — the file may be perfectly good, we are just not allowed to look.
 */
type LoadOutcome =
  | { kind: 'found'; config: Partial<LoggerConfig> }
  | { kind: 'absent' }
  | { kind: 'keyless'; path: string; key: string }
  | { kind: 'invalid'; path: string; reason: string }
  | { kind: 'unreadable'; path: string; reason: string }
  | { kind: 'denied'; path: string; reason: string };

/** The same four outcomes, before the content has been parsed. */
type ReadResult =
  | { kind: 'content'; content: string }
  | { kind: 'absent' }
  | { kind: 'unreadable'; reason: string }
  | { kind: 'denied'; reason: string };

/** Node's permission errno codes, plus the names Deno's sandbox throws under. */
const DENIED = new Set(['EACCES', 'EPERM', 'NotCapable', 'PermissionDenied']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Describe a JSON failure without quoting the file back.
 *
 * V8 puts the first bytes it choked on into the message
 * (`Unexpected token 'S', "SECRET_TOK"...`), which copies file content into
 * logs that may be shipped further than the file itself ever was. The position
 * is the useful half; the excerpt is not.
 */
function describeParseFailure(cause: unknown): string {
  const position = /at position \d+(?: \(line \d+ column \d+\))?/.exec(describe(cause));

  return position ? `not valid JSON (${position[0]})` : 'not valid JSON';
}

/**
 * Anchored paths, which a directory must not be prepended to: POSIX absolute,
 * UNC, `C:\…`, and drive-relative `C:conf.json` — which means "the working
 * directory *on drive C*", so joining it to another directory is nonsense.
 */
function isAnchoredPath(path: string): boolean {
  return path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path);
}

/**
 * Join a candidate name onto a directory without `node:path`.
 *
 * Only the Deno branch needs this — see {@link createPathResolver}. Both Deno
 * and Windows accept `/` as a separator, so the join is safe; what it does not
 * do is normalize, which is why Node does not use it.
 */
function joinPath(name: string, directory: string | undefined): string {
  if (directory === undefined || directory === '' || isAnchoredPath(name)) {
    return name;
  }

  return `${directory.replace(/[\\/]+$/, '')}/${name}`;
}

/**
 * Build the function that turns a candidate name into the path to read.
 *
 * `node:path` rides the same runtime-branched dynamic import `readTextFile`
 * already uses, so the Deno build still never loads it — and in exchange Node
 * gets real resolution: `..` segments collapse before they reach a warning
 * message, a relative directory is anchored to the working directory, and
 * Windows drive-relative paths join the way Windows means them.
 */
async function createPathResolver(
  runtime: string,
  directory: string | undefined
): Promise<(name: string) => string> {
  if (runtime === 'deno') {
    return (name) => joinPath(name, directory);
  }

  const { resolve } = await import('node:path');

  return directory === undefined ? (name) => resolve(name) : (name) => resolve(directory, name);
}

function basename(path: string): string {
  const segments = path.split(/[\\/]/);

  return segments[segments.length - 1] || path;
}

/** The runtime's working directory, or undefined when it will not say. */
function currentDirectory(runtime: string): string | undefined {
  if (runtime === 'deno') {
    try {
      // Deno.cwd() is itself permission-gated. Under a sandbox there is nothing
      // to resolve against, and the read below reports the denial properly.
      // biome-ignore lint/suspicious/noExplicitAny: Deno runtime not in TS types
      return (globalThis as any).Deno?.cwd?.();
    } catch {
      return undefined;
    }
  }

  return typeof process !== 'undefined' && typeof process.cwd === 'function'
    ? process.cwd()
    : undefined;
}

/**
 * Classify a read failure.
 *
 * Duck-typed on the error rather than `instanceof Deno.errors.NotFound`: Deno's
 * NotFound carries `code: 'ENOENT'` as well as its own name, so one check
 * covers both runtimes — and it never dereferences `Deno.errors`, which a
 * partial Deno shim may not define, turning the real failure into a TypeError.
 */
function classifyReadFailure(cause: unknown): ReadResult {
  const code = (cause as NodeJS.ErrnoException | undefined)?.code ?? '';
  const name = (cause as Error | undefined)?.name ?? '';

  if (code === 'ENOENT' || name === 'NotFound') {
    return { kind: 'absent' };
  }
  if (DENIED.has(code) || DENIED.has(name)) {
    return { kind: 'denied', reason: describe(cause) };
  }

  // Everything left is an I/O failure on a path that turned out not to be a
  // readable file — EISDIR from a stray `mkdir -p` or a container volume
  // mounted at the config path, ENOTDIR, ELOOP. None of them say the config is
  // broken, so none of them should stop the search.
  return { kind: 'unreadable', reason: describe(cause) };
}

/**
 * Read a file, keeping apart the outcomes that call for different behavior:
 * content, no such path, a path that is not a readable file, and a runtime that
 * refuses to look. Conflating any of them is how a misconfigured deployment
 * ends up silently on default settings.
 */
async function readTextFile(path: string, runtime: string): Promise<ReadResult> {
  // Deno's own API rather than node:fs, so the Deno build never reaches for the
  // Node compatibility layer just to read a config file.
  const read =
    runtime === 'deno'
      ? // biome-ignore lint/suspicious/noExplicitAny: Deno runtime not in TS types
        (): Promise<string> => (globalThis as any).Deno.readTextFile(path)
      : async (): Promise<string> => (await import('node:fs/promises')).readFile(path, 'utf-8');

  try {
    return { kind: 'content', content: await read() };
  } catch (cause) {
    return classifyReadFailure(cause);
  }
}

/**
 * Convert a level as written in JSON — `"warn"` or `2` — to its ordinal.
 * @returns The level, or undefined when the value names nothing
 */
function coerceLevel(value: unknown): LogLevel | undefined {
  if (typeof value === 'string') {
    return tryParseLogLevel(value);
  }
  if (typeof value === 'number' && LogLevel[value] !== undefined) {
    return value;
  }

  return undefined;
}

/**
 * Validate one entry of `transports`.
 *
 * Elements used to be cast wholesale, which put two failures downstream:
 * `createTransports` reads `entry.type` outside the guard that exists so one
 * bad transport cannot take the others down, and a `level` left as the string
 * `"error"` makes `entry.level < transport.level` NaN — so the transport
 * filters *nothing* and every debug line lands in the file that was configured
 * to hold errors only. That failure is silent, which makes it worse than the
 * top-level one it mirrors.
 *
 * @returns The validated entry, or undefined when it should be dropped
 */
function normalizeTransport(
  entry: unknown,
  index: number,
  path: string
): TransportConfig | undefined {
  const reject = (reason: string) => {
    warnOnce(`[logan-logger] ${path}: ignoring transports[${index}]: ${reason}.`);
  };

  if (!isRecord(entry)) {
    reject(`expected an object, got ${JSON.stringify(entry) ?? typeof entry}`);
    return undefined;
  }
  if (typeof entry.type !== 'string') {
    reject('"type" is required and must be a string');
    return undefined;
  }
  if (entry.options !== undefined && !isRecord(entry.options)) {
    reject('"options" must be an object');
    return undefined;
  }

  // Not narrowed to the built-in union: registerTransport() accepts any name,
  // and createTransports() already reports one it cannot resolve.
  const transport: TransportConfig = {
    type: entry.type as TransportConfig['type'],
    options: (entry.options as Record<string, unknown>) ?? {},
  };

  if (entry.level !== undefined) {
    const level = coerceLevel(entry.level);

    if (level === undefined) {
      // Drop the filter, keep the destination: an unusable level should not
      // also cost you the transport, which would lose records outright.
      warnOnce(
        `[logan-logger] ${path}: ignoring transports[${index}].level=` +
          `${JSON.stringify(entry.level)}. Accepted: debug, info, warn, error, silent.`
      );
    } else {
      transport.level = level;
    }
  }

  return transport;
}

/**
 * Coerce and validate the raw JSON into a `LoggerConfig` subset.
 *
 * A config file naturally writes `"level": "debug"` — a string, where the
 * runtime expects a `LogLevel` ordinal. Passing that through unchanged makes
 * every `level >= this.level` comparison NaN, which silently discards **all**
 * records. Anything unrecognized is dropped with a warning rather than handed
 * to the logger.
 */
function normalize(raw: Record<string, unknown>, path: string): Partial<LoggerConfig> {
  const config: Partial<LoggerConfig> = {};
  const reject = (field: string, value: unknown, accepted: string) => {
    warnOnce(
      `[logan-logger] ${path}: ignoring ${field}=${JSON.stringify(value)}. Accepted: ${accepted}.`
    );
  };

  // Typos live among the keys nobody validates: `{"levl":"debug"}` used to
  // produce an empty config and not one word of output.
  for (const field of Object.keys(raw)) {
    if (!KNOWN_FIELDS.has(field)) {
      warnOnce(
        `[logan-logger] ${path}: ignoring unknown field "${field}". Known fields: ` +
          'level, format, timestamp, colorize, ignoreEnvironment, metadata, transports.'
      );
    }
  }

  if (raw.level !== undefined) {
    const level = coerceLevel(raw.level);

    if (level === undefined) {
      reject('level', raw.level, 'debug, info, warn, error, silent');
    } else {
      config.level = level;
    }
  }

  if (raw.format !== undefined) {
    // 'custom' is part of LoggerConfig['format'] and honored by every
    // transport, so a file may name it exactly as explicit config may.
    if (raw.format === 'json' || raw.format === 'text' || raw.format === 'custom') {
      config.format = raw.format;
    } else {
      reject('format', raw.format, 'json, text, custom');
    }
  }

  for (const field of ['timestamp', 'colorize', 'ignoreEnvironment'] as const) {
    if (raw[field] === undefined) {
      continue;
    }
    if (typeof raw[field] === 'boolean') {
      config[field] = raw[field];
    } else {
      reject(field, raw[field], 'true, false');
    }
  }

  if (raw.metadata !== undefined) {
    if (isRecord(raw.metadata)) {
      config.metadata = raw.metadata;
    } else {
      reject('metadata', raw.metadata, 'an object');
    }
  }

  if (Array.isArray(raw.transports)) {
    const transports = raw.transports
      .map((entry, index) => normalizeTransport(entry, index, path))
      .filter((entry): entry is TransportConfig => entry !== undefined);

    // An explicit empty list means "no destinations" and is honored. A list
    // whose every entry was rejected is a typo, and leaving it empty would
    // silence the logger entirely, so the field is dropped and the console
    // default applies.
    if (transports.length > 0 || raw.transports.length === 0) {
      config.transports = transports;
    }
  } else if (raw.transports !== undefined) {
    reject('transports', raw.transports, 'an array of transport configs');
  }

  return config;
}

async function loadCandidate(candidate: Candidate, runtime: string): Promise<LoadOutcome> {
  const read = await readTextFile(candidate.path, runtime);

  if (read.kind === 'absent') {
    return read;
  }
  if (read.kind !== 'content') {
    return { kind: read.kind, path: candidate.path, reason: read.reason };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(read.content);
  } catch (cause) {
    return { kind: 'invalid', path: candidate.path, reason: describeParseFailure(cause) };
  }

  let raw: unknown = parsed;

  if (candidate.key) {
    if (!isRecord(parsed)) {
      return { kind: 'invalid', path: candidate.path, reason: 'expected a JSON object' };
    }
    if (!Object.hasOwn(parsed, candidate.key)) {
      // No `logan` key is not a config file at all; the search keeps going. Own
      // keys only: `constructor` is on every object's prototype chain.
      //
      // Distinct from 'absent' because an explicitly requested package.json is
      // plainly there, and telling the caller it was not found sends them
      // looking for a missing file rather than a missing key.
      return { kind: 'keyless', path: candidate.path, key: candidate.key };
    }
    raw = parsed[candidate.key];
  }

  if (!isRecord(raw)) {
    const where = candidate.key ? `the "${candidate.key}" key` : 'the file';
    return { kind: 'invalid', path: candidate.path, reason: `expected ${where} to be an object` };
  }

  return { kind: 'found', config: normalize(raw, candidate.path) };
}

/**
 * Build the candidate for an explicitly requested path.
 *
 * A path ending in `package.json` still means the `logan` key inside it. Losing
 * that mapping reads the whole manifest as config, drops `name`, `version` and
 * `scripts` as unrecognized, and returns `{}` — while the plain search reads
 * the very same file correctly.
 */
function candidateFor(path: string): Candidate {
  const known = CANDIDATES.find((candidate) => candidate.path === basename(path));

  return known ? { ...known, path } : { path };
}

function warnDenied(path: string, reason: string): void {
  warnOnce(
    `[logan-logger] cannot read config at ${path} — no permission; using defaults instead: ${reason}`
  );
}

/**
 * Load logger configuration from a file.
 *
 * Without an explicit path, searches `logan.config.json`, then `.loganrc`, then
 * a `logan` key in `package.json`, and returns the first one present. All are
 * parsed as JSON.
 *
 * A file that is present but malformed **warns naming the path** and stops the
 * search rather than silently falling through to defaults. A path that exists
 * but is not a readable file — a directory named `.loganrc`, say — warns and
 * the search continues, because that is not a config file at all. A runtime
 * that refuses permission warns once and yields defaults without throwing;
 * a sandbox is an environment problem, not a reason to fail startup.
 *
 * Every warning is emitted once per distinct message, so calling this per
 * request does not repeat it forever.
 *
 * This is async, and `createLogger()` is not, so file configuration is not part
 * of the automatic precedence chain. Apply it explicitly:
 *
 * ```typescript
 * const logger = createLogger(await loadConfigFromFile());
 * ```
 *
 * @param configPath - Load exactly this file, resolved against `options.cwd`.
 * Unlike the search, a missing file here is a caller error and throws. It must
 * not be built from untrusted input: it names a file to read, and a config file
 * can name an absolute path for the file transport to write.
 * @param options - Search options; see {@link LoadConfigFileOptions}
 * @returns The configuration found, or `{}` when no candidate exists
 * @throws When `configPath` is given and that file does not exist, carries no
 * `logan` key (for a `package.json`), is not a readable file, or is malformed
 */
export async function loadConfigFromFile(
  configPath?: string,
  options: LoadConfigFileOptions = {}
): Promise<Partial<LoggerConfig>> {
  const runtime = detectRuntime();

  if (!runtime.capabilities.fileSystem) {
    return {};
  }

  // `||` rather than `??`: an empty string is not a directory, and
  // `{ cwd: process.env.APP_ROOT ?? '' }` is an ordinary way to write this.
  // Left to stand it resolves to the filesystem root, where a search finds
  // either nothing or — in a container that ships the app at `/` — the wrong
  // package.json, in both cases without a word.
  const directory = options.cwd || currentDirectory(runtime.name);
  const resolvePath = await createPathResolver(runtime.name, directory);

  if (configPath !== undefined) {
    const path = resolvePath(configPath);
    const outcome = await loadCandidate(candidateFor(path), runtime.name);

    if (outcome.kind === 'found') {
      return outcome.config;
    }
    if (outcome.kind === 'absent') {
      // Asking for a specific file that is not there is a mistake worth
      // surfacing, not something to paper over with defaults.
      throw new Error(`[logan-logger] config file not found: ${path}`);
    }
    if (outcome.kind === 'keyless') {
      throw new Error(`[logan-logger] no "${outcome.key}" key in ${outcome.path}`);
    }
    if (outcome.kind === 'denied') {
      warnDenied(outcome.path, outcome.reason);
      return {};
    }
    if (outcome.kind === 'unreadable') {
      // Named as what it is. Calling a directory an invalid config sends people
      // looking for a syntax error in something that has no syntax.
      throw new Error(
        `[logan-logger] config at ${outcome.path} is not a readable file: ${outcome.reason}`
      );
    }

    throw new Error(`[logan-logger] config at ${outcome.path} is invalid: ${outcome.reason}`);
  }

  for (const candidate of CANDIDATES) {
    const outcome = await loadCandidate(
      { ...candidate, path: resolvePath(candidate.path) },
      runtime.name
    );

    if (outcome.kind === 'found') {
      return outcome.config;
    }
    if (outcome.kind === 'invalid') {
      warnOnce(`[logan-logger] config at ${outcome.path} is invalid: ${outcome.reason}`);
      return {};
    }
    if (outcome.kind === 'denied') {
      warnDenied(outcome.path, outcome.reason);
      return {};
    }
    if (outcome.kind === 'unreadable') {
      warnOnce(`[logan-logger] skipping ${outcome.path}: not a readable file (${outcome.reason})`);
    }
    // 'absent', 'keyless' and 'unreadable' — keep searching.
  }

  return {};
}
