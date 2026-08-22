import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogLevel } from '../src/core/types.ts';
// Importing this module registers the 'file' transport.
import { FileTransport } from '../src/runtime/file-transport.ts';
import { NodeLogger } from '../src/runtime/node.ts';

let workspace: string;

function entry(message: string, level: LogLevel = LogLevel.INFO) {
  return {
    timestamp: new Date('2026-08-22T04:15:30.123Z'),
    level,
    message,
    runtime: 'node' as const,
  };
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'logan-file-transport-'));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('FileTransport', () => {
  it('should touch the filesystem only on the first write', () => {
    const target = join(workspace, 'nested', 'deeper', 'app.log');
    const transport = new FileTransport({ filename: target });

    expect(existsSync(join(workspace, 'nested'))).toBe(false);

    transport.write(entry('first line'));
    transport.close();

    expect(existsSync(target)).toBe(true);
  });

  it('should append one JSON envelope per line by default', () => {
    const target = join(workspace, 'app.log');
    const transport = new FileTransport({ filename: target });

    transport.write(entry('one'));
    transport.write(entry('two'));
    transport.close();

    const lines = readFileSync(target, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({
      timestamp: '2026-08-22T04:15:30.123Z',
      level: 'info',
      message: 'one',
      runtime: 'node',
    });
    expect(JSON.parse(lines[1]).message).toBe('two');
  });

  it('should write the text form when asked, never colorized', () => {
    const target = join(workspace, 'app.log');
    const transport = new FileTransport({ filename: target, format: 'text' });

    transport.write(entry('plain'));
    transport.close();

    expect(readFileSync(target, 'utf-8')).toBe('[2026-08-22T04:15:30.123Z] INFO: plain\n');
  });

  it('should rotate once the active file reaches maxsize', () => {
    const target = join(workspace, 'app.log');
    const transport = new FileTransport({ filename: target, maxsize: 120, maxFiles: 3 });

    for (let index = 0; index < 8; index++) {
      transport.write(entry(`message-${index}`));
    }
    transport.close();

    expect(existsSync(`${target}.1`)).toBe(true);
    expect(statSync(target).size).toBeLessThanOrEqual(120 + 200);
  });

  it('should keep at most maxFiles archives and drop the oldest', () => {
    const target = join(workspace, 'app.log');
    const transport = new FileTransport({ filename: target, maxsize: 60, maxFiles: 2 });

    for (let index = 0; index < 20; index++) {
      transport.write(entry(`message-${index}`));
    }
    transport.close();

    expect(existsSync(`${target}.1`)).toBe(true);
    expect(existsSync(`${target}.2`)).toBe(true);
    expect(existsSync(`${target}.3`)).toBe(false);
  });

  it('should keep the newest archive as .1 after rotating', () => {
    const target = join(workspace, 'app.log');
    const transport = new FileTransport({ filename: target, maxsize: 60, maxFiles: 3 });

    transport.write(entry('oldest'));
    transport.write(entry('middle'));
    transport.write(entry('newest'));
    transport.close();

    expect(readFileSync(`${target}.1`, 'utf-8')).toContain('middle');
    expect(readFileSync(target, 'utf-8')).toContain('newest');
  });

  it('should warn once, naming the path, when the destination is not writable', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A file where a directory is required: mkdir then open must fail.
    const blocker = join(workspace, 'blocked');
    mkdirSync(workspace, { recursive: true });
    const transport = new FileTransport({ filename: join(blocker, 'app.log') });
    // Create `blocked` as a regular file so `blocked/app.log` cannot exist.
    new FileTransport({ filename: blocker }).write(entry('occupy'));

    expect(() => transport.write(entry('doomed'))).not.toThrow();
    expect(() => transport.write(entry('doomed again'))).not.toThrow();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const [message, detail] = consoleSpy.mock.calls[0];
    expect(message).toContain(join(blocker, 'app.log'));
    expect(String(detail)).toMatch(/ENOTDIR|EEXIST|ENOENT|EACCES/);
  });

  it('should reject construction without a filename', () => {
    expect(() => new FileTransport({} as { filename: string })).toThrow(/filename/);
  });
});

describe('NodeLogger with a file transport', () => {
  it('should write only what passes the transport level filter', () => {
    const target = join(workspace, 'error.log');
    const logger = new NodeLogger({
      level: LogLevel.DEBUG,
      transports: [{ type: 'file', level: LogLevel.ERROR, options: { filename: target } }],
    });

    logger.info('ignored');
    logger.error('kept');
    logger.close();

    const lines = readFileSync(target, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).message).toBe('kept');
  });

  it('should open exactly one handle however many children are created', () => {
    const target = join(workspace, 'app.log');
    const logger = new NodeLogger({
      transports: [{ type: 'file', options: { filename: target } }],
    });

    const children = Array.from({ length: 50 }, (_, index) =>
      logger.child({ requestId: `req-${index}` })
    );

    for (const child of children) {
      expect((child as NodeLogger).getTransports()).toEqual(logger.getTransports());
    }

    children[0].info('from a child');
    logger.close();

    const lines = readFileSync(target, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).metadata).toEqual({ requestId: 'req-0' });
  });

  it('should fan out to console and file together', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const target = join(workspace, 'app.log');

    const logger = new NodeLogger({
      transports: [
        { type: 'console', options: {} },
        { type: 'file', options: { filename: target } },
      ],
    });

    logger.info('both');
    logger.close();

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(readFileSync(target, 'utf-8')).toContain('both');
  });
});
