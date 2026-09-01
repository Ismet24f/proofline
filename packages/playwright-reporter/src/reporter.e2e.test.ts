import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseInventory, type TestInventory } from '@proofline/evidence-model';
import { beforeAll, describe, expect, it } from 'vitest';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const demoDir = join(workspaceRoot, 'examples/playwright-demo');
const inventoryFile = join(demoDir, '.proofline/inventory.json');
const testDirectoryInventoryFile = join(demoDir, 'tests/.proofline/inventory.json');
const twoUnnamedProjectsFixtureDir = join(
  workspaceRoot,
  'packages/playwright-reporter/e2e-fixtures/two-unnamed-projects',
);
const twoUnnamedProjectsConfig = join(twoUnnamedProjectsFixtureDir, 'playwright.config.ts');
const twoUnnamedProjectsInventory = join(twoUnnamedProjectsFixtureDir, '.proofline/inventory.json');
const executionMarker = join(tmpdir(), `proofline-executed-${String(process.pid)}`);

interface DiscoveryCommandOptions {
  configFile?: string;
  useConfigReporter?: boolean;
}

function runDiscovery({ configFile, useConfigReporter = false }: DiscoveryCommandOptions = {}) {
  const args = [
    '--dir',
    'examples/playwright-demo',
    'exec',
    'playwright',
    'test',
    '--list',
  ];
  if (!useConfigReporter) args.push('--reporter=@proofline/playwright-reporter');
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
    await rm(testDirectoryInventoryFile, { force: true });
    await rm(executionMarker, { force: true });

    const result = runDiscovery();

    expect(result.status, result.stderr || result.stdout).toBe(0);
    await expect(readFile(executionMarker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    const inventory = await loadInventory(inventoryFile);
    await expect(readFile(testDirectoryInventoryFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
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

    expect(inventory.tests.find((item) => item.title === 'discovers a statically skipped test')).toMatchObject({
      annotations: [],
      status: 'SKIPPED',
    });
    expect(inventory.tests.filter((item) => item.title.startsWith('discovers parameterized row'))).toHaveLength(2);

    const duplicateTitles = inventory.tests.filter((item) => item.title === 'duplicate human-readable title');
    expect(duplicateTitles).toHaveLength(2);
    expect(duplicateTitles[0]?.id).not.toBe(duplicateTitles[1]?.id);
  });

  it('represents the implicit Playwright project as <default>', async () => {
    const fixtureDir = await mkdtemp(join(demoDir, '.tmp-default-project-'));
    const fixtureTests = join(fixtureDir, 'tests');
    const fixtureConfig = join(fixtureDir, 'playwright.config.ts');
    const fixtureInventory = join(fixtureDir, '.proofline/inventory.json');

    try {
      await cp(join(demoDir, 'tests'), fixtureTests, { recursive: true });
      await writeFile(
        fixtureConfig,
        `import { defineConfig } from '@playwright/test';\n\n` +
          `export default defineConfig({\n` +
          `  testDir: './tests',\n` +
          `  metadata: { proofline: { repository: 'proofline/playwright-demo', revision: '0123456789abcdef0123456789abcdef01234567' } },\n` +
          `});\n`,
      );

      const result = runDiscovery({ configFile: fixtureConfig });

      expect(result.status, result.stderr || result.stdout).toBe(0);
      const inventory = await loadInventory(fixtureInventory);
      expect(inventory.tests).toHaveLength(6);
      expect(inventory.tests.every((item) => item.projects.join(',') === '<default>')).toBe(true);
      await expect(readFile(join(fixtureTests, '.proofline/inventory.json'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('rejects multiple unnamed Playwright projects without writing an inventory', async () => {
    await rm(twoUnnamedProjectsInventory, { force: true });

    const result = runDiscovery({ configFile: twoUnnamedProjectsConfig });

    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('multiple unnamed Playwright projects are ambiguous');
    await expect(readFile(twoUnnamedProjectsInventory, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('resolves a relative output override from the configuration directory', async () => {
    const fixtureDir = await mkdtemp(join(demoDir, '.tmp-relative-output-'));
    const fixtureTests = join(fixtureDir, 'tests');
    const fixtureConfig = join(fixtureDir, 'playwright.config.ts');
    const fixtureInventory = join(fixtureDir, 'custom-output/inventory.json');

    try {
      await cp(join(demoDir, 'tests'), fixtureTests, { recursive: true });
      await writeFile(
        fixtureConfig,
        `import { defineConfig } from '@playwright/test';\n\n` +
          `export default defineConfig({\n` +
          `  testDir: './tests',\n` +
          `  metadata: { proofline: { repository: 'proofline/playwright-demo', revision: '0123456789abcdef0123456789abcdef01234567' } },\n` +
          `  reporter: [['@proofline/playwright-reporter', { outputFile: './custom-output/inventory.json' }]],\n` +
          `});\n`,
      );

      const result = runDiscovery({ configFile: fixtureConfig, useConfigReporter: true });

      expect(result.status, result.stderr || result.stdout).toBe(0);
      await expect(loadInventory(fixtureInventory)).resolves.toMatchObject({ schemaVersion: 1 });
      await expect(readFile(join(fixtureTests, 'custom-output/inventory.json'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('suppresses output and exits non-zero for duplicate stable test IDs', async () => {
    const fixtureDir = await mkdtemp(join(demoDir, '.tmp-duplicate-'));
    const fixtureTests = join(fixtureDir, 'tests');
    const fixtureConfig = join(fixtureDir, 'playwright.config.ts');
    const fixtureInventory = join(fixtureDir, '.proofline/inventory.json');

    try {
      await cp(join(demoDir, 'tests'), fixtureTests, { recursive: true });
      await cp(join(demoDir, 'playwright.config.ts'), fixtureConfig);
      await writeFile(
        join(fixtureTests, 'duplicate-id.spec.ts'),
        `import { test } from '@playwright/test';\n\n` +
          `test('duplicates an explicit ID', { annotation: { type: 'proofline.id', description: 'PL-T-00001' } }, () => {});\n`,
      );

      const result = runDiscovery({ configFile: fixtureConfig });

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
    const fixtureInventory = join(fixtureDir, '.proofline/inventory.json');

    try {
      await cp(join(demoDir, 'tests'), fixtureTests, { recursive: true });
      await cp(join(demoDir, 'playwright.config.ts'), fixtureConfig);
      await writeFile(
        join(fixtureTests, 'invalid-id.spec.ts'),
        `import { test } from '@playwright/test';\n\n` +
          `test('uses an invalid explicit ID', { annotation: { type: 'proofline.id', description: 'PL-T-1' } }, () => {});\n`,
      );

      const result = runDiscovery({ configFile: fixtureConfig });

      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain('invalid proofline.id: PL-T-1');
      await expect(readFile(fixtureInventory, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it.each([
    { annotationType: 'proofline.id', label: 'a Proofline annotation' },
    { annotationType: 'owner', label: 'a non-Proofline annotation' },
  ])('rejects $label without a description', async ({ annotationType }) => {
    const fixtureDir = await mkdtemp(join(demoDir, '.tmp-missing-description-'));
    const fixtureTests = join(fixtureDir, 'tests');
    const fixtureConfig = join(fixtureDir, 'playwright.config.ts');
    const fixtureInventory = join(fixtureDir, '.proofline/inventory.json');

    try {
      await cp(join(demoDir, 'tests'), fixtureTests, { recursive: true });
      await cp(join(demoDir, 'playwright.config.ts'), fixtureConfig);
      await writeFile(
        join(fixtureTests, 'missing-description.spec.ts'),
        `import { test } from '@playwright/test';\n\n` +
          `test('rejects a description-less annotation', { annotation: { type: '${annotationType}' } }, () => {});\n`,
      );

      const result = runDiscovery({ configFile: fixtureConfig });

      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain(`annotation ${annotationType}`);
      expect(result.stderr + result.stdout).toContain('rejects a description-less annotation');
      await expect(readFile(fixtureInventory, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('rejects a description-less skip marker when the resolved status is not skipped', async () => {
    const fixtureDir = await mkdtemp(join(demoDir, '.tmp-non-skipped-marker-'));
    const fixtureTests = join(fixtureDir, 'tests');
    const fixtureConfig = join(fixtureDir, 'playwright.config.ts');
    const fixtureInventory = join(fixtureDir, '.proofline/inventory.json');

    try {
      await cp(join(demoDir, 'tests'), fixtureTests, { recursive: true });
      await writeFile(
        join(fixtureTests, 'non-skipped-marker.spec.ts'),
        `import { test } from '@playwright/test';\n\n` +
          `test('rejects a non-skipped marker', { annotation: { type: 'skip' } }, () => {});\n`,
      );
      await writeFile(
        join(fixtureDir, 'non-skipped-marker-reporter.mjs'),
        `export default class NonSkippedMarkerReporter {\n` +
          `  onBegin(_config, suite) {\n` +
          `    const target = suite.allTests().find((test) => test.title === 'rejects a non-skipped marker');\n` +
          `    if (!target) throw new Error('missing non-skipped marker fixture');\n` +
          `    target.expectedStatus = 'passed';\n` +
          `  }\n` +
          `}\n`,
      );
      await writeFile(
        fixtureConfig,
        `import { defineConfig } from '@playwright/test';\n\n` +
          `export default defineConfig({\n` +
          `  testDir: './tests',\n` +
          `  metadata: { proofline: { repository: 'proofline/playwright-demo', revision: '0123456789abcdef0123456789abcdef01234567' } },\n` +
          `  projects: [{ name: 'chromium' }, { name: 'firefox' }],\n` +
          `  reporter: [['./non-skipped-marker-reporter.mjs'], ['@proofline/playwright-reporter']],\n` +
          `});\n`,
      );

      const result = runDiscovery({ configFile: fixtureConfig, useConfigReporter: true });

      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain('annotation skip');
      expect(result.stderr + result.stdout).toContain('rejects a non-skipped marker');
      await expect(readFile(fixtureInventory, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('rejects a user-added description-less skip marker on a statically skipped test', async () => {
    const fixtureDir = await mkdtemp(join(demoDir, '.tmp-duplicate-skip-marker-'));
    const fixtureTests = join(fixtureDir, 'tests');
    const fixtureConfig = join(fixtureDir, 'playwright.config.ts');
    const fixtureInventory = join(fixtureDir, '.proofline/inventory.json');

    try {
      await cp(join(demoDir, 'tests'), fixtureTests, { recursive: true });
      await cp(join(demoDir, 'playwright.config.ts'), fixtureConfig);
      await writeFile(
        join(fixtureTests, 'duplicate-skip-marker.spec.ts'),
        `import { test } from '@playwright/test';\n\n` +
          `test.skip('rejects two description-less skip markers', { annotation: { type: 'skip' } }, () => {});\n`,
      );

      const result = runDiscovery({ configFile: fixtureConfig });

      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain('multiple description-less skip annotations');
      await expect(readFile(fixtureInventory, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('rejects matching provisional IDs from separate same-file declarations', async () => {
    const fixtureDir = await mkdtemp(join(demoDir, '.tmp-provisional-collision-'));
    const fixtureTests = join(fixtureDir, 'tests');
    const fixtureConfig = join(fixtureDir, 'playwright.config.ts');
    const fixtureInventory = join(fixtureDir, '.proofline/inventory.json');

    try {
      await cp(join(demoDir, 'tests'), fixtureTests, { recursive: true });
      await writeFile(
        join(fixtureDir, 'same-file-reporter.mjs'),
        `import { join } from 'node:path';\n\n` +
          `export default class SameFileReporter {\n` +
          `  onBegin(config, suite) {\n` +
          `    const target = suite.allTests().find((test) => test.title === 'duplicate human-readable title' && test.location.file.endsWith('duplicate-title.spec.ts'));\n` +
          `    if (!target) throw new Error('missing duplicate-title fixture');\n` +
          `    target.location.file = join(config.rootDir, 'discovery.spec.ts');\n` +
          `  }\n` +
          `}\n`,
      );
      await writeFile(
        fixtureConfig,
        `import { defineConfig } from '@playwright/test';\n\n` +
          `export default defineConfig({\n` +
          `  testDir: './tests',\n` +
          `  metadata: { proofline: { repository: 'proofline/playwright-demo', revision: '0123456789abcdef0123456789abcdef01234567' } },\n` +
          `  projects: [{ name: 'chromium' }, { name: 'firefox' }],\n` +
          `  reporter: [['./same-file-reporter.mjs'], ['@proofline/playwright-reporter']],\n` +
          `});\n`,
      );

      const result = runDiscovery({ configFile: fixtureConfig, useConfigReporter: true });

      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain('duplicate stable test IDs');
      await expect(readFile(fixtureInventory, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('returns non-zero without an inventory when the configured destination cannot be written', async () => {
    const fixtureDir = await mkdtemp(join(demoDir, '.tmp-write-failure-'));
    const fixtureTests = join(fixtureDir, 'tests');
    const fixtureConfig = join(fixtureDir, 'playwright.config.ts');
    const blockedOutput = join(fixtureDir, 'blocked-output');

    try {
      await cp(join(demoDir, 'tests'), fixtureTests, { recursive: true });
      await writeFile(blockedOutput, 'not a directory\n');
      await writeFile(
        fixtureConfig,
        `import { defineConfig } from '@playwright/test';\n\n` +
          `export default defineConfig({\n` +
          `  testDir: './tests',\n` +
          `  metadata: { proofline: { repository: 'proofline/playwright-demo', revision: '0123456789abcdef0123456789abcdef01234567' } },\n` +
          `  projects: [{ name: 'chromium' }, { name: 'firefox' }],\n` +
          `  reporter: [['@proofline/playwright-reporter', { outputFile: ${JSON.stringify(join(blockedOutput, 'inventory.json'))} }]],\n` +
          `});\n`,
      );

      const result = runDiscovery({ configFile: fixtureConfig, useConfigReporter: true });

      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain('Proofline discovery failed:');
      await expect(readFile(blockedOutput, 'utf8')).resolves.toBe('not a directory\n');
      await expect(readFile(join(blockedOutput, 'inventory.json'), 'utf8')).rejects.toBeDefined();
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('removes the sibling temp file when atomic rename fails', async () => {
    const fixtureDir = await mkdtemp(join(demoDir, '.tmp-rename-failure-'));
    const fixtureTests = join(fixtureDir, 'tests');
    const fixtureConfig = join(fixtureDir, 'playwright.config.ts');
    const outputDirectory = join(fixtureDir, 'inventory-output');

    try {
      await cp(join(demoDir, 'tests'), fixtureTests, { recursive: true });
      await mkdir(outputDirectory);
      await writeFile(
        fixtureConfig,
        `import { defineConfig } from '@playwright/test';\n\n` +
          `export default defineConfig({\n` +
          `  testDir: './tests',\n` +
          `  metadata: { proofline: { repository: 'proofline/playwright-demo', revision: '0123456789abcdef0123456789abcdef01234567' } },\n` +
          `  projects: [{ name: 'chromium' }, { name: 'firefox' }],\n` +
          `  reporter: [['@proofline/playwright-reporter', { outputFile: ${JSON.stringify(outputDirectory)} }]],\n` +
          `});\n`,
      );

      const result = runDiscovery({ configFile: fixtureConfig, useConfigReporter: true });

      expect(result.status).not.toBe(0);
      expect(result.stderr + result.stdout).toContain('Proofline discovery failed:');
      await expect(readdir(outputDirectory)).resolves.toEqual([]);
      expect((await readdir(fixtureDir)).filter((name) => name.startsWith(`${basename(outputDirectory)}.`))).toEqual([]);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

});
