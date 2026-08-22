import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/core/factory.ts';
import { LogLevel } from '../src/core/types.ts';
import { resetEnvironmentWarnings } from '../src/utils/config.ts';
import { loadConfigFromFile } from '../src/utils/config-file.ts';

/**
 * Real files in a real directory rather than a mocked `fs`. The defects this
 * suite covers were in path handling and control flow, which a mock papers over.
 *
 * The workspace is passed as `cwd` rather than entered with `process.chdir()`:
 * chdir is process-global, unavailable in a worker-thread pool, and the option
 * is the thing a monorepo or a systemd unit actually needs anyway.
 */
let workspace: string;

/** Write a file into the workspace. */
function put(name: string, contents: unknown) {
  writeFileSync(
    join(workspace, name),
    typeof contents === 'string' ? contents : JSON.stringify(contents)
  );
}

/** Load from the workspace rather than wherever the test runner was started. */
function load(configPath?: string) {
  return loadConfigFromFile(configPath, { cwd: workspace });
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'logan-config-'));
  // Warnings are deduped by message; a leaked entry would make a later test
  // assert on a warning that was suppressed rather than never emitted.
  resetEnvironmentWarnings();
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('candidate search', () => {
  it('should load logan.config.json', async () => {
    put('logan.config.json', { level: 'warn' });

    expect(await load()).toEqual({ level: LogLevel.WARN });
  });

  it('should fall through to .loganrc when logan.config.json is absent', async () => {
    // Previously impossible: the loop returned on the first candidate whether
    // or not it existed, and .loganrc matched neither extension branch.
    put('.loganrc', { level: 'error' });

    expect(await load()).toEqual({ level: LogLevel.ERROR });
  });

  it('should fall through to the logan key in package.json', async () => {
    put('package.json', { name: 'app', logan: { level: 'debug' } });

    expect(await load()).toEqual({ level: LogLevel.DEBUG });
  });

  it('should treat a package.json without a logan key as absent', async () => {
    put('package.json', { name: 'app' });

    // An empty config here would have stopped the search with {}.
    expect(await load()).toEqual({});
  });

  it('should keep searching past a package.json without a logan key', async () => {
    put('package.json', { name: 'app' });
    put('.loganrc', { level: 'warn' });

    expect(await load()).toEqual({ level: LogLevel.WARN });
  });

  it('should prefer the first candidate in order', async () => {
    put('logan.config.json', { level: 'debug' });
    put('.loganrc', { level: 'error' });
    put('package.json', { logan: { level: 'silent' } });

    expect(await load()).toEqual({ level: LogLevel.DEBUG });
  });

  it('should return an empty config when nothing is present', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await load()).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  it('should no longer consider logan.config.js', async () => {
    put('logan.config.js', 'export default { level: "debug" };');

    // Dropped deliberately: it executed a file from the working directory
    // during logger construction, and JSON covers the whole config surface.
    expect(await load()).toEqual({});
  });

  it('should not read an inherited logan key', async () => {
    put('package.json', { name: 'app' });
    Object.defineProperty(Object.prototype, 'logan', {
      value: { level: 'error' },
      configurable: true,
    });

    try {
      // `'logan' in parsed` walks the prototype chain, so a polluted
      // Object.prototype turned every package.json into a config file whose
      // contents came from somewhere else entirely.
      expect(await load()).toEqual({});
    } finally {
      delete (Object.prototype as { logan?: unknown }).logan;
    }
  });
});

