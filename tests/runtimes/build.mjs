import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';

// TypeScript 7 ships no JS compiler API, so transpile with vite's Oxc transform.
// Plain type stripping is not enough: dsl.ts uses a parameter property.
const directory = new URL('./.built/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [input, output] of [
  ['../conformance/dsl.ts', 'dsl.mjs'],
  ['engine.ts', 'engine.mjs'],
]) {
  const url = new URL(input, import.meta.url);
  const source = await readFile(url, 'utf8');
  const result = await transformWithOxc(source, fileURLToPath(url), {
    target: 'es2020',
    // Assignment semantics, and no @oxc-project/runtime helper import the runtime images lack.
    assumptions: { setPublicClassFields: true },
  });
  const code = result.code.replaceAll('../conformance/dsl.ts', './dsl.mjs');
  await writeFile(new URL(output, directory), code);
}
