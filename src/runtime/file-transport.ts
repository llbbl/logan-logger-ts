import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { registerTransport, type Transport } from '../core/transport.ts';
import type { LogEntry, LogLevel } from '../core/types.ts';
import { formatLogEntry } from '../utils/formatting.ts';

/** Default rotation threshold: 5 MiB. */
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

/** Default number of rotated archives kept alongside the active file. */
const DEFAULT_MAX_FILES = 5;

/** Options accepted by {@link FileTransport}. */
export interface FileTransportOptions {
  /** Path to the active log file. Relative paths resolve against `process.cwd()`. */
  filename: string;
  /** Rotate once the active file reaches this many bytes. `0` disables rotation. */
  maxsize?: number;
  /** How many rotated archives to keep (`name.log.1` … `name.log.N`). */
  maxFiles?: number;
  /**
   * Output shape written to the file. Defaults to `'json'` — files are read by
   * machines, so the structured envelope wins even when the logger's own
   * format is `'text'`. Set this explicitly to write human-readable lines.
   */
  format?: 'json' | 'text' | 'custom';
  /** Include the timestamp in the text form. Defaults to `true`. */
  timestamp?: boolean;
  /** Minimum level this transport accepts. */
  level?: LogLevel;
}

/**
 * Appends log entries to a file, rotating by size.
 *
 * Design notes, all of which are deliberate:
 *
 * - **The directory and file handle are created lazily, on first write.** A
 *   logger that is constructed but never writes to a file touches the disk
 *   zero times, which is what makes file logging safe to configure in a
 *   read-only container.
 * - **Writes are synchronous `writeSync` calls against a held file
 *   descriptor.** That costs one syscall per line, and in exchange nothing
 *   sits in a userland buffer waiting to be lost when the process exits.
 * - **Failures warn once and never throw.** A logging destination going away
 *   must not take the application with it, and it must not spam the console
 *   on every subsequent line either.
 */
export class FileTransport implements Transport {
  readonly type = 'file';
  readonly level?: LogLevel;

  private readonly path: string;
  private readonly maxsize: number;
  private readonly maxFiles: number;
  private readonly format: 'json' | 'text';
  private readonly timestamp: boolean;

  private fd?: number;
  private size = 0;
  private warned = false;

  constructor(options: FileTransportOptions) {
    if (!options?.filename) {
      throw new Error('file transport requires options.filename');
    }

    this.path = resolve(options.filename);
    this.maxsize = options.maxsize ?? DEFAULT_MAX_SIZE;
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    this.format = options.format === 'text' ? 'text' : 'json';
    this.timestamp = options.timestamp !== false;
    this.level = options.level;
  }

  /** Absolute path of the active log file. */
  get filename(): string {
    return this.path;
  }

  write(entry: LogEntry): void {
    const line = `${formatLogEntry(entry, this.format, {
      timestamp: this.timestamp,
      colorize: false,
    })}\n`;

    try {
      this.open();

      if (this.maxsize > 0 && this.size >= this.maxsize) {
        this.rotate();
        this.open();
      }

      this.size += writeSync(this.fd as number, line);
    } catch (error) {
      this.warnOnce(error);
    }
  }

  close(): void {
    if (this.fd === undefined) {
      return;
    }

    try {
      closeSync(this.fd);
    } finally {
      this.fd = undefined;
    }
  }

  private open(): void {
    if (this.fd !== undefined) {
      return;
    }

    const directory = dirname(this.path);

    try {
      mkdirSync(directory, { recursive: true });
    } catch (error) {
      throw describeFsError('create log directory', directory, error);
    }

    try {
      this.fd = openSync(this.path, 'a');
    } catch (error) {
      throw describeFsError('open log file', this.path, error);
    }

    this.size = fstatSync(this.fd).size;
  }

  /**
   * Shift the archives along by one and start a fresh active file.
   * `name.log` becomes `name.log.1`, `name.log.1` becomes `name.log.2`, and
   * whatever was at `name.log.<maxFiles>` is dropped.
   */
  private rotate(): void {
    this.close();

    if (this.maxFiles <= 0) {
      // No archives requested: drop the old contents outright.
      if (existsSync(this.path)) {
        unlinkSync(this.path);
      }
      this.size = 0;
      return;
    }

    const oldest = `${this.path}.${this.maxFiles}`;
    if (existsSync(oldest)) {
      unlinkSync(oldest);
    }

    for (let index = this.maxFiles - 1; index >= 1; index--) {
      const from = `${this.path}.${index}`;
      if (existsSync(from)) {
        renameSync(from, `${this.path}.${index + 1}`);
      }
    }

    if (existsSync(this.path)) {
      renameSync(this.path, `${this.path}.1`);
    }

    this.size = 0;
  }

  private warnOnce(error: unknown): void {
    this.close();

    if (this.warned) {
      return;
    }

    this.warned = true;
    console.warn(
      `[logan-logger] file transport for '${this.path}' failed and will keep retrying quietly:`,
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Produce an error that names the resolved path and the underlying syscall,
 * so a permissions problem never surfaces as something unrelated.
 */
function describeFsError(action: string, target: string, error: unknown): Error {
  const cause = error as NodeJS.ErrnoException;
  const code = cause?.code ? ` [${cause.code}]` : '';
  const syscall = cause?.syscall ? ` during ${cause.syscall}` : '';

  const failure = new Error(
    `could not ${action} '${target}'${code}${syscall}: ${cause?.message ?? error}`
  );
  // Assigned rather than passed as ErrorOptions: the build targets es2020.
  (failure as Error & { cause?: unknown }).cause = error;

  return failure;
}

registerTransport('file', (config, context) => {
  const options = config.options ?? {};

  return new FileTransport({
    filename: options.filename,
    maxsize: options.maxsize,
    maxFiles: options.maxFiles,
    // Deliberately not inherited from context.format: a file defaults to the
    // structured envelope whatever the console is doing.
    format: options.format,
    timestamp: options.timestamp ?? context.timestamp,
    level: config.level,
  });
});
