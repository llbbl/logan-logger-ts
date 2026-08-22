# Maintenance releases

How to ship a patch on an older major after a new one has shipped.

## The model

| | Default branch (`main`) | Maintenance branch (`<major>.x`) |
|---|---|---|
| Version derived from | highest `vN.N.N` tag in the repo | highest `v<major>.*.*` tag |
| npm dist-tag | `latest` | `v<major>-lts` |
| JSR | becomes `latest` | does **not** become latest |
| GitHub release | marked "Latest" | not marked "Latest" |
| Major bump | allowed | **refused** |

A maintenance branch is named exactly `<major>.x` — `1.x`, `2.x`. Any other
non-default branch name is refused by the release workflow rather than guessed
at.

## Before the first hotfix on a line

**Check the branch is level with its newest tag.** The branch and the tag line
are two records of "where is 1.x", and they drift the moment a release ships
from `main` after the branch was cut.

```bash
git fetch --all --tags
git merge-base --is-ancestor v1.1.21 origin/1.x && echo "level" || echo "STALE"
git log --oneline origin/1.x..v1.1.21
```

If it is stale, fast-forward it before doing anything else:

```bash
git checkout 1.x && git merge --ff-only v1.1.21 && git push origin 1.x
```

This matters because the version number is computed from the **tag**, not the
branch. A branch sitting at `v1.1.20` while `v1.1.21` exists will publish the
next hotfix as `v1.1.22` — a number that implies it contains everything in
`v1.1.21`, while the code does not. Anyone on the 1.x line would silently lose
whatever `v1.1.21` fixed.

## Shipping a hotfix

1. Branch from the maintenance branch, not from `main`:
   ```bash
   git checkout 1.x && git pull --ff-only
   git checkout -b fix/1.x-something
   ```
2. Open the PR **against `1.x`**. CI runs there — `ci.yml` includes `*.x` in
   both its push and pull_request triggers.
3. Merge. `auto-release.yml` runs on the push to `1.x`, computes the next
   version from the `v1.*.*` tags only, tags it, and publishes.

### Commit message rules

The version bump is driven by the commit messages in the range since the last
tag on that line, same as `main`:

- `fix:` / anything else → patch
- `feat:` → minor
- `feat!:` or a `BREAKING CHANGE:` footer → **the workflow fails**

That last one is deliberate. A major bump on `1.x` would compute `2.0.0` and
collide with the live major. If a backport genuinely is breaking it does not
belong on a maintenance line; if it is not, drop the `!`.

Note that a backport can legitimately be a `feat:` — several of the fixes
queued for backport (#65, #67) change behaviour enough to warrant a minor rather
than a patch.

## How consumers get it

**npm** — maintenance releases publish under `v<major>-lts` and never touch
`latest`:

```bash
npm install logan-logger@v1-lts     # newest 1.x
npm install logan-logger            # newest overall, unaffected
```

Without the explicit `--tag`, `npm publish` assigns `latest` to whatever was
published most recently, so a 1.x hotfix would silently become the default
install for every consumer. The workflow always passes `--tag`.

**JSR** — nothing to do. JSR computes `latest` as the highest non-prerelease,
non-yanked version by semver; publication order has no influence. A range
specifier resolves to the highest version satisfying it:

```ts
import { createLogger } from 'jsr:@logan/logger@^1.1.0';  // newest 1.x
import { createLogger } from 'jsr:@logan/logger';          // newest overall
```

This is confirmed by JSR's own query (`api/src/db/sql_fragments.rs` in
`jsr-io/jsr`), by [jsr-io/jsr#1112](https://github.com/jsr-io/jsr/issues/1112)
recording why dist-tags were not adopted, and observably: `@hono/hono` reports
`4.13.3` as latest while holding twelve `4.9.x` versions, so the ordering is
semver-aware rather than lexicographic.

## Issues do not auto-close from this branch

GitHub only closes issues from commits merged into the **default** branch. A
`Closes #N` in a merge to `1.x` is inert — the issue stays open with no
indication that anything happened.

Close it by hand after the release lands, and say why in the comment so the
trail is not confusing later:

```bash
gh issue close <N> --comment "Backported in #<PR> and published as vX.Y.Z under v<major>-lts."
```

## What is not automated

- **Dependabot** targets the default branch only. A maintenance line does not
  get dependency PRs, which is usually what you want for a frozen branch.
- **Backporting** is manual. `git cherry-pick -x <sha>` from `main` keeps a
  reference to the original commit in the message.
- **Deciding what deserves a backport.** The bar should be security fixes and
  correctness bugs, not features.

## Related

- [#62](https://github.com/llbbl/logan-logger-ts/issues/62) — the issue this
  document closes, with the original analysis of each landmine
- [`version-management.md`](./version-management.md) — version bumping on `main`
- [`auto-publishing-setup.md`](./auto-publishing-setup.md) — the publish pipeline
