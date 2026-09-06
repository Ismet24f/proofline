import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCommand } from '@proofline/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';

import { collectEvidence } from './collect.js';
import { createPlan, resolvePlaywrightCli } from './plan.js';
import { reconcileEvidence } from './reconcile.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const fixtureSource = fileURLToPath(
  new URL('../../test-fixtures/fixtures/playwright-basic/', import.meta.url),
);
const resultFixtureSource = fileURLToPath(
  new URL('../../test-fixtures/fixtures/playwright-results/', import.meta.url),
);
const consumerFixtureSource = fileURLToPath(
  new URL('../../test-fixtures/fixtures/consumer/', import.meta.url),
);
const actionEntrypoint = fileURLToPath(
  new URL('../../../check/dist/index.js', import.meta.url),
);
const revision = 'b'.repeat(40);
const repository = 'proofline/consumer';
const runId = '8001';
const runAttempt = 1;
const temporaryDirectories: string[] = [];

async function prepareWorkspace(
  source = fixtureSource,
  installPlaywright = true,
): Promise<string> {
  const workspace = await mkdtemp(join(repositoryRoot, '.tmp-subprocess-'));
  temporaryDirectories.push(workspace);
  await cp(source, workspace, { recursive: true });
  if (installPlaywright) {
    await mkdir(join(workspace, 'node_modules/@playwright'), {
      recursive: true,
    });
    await symlink(
      join(
        repositoryRoot,
        'packages/playwright-evidence/node_modules/@playwright/test',
      ),
      join(workspace, 'node_modules/@playwright/test'),
    );
  }
  return workspace;
}

function githubEnvironment(workspace: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GITHUB_WORKSPACE: workspace,
    GITHUB_REPOSITORY: repository,
    GITHUB_SHA: revision,
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: String(runAttempt),
  };
}

async function executeScope(options: {
  workspace: string;
  playwrightArguments: readonly string[];
  expectedExitCode: number;
  producer?: {
    id: string;
    shard: { current: number; total: number };
  };
  env?: NodeJS.ProcessEnv;
  reporters?: readonly string[];
  beforeCollect?: (reportPath: string) => Promise<void>;
  reconcileProducers?: string | false;
}) {
  const producer = options.producer ?? {
    id: 'e2e',
    shard: { current: 1, total: 1 },
  };
  const env = { ...githubEnvironment(options.workspace), ...options.env };
  const scope = `proofline/${producer.id}-${String(producer.shard.current)}-of-${String(producer.shard.total)}`;
  const plan = await createPlan({
    workspace: options.workspace,
    producer,
    playwrightArguments: options.playwrightArguments.join('\n'),
    config: 'playwright.config.ts',
    repository,
    revision,
    env,
    out: `${scope}/plan.json`,
  });
  const execution = await runCommand({
    cwd: options.workspace,
    command: process.execPath,
    args: [
      resolvePlaywrightCli(options.workspace),
      'test',
      '--config=playwright.config.ts',
      ...(producer.shard.total === 1
        ? []
        : [
            `--shard=${String(producer.shard.current)}/${String(producer.shard.total)}`,
          ]),
      ...options.playwrightArguments,
      ...(options.reporters ?? ['--reporter=line,json']),
    ],
    env: {
      ...env,
      PLAYWRIGHT_JSON_OUTPUT_FILE: join(
        options.workspace,
        scope,
        'report.json',
      ),
    },
  });
  expect(execution.code, execution.stderr || execution.stdout).toBe(
    options.expectedExitCode,
  );
  const reportPath = join(options.workspace, scope, 'report.json');
  await options.beforeCollect?.(reportPath);

  await collectEvidence({
    workspace: options.workspace,
    producer,
    plan: `${scope}/plan.json`,
    report: `${scope}/report.json`,
    out: `${scope}/envelope.json`,
    env,
  });
  const report =
    options.reconcileProducers === false
      ? undefined
      : await reconcileEvidence({
          workspace: options.workspace,
          artifacts: 'proofline',
          producers: options.reconcileProducers ?? 'e2e=1',
          mode: 'report-only',
          out: 'reconciliation.json',
          repository,
          revision,
          runId,
          runAttempt,
        });
  return { execution, plan, report };
}

