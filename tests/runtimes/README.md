# Runtime fixture harness

Run the complete pinned Docker matrix with `just test-runtimes`. See
[runtime-testing.md](../../docs/runtime-testing.md) for prerequisites and CI usage.

The shared engine runs inside each runtime: Node 22.12/24/26, Bun, Deno, and
Chromium/Firefox/WebKit through Playwright. The native CLI imports the built
public `/node`, `/bun`, or `/deno` entry; browsers load `/browser` over HTTP.
The runtime identity is verified before the fixture clock/runtime seam is used.

## Coverage and fixture ownership

`treering-manifest.json` pins the complete upstream fixture file hashes and
classifies every case in `fixtures-v0.1.4`. It selects 57 shared cases:

- 10 envelope cases, 8 context cases, 6 level cases, and the no-implicit-redaction
  case exercise logger creation and actual console output or public logger state.
- 14 serialization cases and 18 explicit-redaction cases exercise public utility
  exports in each runtime.

The other 72 upstream cases remain covered by the existing full Node conformance
suite. They cover configuration sources, environment/file loading, string parsing,
and detailed transport/resource ownership. This is a coverage boundary, **not** a
claim that those capabilities are unsupported or tested in the other runtimes.
The runtime report names that count `retainedInExistingNodeSuite`; it never counts
those cases as cross-runtime passes or unexpected skips.

`output-fixtures.json` adds public-output regressions for configuration and
transport behavior, including CSS console arguments only in browsers and ANSI
output only in terminal runtimes. There are 13 definitions and 12 applicable cases
per runtime. Together each target executes 69 cases. Adding an upstream fixture,
changing pinned bytes, introducing pending cases, or leaving an expectation
unchecked fails the runner. Missing fixtures also fail instead of skipping.

## Deterministic values

The engine uses the existing internal symbol seam for fixed timestamps and the
fixture's declared record runtime. That does not replace the actual JavaScript
runtime or alter its APIs. Tests capture the arguments passed to real runtime
console methods; the engine never formats captured log entries to manufacture
expected console output.

The existing Treering value DSL constructs native cycles, callables, errors,
symbols, and big integers. Error construction retains a real native Error and its
captured stack. Fresh native Errors in Bun and WebKit contain engine diagnostic
properties such as line/sourceURL; the DSL removes incidental own properties
before adding the exact custom properties requested by `$error.props`. Explicit
properties with those same names remain intact and are tested in every runtime.
The only output normalization is the Treering contract's `<STACK>` substitution;
serialized fields and console arguments are never removed or rewritten.

The TypeScript engine and existing DSL are transpiled to ignored `.built/` ESM by
`node tests/runtimes/build.mjs`, so Node's minimum supported version and browsers
execute the same code without a runtime transpiler. The isolated tooling package
locks Playwright to the exact version of the Docker browser image and does not
add runtime dependencies to the published logger.
