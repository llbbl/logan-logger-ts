import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// The workflow runs dependency-free JavaScript on the supported Node floor.
import { collectSnapshot, determineRelease, verifyReleaseTag } from '../scripts/release-policy.mjs';

const sha = 'a'.repeat(40);
const fixture = (overrides: Record<string, unknown> = {}) => ({
  eventName: 'push',
  ref: 'refs/heads/main',
  branch: 'main',
  defaultBranch: 'main',
  headSha: sha,
  remoteHeadSha: sha,
  eventSha: sha,
  packageVersion: '2.5.6',
  denoVersion: '2.5.6',
  requestedVersion: '',
  tags: ['v1.9.9', 'v2.5.6'],
  commits: 'fix: preserve log output\n\nSome details.',
  ...overrides,
});

describe('release policy', () => {
  it.each([
    ['fix: repair formatting', 'v2.5.7'],
    ['chore(deps): update tooling', 'v2.5.7'],
    ['feat: add output', 'v2.6.0'],
    ['feat(browser): add output\n\nfix: repair formatting', 'v2.6.0'],
  ])('selects the automatic version for %s', (commits, next) => {
    expect(determineRelease(fixture({ commits }))).toMatchObject({
      next,
      channel: 'latest',
      is_default: 'true',
    });
  });

  it.each([
    'feat!: remove an API',
    'chore!: update tooling',
    'fix(browser)!: change format',
    'refactor: cleanup\n\nBREAKING CHANGE: rename field',
    'docs: explain\n\nBREAKING-CHANGE: change semantics',
  ])('refuses automatic publishing for %s on every release branch', (commits) => {
    expect(() => determineRelease(fixture({ commits }))).toThrow(/Breaking-change markers/);
    expect(() =>
      determineRelease(fixture({ commits, branch: '2.x', ref: 'refs/heads/2.x' }))
    ).toThrow(/Breaking-change markers/);
  });

  it('uses the highest strict semver tag, including tags unreachable from HEAD', () => {
    expect(
      determineRelease(
        fixture({
          tags: ['v2.5.6', 'v2.9.9', 'v2.10.0', 'v99.1.0-beta', 'v98.1.0extra', 'v03.0.0'],
        })
      )
    ).toMatchObject({ latest: 'v2.10.0', next: 'v2.10.1' });
  });

  it('keeps maintenance releases on their major and npm channel', () => {
    expect(
      determineRelease(
        fixture({
          branch: '1.x',
          ref: 'refs/heads/1.x',
          packageVersion: '1.9.8',
          denoVersion: '1.9.8',
        })
      )
    ).toMatchObject({ latest: 'v1.9.9', next: 'v1.9.10', channel: 'v1-lts', is_default: 'false' });
  });

  it('bootstraps an untagged zero-major project without an automatic major', () => {
    expect(
      determineRelease(fixture({ tags: [], packageVersion: '0.0.0', denoVersion: '0.0.0' }))
    ).toMatchObject({ next: 'v0.0.1' });
  });

  it('allows exactly the confirmed next major via explicit dispatch', () => {
    expect(
      determineRelease(
        fixture({
          eventName: 'workflow_dispatch',
          requestedVersion: '3.0.0',
          commits: 'feat!: remove API',
        })
      )
    ).toMatchObject({ next: 'v3.0.0', version: '3.0.0', channel: 'latest', source_sha: sha });
  });

  it.each([
    { eventName: 'pull_request' },
    { ref: 'refs/tags/main' },
    { remoteHeadSha: 'b'.repeat(40) },
    { eventSha: 'b'.repeat(40) },
    { headSha: '' },
    { branch: 'feature', ref: 'refs/heads/feature' },
    { branch: '02.x', ref: 'refs/heads/02.x' },
    { packageVersion: '3.0.0', denoVersion: '3.0.0' },
    { tags: ['v2.5.6', 'v3.0.0'] },
    { denoVersion: '2.5.5' },
    { tags: [] },
    { tags: [null] },
    { branch: '1.x', ref: 'refs/heads/1.x', tags: ['v2.5.6'] },
    { requestedVersion: '3.0.0' },
    { eventName: 'workflow_dispatch', requestedVersion: '' },
    { eventName: 'workflow_dispatch', requestedVersion: 'v3.0.0' },
    { eventName: 'workflow_dispatch', requestedVersion: '4.0.0' },
    { eventName: 'workflow_dispatch', requestedVersion: '2.6.0' },
    {
      eventName: 'workflow_dispatch',
      requestedVersion: '3.0.0',
      branch: '2.x',
      ref: 'refs/heads/2.x',
    },
    { eventName: 'workflow_dispatch', requestedVersion: '3.0.0', tags: ['v2.5.6', 'v3.0.0'] },
  ])('fails closed for an invalid release snapshot %j', (overrides) => {
    expect(() => determineRelease(fixture(overrides))).toThrow();
  });

  it('collects full commit bodies only from the chosen maintenance baseline', () => {
    const commands: string[][] = [];
    const responses: Record<string, string> = {
      'rev-parse HEAD': sha,
      'ls-remote --exit-code origin refs/heads/1.x': `${sha}\trefs/heads/1.x\n`,
      'tag --list': 'v1.9.9\nv2.5.6\n',
      'show HEAD:package.json': '{"version":"1.9.8"}',
      'show HEAD:deno.json': '{"version":"1.9.8"}',
      'log v1.9.9..HEAD --pretty=format:%s%n%b': 'fix: safe subject\n\nBREAKING CHANGE: body',
    };
    const snapshot = collectSnapshot(
      {
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF: 'refs/heads/1.x',
        GITHUB_REF_NAME: '1.x',
        GITHUB_SHA: sha,
      },
      { repository: { default_branch: 'main' } },
      (args: string[]) => {
        commands.push(args);
        const response = responses[args.join(' ')];
        if (response === undefined) throw new Error(`Unexpected command: ${args.join(' ')}`);
        return response;
      }
    );
    expect(commands.at(-1)).toEqual(['log', 'v1.9.9..HEAD', '--pretty=format:%s%n%b']);
    expect(() => determineRelease(snapshot)).toThrow(/Breaking-change markers/);
  });
});