function classificationByTitle(
  report: Awaited<ReturnType<typeof reconcileEvidence>>,
): Record<string, string> {
  return Object.fromEntries(
    report.tests.map((test) => [
      test.identity.titlePath.at(-1) ?? '',
      test.classification,
    ]),
  );
}

async function runBundledAction(
  workspace: string,
  inputs: Readonly<Record<string, string>>,
) {
  const output = join(workspace, 'github-output.txt');
  const summary = join(workspace, 'github-summary.md');
  await writeFile(output, '');
  await writeFile(summary, '');
  const actionInputs = Object.fromEntries(
    Object.entries(inputs).map(([name, value]) => [
      `INPUT_${name.replace(/ /gu, '_').toUpperCase()}`,
      value,
    ]),
  );
  return runCommand({
    cwd: workspace,
    command: process.execPath,
    args: [actionEntrypoint],
    env: {
      ...githubEnvironment(workspace),
      ...actionInputs,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
    },
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('real Playwright evidence workflows', () => {
  it('classifies pass, disabled, runtime skip, declared failure, retry, terminal failure, and timeout from one real report', async () => {
    const workspace = await prepareWorkspace();
    const { execution, plan, report } = await executeScope({
      workspace,
      playwrightArguments: [
        '--project=chromium',
        '--grep=(passes$|runtime skips$|passes after retry$|declared failure$|unexpected pass under declared failure$|terminal failure$|timeout$|disabled$|fixme$)',
      ],
      expectedExitCode: 1,
    });

    expect(execution.stdout).toContain('Running 9 tests using');
    expect(report).toBeDefined();
    if (report === undefined) throw new Error('expected reconciliation report');
    expect(plan.tests).toHaveLength(9);
    expect(report.counts).toMatchObject({
      plannedActive: 7,
      plannedDisabled: 2,
      executedAsExpected: 2,
      retryMasked: 1,
      failed: 3,
      runtimeSkipped: 1,
      knownTestGaps: 1,
    });
    expect(classificationByTitle(report)).toEqual({
      'declared failure': 'executed_as_expected',
      passes: 'executed_as_expected',
      'passes after retry': 'retry_masked',
      'runtime skips': 'runtime_skipped',
      'terminal failure': 'failed',
      timeout: 'failed',
      'unexpected pass under declared failure': 'failed',
    });
    for (const test of report.tests) {
      expect(test.identity.file).toBe('outcomes.spec.ts');
      expect(test.identity.line).toBeGreaterThan(0);
      expect(test.identity.column).toBeGreaterThan(0);
    }
  });

  it('reconciles two Playwright projects split across three real shards', async () => {
    const workspace = await prepareWorkspace();
    const fragments = [];
    for (let current = 1; current <= 3; current += 1) {
      fragments.push(
        await executeScope({
          workspace,
          producer: { id: 'e2e', shard: { current, total: 3 } },
          playwrightArguments: ['--grep=(passes$|parameterized)'],
          expectedExitCode: 0,
          reconcileProducers: false,
        }),
      );
    }

    expect(fragments.map((fragment) => fragment.plan.tests.length)).toEqual([
      2, 2, 2,
    ]);
    const report = await reconcileEvidence({
      workspace,
      artifacts: 'proofline',
      producers: 'e2e=3',
      mode: 'report-only',
      out: 'reconciliation.json',
      repository,
      revision,
      runId,
      runAttempt,
    });
    expect(report).toMatchObject({
      status: 'complete',
      counts: { plannedActive: 6, executedAsExpected: 6 },
    });
    expect(report.topology).toHaveLength(3);
    expect(
      new Set(report.tests.map((test) => test.identity.projectName)),
    ).toEqual(new Set(['chromium', 'firefox']));
  });

  it('preserves a config-array line reporter while collecting JSON evidence', async () => {
    const workspace = await prepareWorkspace();
    const { execution, report } = await executeScope({
      workspace,
      playwrightArguments: ['--project=chromium', '--grep=passes$'],
      expectedExitCode: 0,
      reporters: [],
      env: { PROOFLINE_CONFIG_REPORTERS: 'true' },
    });

    expect(execution.stdout).toContain('Running 1 test using 1 worker');
    expect(report).toMatchObject({
      status: 'complete',
      counts: { plannedActive: 1, executedAsExpected: 1 },
    });
  });

  it('keeps repeat-each executions as two distinct built-in identities', async () => {
    const workspace = await prepareWorkspace();
    const { plan, report } = await executeScope({
      workspace,
      playwrightArguments: ['--project=chromium', '--grep=passes$'],
      expectedExitCode: 0,
      env: { PROOFLINE_REPEAT_EACH: '2' },
    });

    expect(plan.tests).toHaveLength(2);
    expect(new Set(plan.tests.map((test) => test.identity.key)).size).toBe(2);
    expect(report).toMatchObject({
      status: 'complete',
      counts: { plannedActive: 2, executedAsExpected: 2 },
    });
  });

  it('classifies an active planned test removed from a real report as absent', async () => {
    const workspace = await prepareWorkspace();
    const { report } = await executeScope({
      workspace,
      playwrightArguments: ['--project=chromium', '--grep=passes$'],
      expectedExitCode: 0,
      beforeCollect: async (reportPath) => {
        const raw = JSON.parse(await readFile(reportPath, 'utf8')) as {
          suites: Array<{ specs?: unknown[] }>;
        };
        for (const suite of raw.suites) suite.specs = [];
        await writeFile(reportPath, `${JSON.stringify(raw)}\n`);
      },
    });

    expect(report).toMatchObject({
      status: 'evidence_gaps',
      counts: { absent: 1, knownTestGaps: 1 },
      tests: [{ classification: 'absent' }],
    });
  });

  it('preserves partial SIGINT evidence as runtime-skipped plus incomplete tests', async () => {
    const workspace = await prepareWorkspace(resultFixtureSource);
    const producer = { id: 'e2e', shard: { current: 1, total: 1 } } as const;
    const env = githubEnvironment(workspace);
    await createPlan({
      workspace,
      producer,
      playwrightArguments: 'tests/sigint.spec.ts',
      config: 'playwright.config.ts',
      repository,
      revision,
      env,
      out: 'proofline/e2e-1-of-1/plan.json',
    });
    const execution = await runCommand({
      cwd: workspace,
      command: process.execPath,
      args: [
        resolvePlaywrightCli(workspace),
        'test',
        '--config=playwright.config.ts',
        'tests/sigint.spec.ts',
        '--reporter=line,json',
      ],
      env: {
        ...env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: join(
          workspace,
          'proofline/e2e-1-of-1/report.json',
        ),
      },
      signalAfterMs: 1_500,
    });
    expect(execution.code).toBe(130);
    expect(execution.signal).toBeNull();
    expect(execution.stdout).toContain('PROOFLINE_IN_FLIGHT');
    await collectEvidence({
      workspace,
      producer,
      plan: 'proofline/e2e-1-of-1/plan.json',
      report: 'proofline/e2e-1-of-1/report.json',
      out: 'proofline/e2e-1-of-1/envelope.json',
      env,
    });
    const report = await reconcileEvidence({
      workspace,
      artifacts: 'proofline',
      producers: 'e2e=1',
      mode: 'report-only',
      out: 'reconciliation.json',
      repository,
      revision,
      runId,
      runAttempt,
    });

    expect(report.counts).toMatchObject({
      runtimeSkipped: 1,
      incomplete: 2,
      knownTestGaps: 3,
    });
    expect(classificationByTitle(report)).toEqual({
      'in flight at signal': 'incomplete',
      'never started': 'incomplete',
      'runtime skip before signal': 'runtime_skipped',
    });
  });

  it('writes a diagnostic envelope and report for a real project selection mismatch', async () => {
    const workspace = await prepareWorkspace();
    const producer = { id: 'e2e', shard: { current: 1, total: 1 } } as const;
    const env = githubEnvironment(workspace);
    await createPlan({
      workspace,
      producer,
      playwrightArguments: '--project=chromium\n--grep=passes$',
      config: 'playwright.config.ts',
      repository,
      revision,
      env,
      out: 'proofline/e2e-1-of-1/plan.json',
    });
    const execution = await runCommand({
      cwd: workspace,
      command: process.execPath,
      args: [
        resolvePlaywrightCli(workspace),
        'test',
        '--config=playwright.config.ts',
        '--project=firefox',
        '--grep=passes$',
        '--reporter=json',
      ],
      env: {
        ...env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: join(
          workspace,
          'proofline/e2e-1-of-1/report.json',
        ),
      },
    });
    expect(execution.code).toBe(0);
    await expect(
      collectEvidence({
        workspace,
        producer,
        plan: 'proofline/e2e-1-of-1/plan.json',
        report: 'proofline/e2e-1-of-1/report.json',
        out: 'proofline/e2e-1-of-1/envelope.json',
        env,
      }),
    ).rejects.toThrow('selection_mismatch');
    const envelope = JSON.parse(
      await readFile(
        join(workspace, 'proofline/e2e-1-of-1/envelope.json'),
        'utf8',
      ),
    ) as { selectionCheck: { status: string; differences: unknown[] } };
    expect(envelope.selectionCheck).toMatchObject({
      status: 'mismatch',
      differences: [{ field: 'cli' }],
    });
    const report = await reconcileEvidence({
      workspace,
      artifacts: 'proofline',
      producers: 'e2e=1',
      mode: 'report-only',
      out: 'reconciliation.json',
      repository,
      revision,
      runId,
      runAttempt,
    });
    expect(report).toMatchObject({
      status: 'tool_error',
      exitDecision: { code: 2, reasonCodes: ['selection_mismatch'] },
    });
  });

  it('fails closed before spawning when Playwright is absent from the consumer', async () => {
    const workspace = await prepareWorkspace(fixtureSource, false);
    await expect(
      createPlan({
        workspace,
        producer: { id: 'e2e', shard: { current: 1, total: 1 } },
        playwrightArguments: '',
        config: 'playwright.config.ts',
        repository,
        revision,
        env: githubEnvironment(workspace),
        out: 'proofline/plan.json',
      }),
    ).rejects.toThrow(`cannot resolve @playwright/test/cli from ${workspace}`);
  });

  it('runs the bundled action against a consumer that installs no Proofline package', async () => {
    const workspace = await prepareWorkspace(consumerFixtureSource);
    const consumerPackage = JSON.parse(
      await readFile(join(workspace, 'package.json'), 'utf8'),
    ) as unknown;
    expect(JSON.stringify(consumerPackage)).not.toContain('@proofline/');

    const plan = await runBundledAction(workspace, {
      operation: 'plan',
      producer: 'e2e',
      shard: '1/1',
      'playwright-args': '--project=chromium',
      config: 'playwright.config.ts',
      repository,
      revision,
      out: 'proofline/plan.json',
    });
    expect(plan.code, plan.stderr || plan.stdout).toBe(0);

    const execution = await runCommand({
      cwd: workspace,
      command: process.execPath,
      args: [
        resolvePlaywrightCli(workspace),
        'test',
        '--config=playwright.config.ts',
        '--project=chromium',
        '--reporter=line,json',
      ],
      env: {
        ...githubEnvironment(workspace),
        PLAYWRIGHT_JSON_OUTPUT_FILE: join(workspace, 'proofline/report.json'),
      },
    });
    expect(execution.code, execution.stderr || execution.stdout).toBe(0);

    const collect = await runBundledAction(workspace, {
      operation: 'collect',
      producer: 'e2e',
      shard: '1/1',
      report: 'proofline/report.json',
      plan: 'proofline/plan.json',
      out: 'proofline/envelope.json',
    });
    expect(collect.code, collect.stderr || collect.stdout).toBe(0);

    const reconcile = await runBundledAction(workspace, {
      operation: 'reconcile',
      producers: 'e2e=1',
      artifacts: 'proofline',
      mode: 'report-only',
      out: 'reconciliation.json',
      summary: 'false',
    });
    expect(reconcile.code, reconcile.stderr || reconcile.stdout).toBe(0);
    const report = JSON.parse(
      await readFile(join(workspace, 'reconciliation.json'), 'utf8'),
    ) as { status: string; counts: { executedAsExpected: number } };
    expect(report).toMatchObject({
      status: 'complete',
      counts: { executedAsExpected: 1 },
    });
  });
});
