import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveRepositoryContext } from './metadata.js';

const revision = 'a'.repeat(40);
const githubRevision = 'b'.repeat(40);
const localRevision = 'c'.repeat(40);
const headRevision = 'd'.repeat(40);
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'proofline-metadata-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('resolveRepositoryContext', () => {
  it('uses complete explicit metadata before environment or Git', async () => {
    const result = await resolveRepositoryContext({
      workspace: '/workspace',
      repository: 'explicit/repository',
      revision,
      env: {
        GITHUB_REPOSITORY: 'github/repository',
        GITHUB_SHA: githubRevision,
      },
      runGit: () => Promise.reject(new Error('Git must not run')),
    });

    expect(result).toEqual({ repository: 'explicit/repository', revision });
  });

  it('uses GitHub metadata before local Git and reads pull-request head SHA', async () => {
    const workspace = await temporaryDirectory();
    const eventPath = join(workspace, 'event.json');
    await writeFile(
      eventPath,
      JSON.stringify({ pull_request: { head: { sha: headRevision } } }),
    );

    const result = await resolveRepositoryContext({
      workspace,
      env: {
        GITHUB_REPOSITORY: 'github/repository',
        GITHUB_SHA: githubRevision,
        GITHUB_EVENT_PATH: eventPath,
      },
      runGit: () => Promise.reject(new Error('Git must not run')),
    });

    expect(result).toEqual({
      repository: 'github/repository',
      revision: githubRevision,
      headRevision,
    });
  });

  it.each([
    ['https://github.com/acme/checkout.git', 'acme/checkout'],
    ['git@github.com:acme/checkout.git', 'acme/checkout'],
    ['ssh://git@github.com/acme/checkout.git', 'acme/checkout'],
  ])('normalizes local Git origin %s', async (origin, repository) => {
    const result = await resolveRepositoryContext({
      workspace: '/workspace',
      env: {},
      runGit: (args) => {
        if (args.join(' ') === 'remote get-url origin') {
          return Promise.resolve(origin);
        }
        if (args.join(' ') === 'rev-parse HEAD') {
          return Promise.resolve(localRevision);
        }
        return Promise.reject(new Error('unexpected Git arguments'));
      },
    });

    expect(result).toEqual({ repository, revision: localRevision });
  });

  it.each([
    { repository: 'explicit/repository', revision: 'main', env: {} },
    {
      env: { GITHUB_REPOSITORY: 'github/repository', GITHUB_SHA: 'main' },
    },
  ])('rejects a non-immutable revision %#', async (metadata) => {
    await expect(
      resolveRepositoryContext({
        workspace: '/workspace',
        ...metadata,
        runGit: () => Promise.reject(new Error('Git must not run')),
      }),
    ).rejects.toThrow('lowercase 40-character hexadecimal revision');
  });

  it('rejects incomplete explicit metadata instead of mixing sources', async () => {
    await expect(
      resolveRepositoryContext({
        workspace: '/workspace',
        repository: 'explicit/repository',
        env: {
          GITHUB_REPOSITORY: 'github/repository',
          GITHUB_SHA: githubRevision,
        },
        runGit: () => Promise.reject(new Error('Git must not run')),
      }),
    ).rejects.toThrow('repository and revision must be provided together');
  });

  it('rejects a non-GitHub origin', async () => {
    await expect(
      resolveRepositoryContext({
        workspace: '/workspace',
        env: {},
        runGit: (args) =>
          Promise.resolve(
            args[0] === 'remote'
              ? 'https://gitlab.com/acme/checkout.git'
              : localRevision,
          ),
      }),
    ).rejects.toThrow('GitHub origin');
  });
});