describe('published release tag boundary', () => {
  const artifact = (overrides: Record<string, unknown> = {}) => ({
    eventName: 'push',
    ref: 'refs/heads/main',
    branch: 'main',
    defaultBranch: 'main',
    sourceSha: sha,
    parentShas: [sha],
    headSha: 'b'.repeat(40),
    tagCommitSha: 'b'.repeat(40),
    sourceVersion: '2.5.6',
    tag: 'v2.5.7',
    packageVersion: '2.5.7',
    denoVersion: '2.5.7',
    requestedVersion: '',
    ...overrides,
  });
  it('accepts a patch tag directly after the chosen source', () => {
    expect(verifyReleaseTag(artifact())).toBe(true);
  });
  it('accepts only a confirmed next-major artifact for a dispatch', () => {
    expect(
      verifyReleaseTag(
        artifact({
          eventName: 'workflow_dispatch',
          requestedVersion: '3.0.0',
          tag: 'v3.0.0',
          packageVersion: '3.0.0',
          denoVersion: '3.0.0',
        })
      )
    ).toBe(true);
  });
  it.each([
    { tag: 'v3.0.0', packageVersion: '3.0.0', denoVersion: '3.0.0' },
    { tag: 'v2.5.8' },
    { denoVersion: '2.5.8' },
    { parentShas: ['c'.repeat(40)] },
    { parentShas: [sha, 'c'.repeat(40)] },
    { tagCommitSha: 'c'.repeat(40) },
    { eventName: 'push', requestedVersion: '3.0.0' },
    { eventName: 'workflow_dispatch', requestedVersion: '2.5.7' },
    { ref: 'refs/tags/main' },
    { branch: 'feature', ref: 'refs/heads/feature' },
    { branch: '1.x', ref: 'refs/heads/1.x' },
    {
      eventName: 'workflow_dispatch',
      requestedVersion: '3.0.0',
      branch: '2.x',
      ref: 'refs/heads/2.x',
    },
  ])('refuses an unauthorized or mismatched pushed artifact %j', (overrides) => {
    expect(() => verifyReleaseTag(artifact(overrides))).toThrow();
  });
});

describe('release policy CLI', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0))
      rmSync(directory, { recursive: true, force: true });
  });
  const invoke = (snapshot: unknown, extraEnv: Record<string, string> = {}) => {
    const directory = mkdtempSync(join(tmpdir(), 'logger-release-policy-'));
    directories.push(directory);
    const outputFile = join(directory, 'output');
    writeFileSync(outputFile, 'existing=value\n');
    const result = spawnSync(process.execPath, ['./scripts/release-policy.mjs', '--snapshot'], {
      cwd: process.cwd(),
      input: JSON.stringify(snapshot),
      encoding: 'utf8',
      env: { ...process.env, EXPECTED_RELEASE_TAG: '', ...extraEnv, GITHUB_OUTPUT: outputFile },
    });
    return { ...result, output: readFileSync(outputFile, 'utf8') };
  };

  it('writes the actual Actions output contract only after a valid selection', () => {
    const result = invoke(fixture());
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      `latest=v2.5.6\nchannel=latest\nis_default=true\nnext=v2.5.7\nversion=2.5.7\nsource_sha=${sha}\n`
    );
    expect(result.output).toBe(`existing=value\n${result.stdout}`);
  });

  it.each([
    [fixture({ commits: 'chore!: accidental marker' }), {}],
    [fixture({ eventName: 'workflow_dispatch', requestedVersion: '4.0.0' }), {}],
    [fixture(), { EXPECTED_RELEASE_TAG: 'v2.5.8' }],
    [{}, {}],
  ])('exits nonzero and leaves outputs untouched on failure', (snapshot, env) => {
    const result = invoke(snapshot, env);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('::error::');
    expect(result.output).toBe('existing=value\n');
  });
});
