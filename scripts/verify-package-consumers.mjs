import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'logan-logger-package-'));
const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
const packDir = path.join(tempRoot, 'pack');
const consumerRoot = path.join(tempRoot, 'consumer');

async function run(label, command, args, cwd) {
  process.stdout.write(`\n[package consumer] ${label}\n`);
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

async function writeConsumerFile(directory, filename, contents) {
  const filePath = path.join(directory, filename);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
}

function installedPath(...parts) {
  return path.join(consumerRoot, 'node_modules', ...parts);
}

async function verifyNodeConsumers() {
  const directory = path.join(consumerRoot, 'node');
  await mkdir(directory, { recursive: true });

  await writeConsumerFile(
    directory,
    'esm.mjs',
    `
import { createLogger, logger } from 'logan-logger';
import { createMorganStream } from 'logan-logger/node';
import { createLogger as createDenoLogger } from 'logan-logger/deno';
import { createLogger as createBunLogger } from 'logan-logger/bun';
import { BrowserLogger } from 'logan-logger/browser';

if (typeof createLogger !== 'function' || typeof logger.info !== 'function') throw new Error('root ESM exports failed');
if (typeof createMorganStream !== 'function') throw new Error('node ESM exports failed');
if (typeof createDenoLogger !== 'function') throw new Error('deno ESM exports failed');
if (typeof createBunLogger !== 'function') throw new Error('bun ESM exports failed');
if (typeof BrowserLogger !== 'function') throw new Error('browser ESM exports failed');
`
  );

  await writeConsumerFile(
    directory,
    'cjs.cjs',
    `
const root = require('logan-logger');
const node = require('logan-logger/node');
const deno = require('logan-logger/deno');
const bun = require('logan-logger/bun');
const browser = require('logan-logger/browser');

if (typeof root.createLogger !== 'function' || typeof root.logger.info !== 'function') throw new Error('root CJS exports failed');
if (typeof node.createMorganStream !== 'function') throw new Error('node CJS exports failed');
if (typeof deno.createLogger !== 'function') throw new Error('deno CJS exports failed');
if (typeof bun.createLogger !== 'function') throw new Error('bun CJS exports failed');
if (typeof browser.BrowserLogger !== 'function') throw new Error('browser CJS exports failed');
`
  );

  await run('raw Node ESM', 'node', ['esm.mjs'], directory);
  await run('raw Node CJS', 'node', ['cjs.cjs'], directory);
}

async function verifyTsxConsumers() {
  const scenarios = [
    { name: 'tsx-4-23-1-cjs', packageType: null, packageName: 'tsx-old' },
    { name: 'tsx-4-23-1-esm', packageType: 'module', packageName: 'tsx-old' },
    { name: 'tsx-4-23-12-cjs', packageType: null, packageName: 'tsx-new' },
    { name: 'tsx-4-23-12-esm', packageType: 'module', packageName: 'tsx-new' },
  ];

  for (const scenario of scenarios) {
    const directory = path.join(consumerRoot, scenario.name);
    await mkdir(directory, { recursive: true });
    await writeConsumerFile(
      directory,
      'package.json',
      JSON.stringify({
        name: scenario.name,
        private: true,
        ...(scenario.packageType ? { type: scenario.packageType } : {}),
      })
    );
    await writeConsumerFile(
      directory,
      'index.ts',
      `
import { createLogger, logger } from 'logan-logger';
if (typeof createLogger !== 'function' || typeof logger.info !== 'function') throw new Error('tsx named imports failed');
`
    );

    await run(
      scenario.name,
      'node',
      [installedPath(scenario.packageName, 'dist', 'cli.mjs'), 'index.ts'],
      directory
    );
  }
}

async function verifyTsNodeConsumer() {
  const directory = path.join(consumerRoot, 'ts-node');
  await mkdir(directory, { recursive: true });
  await writeConsumerFile(
    directory,
    'package.json',
    JSON.stringify({ name: 'ts-node-consumer', private: true, type: 'module' })
  );
  await writeConsumerFile(
    directory,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2020',
      },
    })
  );
  await writeConsumerFile(
    directory,
    'index.ts',
    `
import { createLogger, logger } from 'logan-logger';
if (typeof createLogger !== 'function' || typeof logger.info !== 'function') throw new Error('ts-node named imports failed');
`
  );

  await run(
    'ts-node ESM',
    'node',
    [installedPath('ts-node', 'dist', 'bin-esm.js'), 'index.ts'],
    directory
  );
}

