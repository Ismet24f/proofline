import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

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

function validateLimits(limits: JsonLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
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
