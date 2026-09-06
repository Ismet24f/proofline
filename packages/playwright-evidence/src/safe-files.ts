import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';

export interface JsonLimits {
  maxFileBytes: number;
  maxDepth: number;
  maxStringBytes: number;
  maxRecords: number;
}

export const DEFAULT_JSON_LIMITS: Readonly<JsonLimits> = Object.freeze({
  maxFileBytes: 50 * 1024 * 1024,
  maxDepth: 64,
  maxStringBytes: 1024 * 1024,
  maxRecords: 200_000,
});

export interface ArtifactLimits {
  maxDepth: number;
  maxDirectories: number;
  maxEntries: number;
  maxArtifactFiles: number;
  maxAggregateBytes: number;
}

export const DEFAULT_ARTIFACT_LIMITS: Readonly<ArtifactLimits> = Object.freeze({
  maxDepth: 32,
  maxDirectories: 4_096,
  maxEntries: 20_000,
  maxArtifactFiles: 4_096,
  maxAggregateBytes: 512 * 1024 * 1024,
});

export class ArtifactLimitError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ArtifactLimitError';
  }
}

export interface DiscoveredArtifacts {
  plans: string[];
  envelopes: string[];
}

function validateArtifactLimits(limits: ArtifactLimits): void {
  if (!Number.isSafeInteger(limits.maxDepth) || limits.maxDepth < 0) {
    throw new Error('maxDepth must be a non-negative safe integer');
  }
  validateLimits({
    maxDirectories: limits.maxDirectories,
    maxEntries: limits.maxEntries,
    maxArtifactFiles: limits.maxArtifactFiles,
    maxAggregateBytes: limits.maxAggregateBytes,
  });
}

export async function discoverArtifacts(
  root: string,
  limits: ArtifactLimits = DEFAULT_ARTIFACT_LIMITS,
): Promise<DiscoveredArtifacts> {
  validateArtifactLimits(limits);
  const discovered: DiscoveredArtifacts = { plans: [], envelopes: [] };
  const directories = [{ path: root, depth: 0 }];
  let directoryCount = 0;
  let entryCount = 0;
  let artifactCount = 0;

  while (directories.length > 0) {
    const directory = directories.pop();
    if (directory === undefined) break;
    directoryCount += 1;
    if (directoryCount > limits.maxDirectories) {
      throw new ArtifactLimitError('artifact_directory_limit_exceeded');
    }
    for (const entry of await readdir(directory.path, {
      withFileTypes: true,
    })) {
      entryCount += 1;
      if (entryCount > limits.maxEntries) {
        throw new ArtifactLimitError('artifact_entry_limit_exceeded');
      }
      const path = join(directory.path, entry.name);
      if (entry.isDirectory()) {
        const depth = directory.depth + 1;
        if (depth > limits.maxDepth) {
          throw new ArtifactLimitError('artifact_depth_limit_exceeded');
        }
        directories.push({ path, depth });
        continue;
      }
      if (!entry.isFile()) continue;
      const name = basename(path);
      if (name !== 'plan.json' && name !== 'envelope.json') continue;
      artifactCount += 1;
      if (artifactCount > limits.maxArtifactFiles) {
        throw new ArtifactLimitError('artifact_file_limit_exceeded');
      }
      (name === 'plan.json' ? discovered.plans : discovered.envelopes).push(
        path,
      );
    }
  }

  discovered.plans.sort((left, right) => left.localeCompare(right));
  discovered.envelopes.sort((left, right) => left.localeCompare(right));
  return discovered;
}

export class ArtifactByteBudget {
  readonly #seen = new Set<string>();
  #consumed = 0;

  constructor(
    readonly maxBytes: number = DEFAULT_ARTIFACT_LIMITS.maxAggregateBytes,
  ) {
    validateLimits({ maxBytes });
  }

  async reserve(path: string): Promise<void> {
    const canonicalPath = await realpath(path);
    if (this.#seen.has(canonicalPath)) return;
    const file = await stat(canonicalPath);
    const next = this.#consumed + file.size;
    if (next > this.maxBytes) {
      throw new ArtifactLimitError('artifact_byte_limit_exceeded');
    }
    this.#seen.add(canonicalPath);
    this.#consumed = next;
  }
}

const stringifyJson = JSON.stringify as (
  value: unknown,
  replacer: undefined,
  space: number,
) => string | undefined;

function isContainedBy(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === '' ||
    (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent))
  );
}

