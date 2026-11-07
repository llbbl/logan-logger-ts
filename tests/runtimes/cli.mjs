import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFixtures } from './.built/engine.mjs';
import { argumentsFor, loadRuntimeFixtures, printReport } from './load.mjs';

const options = argumentsFor(process.argv.slice(2), ['runtime', 'fixtures']);
if (!['node', 'bun', 'deno'].includes(options.runtime))
  throw new Error('--runtime must be node, bun, or deno');
const actual =
  typeof globalThis.Deno !== 'undefined'
    ? 'deno'
    : typeof globalThis.Bun !== 'undefined'
      ? 'bun'
      : 'node';
if (actual !== options.runtime)
  throw new Error(`CLI requested ${options.runtime}, running in ${actual}`);
const payload = await loadRuntimeFixtures(options.fixtures ?? process.env.TREERING_FIXTURES);
const root = new URL('../../', import.meta.url);
const entry = await import(new URL(`dist/${options.runtime}.mjs`, root));
const utilities = await import(new URL('dist/index.mjs', root));
const library = { ...utilities, ...entry };
const variables = [
  'LOG_LEVEL',
  'LOG_FORMAT',
  'LOG_TIMESTAMP',
  'LOG_COLOR',
  'NO_COLOR',
  'FORCE_COLOR',
];
const saved = new Map(variables.map((name) => [name, process.env[name]]));
try {
  for (const name of variables) delete process.env[name];
  const results = runFixtures(library, actual, payload.cases, payload.outputs);
  const version =
    actual === 'deno'
      ? globalThis.Deno.version.deno
      : actual === 'bun'
        ? globalThis.Bun.version
        : process.version;
  console.log(
    `[runtime] ${actual} ${version}; public entry ${resolve(fileURLToPath(new URL(`dist/${actual}.mjs`, root)))}`
  );
  if (!printReport(`${actual}-${version}`, payload, results)) process.exitCode = 1;
} finally {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
