import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_JSON_LIMITS,
  readBoundedJson,
  resolveInputPath,
  resolveOutputPath,
  sha256File,
  writeJsonAtomically,
} from './safe-files.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(
  prefix = 'proofline-files-',
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
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

describe('safe workspace paths', () => {
  it('resolves an existing input inside the workspace', async () => {
    const workspace = await temporaryDirectory();
    const input = join(workspace, 'report.json');
    await writeFile(input, '{}');

    await expect(resolveInputPath(workspace, 'report.json')).resolves.toBe(
      await realpath(input),
    );
  });

  it('rejects input traversal outside the workspace', async () => {
    const parent = await temporaryDirectory();
    const workspace = join(parent, 'workspace');
    await mkdir(workspace);
    await writeFile(join(parent, 'outside.json'), '{}');

    await expect(
      resolveInputPath(workspace, '../outside.json'),
    ).rejects.toThrow('escapes workspace');
  });

  it('rejects an input symlink that escapes the workspace', async () => {
    const workspace = await temporaryDirectory();
    const outside = await temporaryDirectory('proofline-outside-');
    const target = join(outside, 'report.json');
    await writeFile(target, '{}');
    await symlink(target, join(workspace, 'report.json'));

    await expect(resolveInputPath(workspace, 'report.json')).rejects.toThrow(
      'symlink escapes workspace',
    );
  });

  it('resolves output beneath the nearest existing in-workspace parent', async () => {
    const workspace = await temporaryDirectory();

    await expect(
      resolveOutputPath(workspace, 'new/nested/report.json'),
    ).resolves.toBe(join(workspace, 'new/nested/report.json'));
  });

  it('rejects an empty output path instead of targeting the workspace root', async () => {
    const workspace = await temporaryDirectory();

    await expect(resolveOutputPath(workspace, '')).rejects.toThrow(
      'output path must name a file',
    );
  });

  it('rejects output traversal and symlink escapes', async () => {
    const parent = await temporaryDirectory();
    const workspace = join(parent, 'workspace');
    const outside = join(parent, 'outside');
    await mkdir(workspace);
    await mkdir(outside);
    await symlink(outside, join(workspace, 'linked'));

    await expect(
      resolveOutputPath(workspace, '../report.json'),
    ).rejects.toThrow('escapes workspace');
    await expect(
      resolveOutputPath(workspace, 'linked/report.json'),
    ).rejects.toThrow('symlink escapes workspace');
  });
});

describe('readBoundedJson', () => {
  it('reads JSON within every default bound', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'valid.json');
    await writeFile(path, JSON.stringify({ tests: ['checkout'] }));

    await expect(readBoundedJson(path, DEFAULT_JSON_LIMITS)).resolves.toEqual({
      tests: ['checkout'],
    });
  });

  it('rejects a file larger than 50 MB before reading it', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'large.json');
    await writeFile(path, '');
    await truncate(path, 50 * 1024 * 1024 + 1);

    await expect(readBoundedJson(path, DEFAULT_JSON_LIMITS)).rejects.toThrow(
      'file size exceeds 52428800 bytes',
    );
  });

  it('rejects JSON at depth 65', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'deep.json');
    await writeFile(path, `${'['.repeat(65)}null${']'.repeat(65)}`);

    await expect(readBoundedJson(path, DEFAULT_JSON_LIMITS)).rejects.toThrow(
      'JSON depth exceeds 64',
    );
  });

  it('rejects a string larger than 1 MB in UTF-8 bytes', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'string.json');
    await writeFile(path, JSON.stringify('a'.repeat(1024 * 1024 + 1)));

    await expect(readBoundedJson(path, DEFAULT_JSON_LIMITS)).rejects.toThrow(
      'JSON string exceeds 1048576 bytes',
    );
  });

  it('rejects more than 200,000 JSON nodes', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'records.json');
    await writeFile(path, `[${'null,'.repeat(200_000)}null]`);

    await expect(readBoundedJson(path, DEFAULT_JSON_LIMITS)).rejects.toThrow(
      'JSON record count exceeds 200000',
    );
  });
});

describe('atomic JSON and hashing', () => {
  it('writes replaceable JSON atomically with a trailing newline', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'nested', 'report.json');

    await writeJsonAtomically(path, { status: 'first' });
    await writeJsonAtomically(path, { status: 'complete' });

    await expect(readFile(path, 'utf8')).resolves.toBe(
      '{\n  "status": "complete"\n}\n',
    );
  });

  it('cleans up its exclusive temporary file when rename fails', async () => {
    const directory = await temporaryDirectory();
    const destinationDirectory = join(directory, 'destination');
    await mkdir(destinationDirectory);

    await expect(
      writeJsonAtomically(destinationDirectory, { status: 'complete' }),
    ).rejects.toThrow();
    await expect(readdir(directory)).resolves.toEqual(['destination']);
  });

  it('rejects a non-serializable JSON root without leaving an artifact', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'report.json');

    await expect(writeJsonAtomically(path, undefined)).rejects.toThrow(
      'value is not JSON-serializable',
    );
    await expect(readdir(directory)).resolves.toEqual([]);
  });

  it('streams the SHA-256 digest of a file', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'payload.txt');
    await writeFile(path, 'abc');

    await expect(sha256File(path)).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
