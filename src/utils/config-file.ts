import { type LoggerConfig, LogLevel } from '../core/types.ts';
import { tryParseLogLevel } from './config.ts';
import { detectRuntime } from './runtime.ts';

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

/**
 * The three outcomes a candidate can produce. Conflating the first two is what
 * made the original loader unable to iterate.
 */
type LoadOutcome =
  | { kind: 'found'; config: Partial<LoggerConfig> }
  | { kind: 'absent' }
  | { kind: 'invalid'; path: string; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Read a file, distinguishing "not there" from "there but unreadable".
 * @returns The contents, or undefined when the file does not exist
 * @throws When the file exists but cannot be read — a permissions problem is
 * not the same as an absent file, and silently treating it as one is how a
 * misconfigured deployment ends up on default settings.
 */
async function readTextFile(path: string, runtime: string): Promise<string | undefined> {
  if (runtime === 'deno') {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: Deno runtime not in TS types
      return await (globalThis as any).Deno.readTextFile(path);
    } catch (cause) {
      // biome-ignore lint/suspicious/noExplicitAny: Deno runtime not in TS types
      if (cause instanceof (globalThis as any).Deno.errors.NotFound) {
        return undefined;
      }
      throw cause;
    }
  }

  const fs = await import('node:fs/promises');

  try {
    return await fs.readFile(path, 'utf-8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return undefined;
    }
    throw cause;
  }
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
    console.warn(
      `[logan-logger] ${path}: ignoring ${field}=${JSON.stringify(value)}. Accepted: ${accepted}.`
    );
  };

  if (raw.level !== undefined) {
    if (typeof raw.level === 'string') {
      const level = tryParseLogLevel(raw.level);
      if (level === undefined) {
        reject('level', raw.level, 'debug, info, warn, error, silent');
      } else {
        config.level = level;
      }
    } else if (typeof raw.level === 'number' && LogLevel[raw.level] !== undefined) {
      config.level = raw.level;
    } else {
      reject('level', raw.level, 'debug, info, warn, error, silent');
    }
  }

  if (raw.format !== undefined) {
    if (raw.format === 'json' || raw.format === 'text') {
      config.format = raw.format;
    } else {
      reject('format', raw.format, 'json, text');
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
    config.transports = raw.transports as LoggerConfig['transports'];
  } else if (raw.transports !== undefined) {
    reject('transports', raw.transports, 'an array of transport configs');
  }

  return config;
}

async function loadCandidate(candidate: Candidate, runtime: string): Promise<LoadOutcome> {
  let content: string | undefined;

  try {
    content = await readTextFile(candidate.path, runtime);
  } catch (cause) {
    return { kind: 'invalid', path: candidate.path, reason: describe(cause) };
  }

  if (content === undefined) {
    return { kind: 'absent' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (cause) {
    return { kind: 'invalid', path: candidate.path, reason: describe(cause) };
  }

  let raw: unknown = parsed;

  if (candidate.key) {
    if (!isRecord(parsed)) {
      return { kind: 'invalid', path: candidate.path, reason: 'expected a JSON object' };
    }
    if (!(candidate.key in parsed)) {
      // No `logan` key is not a config file at all; keep searching.
      return { kind: 'absent' };
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
 * Load logger configuration from a file.
 *
 * Without an explicit path, searches `logan.config.json`, then `.loganrc`, then
 * a `logan` key in `package.json`, and returns the first one present. All are
 * parsed as JSON.
 *
 * A file that is present but unreadable or malformed **warns naming the path**
 * and stops the search rather than silently falling through to defaults.
 *
 * This is async, and `createLogger()` is not, so file configuration is not part
 * of the automatic precedence chain. Apply it explicitly:
 *
 * ```typescript
 * const logger = createLogger(await loadConfigFromFile());
 * ```
 *
 * @param configPath - Load exactly this file. Unlike the search, a missing file
 * here is a caller error and throws.
 * @returns The configuration found, or `{}` when no candidate exists
 * @throws When `configPath` is given and that file does not exist
 */
export async function loadConfigFromFile(configPath?: string): Promise<Partial<LoggerConfig>> {
  const runtime = detectRuntime();

  if (!runtime.capabilities.fileSystem) {
    return {};
  }

  if (configPath !== undefined) {
    const outcome = await loadCandidate({ path: configPath }, runtime.name);

    if (outcome.kind === 'absent') {
      // Asking for a specific file that is not there is a mistake worth
      // surfacing, not something to paper over with defaults.
      throw new Error(`[logan-logger] config file not found: ${configPath}`);
    }
    if (outcome.kind === 'invalid') {
      throw new Error(`[logan-logger] config at ${outcome.path} is invalid: ${outcome.reason}`);
    }

    return outcome.config;
  }

  for (const candidate of CANDIDATES) {
    const outcome = await loadCandidate(candidate, runtime.name);

    if (outcome.kind === 'found') {
      return outcome.config;
    }
    if (outcome.kind === 'invalid') {
      console.warn(`[logan-logger] config at ${outcome.path} is invalid: ${outcome.reason}`);
      return {};
    }
    // 'absent' — keep searching.
  }

  return {};
}
