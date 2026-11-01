# Publishing setup for npm and JSR

[Auto Release](../.github/workflows/auto-release.yml) publishes npm
`logan-logger`, JSR `@logan/logger`, and a GitHub release. Pushes to `main` and
`<major>.x` branches select patch or minor versions automatically. Major releases
require a manual workflow dispatch with the exact next-major confirmation.
See [version management](./version-management.md) for the operator procedure.

## Registry configuration

The workflow requests GitHub Actions OIDC credentials through `id-token: write`.
Configure npm trusted publishing for this repository and `auto-release.yml`,
and link the JSR package to this GitHub repository. Normal releases use OIDC;
the workflow does not read `NPM_TOKEN` or `JSR_TOKEN` secrets.

`contents: write` permits the version job to push the release commit and tag,
and the release job to create a GitHub release. Repository branch/tag rules must
allow this authorized workflow path.

## Pipeline

1. Check out the triggering commit with all release tags. Confirm it is still
   the remote branch HEAD, and compute the version using
   `scripts/release-policy.mjs`.
2. Install using the pinned pnpm version and frozen lockfile. Update
   `package.json` and `deno.json` together; type-check, lint, and test.
3. Refresh tags and revalidate the source/version. Atomically push the scoped
   version commit and its specific annotated tag. A stale branch or tag collision
   rejects both ref updates.
4. Check out and independently validate the pushed tag before publication.
   Build with `pnpm build`, then publish npm with provenance and an explicit
   npm dist-tag. Publish JSR with `pnpx jsr publish`.
5. Independently validate the tag before creating the GitHub release with
   generated notes.

npm ships `dist/`, README, and LICENSE. JSR uses `deno.json` and publishes
TypeScript source from `src/`, README, and LICENSE. Both manifests carry the same
committed version; there is no separate `jsr.json` or `publish:jsr` script.

The default branch uses npm `latest` and marks its GitHub release Latest.
Maintenance branches use npm `v<major>-lts` and do not replace the latest GitHub
release. JSR resolves versions by semver; see
[maintenance releases](./maintenance-releases.md).

## Diagnosing a failed release

Start with the failed job's log in Actions. Breaking markers, an incorrect manual
confirmation, a stale source, inconsistent manifest versions, or an existing tag
fail before publishing. A branch update while checks run requires a fresh run
against the new HEAD.

A registry failure after the tag push may leave a partially published release.
Inspect npm, JSR, and the existing tag before attempting recovery; do not bump or
republish blindly. Removing a version check or publishing an unchanged version
is not a recovery procedure.
