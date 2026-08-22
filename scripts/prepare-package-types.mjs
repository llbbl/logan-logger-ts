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

async function writeDeclarationVariant(filePath, declarationExtension, runtimeExtension) {
  const content = await readFile(filePath, 'utf8');
  const targetPath = filePath.replace(/\.d\.ts$/, declarationExtension);
  await writeFile(targetPath, rewriteRelativeSpecifiers(content, runtimeExtension));
}

const declarationFiles = (await walk(distDir)).filter((filePath) => filePath.endsWith('.d.ts'));

await Promise.all(
  declarationFiles.flatMap((filePath) => [
    writeDeclarationVariant(filePath, '.d.mts', '.mjs'),
    writeDeclarationVariant(filePath, '.d.cts', '.cjs'),
  ])
);
