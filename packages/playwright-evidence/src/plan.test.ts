import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createPlan, normalizePlanJson, resolvePlaywrightCli } from './plan.js';

const revision = 'a'.repeat(40);
const checkRoot = fileURLToPath(new URL('../../../check/', import.meta.url));
const temporaryDirectories: string[] = [];

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'),
  ) as unknown;
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('normalizePlanJson', () => {
  it('builds a deterministic plan from a captured list report', async () => {
    const plan = normalizePlanJson(
      await fixture('playwright-1.62-list-shard-1-of-2.json'),
      {
        workspace: '/workspace',
        repository: 'acme/checkout',
        revision,
        producer: { id: 'e2e', shard: { current: 1, total: 2 } },
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
    );

    expect(plan.tests).toHaveLength(7);
    expect(plan.selection.shard).toEqual({ current: 1, total: 2 });
    expect(plan.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      normalizePlanJson(
        await fixture('playwright-1.62-list-shard-1-of-2.json'),
        {
          workspace: '/workspace',
          repository: 'acme/checkout',
          revision,
          producer: { id: 'e2e', shard: { current: 1, total: 2 } },
          generatedAt: '2026-01-01T00:00:00.000Z',
        },
      ).digest,
    ).toBe(plan.digest);
  });
});

describe('resolvePlaywrightCli', () => {
  it('fails locally without invoking a package manager when Playwright is absent', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'proofline-no-playwright-'));
    temporaryDirectories.push(workspace);

    expect(() => resolvePlaywrightCli(workspace)).toThrow(
      `cannot resolve @playwright/test/cli from ${workspace}`,
    );
    await expect(
      stat(join(workspace, 'proofline/plan.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('createPlan', () => {
  it('rejects an explicit config symlink that resolves outside the workspace', async () => {
    const workspace = await mkdtemp(join(checkRoot, '.tmp-plan-config-'));
    const outside = await mkdtemp(join(tmpdir(), 'proofline-config-outside-'));
    temporaryDirectories.push(workspace, outside);
    await symlink(
      join(checkRoot, 'node_modules'),
      join(workspace, 'node_modules'),
    );
    await writeFile(
      join(outside, 'playwright.config.ts'),
      'export default {};',
    );
    await symlink(
      join(outside, 'playwright.config.ts'),
      join(workspace, 'playwright.config.ts'),
    );

    await expect(
      createPlan({
        workspace,
        producer: { id: 'e2e', shard: { current: 1, total: 1 } },
        playwrightArguments: '',
        config: 'playwright.config.ts',
        repository: 'acme/checkout',
        revision,
        env: process.env,
        out: 'proofline/plan.json',
      }),
    ).rejects.toThrow('input symlink escapes workspace');
  });

  it('does not fall back to a package manager when local Playwright is absent', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'proofline-no-playwright-'));
    temporaryDirectories.push(workspace);

    await expect(
      createPlan({
        workspace,
        producer: { id: 'e2e', shard: { current: 1, total: 1 } },
        playwrightArguments: '',
        repository: 'acme/checkout',
        revision,
        env: {
          HTTPS_PROXY: 'http://127.0.0.1:9',
          npm_config_registry: 'http://127.0.0.1:9',
        },
        out: 'proofline/plan.json',
      }),
    ).rejects.toThrow(`cannot resolve @playwright/test/cli from ${workspace}`);
    await expect(
      stat(join(workspace, 'proofline/plan.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('stops list discovery when stdout exceeds 50 MB', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'proofline-large-stdout-'));
    temporaryDirectories.push(workspace);
    const moduleRoot = join(workspace, 'node_modules/@playwright/test');
    await mkdir(moduleRoot, { recursive: true });
    await writeFile(
      join(moduleRoot, 'package.json'),
      JSON.stringify({
        name: '@playwright/test',
        type: 'module',
        exports: { './cli': './cli.js' },
      }),
    );
    const cliPath = join(moduleRoot, 'cli.js');
    await writeFile(
      cliPath,
      "process.stdout.write('x'.repeat(50 * 1024 * 1024 + 1));\n",
    );
    await chmod(cliPath, 0o700);

    await expect(
      createPlan({
        workspace,
        producer: { id: 'e2e', shard: { current: 1, total: 1 } },
        playwrightArguments: '',
        repository: 'acme/checkout',
        revision,
        env: process.env,
        out: 'proofline/plan.json',
      }),
    ).rejects.toThrow('Playwright stdout exceeds 52428800 bytes');
  });

  it('runs real local Playwright list discovery and preserves active list entries', async () => {
    const workspace = await mkdtemp(join(checkRoot, '.tmp-plan-'));
    temporaryDirectories.push(workspace);
    await cp(
      new URL(
        '../../test-fixtures/fixtures/playwright-basic/',
        import.meta.url,
      ),
      workspace,
      { recursive: true },
    );
    await symlink(
      join(checkRoot, 'node_modules'),
      join(workspace, 'node_modules'),
    );

    const plan = await createPlan({
      workspace,
      producer: { id: 'e2e', shard: { current: 1, total: 1 } },
      playwrightArguments: '--project=chromium',
      config: 'playwright.config.ts',
      repository: 'acme/checkout',
      revision,
      env: {
        ...process.env,
        HTTPS_PROXY: 'http://127.0.0.1:9',
        npm_config_registry: 'http://127.0.0.1:9',
      },
      out: 'proofline/plan.json',
    });

    expect(plan.tests.some((test) => test.expectedStatus === 'passed')).toBe(
      true,
    );
    expect(
      plan.tests.find((test) => test.identity.titlePath.at(-1) === 'disabled')
        ?.expectedStatus,
    ).toBe('skipped');
    expect((await stat(join(workspace, 'proofline/plan.json'))).isFile()).toBe(
      true,
    );
  });
});
