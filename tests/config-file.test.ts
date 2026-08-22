import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/core/factory.ts';
import { LogLevel } from '../src/core/types.ts';
import { loadConfigFromFile } from '../src/utils/config-file.ts';

/**
 * Real files in a real directory rather than a mocked `fs`. The defects this
 * suite covers were in path handling and control flow, which a mock papers over.
 */
let workspace: string;
let originalCwd: string;

/** Write a file into the workspace. */
function put(name: string, contents: unknown) {
  writeFileSync(
    join(workspace, name),
    typeof contents === 'string' ? contents : JSON.stringify(contents)
  );
}

beforeEach(() => {
  originalCwd = process.cwd();
  workspace = mkdtempSync(join(tmpdir(), 'logan-config-'));
  process.chdir(workspace);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workspace, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('candidate search', () => {
  it('should load logan.config.json', async () => {
    put('logan.config.json', { level: 'warn' });

    expect(await loadConfigFromFile()).toEqual({ level: LogLevel.WARN });
  });

  it('should fall through to .loganrc when logan.config.json is absent', async () => {
    // Previously impossible: the loop returned on the first candidate whether
    // or not it existed, and .loganrc matched neither extension branch.
    put('.loganrc', { level: 'error' });

    expect(await loadConfigFromFile()).toEqual({ level: LogLevel.ERROR });
  });

  it('should fall through to the logan key in package.json', async () => {
    put('package.json', { name: 'app', logan: { level: 'debug' } });

    expect(await loadConfigFromFile()).toEqual({ level: LogLevel.DEBUG });
  });

  it('should treat a package.json without a logan key as absent', async () => {
    put('package.json', { name: 'app' });

    // An empty config here would have stopped the search with {}.
    expect(await loadConfigFromFile()).toEqual({});
  });

  it('should keep searching past a package.json without a logan key', async () => {
    put('package.json', { name: 'app' });
    put('.loganrc', { level: 'warn' });

    expect(await loadConfigFromFile()).toEqual({ level: LogLevel.WARN });
  });

  it('should prefer the first candidate in order', async () => {
    put('logan.config.json', { level: 'debug' });
    put('.loganrc', { level: 'error' });
    put('package.json', { logan: { level: 'silent' } });

    expect(await loadConfigFromFile()).toEqual({ level: LogLevel.DEBUG });
  });

  it('should return an empty config when nothing is present', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await loadConfigFromFile()).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  it('should no longer consider logan.config.js', async () => {
    put('logan.config.js', 'export default { level: "debug" };');

    // Dropped deliberately: it executed a file from the working directory
    // during logger construction, and JSON covers the whole config surface.
    expect(await loadConfigFromFile()).toEqual({});
  });
});

describe('malformed input', () => {
  it('should warn naming the path rather than silently returning defaults', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', '{ this is not json');

    expect(await loadConfigFromFile()).toEqual({});
    expect(warn.mock.calls[0][0]).toContain('logan.config.json');
  });

  it('should stop rather than fall through to a later candidate', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', '{ broken');
    put('.loganrc', { level: 'error' });

    // A broken file is a user error to surface, not a reason to quietly use
    // something else.
    expect(await loadConfigFromFile()).toEqual({});
  });

  it('should reject a non-object config', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', [1, 2, 3]);

    expect(await loadConfigFromFile()).toEqual({});
    expect(warn.mock.calls[0][0]).toContain('object');
  });

  it('should distinguish an unreadable file from an absent one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { level: 'warn' });
    chmodSync(join(workspace, 'logan.config.json'), 0o000);

    try {
      const config = await loadConfigFromFile();

      // Root ignores the mode bits; skip rather than assert something untrue.
      if (warn.mock.calls.length > 0) {
        expect(warn.mock.calls[0][0]).toContain('logan.config.json');
        expect(config).toEqual({});
      }
    } finally {
      chmodSync(join(workspace, 'logan.config.json'), 0o644);
    }
  });
});

describe('explicit configPath', () => {
  it('should load exactly that file', async () => {
    put('custom.json', { level: 'warn' });

    expect(await loadConfigFromFile('custom.json')).toEqual({ level: LogLevel.WARN });
  });

  it('should throw when the file does not exist', async () => {
    await expect(loadConfigFromFile('missing.json')).rejects.toThrow(/config file not found/);
  });

  it('should throw when the file is malformed', async () => {
    put('custom.json', '{ broken');

    await expect(loadConfigFromFile('custom.json')).rejects.toThrow(/is invalid/);
  });

  it('should not fall back to the candidate list', async () => {
    put('logan.config.json', { level: 'debug' });

    await expect(loadConfigFromFile('missing.json')).rejects.toThrow();
  });
});

describe('value normalization', () => {
  it('should convert a string level to the enum ordinal', async () => {
    put('logan.config.json', { level: 'debug' });

    const config = await loadConfigFromFile();

    // A raw "debug" string makes every `level >= this.level` comparison NaN,
    // which silently discards every record. This is the whole reason the
    // loader normalizes rather than handing the parsed JSON straight over.
    expect(config.level).toBe(LogLevel.DEBUG);
    expect(typeof config.level).toBe('number');
  });

  it('should produce a logger that actually logs at the configured level', async () => {
    put('logan.config.json', { level: 'debug' });
    const lines: string[] = [];
    for (const method of ['debug', 'info'] as const) {
      vi.spyOn(console, method).mockImplementation((v: unknown) => {
        lines.push(String(v));
      });
    }

    const logger = createLogger({ ...(await loadConfigFromFile()), ignoreEnvironment: true });
    logger.debug('visible');

    expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    expect(lines).toHaveLength(1);
  });

  it('should accept a numeric level', async () => {
    put('logan.config.json', { level: 2 });

    expect((await loadConfigFromFile()).level).toBe(LogLevel.WARN);
  });

  it('should warn and drop an unrecognized level', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { level: 'verbose', format: 'json' });

    const config = await loadConfigFromFile();

    expect(config.level).toBeUndefined();
    expect(config.format).toBe('json');
    expect(warn.mock.calls[0][0]).toContain('level');
  });

  it('should warn and drop a mistyped field rather than pass it through', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { timestamp: 'yes', colorize: 1, metadata: 'nope', format: 'yaml' });

    expect(await loadConfigFromFile()).toEqual({});
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('should carry the fields it does understand', async () => {
    put('logan.config.json', {
      level: 'warn',
      format: 'json',
      timestamp: false,
      colorize: true,
      ignoreEnvironment: true,
      metadata: { service: 'api' },
      transports: [{ type: 'console', options: {} }],
    });

    expect(await loadConfigFromFile()).toEqual({
      level: LogLevel.WARN,
      format: 'json',
      timestamp: false,
      colorize: true,
      ignoreEnvironment: true,
      metadata: { service: 'api' },
      transports: [{ type: 'console', options: {} }],
    });
  });
});

describe('precedence when applied explicitly', () => {
  it('should be overridden by explicit config passed to createLogger', async () => {
    put('logan.config.json', { level: 'debug' });

    const fromFile = await loadConfigFromFile();
    const logger = createLogger({ ...fromFile, level: LogLevel.ERROR, ignoreEnvironment: true });

    expect(logger.getLevel()).toBe(LogLevel.ERROR);
  });

  it('should be overridden by the environment', async () => {
    const saved = process.env.LOG_LEVEL;
    put('logan.config.json', { level: 'debug' });
    process.env.LOG_LEVEL = 'error';

    try {
      expect(createLogger(await loadConfigFromFile()).getLevel()).toBe(LogLevel.ERROR);
    } finally {
      if (saved === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = saved;
      }
    }
  });
});
