import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const breakingPattern = /^(?:[a-zA-Z]+(?:\([^\r\n]+\))?!:|BREAKING[ -]CHANGE:)/m;

function parseVersion(value) {
  const match = typeof value === 'string' && versionPattern.exec(value);
  if (!match) throw new Error(`Invalid release version: ${String(value)}`);
  return match.slice(1).map(BigInt);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

/** Select a release baseline without trusting tag ordering or malformed tags. */
export function releaseBaseline(snapshot) {
  const { eventName, ref, branch, defaultBranch, headSha, remoteHeadSha } = snapshot;
  if (!['push', 'workflow_dispatch'].includes(eventName)) {
    throw new Error('Releases require a push or an explicit workflow dispatch.');
  }
  if (typeof branch !== 'string' || !branch || ref !== `refs/heads/${branch}`) {
    throw new Error('Releases require a branch ref; tag refs are refused.');
  }
  if (typeof defaultBranch !== 'string' || !defaultBranch) {
    throw new Error('The repository default branch is missing.');
  }
  if (
    !/^[0-9a-f]{40}$/.test(headSha ?? '') ||
    headSha !== remoteHeadSha ||
    headSha !== snapshot.eventSha
  ) {
    throw new Error('The release snapshot is stale or does not match the triggering commit.');
  }
  const isDefault = branch === defaultBranch;
  const line = /^(0|[1-9]\d*)\.x$/.exec(branch)?.[1];
  if (!isDefault && line === undefined)
    throw new Error('Release branch must be the default branch or <major>.x.');
  if (eventName === 'workflow_dispatch' && !isDefault) {
    throw new Error('An explicit major release is allowed only on the default branch.');
  }
  if (eventName === 'push' && snapshot.requestedVersion) {
    throw new Error('A push cannot authorize an explicit major release.');
  }
  const manifestVersion = parseVersion(snapshot.packageVersion);
  if (snapshot.packageVersion !== snapshot.denoVersion) {
    throw new Error('package.json and deno.json versions must agree before releasing.');
  }
  if (!Array.isArray(snapshot.tags) || snapshot.tags.some((tag) => typeof tag !== 'string')) {
    throw new Error('Release tags must be an array of strings.');
  }
  const candidates = snapshot.tags
    .filter((tag) => tag.startsWith('v') && versionPattern.test(tag.slice(1)))
    .map((tag) => ({ tag, version: parseVersion(tag.slice(1)) }))
    .filter(({ version }) => isDefault || version[0] === BigInt(line))
    .sort((left, right) => compareVersions(right.version, left.version));
  if (!isDefault && candidates.length === 0)
    throw new Error(`No release tag exists for maintenance branch ${branch}.`);
  const latest = candidates[0]?.tag ?? 'v0.0.0';
  const version = candidates[0]?.version ?? [0n, 0n, 0n];
  if (version[0] !== manifestVersion[0] || (!isDefault && manifestVersion[0] !== BigInt(line))) {
    throw new Error(
      'The release tag major must match both checked-in manifest versions and the branch line.'
    );
  }
  return {
    latest,
    version,
    channel: isDefault ? 'latest' : `v${line}-lts`,
    is_default: String(isDefault),
  };
}

/** Apply the policy to a complete immutable snapshot, before writing outputs. */
export function determineRelease(snapshot) {
  const baseline = releaseBaseline(snapshot);
  if (typeof snapshot.commits !== 'string')
    throw new Error('Commit subjects and bodies are required.');
  let [major, minor, patch] = baseline.version;
  if (snapshot.eventName === 'workflow_dispatch') {
    const expected = `${major + 1n}.0.0`;
    if (snapshot.requestedVersion !== expected) {
      throw new Error(`Explicit major release requires confirmation of exactly ${expected}.`);
    }
    major += 1n;
    minor = 0n;
    patch = 0n;
  } else {
    if (breakingPattern.test(snapshot.commits)) {
      throw new Error(
        'Breaking-change markers block automatic publishing. Review the change, then use the explicit major workflow when intentional.'
      );
    }
    if (/^feat(?:\([^\r\n]+\))?:/m.test(snapshot.commits)) {
      minor += 1n;
      patch = 0n;
    } else {
      patch += 1n;
    }
  }
  const version = `${major}.${minor}.${patch}`;
  const next = `v${version}`;
  // Independent final boundary: automatic releases cannot cross a major, even
  // if the bump selection above changes in the future.
  if (snapshot.eventName !== 'workflow_dispatch' && major !== baseline.version[0]) {
    throw new Error('An automatic release cannot change the major version.');
  }
  if (snapshot.tags.includes(next))
    throw new Error(`Tag ${next} already exists. Refusing to republish.`);
  return {
    latest: baseline.latest,
    channel: baseline.channel,
    is_default: baseline.is_default,
    next,
    version,
    source_sha: snapshot.headSha,
  };
}

/** Thin GitHub Actions adapter; dependencies are injectable for offline tests. */
export function collectSnapshot(env, event, git) {
  const snapshot = {
    eventName: env.GITHUB_EVENT_NAME,
    ref: env.GITHUB_REF,
    branch: env.GITHUB_REF_NAME,
    defaultBranch: event.repository?.default_branch,
    eventSha: env.GITHUB_SHA,
    requestedVersion: event.inputs?.version ?? '',
    headSha: git(['rev-parse', 'HEAD']).trim(),
    remoteHeadSha: git(['ls-remote', '--exit-code', 'origin', `refs/heads/${env.GITHUB_REF_NAME}`])
      .trim()
      .split(/\s+/)[0],
    tags: git(['tag', '--list']).split(/\r?\n/).filter(Boolean),
    packageVersion: JSON.parse(git(['show', 'HEAD:package.json'])).version,
    denoVersion: JSON.parse(git(['show', 'HEAD:deno.json'])).version,
  };
  const { latest } = releaseBaseline(snapshot);
  const range = snapshot.tags.includes(latest) ? [`${latest}..HEAD`] : [];
  // Both subjects and bodies matter: footer-only breaking changes must block.
  return { ...snapshot, commits: git(['log', ...range, '--pretty=format:%s%n%b']) };
}

/** Recheck the pushed artifact independently before registry/GitHub publication. */
export function verifyReleaseTag(snapshot) {
  const { eventName, ref, branch, defaultBranch, tag, sourceSha } = snapshot;
  if (!['push', 'workflow_dispatch'].includes(eventName) || ref !== `refs/heads/${branch}`) {
    throw new Error('Publication requires the original release branch event.');
  }
  const line = /^(0|[1-9]\d*)\.x$/.exec(branch)?.[1];
  if (!defaultBranch || (branch !== defaultBranch && line === undefined)) {
    throw new Error('Publication branch must be the default branch or <major>.x.');
  }
  if (
    !/^[0-9a-f]{40}$/.test(sourceSha ?? '') ||
    snapshot.parentShas?.length !== 1 ||
    snapshot.parentShas[0] !== sourceSha ||
    snapshot.tagCommitSha !== snapshot.headSha
  ) {
    throw new Error(
      'Release tag must point to a release commit directly after the selected source commit.'
    );
  }
  if (
    typeof tag !== 'string' ||
    tag !== `v${snapshot.packageVersion}` ||
    snapshot.packageVersion !== snapshot.denoVersion
  ) {
    throw new Error('Release tag and both published manifest versions must agree.');
  }
  const version = parseVersion(snapshot.packageVersion);
  const sourceVersion = parseVersion(snapshot.sourceVersion);
  if (eventName === 'workflow_dispatch') {
    if (
      branch !== defaultBranch ||
      snapshot.requestedVersion !== `${sourceVersion[0] + 1n}.0.0` ||
      snapshot.packageVersion !== snapshot.requestedVersion
    ) {
      throw new Error(
        'Published major version must match the explicit default-branch confirmation.'
      );
    }
  } else if (
    snapshot.requestedVersion ||
    version[0] !== sourceVersion[0] ||
    (line !== undefined && version[0] !== BigInt(line))
  ) {
    throw new Error('An automatically pushed tag cannot publish a different major version.');
  }
  return true;
}

export function main(args = process.argv.slice(2), env = process.env) {
  try {
    let snapshot;
    if (args.length === 3 && args[0] === '--verify-tag') {
      const [, tag, sourceSha] = args;
      const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
      const git = (argv) => execFileSync('git', argv, { encoding: 'utf8' }).trim();
      verifyReleaseTag({
        eventName: env.GITHUB_EVENT_NAME,
        ref: env.GITHUB_REF,
        branch: env.GITHUB_REF_NAME,
        defaultBranch: event.repository?.default_branch,
        requestedVersion: event.inputs?.version ?? '',
        tag,
        sourceSha,
        headSha: git(['rev-parse', 'HEAD']),
        tagCommitSha: git(['rev-parse', `refs/tags/${tag}^{commit}`]),
        parentShas: git(['rev-list', '--parents', '-n', '1', 'HEAD']).split(/\s+/).slice(1),
        sourceVersion: JSON.parse(git(['show', `${sourceSha}:package.json`])).version,
        packageVersion: JSON.parse(readFileSync('package.json', 'utf8')).version,
        denoVersion: JSON.parse(readFileSync('deno.json', 'utf8')).version,
      });
      process.stdout.write(`Verified release tag ${tag}.\n`);
      return 0;
    } else if (args.length === 1 && args[0] === '--snapshot') {
      snapshot = JSON.parse(readFileSync(0, 'utf8'));
    } else if (args.length === 0) {
      const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
      snapshot = collectSnapshot(env, event, (argv) =>
        execFileSync('git', argv, { encoding: 'utf8' })
      );
    } else {
      throw new Error(
        'Usage: node scripts/release-policy.mjs [--snapshot | --verify-tag TAG SOURCE_SHA]'
      );
    }
    const result = determineRelease(snapshot);
    if (env.EXPECTED_RELEASE_TAG && result.next !== env.EXPECTED_RELEASE_TAG) {
      throw new Error('Release selection changed during validation. Start a new release run.');
    }
    const output = Object.entries(result)
      .map(([key, value]) => `${key}=${value}\n`)
      .join('');
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, output);
    process.stdout.write(output);
    return 0;
  } catch (error) {
    process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
