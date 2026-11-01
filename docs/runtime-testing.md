# Runtime fixture validation

Run the runtime fixture matrix with Docker Engine and Compose (or Docker
Desktop) running:

```sh
just test-runtimes
```

The equivalent command without `just` is:

```sh
./scripts/test-runtimes.sh
```

No local Node, Bun, Deno, browser installation, dependency installation, or
sibling Treering clone is needed. The first run downloads the pinned images
and build dependencies. Later runs reuse Docker's build cache.

## What runs

| Target | Runtime |
|---|---|
| `node22` | Node 22.12.0, the package's supported floor |
| `node24` | Node 24.13.0 |
| `node26` | Node 26.0.0 |
| `bun` | Bun 1.4.0 |
| `deno` | Deno 2.6.9 |
| `browsers` | Chromium, Firefox and WebKit from Playwright 1.64.1 |

The image tags and manifest digests are pinned in `Dockerfile.runtimes`.
The Playwright dependency and image use the same exact version. Each target
loads the actual built public entry for its runtime. The browser target runs
the browser entry inside real browser engines, with its fixture assertions
executing in the page.

All targets run even if another target fails. The command exits unsuccessfully
if any target fails. CI runs the same command and retains its combined output
as the `runtime-fixture-results` artifact.

## Fixtures and coverage

The image build downloads the immutable Treering commit corresponding to
`fixtures-v0.1.4` and verifies the archive's SHA-256 checksum. It also verifies
that this tag agrees with the existing Treering checkout pin in CI. A missing
fixture archive, checksum mismatch, missing fixture file, or unaccounted-for
fixture case fails validation.

The shared runner exercises portable Treering cases and additional public
console-output cases for formatting, timestamps, destinations and browser CSS
arguments. Its coverage manifest explicitly identifies cases retained in the
full Node conformance suite; those cases are not reported as runtime passes.
The full Node suite remains available with `just conformance` and runs in CI.

Expected and actual output are compared using fixed clocks and explicit
runtime labels. Console output is captured at the runtime boundary so tests
exercise the logger's formatting and routing. Runtime-only functionality, such
as filesystem configuration and file transports, remains covered by the
corresponding Node tests rather than being simulated in a browser.

## Updating the pins

When adopting new Treering fixtures, update CI's conformance `ref`, the Docker
fixture tag/commit/archive checksum, and the runner's coverage manifest and
fixture hashes together. Review new cases for applicability to every runtime.

When updating Playwright, update both the test-tool dependency and Docker image
to the same version. Runtime image updates should retain exact version tags
and manifest digests. Run the complete matrix after either kind of update.

To force a new image build for diagnostics, run:

```sh
docker compose -f ./compose.runtimes.yaml build --no-cache
./scripts/test-runtimes.sh
```