async function workspacePaths(
  workspace: string,
  input: string,
): Promise<{ canonicalWorkspace: string; candidate: string }> {
  const absoluteWorkspace = resolve(workspace);
  const candidate = resolve(absoluteWorkspace, input);
  if (!isContainedBy(absoluteWorkspace, candidate)) {
    throw new Error(`path escapes workspace: ${input}`);
  }
  return { canonicalWorkspace: await realpath(absoluteWorkspace), candidate };
}

export async function resolveInputPath(
  workspace: string,
  input: string,
): Promise<string> {
  const { canonicalWorkspace, candidate } = await workspacePaths(
    workspace,
    input,
  );
  const canonicalCandidate = await realpath(candidate);
  if (!isContainedBy(canonicalWorkspace, canonicalCandidate)) {
    throw new Error(`input symlink escapes workspace: ${input}`);
  }
  return canonicalCandidate;
}

export async function resolveInputDirectory(
  workspace: string,
  input: string,
): Promise<string> {
  const path = await resolveInputPath(workspace, input);
  if (!(await stat(path)).isDirectory()) {
    throw new Error(`input is not a directory: ${input}`);
  }
  return path;
}

async function nearestExistingPath(candidate: string): Promise<string> {
  let current = candidate;
  while (current !== dirname(current)) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw error;
      }
      current = dirname(current);
    }
  }
  await lstat(current);
  return current;
}

export async function resolveOutputPath(
  workspace: string,
  output: string,
): Promise<string> {
  if (output.trim().length === 0) {
    throw new Error('output path must name a file');
  }
  const { canonicalWorkspace, candidate } = await workspacePaths(
    workspace,
    output,
  );
  const existingParent = await nearestExistingPath(candidate);
  const canonicalParent = await realpath(existingParent);
  if (!isContainedBy(canonicalWorkspace, canonicalParent)) {
    throw new Error(`output symlink escapes workspace: ${output}`);
  }
  return candidate;
}

function validateLimits(limits: object): void {
  for (const [name, value] of Object.entries(limits)) {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 1
    ) {
      throw new Error(`${name} must be a positive safe integer`);
    }
  }
}

function validateJsonTree(value: unknown, limits: JsonLimits): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let records = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    records += 1;
    if (records > limits.maxRecords) {
      throw new Error(`JSON record count exceeds ${String(limits.maxRecords)}`);
    }
    if (current.depth > limits.maxDepth) {
      throw new Error(`JSON depth exceeds ${String(limits.maxDepth)}`);
    }
    if (typeof current.value === 'string') {
      if (Buffer.byteLength(current.value, 'utf8') > limits.maxStringBytes) {
        throw new Error(
          `JSON string exceeds ${String(limits.maxStringBytes)} bytes`,
        );
      }
      continue;
    }
    if (Array.isArray(current.value)) {
      for (const child of current.value) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
      continue;
    }
    if (current.value !== null && typeof current.value === 'object') {
      for (const [key, child] of Object.entries(current.value)) {
        if (Buffer.byteLength(key, 'utf8') > limits.maxStringBytes) {
          throw new Error(
            `JSON string exceeds ${String(limits.maxStringBytes)} bytes`,
          );
        }
        stack.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
}

export async function readBoundedJson(
  path: string,
  limits: JsonLimits = DEFAULT_JSON_LIMITS,
): Promise<unknown> {
  validateLimits(limits);
  const file = await stat(path);
  if (!file.isFile()) {
    throw new Error(`JSON input is not a file: ${path}`);
  }
  if (file.size > limits.maxFileBytes) {
    throw new Error(
      `file size exceeds ${String(limits.maxFileBytes)} bytes: ${path}`,
    );
  }

  const serialized = await readFile(path, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error(`invalid JSON: ${path}`, { cause: error });
  }
  validateJsonTree(value, limits);
  return value;
}

export async function writeJsonAtomically(
  path: string,
  value: unknown,
): Promise<void> {
  let serialized: string | undefined;
  try {
    serialized = stringifyJson(value, undefined, 2);
  } catch (error) {
    throw new Error(`value is not JSON-serializable: ${path}`, {
      cause: error,
    });
  }
  if (serialized === undefined) {
    throw new Error(`value is not JSON-serializable: ${path}`);
  }

  const parent = dirname(path);
  await mkdir(parent, { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(`${serialized}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
  } finally {
    if (handle !== undefined) {
      await handle.close().catch(() => undefined);
    }
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}
