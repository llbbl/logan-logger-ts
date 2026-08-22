import { describe, expect, it } from 'vitest';
import { UnsupportedTagError } from './dsl.ts';
import { executeCase } from './execute.ts';
import { type ConformanceCase, loadFixtures } from './fixtures.ts';

/**
 * Runs the treering conformance fixtures against this implementation.
 *
 * `fixtures/README.md` is the normative runner contract; the rules it imposes
 * and where they live here:
 *
 * - `expect.json` / `expect.text` are compared as **exact strings**, never
 *   structurally — field order is normative (SPEC §2.2), so a structural
 *   compare would not catch a violation.
 * - `<STACK>` is substituted for real stack text before comparing
 *   (`dsl.ts`, `applyStackPlaceholder`).
 * - `pending: true` cases are skipped and reported as skipped, never as passing.
 * - A case using a DSL tag with no TypeScript equivalent is skipped with a
 *   reason rather than given a fabricated substitute.
 * - Frozen `timestamp` and `runtime` are injected rather than read from the
 *   environment (`src/core/internal.ts`).
 *
 * With treering not checked out the whole suite skips loudly, so a contributor
 * without it can still run `pnpm test`.
 */
const fixtures = loadFixtures();

if (!fixtures.found) {
  const searched = fixtures.searched.join(', ');

  console.warn(
    `[conformance] treering fixtures not found — searched: ${searched}. ` +
      'Clone https://github.com/llbbl/treering as a sibling directory, or set ' +
      'TREERING_FIXTURES, to run the conformance suite.'
  );

  describe.skip(`treering conformance (fixtures not found; searched ${searched})`, () => {
    it('fixtures are available', () => {
      expect.unreachable();
    });
  });
} else {
  describe(`treering conformance (${fixtures.via})`, () => {
    for (const suite of fixtures.suites) {
      describe(`${suite.suite} (spec ${suite.spec})`, () => {
        for (const testCase of suite.cases) {
          register(suite.suite, testCase);
        }
      });
    }
  });
}

function register(suite: string, testCase: ConformanceCase): void {
  const title = `${testCase.id} — ${testCase.description} [${testCase.spec_ref}]`;

  if (testCase.pending) {
    // Reported as skipped, never as passing: a pending case documents intended
    // behavior the reference implementation is not claimed to exhibit.
    it.skip(`${title} (pending: ${testCase.pending_reason ?? 'no reason given'})`, () => {
      expect.unreachable();
    });

    return;
  }

  it(title, (context) => {
    let comparisons: ReturnType<typeof executeCase>;

    try {
      comparisons = executeCase(testCase, suite);
    } catch (error) {
      if (error instanceof UnsupportedTagError) {
        context.skip(`${error.message} — a substitute must not be fabricated`);
        return;
      }
      throw error;
    }

    // Before comparing anything, prove every expectation was actually checked.
    // A case whose `expect` key the runner does not handle would otherwise
    // report as a pass, which is exactly the outcome this suite exists to make
    // impossible.
    const discharged = new Set(comparisons.map((comparison) => comparison.expectKey));
    const unchecked = Object.keys(testCase.expect).filter((key) => !discharged.has(key));

    expect(unchecked, `${testCase.id} has expectations the runner never checked`).toEqual([]);
    expect(comparisons.length, `${testCase.id} produced no comparisons`).toBeGreaterThan(0);

    for (const comparison of comparisons) {
      expect(comparison.actual, `${testCase.id} · ${comparison.what}`).toBe(comparison.expected);
    }
  });
}
