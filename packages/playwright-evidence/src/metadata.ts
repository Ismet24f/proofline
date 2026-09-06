import { readBoundedJson } from './safe-files.js';

const revisionPattern = /^[a-f0-9]{40}$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export interface RepositoryContextOptions {
  workspace: string;
  repository?: string;
  revision?: string;
  env: NodeJS.ProcessEnv;
  runGit(args: readonly string[]): Promise<string>;
}

function validateRevision(revision: string): string {
  const normalized = revision.trim();
  if (!revisionPattern.test(normalized)) {
    throw new Error(
      'revision must be a lowercase 40-character hexadecimal revision',
    );
  }
  return normalized;
}

function validateRepository(repository: string): string {
  const normalized = repository.trim();
  if (!repositoryPattern.test(normalized)) {
    throw new Error('repository must use owner/name format');
  }
  return normalized;
}

function normalizeGitHubOrigin(origin: string): string {
  const normalized = origin.trim().replace(/\/$/u, '');
  const scpMatch = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/u.exec(
    normalized,
  );
  if (scpMatch?.[1] !== undefined) {
    return validateRepository(scpMatch[1]);
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch (error) {
    throw new Error('origin must be a GitHub origin', { cause: error });
  }
  if (url.hostname !== 'github.com') {
    throw new Error('origin must be a GitHub origin');
  }
  const repository = url.pathname.replace(/^\//u, '').replace(/\.git$/u, '');
  return validateRepository(repository);
}

function pullRequestHeadRevision(event: unknown): string | undefined {
  if (event === null || typeof event !== 'object') {
    return undefined;
  }
  const pullRequest = Reflect.get(event, 'pull_request') as unknown;
  if (pullRequest === null || typeof pullRequest !== 'object') {
    return undefined;
  }
  const head = Reflect.get(pullRequest, 'head') as unknown;
  if (head === null || typeof head !== 'object') {
    return undefined;
  }
  const sha = Reflect.get(head, 'sha') as unknown;
  return typeof sha === 'string' ? validateRevision(sha) : undefined;
}

async function githubHeadRevision(
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const eventPath = env.GITHUB_EVENT_PATH;
  if (eventPath === undefined || eventPath.trim() === '') {
    return undefined;
  }
  return pullRequestHeadRevision(await readBoundedJson(eventPath));
}

export async function resolveRepositoryContext(
  options: RepositoryContextOptions,
): Promise<{
  repository: string;
  revision: string;
  headRevision?: string | undefined;
}> {
  const hasExplicitRepository = options.repository !== undefined;
  const hasExplicitRevision = options.revision !== undefined;
  if (hasExplicitRepository !== hasExplicitRevision) {
    throw new Error('repository and revision must be provided together');
  }
  if (options.repository !== undefined && options.revision !== undefined) {
    return {
      repository: validateRepository(options.repository),
      revision: validateRevision(options.revision),
    };
  }

  const githubRepository = options.env.GITHUB_REPOSITORY;
  const githubRevision = options.env.GITHUB_SHA;
  if ((githubRepository === undefined) !== (githubRevision === undefined)) {
    throw new Error(
      'GITHUB_REPOSITORY and GITHUB_SHA must be provided together',
    );
  }
  if (githubRepository !== undefined && githubRevision !== undefined) {
    const headRevision = await githubHeadRevision(options.env);
    return {
      repository: validateRepository(githubRepository),
      revision: validateRevision(githubRevision),
      ...(headRevision === undefined ? {} : { headRevision }),
    };
  }

  const [origin, revision] = await Promise.all([
    options.runGit(['remote', 'get-url', 'origin']),
    options.runGit(['rev-parse', 'HEAD']),
  ]);
  return {
    repository: normalizeGitHubOrigin(origin),
    revision: validateRevision(revision),
  };
}
