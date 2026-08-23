/**
 * The ambient-state half of the runner contract in `fixtures/README.md`:
 * `input.env`, `input.files` and `expect.diagnostics`.
 *
 * Every helper here restores what it changed in a `finally`. A case that throws
 * would otherwise leave a variable set or a directory behind, and the next case
 * to read it would fail — or worse, pass — for a reason that has nothing to do
 * with what it was testing.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resetEnvironmentWarnings } from '../../src/utils/config.ts';

/**
 * The variables a case must not inherit from the developer's own shell.
 *
 * SPEC §6.3 defines the four `LOG_*` names. A case that names none of them
 * still needs them gone: an operator's `LOG_LEVEL` must not decide whether
 * `"diagnostics": []` holds.
 *
 * Two variables outside this library's namespace change a conformance result
 * and so are listed here as well:
 *
 * `NO_COLOR` — SPEC §6.4.1 makes it an override that outranks every
 * configuration source, so a developer who keeps it set in their shell — an
 * increasingly common preference — would otherwise see every `colorize`
 * assertion resolve to `false` and every disagreement case warn spuriously.
 *
 * `FORCE_COLOR` — §6.4.1's "What is not specified" leaves it unspecified, but
 * this implementation consults it in `shouldColorize()`, which seeds the
 * `colorize` default of every merged config. CI providers commonly set it, so
 * leaving it ambient makes a case's result depend on the runner.
 */
const SPEC_VARIABLES = [
  'LOG_LEVEL',
  'LOG_FORMAT',
  'LOG_TIMESTAMP',
  'LOG_COLOR',
  'NO_COLOR',
  'FORCE_COLOR',
];

/** `null` in a fixture means "ensure unset", which is not the empty string. */
export type EnvironmentRequest = Record<string, string | null>;

/**
 * Run `body` with the requested environment in place, then put the process
 * back exactly as it was — a variable that did not exist goes back to not
 * existing, not to an empty string.
 * @param requested - The case's `input.env`
 * @param body - What to run while it is applied
 * @returns Whatever `body` returned
 */
export async function withEnvironment<T>(
  requested: EnvironmentRequest,
  body: () => Promise<T>
): Promise<T> {
  const names = new Set([...SPEC_VARIABLES, ...Object.keys(requested)]);
  const saved = new Map<string, string | undefined>();

  for (const name of names) {
    saved.set(name, Object.hasOwn(process.env, name) ? process.env[name] : undefined);

    // Unnamed spec variables are cleared rather than left alone; see
    // SPEC_VARIABLES above.
    const value = Object.hasOwn(requested, name) ? requested[name] : null;

    if (value === null) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  try {
    return await body();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

/**
 * Write the case's files into a fresh temporary directory, hand its path to
 * `body`, and remove it afterwards.
 *
 * The directory is passed as a value rather than installed as the process
 * working directory: `process.chdir` is global state that breaks under a
 * concurrent runner, and it does not exist at all inside a worker thread, which
 * is where this suite runs.
 * @param files - The case's `input.files`, relative path to exact contents
 * @param body - Receives the directory config discovery should be pointed at
 * @returns Whatever `body` returned
 */
export async function withFiles<T>(
  files: Record<string, string>,
  body: (directory: string) => Promise<T>
): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), 'treering-conformance-'));

  try {
    for (const [relative, contents] of Object.entries(files)) {
      const path = join(directory, relative);

      // Fixture paths may contain separators, so intervening directories are
      // the runner's job to create.
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents, 'utf8');
    }

    return await body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** One argument of a `console.warn` call, rendered for substring matching. */
function describeArgument(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error) {
    return value.message;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Collect everything written to the diagnostic channel while `body` runs.
 *
 * The warn-once table is cleared first. It exists so a misconfigured variable
 * warns once per process rather than once per logger, which means the second
 * case to provoke the same message would otherwise see silence and read it as
 * conformance.
 * @param body - What to run while diagnostics are captured
 * @returns The result alongside one string per diagnostic emitted
 */
export async function captureDiagnostics<T>(
  body: () => Promise<T>
): Promise<{ result: T; diagnostics: string[] }> {
  const diagnostics: string[] = [];
  const { warn, error } = console;

  const record = (...args: unknown[]): void => {
    diagnostics.push(args.map(describeArgument).join(' '));
  };

  resetEnvironmentWarnings();
  console.warn = record;
  console.error = record;

  try {
    return { result: await body(), diagnostics };
  } finally {
    console.warn = warn;
    console.error = error;
  }
}
