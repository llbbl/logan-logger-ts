import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const METHODS = new Set(['node', 'bun', 'deno', 'browser']);

export function classifyFixtureSuites(suites, classifications) {
  const cases = [];
  const excluded = [];
  const seen = new Set();
  for (const suite of suites) {
    if (!Array.isArray(suite.cases) || typeof suite.suite !== 'string')
      throw new Error('Invalid fixture suite');
    for (const testCase of suite.cases) {
      if (typeof testCase.id !== 'string' || seen.has(testCase.id))
        throw new Error(`Missing or duplicate fixture id ${String(testCase.id)}`);
      seen.add(testCase.id);
      const classification = classifications[testCase.id];
      if (!classification) throw new Error(`Unclassified fixture ${testCase.id}`);
      if (testCase.pending)
        throw new Error(
          `Unexpected pending fixture ${testCase.id}; explicitly review applicability`
        );
      if (classification.scope === 'shared') cases.push({ ...testCase, suite: suite.suite });
      else if (classification.scope === 'existing-node-suite' && classification.reason)
        excluded.push({ id: testCase.id, reason: classification.reason });
      else throw new Error(`Invalid classification for ${testCase.id}`);
    }
  }
  const missing = Object.keys(classifications).filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`Pinned fixture IDs missing: ${missing.join(', ')}`);
  return { cases, excluded, seen };
}

export function argumentsFor(args, allowed) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/, '');
    const value = args[index + 1];
    if (
      !args[index]?.startsWith('--') ||
      !allowed.includes(key) ||
      !value ||
      value.startsWith('--') ||
      parsed[key]
    ) {
      throw new Error(
        `Invalid arguments; expected ${allowed.map((name) => `--${name} <value>`).join(' ')}`
      );
    }
    parsed[key] = value;
  }
  return parsed;
}

/** Validate the complete pinned set before selecting the portable cases. */
export async function loadRuntimeFixtures(directory) {
  if (!directory)
    throw new Error('TREERING_FIXTURES or --fixtures is required; missing fixtures must fail');
  const manifest = JSON.parse(
    await readFile(new URL('./treering-manifest.json', import.meta.url), 'utf8')
  );
  const expectedFiles = Object.keys(manifest.files).sort();
  const actualFiles = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles))
    throw new Error('Treering fixture file set differs from the pinned manifest');
  const suites = [];
  for (const filename of expectedFiles) {
    const raw = await readFile(resolve(directory, filename));
    if (createHash('sha256').update(raw).digest('hex') !== manifest.files[filename]) {
      throw new Error(
        `Treering ${filename} differs from ${manifest.tag}; review fixture changes and update the manifest deliberately`
      );
    }
    suites.push(JSON.parse(raw));
  }
  const { cases, excluded, seen } = classifyFixtureSuites(suites, manifest.cases);
  if (cases.length !== 57 || excluded.length !== 72)
    throw new Error('Runtime fixture scope changed unexpectedly');
  const outputs = JSON.parse(
    await readFile(new URL('./output-fixtures.json', import.meta.url), 'utf8')
  );
  if (!Array.isArray(outputs) || !outputs.length)
    throw new Error('Public-output fixtures are missing');
  for (const testCase of outputs) {
    if (!testCase.id || seen.has(testCase.id))
      throw new Error(`Missing or duplicate output fixture id ${String(testCase.id)}`);
    seen.add(testCase.id);
    if (
      !Array.isArray(testCase.runtimes) ||
      !testCase.runtimes.length ||
      testCase.runtimes.some((name) => !METHODS.has(name))
    ) {
      throw new Error(`Invalid runtime applicability for ${testCase.id}`);
    }
    if (!testCase.input || !testCase.expect)
      throw new Error(`Invalid output fixture ${testCase.id}`);
  }
  return { cases, outputs, excluded, tag: manifest.tag };
}

export function printReport(label, payload, results) {
  const failures = results.filter((result) => result.status === 'failed');
  for (const result of results) {
    console.log(`[${label}] ${result.status === 'passed' ? 'PASS' : 'FAIL'} ${result.id}`);
    for (const error of result.errors) console.error(`[${label}] ${result.id}: ${error}`);
  }
  console.log(
    JSON.stringify({
      runtime: label,
      fixtures: payload.tag,
      passed: results.length - failures.length,
      failed: failures.length,
      treeringShared: payload.cases.length,
      publicOutput: results.length - payload.cases.length,
      retainedInExistingNodeSuite: payload.excluded.length,
      unexpectedSkips: 0,
    })
  );
  return failures.length === 0;
}
