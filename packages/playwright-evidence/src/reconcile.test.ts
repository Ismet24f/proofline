import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { normalizePlanJson } from './plan.js';
import { reconcileEvidence } from './reconcile.js';
import { sha256File } from './safe-files.js';
import type { ReconciliationReport } from '@proofline/evidence-model';

interface FixtureTest {
  id: string;
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  attempts: ReadonlyArray<
    'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'
  >;
  expectedStatus?: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted';
}

interface MatrixFixture {
  planned: FixtureTest[];
  observed: FixtureTest[];
  missingProducerPlanned: FixtureTest[];
}

const revision = 'a'.repeat(40);
const repository = 'acme/checkout';
const runId = '123456789';
const runAttempt = 2;
const temporaryDirectories: string[] = [];

async function loadFixture(): Promise<MatrixFixture> {
  return JSON.parse(
    await readFile(
      new URL(
        '../../test-fixtures/fixtures/reconciliation/classification-matrix.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as MatrixFixture;
}

function rawReport(
  workspace: string,
  tests: readonly FixtureTest[],
  shard: { current: number; total: number } | null = { current: 1, total: 1 },
  cliProject?: string,
) {
  const selectedProject = cliProject ?? 'chromium';
  return {
    config: {
      argv: [
        'test',
        '--config=playwright.config.ts',
        '--reporter=json',
        ...(cliProject === undefined ? [] : [`--project=${cliProject}`]),
      ],
      configFile: join(workspace, 'playwright.config.ts'),
      rootDir: join(workspace, 'tests'),
      projects:
        cliProject === undefined
          ? [{ name: 'chromium' }]
          : [{ name: 'chromium' }, { name: 'firefox' }],
      shard,
      version: '1.62.1',
    },
    suites: [
      {
        title: 'matrix.spec.ts',
        specs: tests.map((test, index) => ({
          id: test.id,
          title: test.id,
          file: join(workspace, 'tests', 'matrix.spec.ts'),
          line: index + 1,
          column: 1,
          tests: [
            {
              expectedStatus: test.expectedStatus ?? 'passed',
              projectName: selectedProject,
              results: test.attempts.map((status) => ({ status })),
              status: test.status,
            },
          ],
        })),
        suites: [],
      },
    ],
  };
}

async function writeScope(options: {
  workspace: string;
  directory: string;
  producer: { id: string; shard: { current: number; total: number } };
  planned: readonly FixtureTest[];
  observed?: readonly FixtureTest[];
  observedShard?: { current: number; total: number } | null;
  cliProject?: string;
}): Promise<void> {
  const directory = join(options.workspace, 'artifacts', options.directory);
  await mkdir(directory, { recursive: true });
  const plannedReport = rawReport(
    options.workspace,
    options.planned,
    options.producer.shard,
    options.cliProject,
  );
  const plan = normalizePlanJson(plannedReport, {
    workspace: options.workspace,
    repository,
    revision,
    producer: options.producer,
    generatedAt: '2026-01-01T00:00:00.000Z',
  });
  await writeFile(join(directory, 'plan.json'), JSON.stringify(plan));
  if (options.observed === undefined) return;

  const report = rawReport(
    options.workspace,
    options.observed,
    options.observedShard === undefined
      ? options.producer.shard
      : options.observedShard,
    options.cliProject,
  );
  const reportPath = join(directory, 'report.json');
  await writeFile(reportPath, JSON.stringify(report));
  await writeFile(
    join(directory, 'envelope.json'),
    JSON.stringify({
      schemaVersion: 1,
      repository,
      revision,
      runId,
      runAttempt,
      producer: options.producer,
      planDigest: plan.digest,
      reportPath: 'report.json',
      reportDigest: await sha256File(reportPath),
      collectedAt: '2026-01-01T00:01:00.000Z',
      selectionCheck: { status: 'match' },
    }),
  );
}

async function setupMatrix() {
  const workspace = await mkdtemp(join(tmpdir(), 'proofline-reconcile-'));
  temporaryDirectories.push(workspace);
  await mkdir(join(workspace, 'artifacts'));
  const fixture = await loadFixture();
  await writeScope({
    workspace,
    directory: 'z-e2e',
    producer: { id: 'e2e', shard: { current: 1, total: 1 } },
    planned: fixture.planned,
    observed: fixture.observed,
  });
  await writeScope({
    workspace,
    directory: 'a-api',
    producer: { id: 'api', shard: { current: 1, total: 1 } },
    planned: fixture.missingProducerPlanned,
  });
  return {
    workspace,
    out: join(workspace, 'reconciliation.json'),
    options: {
      workspace,
      artifacts: 'artifacts',
      producers: 'e2e=1,api=1',
      mode: 'report-only' as const,
      out: 'reconciliation.json',
      repository,
      revision,
      runId,
      runAttempt,
    },
  };
}

function stableReport(report: ReconciliationReport) {
  return {
    ...report,
    generatedAt: '<run-specific>',
    evaluatedAt: '<run-specific>',
    topology: report.topology.map((record) => ({
      producer: record.producer,
      status: record.status,
      selectionCheck: record.selectionCheck,
      reasonCodes: record.reasonCodes,
    })),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('reconcileEvidence', () => {
  it('reconciles the complete classification matrix producer-first', async () => {
    const setup = await setupMatrix();
    const report = await reconcileEvidence(setup.options);

    expect(report.counts).toEqual({
      plannedActive: 7,
      plannedDisabled: 1,
      executedAsExpected: 1,
      retryMasked: 1,
      failed: 1,
      runtimeSkipped: 1,
      incomplete: 1,
      absent: 1,
      noEvidence: 1,
      producerGaps: 1,
      knownTestGaps: 4,
      notExecuted: 4,
      unexpected: 1,
      toolErrors: 0,
    });
    expect(report.status).toBe('evidence_gaps');
    expect(
      report.topology.map(({ producer, status }) => [producer.id, status]),
    ).toEqual([
      ['api', 'missing'],
      ['e2e', 'received'],
    ]);
    expect(report.tests.map((test) => test.identity.playwrightTestId)).toEqual([
      'absent',
      'api-contract',
      'failure',
      'interrupted',
      'pass',
      'retry',
      'runtime-skip',
    ]);
  });

  it('cannot invent test identities when a producer has no plan', async () => {
    const setup = await setupMatrix();
    const report = await reconcileEvidence({
      ...setup.options,
      producers: 'e2e=1,api=1,ui=1',
    });

    expect(report.topology).toContainEqual({
      producer: { id: 'ui', shard: { current: 1, total: 1 } },
      status: 'missing',
      reasonCodes: ['producer_plan_missing'],
    });
    expect(report.tests.some((test) => test.producer.id === 'ui')).toBe(false);
  });

  it('uses exit 0 in report-only and exit 1 in enforce-evidence', async () => {
    const setup = await setupMatrix();
    expect((await reconcileEvidence(setup.options)).exitDecision.code).toBe(0);
    expect(
      (
        await reconcileEvidence({
          ...setup.options,
          mode: 'enforce-evidence',
          out: 'enforced.json',
        })
      ).exitDecision.code,
    ).toBe(1);
  });

  it.each([
    [
      'executed_as_expected',
      { id: 'case', status: 'expected', attempts: ['passed'] },
      { id: 'case', status: 'expected', attempts: ['passed'] },
      0,
    ],
    [
      'retry_masked',
      { id: 'case', status: 'expected', attempts: ['passed'] },
      { id: 'case', status: 'flaky', attempts: ['failed', 'passed'] },
      0,
    ],
    [
      'failed',
      { id: 'case', status: 'expected', attempts: ['passed'] },
      { id: 'case', status: 'unexpected', attempts: ['failed'] },
      0,
    ],
    [
      'runtime_skipped',
      { id: 'case', status: 'expected', attempts: ['passed'] },
      { id: 'case', status: 'skipped', attempts: ['skipped'] },
      1,
    ],
    [
      'incomplete',
      { id: 'case', status: 'expected', attempts: ['passed'] },
      { id: 'case', status: 'skipped', attempts: ['interrupted'] },
      1,
    ],
    [
      'absent',
      { id: 'case', status: 'expected', attempts: ['passed'] },
      undefined,
      1,
    ],
  ] as const)(
    'applies report-only and enforce-evidence exit policy to %s',
    async (classification, planned, observed, enforceCode) => {
      for (const mode of ['report-only', 'enforce-evidence'] as const) {
        const setup = await setupMatrix();
        await rm(join(setup.workspace, 'artifacts'), { recursive: true });
        await writeScope({
          workspace: setup.workspace,
          directory: 'single',
          producer: { id: 'e2e', shard: { current: 1, total: 1 } },
          planned: [planned],
          observed: observed === undefined ? [] : [observed],
        });

        const report = await reconcileEvidence({
          ...setup.options,
          producers: 'e2e=1',
          mode,
          out: `${classification}-${mode}.json`,
        });
        expect(report.tests).toHaveLength(1);
        expect(report.tests[0]?.classification).toBe(classification);
        expect(report.exitDecision.code).toBe(
          mode === 'report-only' ? 0 : enforceCode,
        );
      }
    },
  );

  it.each(['report-only', 'enforce-evidence'] as const)(
    'treats unexpected identities as an evidence gap in %s mode',
    async (mode) => {
      const setup = await setupMatrix();
      await rm(join(setup.workspace, 'artifacts'), { recursive: true });
      await writeScope({
        workspace: setup.workspace,
        directory: 'unexpected',
        producer: { id: 'e2e', shard: { current: 1, total: 1 } },
        planned: [],
        observed: [{ id: 'extra', status: 'expected', attempts: ['passed'] }],
      });

      const report = await reconcileEvidence({
        ...setup.options,
        producers: 'e2e=1',
        mode,
        out: `unexpected-${mode}.json`,
      });
      expect(report.counts.unexpected).toBe(1);
      expect(report.exitDecision.code).toBe(mode === 'report-only' ? 0 : 1);
    },
  );

  it.each(['report-only', 'enforce-evidence'] as const)(
    'applies exit policy to no_evidence in %s mode',
    async (mode) => {
      const setup = await setupMatrix();
      await rm(join(setup.workspace, 'artifacts'), { recursive: true });
      await writeScope({
        workspace: setup.workspace,
        directory: 'missing-evidence',
        producer: { id: 'e2e', shard: { current: 1, total: 1 } },
        planned: [{ id: 'case', status: 'expected', attempts: ['passed'] }],
      });

      const report = await reconcileEvidence({
        ...setup.options,
        producers: 'e2e=1',
        mode,
        out: `no-evidence-${mode}.json`,
      });
      expect(report.tests[0]?.classification).toBe('no_evidence');
      expect(report.exitDecision.code).toBe(mode === 'report-only' ? 0 : 1);
    },
  );

  it.each(['report-only', 'enforce-evidence'] as const)(
    'returns code 2 for representative tool errors in %s mode',
    async (mode) => {
      const setup = await setupMatrix();
      await writeFile(
        join(setup.workspace, 'artifacts', 'z-e2e', 'report.json'),
        '{}',
      );

      const report = await reconcileEvidence({ ...setup.options, mode });
      expect(report.status).toBe('tool_error');
      expect(report.exitDecision.code).toBe(2);
    },
  );

  it('is deterministic across artifact paths and manifest input order', async () => {
    const first = await setupMatrix();
    const second = await setupMatrix();

    const left = await reconcileEvidence(first.options);
    const right = await reconcileEvidence({
      ...second.options,
      producers: 'api=1,e2e=1',
    });

    expect(stableReport(left)).toEqual(stableReport(right));
  });

  it('does not re-fail a scope whose only result is a Playwright failure', async () => {
    const setup = await setupMatrix();
    const fixture = await loadFixture();
    const plannedFailure = fixture.planned[2];
    const observedFailure = fixture.observed[2];
    if (plannedFailure === undefined || observedFailure === undefined) {
      throw new Error('classification fixture must contain failure records');
    }
    await rm(join(setup.workspace, 'artifacts'), { recursive: true });
    await writeScope({
      workspace: setup.workspace,
      directory: 'failure-only',
      producer: { id: 'e2e', shard: { current: 1, total: 1 } },
      planned: [plannedFailure],
      observed: [observedFailure],
    });

    const report = await reconcileEvidence({
      ...setup.options,
      producers: 'e2e=1',
      mode: 'enforce-evidence',
    });
    expect(report).toMatchObject({
      status: 'complete',
      counts: { failed: 1, knownTestGaps: 0 },
      exitDecision: { code: 0 },
    });
  });

  it('writes a valid code-2 diagnostic report for selection contradiction', async () => {
    const setup = await setupMatrix();
    const path = join(setup.workspace, 'artifacts', 'z-e2e', 'envelope.json');
    const envelope = JSON.parse(await readFile(path, 'utf8')) as Record<
      string,
      unknown
    >;
    envelope.selectionCheck = {
      status: 'mismatch',
      differences: [
        {
          field: 'cli',
          planned: '--project=chromium',
          actual: '--project=firefox',
        },
      ],
    };
    await writeFile(path, JSON.stringify(envelope));

    const report = await reconcileEvidence(setup.options);
    expect(report).toMatchObject({
      status: 'tool_error',
      counts: { toolErrors: 1 },
      exitDecision: { code: 2, reasonCodes: ['selection_mismatch'] },
      topology: [
        { producer: { id: 'api' }, reasonCodes: ['evaluation_aborted'] },
        { producer: { id: 'e2e' }, reasonCodes: ['selection_mismatch'] },
      ],
    });
    await expect(readFile(setup.out, 'utf8')).resolves.toContain('tool_error');
  });

  it('rejects inconsistent project selection across shards of one producer', async () => {
    const setup = await setupMatrix();
    const fixture = await loadFixture();
    await rm(join(setup.workspace, 'artifacts'), { recursive: true });
    await writeScope({
      workspace: setup.workspace,
      directory: 'shard-1',
      producer: { id: 'e2e', shard: { current: 1, total: 2 } },
      planned: fixture.planned.slice(0, 1),
      observed: fixture.observed.slice(0, 1),
      cliProject: 'chromium',
    });
    await writeScope({
      workspace: setup.workspace,
      directory: 'shard-2',
      producer: { id: 'e2e', shard: { current: 2, total: 2 } },
      planned: fixture.planned.slice(1, 2),
      observed: fixture.observed.slice(1, 2),
      cliProject: 'firefox',
    });

    const report = await reconcileEvidence({
      ...setup.options,
      producers: 'e2e=2',
    });
    expect(report).toMatchObject({
      status: 'tool_error',
      exitDecision: { code: 2, reasonCodes: ['selection_mismatch'] },
    });
  });

  it('rejects missing observed shard metadata for a declared multi-shard scope', async () => {
    const setup = await setupMatrix();
    const fixture = await loadFixture();
    await rm(join(setup.workspace, 'artifacts'), { recursive: true });
    await writeScope({
      workspace: setup.workspace,
      directory: 'shard-1',
      producer: { id: 'e2e', shard: { current: 1, total: 2 } },
      planned: fixture.planned.slice(0, 1),
      observed: fixture.observed.slice(0, 1),
      observedShard: null,
    });

    const report = await reconcileEvidence({
      ...setup.options,
      producers: 'e2e=2',
    });
    expect(report).toMatchObject({
      status: 'tool_error',
      exitDecision: { code: 2, reasonCodes: ['selection_mismatch'] },
    });
  });

  it('treats duplicate envelope identities as a code-2 tool error', async () => {
    const setup = await setupMatrix();
    const source = join(setup.workspace, 'artifacts', 'z-e2e', 'envelope.json');
    const duplicateDirectory = join(setup.workspace, 'artifacts', 'duplicate');
    await mkdir(duplicateDirectory);
    await writeFile(
      join(duplicateDirectory, 'envelope.json'),
      await readFile(source),
    );

    const report = await reconcileEvidence(setup.options);
    expect(report).toMatchObject({
      status: 'tool_error',
      counts: { toolErrors: 1 },
      exitDecision: { code: 2, reasonCodes: ['duplicate_envelope'] },
    });
  });

  it('returns the exact breached artifact traversal bound as a tool error', async () => {
    const setup = await setupMatrix();
    let directory = join(setup.workspace, 'artifacts');
    for (let depth = 0; depth < 33; depth += 1) {
      directory = join(directory, `depth-${String(depth)}`);
    }
    await mkdir(directory, { recursive: true });

    const report = await reconcileEvidence(setup.options);
    expect(report).toMatchObject({
      status: 'tool_error',
      counts: { toolErrors: 1 },
      exitDecision: {
        code: 2,
        reasonCodes: ['artifact_depth_limit_exceeded'],
      },
    });
  });

  it('does not downgrade a report digest contradiction to no_evidence', async () => {
    const setup = await setupMatrix();
    await writeFile(
      join(setup.workspace, 'artifacts', 'z-e2e', 'report.json'),
      '{}',
    );

    const report = await reconcileEvidence(setup.options);
    expect(report).toMatchObject({
      status: 'tool_error',
      counts: { toolErrors: 1 },
      exitDecision: { code: 2, reasonCodes: ['report_digest_mismatch'] },
    });
  });

  it.each(['report-only', 'enforce-evidence'] as const)(
    'fails closed when collected report semantics are contradictory in %s mode',
    async (mode) => {
      const setup = await setupMatrix();
      const directory = join(setup.workspace, 'artifacts', 'z-e2e');
      const reportPath = join(directory, 'report.json');
      const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
        suites: Array<{
          specs: Array<{ tests: Array<Record<string, unknown>> }>;
        }>;
      };
      const test = report.suites[0]?.specs[0]?.tests[0];
      if (test === undefined) throw new Error('fixture must contain a test');
      Object.assign(test, {
        status: 'flaky',
        expectedStatus: 'passed',
        results: [{ status: 'skipped' }, { status: 'passed' }],
      });
      await writeFile(reportPath, JSON.stringify(report));

      const envelopePath = join(directory, 'envelope.json');
      const envelope = JSON.parse(
        await readFile(envelopePath, 'utf8'),
      ) as Record<string, unknown>;
      envelope.reportDigest = await sha256File(reportPath);
      await writeFile(envelopePath, JSON.stringify(envelope));

      const result = await reconcileEvidence({ ...setup.options, mode });
      expect(result).toMatchObject({
        status: 'tool_error',
        counts: { toolErrors: 1, retryMasked: 0, knownTestGaps: 0 },
        exitDecision: { code: 2, reasonCodes: ['artifact_invalid'] },
      });
    },
  );
});