describe('cwd option', () => {
  it('should search the directory given rather than the process cwd', async () => {
    put('logan.config.json', { level: 'error' });

    // The repo root has no config file, so a search rooted there finds nothing.
    // This is the monorepo / `pnpm -C` / systemd case: cwd is not the package.
    expect(await loadConfigFromFile(undefined, { cwd: process.cwd() })).toEqual({});
    expect(await loadConfigFromFile(undefined, { cwd: workspace })).toEqual({
      level: LogLevel.ERROR,
    });
  });

  it('should resolve a relative configPath against it', async () => {
    put('custom.json', { level: 'warn' });

    expect(await load('custom.json')).toEqual({ level: LogLevel.WARN });
  });

  it('should leave an absolute configPath alone', async () => {
    put('custom.json', { level: 'warn' });

    expect(
      await loadConfigFromFile(join(workspace, 'custom.json'), { cwd: '/nonexistent' })
    ).toEqual({ level: LogLevel.WARN });
  });

  it('should accept a trailing separator on cwd', async () => {
    put('logan.config.json', { level: 'warn' });

    expect(await loadConfigFromFile(undefined, { cwd: `${workspace}/` })).toEqual({
      level: LogLevel.WARN,
    });
  });

  it('should treat an empty cwd as the working directory, not the filesystem root', async () => {
    // `{ cwd: process.env.APP_ROOT ?? '' }` is an ordinary way to write this,
    // and '' is not nullish — so it used to survive and resolve to `/`, where
    // the search finds nothing, or the wrong package.json in a container that
    // ships the app at the root.
    await expect(loadConfigFromFile('logan.config.json', { cwd: '' })).rejects.toThrow(
      `config file not found: ${join(process.cwd(), 'logan.config.json')}`
    );
  });

  it('should normalize the path it reports', async () => {
    // An unnormalized `..` in a warning is a path the reader then has to
    // resolve in their head before they can go look at the file.
    await expect(loadConfigFromFile('sub/../missing.json', { cwd: workspace })).rejects.toThrow(
      `config file not found: ${join(workspace, 'missing.json')}`
    );
  });
});

describe('malformed input', () => {
  it('should warn naming the path rather than silently returning defaults', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', '{ this is not json');

    expect(await load()).toEqual({});
    expect(warn.mock.calls[0][0]).toContain('logan.config.json');
  });

  it('should not echo file content back in the parse error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', 'SECRET_TOKEN=hunter2');

    await load();

    // V8's message quotes the first bytes it choked on. A config file is not
    // necessarily as public as the log stream that would carry them.
    expect(warn.mock.calls[0][0]).not.toContain('SECRET');
    expect(warn.mock.calls[0][0]).toContain('not valid JSON');
  });

  it('should stop rather than fall through to a later candidate', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', '{ broken');
    put('.loganrc', { level: 'error' });

    // A broken file is a user error to surface, not a reason to quietly use
    // something else.
    expect(await load()).toEqual({});
  });

  it('should reject a non-object config', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', [1, 2, 3]);

    expect(await load()).toEqual({});
    expect(warn.mock.calls[0][0]).toContain('object');
  });

  it('should reject a null logan key rather than treat it as absent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('package.json', { name: 'app', logan: null });

    expect(await load()).toEqual({});
    expect(warn.mock.calls[0][0]).toContain('"logan" key');
  });

  it('should keep searching past a path that is not a readable file', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A stray `mkdir -p`, or a container volume mounted at the config path.
    mkdirSync(join(workspace, '.loganrc'));
    put('package.json', { logan: { level: 'error' } });

    // EISDIR used to abort the search, so the valid package.json below it was
    // silently ignored. A directory is not a broken config; it is not config.
    expect(await load()).toEqual({ level: LogLevel.ERROR });
    expect(warn.mock.calls[0][0]).toContain('.loganrc');
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'should distinguish an unreadable file from an absent one',
    async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      put('logan.config.json', { level: 'warn' });
      chmodSync(join(workspace, 'logan.config.json'), 0o000);

      try {
        const config = await load();

        // The assertion that matters: the file says WARN, and a loader that
        // went back to swallowing read errors would fall through to the search
        // and return {} without a word. Both halves have to hold.
        expect(warn.mock.calls[0][0]).toContain('logan.config.json');
        expect(config).toEqual({});
        expect(config).not.toEqual({ level: LogLevel.WARN });
      } finally {
        chmodSync(join(workspace, 'logan.config.json'), 0o644);
      }
    }
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'should not throw for an unreadable explicit path',
    async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      put('custom.json', { level: 'warn' });
      chmodSync(join(workspace, 'custom.json'), 0o000);

      try {
        // A permissions problem is the environment's, not the caller's. Taking
        // startup down over it is worse than logging at the default level.
        expect(await load('custom.json')).toEqual({});
        expect(warn.mock.calls[0][0]).toContain('no permission');
      } finally {
        chmodSync(join(workspace, 'custom.json'), 0o644);
      }
    }
  );
});