async function verifyViteConsumer() {
  const directory = path.join(consumerRoot, 'vite');
  await writeConsumerFile(directory, 'index.html', '<script type="module" src="/src.js"></script>');
  await writeConsumerFile(
    directory,
    'src.js',
    `
import { createLogger } from 'logan-logger';
import { createMorganStream } from 'logan-logger/node';
import { createLogger as createDenoLogger } from 'logan-logger/deno';
import { createLogger as createBunLogger } from 'logan-logger/bun';
import { BrowserLogger } from 'logan-logger/browser';
console.log(createLogger, createMorganStream, createDenoLogger, createBunLogger, BrowserLogger);
`
  );

  await run('Vite build', 'node', [installedPath('vite', 'bin', 'vite.js'), 'build'], directory);
}

async function verifyVitestConsumer() {
  const directory = path.join(consumerRoot, 'vitest');
  await writeConsumerFile(
    directory,
    'package.test.ts',
    `
import { expect, test } from 'vitest';
import { createLogger, logger } from 'logan-logger';
import { createMorganStream } from 'logan-logger/node';

test('package exports resolve', () => {
  expect(typeof createLogger).toBe('function');
  expect(typeof logger.info).toBe('function');
  expect(typeof createMorganStream).toBe('function');
});
`
  );

  await run(
    'Vitest',
    'node',
    [installedPath('vitest', 'vitest.mjs'), 'run', 'package.test.ts'],
    directory
  );
}

async function verifyWebpackConsumer() {
  const directory = path.join(consumerRoot, 'webpack');
  await writeConsumerFile(
    directory,
    'src.js',
    `
import { createLogger } from 'logan-logger';
import { BrowserLogger } from 'logan-logger/browser';
console.log(createLogger, BrowserLogger);
`
  );
  await writeConsumerFile(
    directory,
    'webpack.config.cjs',
    `
const path = require('node:path');
module.exports = {
  mode: 'production',
  target: 'node',
  entry: './src.js',
  output: { path: path.resolve(__dirname, 'dist'), filename: 'bundle.js' },
};
`
  );

  await run(
    'Webpack build',
    'node',
    [installedPath('webpack-cli', 'bin', 'cli.js'), '--config', 'webpack.config.cjs'],
    directory
  );
}

await mkdir(packDir, { recursive: true });
await mkdir(consumerRoot, { recursive: true });

try {
  await run('pack library', 'pnpm', ['pack', '--pack-destination', packDir], repoRoot);

  const tarballPath = path.join(packDir, `logan-logger-${packageJson.version}.tgz`);

  await writeConsumerFile(
    consumerRoot,
    'package.json',
    JSON.stringify({ name: 'logan-logger-package-consumers', private: true })
  );

  await run(
    'install packed library and runner matrix',
    'pnpm',
    [
      'add',
      '--allow-build=esbuild',
      tarballPath,
      'tsx-old@npm:tsx@4.23.1',
      'tsx-new@npm:tsx@4.23.12',
      'ts-node@10.9.2',
      'typescript@5.9.3',
      'vite@8.2.2',
      'vitest@4.1.0',
      'webpack@5.109.2',
      'webpack-cli@7.2.2',
      'winston@3.17.0',
    ],
    consumerRoot
  );

  await verifyNodeConsumers();
  await verifyTsxConsumers();
  await verifyTsNodeConsumer();
  await verifyViteConsumer();
  await verifyVitestConsumer();
  await verifyWebpackConsumer();
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
