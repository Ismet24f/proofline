import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseInventory, type TestInventory } from '@proofline/evidence-model';
import { beforeAll, describe, expect, it } from 'vitest';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const demoDir = join(workspaceRoot, 'examples/playwright-demo');
const inventoryFile = join(demoDir, 'tests/.proofline/inventory.json');
const executionMarker = join(tmpdir(), `proofline-executed-${String(process.pid)}`);

function runDiscovery(configFile?: string) {
  const args = [
    '--dir',
    'examples/playwright-demo',
    'exec',
    'playwright',
    'test',
    '--list',
    '--reporter=@proofline/playwright-reporter',
  ];
  if (configFile) args.push('--config', configFile);

  return spawnSync('pnpm', args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: { ...process.env, PROOFLINE_EXECUTION_MARKER: executionMarker },
  });
}

async function loadInventory(file: string): Promise<TestInventory> {
  return parseInventory(JSON.parse(await readFile(file, 'utf8')));
}

beforeAll(() => {
  execFileSync('pnpm', ['--filter', '@proofline/evidence-model', 'build'], {
    cwd: workspaceRoot,
    stdio: 'pipe',
  });
  execFileSync('pnpm', ['--filter', '@proofline/playwright-reporter', 'build'], {
    cwd: workspaceRoot,
    stdio: 'pipe',
  });
});

describe('Playwright discovery reporter', () => {
  it('discovers one complete logical inventory without executing tests', async () => {
    await rm(inventoryFile, { force: true });
    await rm(executionMarker, { force: true });

    const result = runDiscovery();

    expect(result.status, result.stderr || result.stdout).toBe(0);
    await expect(readFile(executionMarker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    const inventory = await loadInventory(inventoryFile);
    expect(inventory).toMatchObject({
      schemaVersion: 1,
      repository: 'proofline/playwright-demo',
      revision: '0123456789abcdef0123456789abcdef01234567',
    });
    expect(inventory.tests).toHaveLength(6);
    expect(new Set(inventory.tests.map((item) => item.id)).size).toBe(6);
    expect(inventory.tests.every((item) => item.projects.join(',') === 'chromium,firefox')).toBe(true);

    const explicit = inventory.tests.find((item) => item.id === 'PL-T-00001');
    expect(explicit).toMatchObject({
      stability: 'EXPLICIT',
      tags: ['@critical'],
      capabilities: ['checkout'],
      risks: ['payment-loss'],
      requirements: ['REQ-CHECKOUT-1'],
      status: 'ACTIVE',
    });
    expect(explicit?.annotations).toEqual(
      expect.arrayContaining([
        { type: 'proofline.id', description: 'PL-T-00001' },
        { type: 'proofline.capability', description: 'checkout' },
        { type: 'proofline.risk', description: 'payment-loss' },
        { type: 'proofline.requirement', description: 'REQ-CHECKOUT-1' },
      ]),
    );

    expect(inventory.tests.find((item) => item.title === 'discovers a statically skipped test')?.status).toBe(
      'SKIPPED',
    );
    expect(inventory.tests.filter((item) => item.title.startsWith('discovers parameterized row'))).toHaveLength(2);

    const duplicateTitles = inventory.tests.filter((item) => item.title === 'duplicate human-readable title');
    expect(duplicateTitles).toHaveLength(2);
    expect(duplicateTitles[0]?.id).not.toBe(duplicateTitles[1]?.id);
  });

  it('suppresses output and exits non-zero for duplicate stable test IDs', async () => {
    const fixtureDir = await mkdtemp(join(demoDir, '.tmp-duplicate-'));
    const fixtureTests = join(fixtureDir, 'tests');
    const fixtureConfig = join(fixtureDir, 'playwright.config.ts');
    const fixtureInventory = join(fixtureTests, '.proofline/inventory.json');

    try {
      await cp(join(demoDir, 'tests'), fixtureTests, { recursive: true });
      await cp(join(demoDir, 'playwright.config.ts'), fixtureConfig);
      await writeFile(
        join(fixtureTests, 'duplicate-id.spec.ts'),
        `import { test } from '@playwright/test';\n\n` +
          `test('duplicates an explicit ID', { annotation: { type: 'proofline.id', description: 'PL-T-00001' } }, () => {});\n`,
      );

      const result = runDiscovery(fixtureConfig);

      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain('duplicate stable test IDs');
      await expect(readFile(fixtureInventory, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('suppresses output and exits non-zero for an invalid explicit ID', async () => {
    const fixtureDir = await mkdtemp(join(demoDir, '.tmp-invalid-id-'));
    const fixtureTests = join(fixtureDir, 'tests');
    const fixtureConfig = join(fixtureDir, 'playwright.config.ts');
    const fixtureInventory = join(fixtureTests, '.proofline/inventory.json');

    try {
      await cp(join(demoDir, 'tests'), fixtureTests, { recursive: true });
      await cp(join(demoDir, 'playwright.config.ts'), fixtureConfig);
      await writeFile(
        join(fixtureTests, 'invalid-id.spec.ts'),
        `import { test } from '@playwright/test';\n\n` +
          `test('uses an invalid explicit ID', { annotation: { type: 'proofline.id', description: 'PL-T-1' } }, () => {});\n`,
      );

      const result = runDiscovery(fixtureConfig);

      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain('invalid proofline.id: PL-T-1');
      await expect(readFile(fixtureInventory, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

});
