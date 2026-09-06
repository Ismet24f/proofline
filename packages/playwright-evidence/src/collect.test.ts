import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectEvidence, ProoflineToolError } from './collect.js';
import { normalizePlanJson } from './plan.js';

interface MutableRawReport {
  config: {
    argv: string[];
    configFile: string;
    rootDir: string;
    version: string;
    shard: { current: number; total: number } | null;
  };
  suites: Array<{
    specs: Array<{
      file: string;
      line: number;
      tests: unknown[];
    }>;
  }>;
}

const revision = 'a'.repeat(40);
const producer = { id: 'e2e', shard: { current: 1, total: 1 } } as const;
const temporaryDirectories: string[] = [];

function localize(value: unknown, workspace: string): unknown {
  if (typeof value === 'string') {
    return value.replaceAll('/workspace', workspace);
  }
  if (Array.isArray(value)) {
    return value.map((item) => localize(item, workspace));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        localize(item, workspace),
      ]),
    );
  }
  return value;
}

async function capturedReport(workspace: string): Promise<MutableRawReport> {
  const raw = JSON.parse(
    await readFile(
      new URL(
        '../../test-fixtures/fixtures/playwright-results/reports/outcomes.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as unknown;
  return localize(raw, workspace) as MutableRawReport;
}

async function setupArtifacts() {
  const workspace = await mkdtemp(join(tmpdir(), 'proofline-collect-'));
  temporaryDirectories.push(workspace);
  const report = await capturedReport(workspace);
  const plan = normalizePlanJson(report, {
    workspace,
    repository: 'acme/checkout',
    revision,
    producer,
    generatedAt: '2026-01-01T00:00:00.000Z',
  });
  const planPath = join(workspace, 'plan.json');
  const reportPath = join(workspace, 'report.json');
  const out = join(workspace, 'envelope.json');
  await writeFile(planPath, `${JSON.stringify(plan, undefined, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, undefined, 2)}\n`);
  return {
    workspace,
    report,
    plan,
    planPath,
    reportPath,
    out,
    options: {
      workspace,
      producer,
      plan: 'plan.json',
      report: 'report.json',
      out: 'envelope.json',
      env: {
        GITHUB_REPOSITORY: 'acme/checkout',
        GITHUB_SHA: revision,
        GITHUB_RUN_ID: '123456789',
        GITHUB_RUN_ATTEMPT: '2',
      },
    },
  };
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('collectEvidence', () => {
  it('writes a matching envelope with plan and report digests', async () => {
    const setup = await setupArtifacts();

    const envelope = await collectEvidence(setup.options);

    expect(envelope).toMatchObject({
      repository: 'acme/checkout',
      revision,
      runId: '123456789',
      runAttempt: 2,
      planDigest: setup.plan.digest,
      selectionCheck: { status: 'match' },
    });
    expect(envelope.reportDigest).toMatch(/^[a-f0-9]{64}$/u);
    await expect(readJson(setup.out)).resolves.toMatchObject({
      selectionCheck: { status: 'match' },
    });
  });

  it.each([
    [
      'cli project',
      'cli',
      (report: MutableRawReport) => {
        report.config.argv.push('--project=firefox');
      },
    ],
    [
      'shard',
      'shard',
      (report: MutableRawReport) => {
        report.config.shard = { current: 1, total: 2 };
      },
    ],
    [
      'config path',
      'configFile',
      (report: MutableRawReport, workspace: string) => {
        report.config.configFile = join(workspace, 'other.config.ts');
      },
    ],
    [
      'root path',
      'rootDir',
      (report: MutableRawReport, workspace: string) => {
        report.config.rootDir = join(workspace, 'other-tests');
      },
    ],
    [
      'Playwright version',
      'playwrightVersion',
      (report: MutableRawReport) => {
        report.config.version = '1.62.2';
      },
    ],
    [
      'grep',
      'cli',
      (report: MutableRawReport) => {
        report.config.argv.push('--grep=checkout');
      },
    ],
    [
      'positional filter',
      'cli',
      (report: MutableRawReport) => {
        const index = report.config.argv.indexOf('tests/outcomes.spec.ts');
        report.config.argv[index] = 'tests/other.spec.ts';
      },
    ],
  ])(
    'writes a diagnostic envelope before throwing for %s drift',
    async (_name, field, mutate) => {
      const setup = await setupArtifacts();
      mutate(setup.report, setup.workspace);
      await writeFile(
        setup.reportPath,
        `${JSON.stringify(setup.report, undefined, 2)}\n`,
      );

      let thrown: unknown;
      try {
        await collectEvidence(setup.options);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(ProoflineToolError);
      expect(thrown).toMatchObject({ code: 'selection_mismatch' });
      await expect(readJson(setup.out)).resolves.toMatchObject({
        selectionCheck: {
          status: 'mismatch',
          differences: [expect.objectContaining({ field })],
        },
      });
    },
  );

  it('ignores reporter-only differences', async () => {
    const setup = await setupArtifacts();
    const reporterIndex = setup.report.config.argv.indexOf('--reporter=json');
    setup.report.config.argv[reporterIndex] = '--reporter=line';
    await writeFile(
      setup.reportPath,
      `${JSON.stringify(setup.report, undefined, 2)}\n`,
    );

    await expect(collectEvidence(setup.options)).resolves.toMatchObject({
      selectionCheck: { status: 'match' },
    });
  });

  it('writes a mismatch envelope when a multi-shard report omits shard metadata', async () => {
    const setup = await setupArtifacts();
    const shardedProducer = {
      id: 'e2e',
      shard: { current: 1, total: 2 },
    } as const;
    setup.report.config.shard = shardedProducer.shard;
    const plan = normalizePlanJson(setup.report, {
      workspace: setup.workspace,
      repository: 'acme/checkout',
      revision,
      producer: shardedProducer,
      generatedAt: '2026-01-01T00:00:00.000Z',
    });
    await writeFile(setup.planPath, `${JSON.stringify(plan, undefined, 2)}\n`);
    setup.report.config.shard = null;
    await writeFile(
      setup.reportPath,
      `${JSON.stringify(setup.report, undefined, 2)}\n`,
    );

    await expect(
      collectEvidence({ ...setup.options, producer: shardedProducer }),
    ).rejects.toMatchObject({ code: 'selection_mismatch' });
    await expect(readJson(setup.out)).resolves.toMatchObject({
      selectionCheck: {
        status: 'mismatch',
        differences: [{ field: 'shard', actual: 'null' }],
      },
    });
  });

  it('rejects a plan whose content does not match its digest', async () => {
    const setup = await setupArtifacts();
    await writeFile(
      setup.planPath,
      `${JSON.stringify({ ...setup.plan, digest: 'b'.repeat(64) }, undefined, 2)}\n`,
    );

    await expect(collectEvidence(setup.options)).rejects.toMatchObject({
      name: 'ProoflineToolError',
      code: 'plan_digest_mismatch',
    });
  });

  it('rejects changed display metadata for a matching identity', async () => {
    const setup = await setupArtifacts();
    const spec = setup.report.suites[0]?.specs[0];
    if (spec === undefined) {
      throw new Error('fixture must contain a spec');
    }
    spec.line += 1;
    await writeFile(
      setup.reportPath,
      `${JSON.stringify(setup.report, undefined, 2)}\n`,
    );

    await expect(collectEvidence(setup.options)).rejects.toMatchObject({
      name: 'ProoflineToolError',
      code: 'identity_metadata_mismatch',
    });
  });

  it('writes explicit unavailable evidence when the plan is missing', async () => {
    const setup = await setupArtifacts();
    await rm(setup.planPath);

    await expect(collectEvidence(setup.options)).resolves.toMatchObject({
      repository: 'acme/checkout',
      revision,
      planDigest: 'missing',
      selectionCheck: { status: 'unavailable', reason: 'plan_missing' },
    });
  });

  it.each([
    [
      'missing',
      async (setup: Awaited<ReturnType<typeof setupArtifacts>>) => {
        await rm(setup.reportPath);
      },
    ],
    [
      'invalid',
      async (setup: Awaited<ReturnType<typeof setupArtifacts>>) => {
        await writeFile(setup.reportPath, '{"not":"playwright"}\n');
      },
    ],
  ])(
    'removes a stale envelope when the report is %s',
    async (_name, mutate) => {
      const setup = await setupArtifacts();
      await writeFile(setup.out, '{"stale":true}\n');
      await mutate(setup);

      await expect(collectEvidence(setup.options)).rejects.toBeInstanceOf(
        ProoflineToolError,
      );
      await expect(stat(setup.out)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
});
