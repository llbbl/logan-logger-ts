import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(scriptDir, '..', 'dist');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(filePath)));
    } else {
      files.push(filePath);
    }
  }

  return files;
}

function rewriteRelativeSpecifiers(content, runtimeExtension) {
  return content.replace(
    /((?:from\s+|import\s*\()\s*)(['"])(\.{1,2}\/[^'"]+)\2(\s*\)?)/g,
    (match, prefix, quote, specifier, suffix) => {
      if (/\.(?:[cm]?js|json|node)$/.test(specifier)) {
        return match;
      }

      return `${prefix}${quote}${specifier}${runtimeExtension}${quote}${suffix}`;
    }
  );
}

// tsc keeps src/'s `.ts` specifiers: TS < 5.0 consumers reject them, and the
// .d.mts/.d.cts variants would get './x.ts.mjs'. rewriteRelativeImportExtensions
// does not apply to declarations.
function stripTsExtensions(content) {
  return content.replace(/from ['"](.+?)\.ts['"]/g, "from '$1'");
}

async function prepareDeclaration(filePath) {
  const content = stripTsExtensions(await readFile(filePath, 'utf8'));
  await Promise.all([
    writeFile(filePath, content),
    writeFile(filePath.replace(/\.d\.ts$/, '.d.mts'), rewriteRelativeSpecifiers(content, '.mjs')),
    writeFile(filePath.replace(/\.d\.ts$/, '.d.cts'), rewriteRelativeSpecifiers(content, '.cjs')),
  ]);
}

const declarationFiles = (await walk(distDir)).filter((filePath) => filePath.endsWith('.d.ts'));

await Promise.all(declarationFiles.map(prepareDeclaration));
