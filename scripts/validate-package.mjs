import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'logan-logger-validation-'));
const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));

function localBinary(name) {
  return path.join(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${name}.cmd` : name
  );
}

async function run(command, args) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: repoRoot,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

try {
  await run(localBinary('publint'), ['--pack', 'pnpm']);
  await run('pnpm', ['pack', '--pack-destination', tempRoot]);

  const tarballPath = path.join(tempRoot, `logan-logger-${packageJson.version}.tgz`);
  await run(localBinary('attw'), [tarballPath, '--format', 'table']);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