describe('explicit configPath', () => {
  it('should load exactly that file', async () => {
    put('custom.json', { level: 'warn' });

    expect(await load('custom.json')).toEqual({ level: LogLevel.WARN });
  });

  it('should still read the logan key when pointed at a package.json', async () => {
    put('package.json', { name: 'app', version: '1.0.0', logan: { level: 'error' } });

    // Without the candidate mapping this normalized the whole manifest: every
    // field unrecognized, all of them dropped, {} returned with no warning —
    // while the no-arg search read the same file correctly.
    expect(await load('package.json')).toEqual({ level: LogLevel.ERROR });
  });

  it('should read the logan key through a nested path to a package.json', async () => {
    mkdirSync(join(workspace, 'packages'));
    writeFileSync(
      join(workspace, 'packages/package.json'),
      JSON.stringify({ name: 'app', logan: { level: 'warn' } })
    );

    expect(await load('packages/package.json')).toEqual({ level: LogLevel.WARN });
  });

  it('should throw when the file does not exist', async () => {
    await expect(load('missing.json')).rejects.toThrow(/config file not found/);
  });

  it('should say the key is missing, not the file, for a keyless package.json', async () => {
    put('package.json', { name: 'app' });

    // The file is plainly there. Reporting it as not found sends the caller
    // looking for a missing file rather than the key they forgot to add.
    await expect(load('package.json')).rejects.toThrow(/no "logan" key in/);

    const error = await load('package.json').catch((cause: Error) => cause);
    expect((error as Error).message).not.toContain('not found');
  });

  it('should throw when the file is malformed', async () => {
    put('custom.json', '{ broken');

    await expect(load('custom.json')).rejects.toThrow(/is invalid/);
  });

  it('should throw naming what it found when the path is a directory', async () => {
    mkdirSync(join(workspace, 'custom.json'));

    await expect(load('custom.json')).rejects.toThrow(/is not a readable file/);
  });

  it('should not fall back to the candidate list', async () => {
    put('logan.config.json', { level: 'debug' });

    await expect(load('missing.json')).rejects.toThrow();
  });
});

describe('value normalization', () => {
  it('should convert a string level to the enum ordinal', async () => {
    put('logan.config.json', { level: 'debug' });

    const config = await load();

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

    const logger = createLogger({ ...(await load()), ignoreEnvironment: true });
    logger.debug('visible');

    expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    expect(lines).toHaveLength(1);
  });

  it('should accept a numeric level', async () => {
    put('logan.config.json', { level: 2 });

    expect((await load()).level).toBe(LogLevel.WARN);
  });

  it('should warn and drop an unrecognized level', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { level: 'verbose', format: 'json' });

    const config = await load();

    expect(config.level).toBeUndefined();
    expect(config.format).toBe('json');
    expect(warn.mock.calls[0][0]).toContain('level');
  });

  it('should warn and drop a mistyped field rather than pass it through', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { timestamp: 'yes', colorize: 1, metadata: 'nope', format: 'yaml' });

    expect(await load()).toEqual({});
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('should warn about a field it does not recognize at all', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { levl: 'debug', formatt: 'json' });

    // Typos live here, and this used to be the one class of mistake that
    // produced no output whatsoever.
    expect(await load()).toEqual({});
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toContain('levl');
    expect(warn.mock.calls[1][0]).toContain('formatt');
  });

  it('should not complain about $schema', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { $schema: './logan.schema.json', level: 'warn' });

    expect(await load()).toEqual({ level: LogLevel.WARN });
    expect(warn).not.toHaveBeenCalled();
  });

  it('should accept format: custom', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { format: 'custom' });

    // 'custom' is part of LoggerConfig['format'] and honored by the transports,
    // so createLogger({format:'custom'}) works — the file form has to as well.
    expect(await load()).toEqual({ format: 'custom' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('should warn once rather than on every load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { level: 'verbose' });

    await load();
    await load();
    await load();

    // A per-request loadConfigFromFile() would otherwise repeat forever.
    expect(warn).toHaveBeenCalledTimes(1);
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

    expect(await load()).toEqual({
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

describe('transport normalization', () => {
  it.each([
    ['null', null],
    ['a number', 1],
    ['a bare string', 'console'],
    ['an array', []],
  ])('should drop %s rather than hand it to createTransports', async (_label, entry) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { transports: [entry] });

    const config = await load();

    // createTransports reads entry.type *outside* the try that exists so one
    // bad transport cannot take the others down, so this used to throw out of
    // createLogger(). Dropping the whole field leaves the console default,
    // which beats a logger with no destinations at all.
    expect(config.transports).toBeUndefined();
    expect(warn.mock.calls[0][0]).toContain('transports[0]');
    expect(() => createLogger({ ...config, ignoreEnvironment: true })).not.toThrow();
  });

  it('should keep the valid entries beside a rejected one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { transports: [null, { type: 'console', options: {} }] });

    expect((await load()).transports).toEqual([{ type: 'console', options: {} }]);
  });

  it('should reject a non-object options', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { transports: [{ type: 'console', options: 'text' }] });

    expect((await load()).transports).toBeUndefined();
    expect(warn.mock.calls[0][0]).toContain('"options"');
  });

  it('should default a missing options to an empty object', async () => {
    put('logan.config.json', { transports: [{ type: 'console' }] });

    expect((await load()).transports).toEqual([{ type: 'console', options: {} }]);
  });

  it('should honor an explicitly empty transport list', async () => {
    put('logan.config.json', { transports: [] });

    // "Nowhere" is a legitimate choice, unlike a list of nothing but typos.
    expect((await load()).transports).toEqual([]);
  });

  it('should convert a transport level string to the enum ordinal', async () => {
    put('logan.config.json', { transports: [{ type: 'console', level: 'error', options: {} }] });

    expect((await load()).transports).toEqual([
      { type: 'console', level: LogLevel.ERROR, options: {} },
    ]);
  });

  it('should produce a transport that actually filters on its level', async () => {
    put('logan.config.json', {
      level: 'debug',
      transports: [{ type: 'console', level: 'error', options: {} }],
    });
    const seen: string[] = [];
    for (const method of ['debug', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((v: unknown) => {
        seen.push(String(v));
      });
    }

    const logger = createLogger({ ...(await load()), ignoreEnvironment: true });
    logger.debug('dropped');
    logger.info('dropped');
    logger.error('kept');

    // `entry.level < transport.level` against the string "error" is NaN, so an
    // unnormalized level filters nothing: every debug line lands in the
    // destination configured to hold errors only, and nothing says so.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('kept');
  });

  it('should drop an unusable transport level but keep the destination', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    put('logan.config.json', { transports: [{ type: 'console', level: 'loud', options: {} }] });

    expect((await load()).transports).toEqual([{ type: 'console', options: {} }]);
    expect(warn.mock.calls[0][0]).toContain('transports[0].level');
  });
});

