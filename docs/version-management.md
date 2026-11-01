# Version management

The release workflow computes versions from strict `v<major>.<minor>.<patch>`
tags and commit messages. It updates **both** `package.json` and `deno.json`,
checks the project, and commits the synchronized versions before tagging.

## Automatic patch and minor releases

A push to `main` or a `<major>.x` maintenance branch starts
[Auto Release](../.github/workflows/auto-release.yml). A push containing only
`.github/**` and `docs/**` changes is skipped. README changes are published.
Release-bot version commits are skipped to prevent recursion.

| Commit subject or body since the last release | Result |
|---|---|
| `feat:` or `feat(scope):` | Minor release |
| `fix:`, `chore:`, or other messages | Patch release |
| Any conventional type with `!:`; `BREAKING CHANGE:` or `BREAKING-CHANGE:` footer | Publishing fails before any version commit or tag |

Inspect all commit subjects **and bodies** before merging. An accidental marker
must be corrected in the release history; a genuine breaking change requires
the explicit process below. Removing a marker does not make an incompatible
change safe for an automatic release.

The default branch starts from the highest valid release tag in the repository,
including tags unreachable from its current HEAD. Maintenance branches use only
tags from their own major. The tag major must match the checked-in manifests;
manually changing a manifest major or pushing a higher-major tag cannot authorize
an automatic major release. An untagged project can bootstrap from `0.0.0` only.

## Intentional major releases

After reviewing and merging the breaking change:

1. Open **Actions → Auto Release → Run workflow**.
2. Select the repository default branch (`main`).
3. Enter the exact next major version, such as `3.0.0` when the current release
   line is `2.x`. Do not include a `v` prefix.
4. Run the workflow and verify the npm, JSR, and GitHub release jobs succeed.

The dispatch is the explicit authorization to publish a major. It refuses tag
refs, maintenance branches, skipped majors, minor/patch inputs, stale commits,
existing tags, and mismatched manifest versions. It works even if the previous
push was blocked by a breaking marker or contained only documentation changes.

Runs on the same branch serialize through publication. The workflow rechecks
the selected source and version after verification, then atomically pushes only
its release commit and specific tag. Registry publication and GitHub release
creation independently verify the pushed tag, both versions, the source commit,
and whether the event authorized a major release.

## Local version tools

`just version` and `just versions` inspect versions. `just version-sync` copies
the package version into `deno.json` locally.

Legacy `just bump-*` recipes create version commits and tags; `just release-*`
also push them. They do **not** invoke the publishing workflow for a skipped
release-bot commit or a tag push. Use the workflow above for releases; do not
combine local bump/tag recipes with automatic version selection.

For older release lines, see [maintenance releases](./maintenance-releases.md).
For registry configuration, see [publishing setup](./auto-publishing-setup.md).
