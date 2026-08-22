import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** One case from a treering suite file. */
export interface ConformanceCase {
  id: string;
  description: string;
  spec_ref: string;
  pending?: boolean;
  pending_reason?: string;
  note?: string;
  input: Record<string, unknown>;
  expect: Record<string, unknown>;
}

/** One treering suite file. */
export interface ConformanceSuite {
  suite: string;
  spec: string;
  cases: ConformanceCase[];
}

export interface FixturesFound {
  found: true;
  /** Absolute path to the fixtures directory in use. */
  directory: string;
  /** Which of the search candidates matched, for the test output. */
  via: string;
  suites: ConformanceSuite[];
}

export interface FixturesMissing {
  found: false;
  /** Every candidate that was tried, in order, for the skip message. */
  searched: string[];
}

/**
 * Where the treering fixtures may live, in the order the brief specifies.
 *
 * `TREERING_FIXTURES` is what CI sets when it wants a path of its own;
 * `.treering/fixtures` is where the CI checkout lands; `../treering/fixtures`
 * is the sibling clone a contributor is likely to already have.
 */
function candidates(): { label: string; path: string }[] {
  const found: { label: string; path: string }[] = [];
  const fromEnvironment = process.env.TREERING_FIXTURES;

  if (fromEnvironment) {
    found.push({ label: `TREERING_FIXTURES=${fromEnvironment}`, path: resolve(fromEnvironment) });
  }

  found.push({ label: './.treering/fixtures', path: resolve(REPO_ROOT, '.treering', 'fixtures') });
  found.push({
    label: '../treering/fixtures',
    path: resolve(REPO_ROOT, '..', 'treering', 'fixtures'),
  });

  return found;
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function readSuite(path: string): ConformanceSuite {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as ConformanceSuite;

  if (!Array.isArray(parsed.cases)) {
    throw new Error(`${path} is not a treering suite: no 'cases' array`);
  }

  return parsed;
}

/**
 * Locate and load the treering fixtures.
 *
 * Absence is a normal outcome, not an error: a contributor without treering
 * checked out must still be able to run `pnpm test`. The caller turns a
 * {@link FixturesMissing} into a visible skip.
 * @returns The loaded suites, or the list of paths that were searched
 */
export function loadFixtures(): FixturesFound | FixturesMissing {
  const searched: string[] = [];

  for (const candidate of candidates()) {
    searched.push(candidate.label);

    if (!isDirectory(candidate.path)) {
      continue;
    }

    const files = readdirSync(candidate.path)
      .filter((name) => name.endsWith('.json'))
      .sort();

    if (files.length === 0) {
      continue;
    }

    return {
      found: true,
      directory: candidate.path,
      via: candidate.label,
      suites: files.map((name) => readSuite(join(candidate.path, name))),
    };
  }

  return { found: false, searched };
}