describe('Deno', () => {
  /** Install a Deno global whose file reads fail the way `cause` says. */
  function stubDeno(cause: unknown) {
    vi.stubGlobal('Deno', {
      version: { deno: '2.6.9' },
      cwd: () => workspace,
      readTextFile: () => Promise.reject(cause),
    });
  }

  it('should report a sandbox denial as a denial, not an invalid config', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const denial = Object.assign(
      new Error(
        'Requires read access to "logan.config.json", run again with the --allow-read flag'
      ),
      { name: 'NotCapable' }
    );
    stubDeno(denial);

    // The file is fine; the process is sandboxed. Calling that "invalid" sends
    // people looking for a syntax error that is not there.
    expect(await load()).toEqual({});
    expect(warn.mock.calls[0][0]).toContain('no permission');
    expect(warn.mock.calls[0][0]).not.toContain('invalid');
  });

  it('should not throw on a denial for an explicit path', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubDeno(Object.assign(new Error('Requires read access'), { name: 'PermissionDenied' }));

    // The documented pattern is `createLogger(await loadConfigFromFile('…'))`,
    // so throwing here kills startup for every sandboxed Deno user.
    await expect(load('logan.config.json')).resolves.toEqual({});
  });

  it('should treat a missing file as absent without dereferencing Deno.errors', async () => {
    // A partial shim — an edge polyfill, or this suite's own Deno stub — has no
    // `Deno.errors`, and reading it inside the catch threw a second TypeError
    // that masked the real cause.
    stubDeno(Object.assign(new Error('No such file'), { name: 'NotFound', code: 'ENOENT' }));

    expect(await load()).toEqual({});
    await expect(load('logan.config.json')).rejects.toThrow(/config file not found/);
  });
});

describe('precedence when applied explicitly', () => {
  it('should be overridden by explicit config passed to createLogger', async () => {
    put('logan.config.json', { level: 'debug' });

    const fromFile = await load();
    const logger = createLogger({ ...fromFile, level: LogLevel.ERROR, ignoreEnvironment: true });

    expect(logger.getLevel()).toBe(LogLevel.ERROR);
  });

  it('should be overridden by the environment', async () => {
    const saved = process.env.LOG_LEVEL;
    put('logan.config.json', { level: 'debug' });
    process.env.LOG_LEVEL = 'error';

    try {
      expect(createLogger(await load()).getLevel()).toBe(LogLevel.ERROR);
    } finally {
      if (saved === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = saved;
      }
    }
  });
});
