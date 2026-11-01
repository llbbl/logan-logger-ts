import { mkdir, readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const directory = new URL('./.built/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [input, output] of [['../conformance/dsl.ts', 'dsl.mjs'], ['engine.ts', 'engine.mjs']]) {
  const source = await readFile(new URL(input, import.meta.url), 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    fileName: input,
    reportDiagnostics: true,
  });
  if (result.diagnostics?.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(result.diagnostics, {
    getCurrentDirectory: () => process.cwd(), getCanonicalFileName: name => name, getNewLine: () => '\n',
  }));
  const code = result.outputText.replaceAll('../conformance/dsl.ts', './dsl.mjs');
  await writeFile(new URL(output, directory), code);
}
