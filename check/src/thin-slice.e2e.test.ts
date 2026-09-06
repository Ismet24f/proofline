import { spawnSync } from 'node:child_process';
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

import { afterEach, describe, expect, it } from 'vitest';

import {
  dispatchAction,
  type ActionRuntime,
  type ActionsPort,
} from './main.js';

const checkRoot = fileURLToPath(new URL('../', import.meta.url));
const fixtureSource = fileURLToPath(
  new URL(
    '../../packages/test-fixtures/fixtures/playwright-basic/',
    import.meta.url,
  ),
);
const revision = 'a'.repeat(40);
const temporaryDirectories: string[] = [];

type Scenario =
  | 'pass'
  | 'missing-producer'
  | 'absent'
  | 'runtime-skipped'
  | 'retry-masked'
  | 'selection-mismatch'
  | 'active-disabled';

class TestActionsPort implements ActionsPort {
  readonly outputs = new Map<string, string>();
  readonly failures: string[] = [];
  readonly summaries: string[] = [];

  constructor(private readonly inputs: Readonly<Record<string, string>>) {}

  getInput(name: string): string {
    return this.inputs[name] ?? '';
  }

  setOutput(name: string, value: string): void {
    this.outputs.set(name, value);
  }

  setFailed(message: string): void {
    this.failures.push(message);
  }

  writeSummary(markdown: string): Promise<void> {
    this.summaries.push(markdown);
    return Promise.resolve();
  }
}

function testRuntime(env: NodeJS.ProcessEnv): ActionRuntime {
  return {
    env,
    nodeVersion: process.versions.node,
    setExitCode: () => undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function removeSpecs(report: unknown): void {
  if (!isRecord(report) || !isUnknownArray(report.suites)) {
    throw new Error('expected a Playwright report with suites');
  }
  const stack = [...report.suites];
  while (stack.length > 0) {
    const suite = stack.pop();
    if (!isRecord(suite)) {
      throw new Error('expected a Playwright suite object');
    }
    suite.specs = [];
    if (isUnknownArray(suite.suites)) {
      stack.push(...suite.suites);
    }
  }
}

function collectRawTestStatuses(
  report: unknown,
): Array<{ status: unknown; expectedStatus: unknown }> {
  if (!isRecord(report) || !isUnknownArray(report.suites)) {
    throw new Error('expected a Playwright report with suites');
  }
  const statuses: Array<{ status: unknown; expectedStatus: unknown }> = [];
  const stack = [...report.suites];
  while (stack.length > 0) {
    const suite = stack.pop();
    if (!isRecord(suite)) {
      throw new Error('expected a Playwright suite object');
    }
    if (isUnknownArray(suite.specs)) {
      for (const spec of suite.specs) {
        if (!isRecord(spec) || !isUnknownArray(spec.tests)) {
          throw new Error('expected a Playwright spec with tests');
        }
        for (const test of spec.tests) {
          if (!isRecord(test)) {
            throw new Error('expected a Playwright test object');
          }
          statuses.push({
            status: test.status,
            expectedStatus: test.expectedStatus,
          });
        }
      }
    }
    if (isUnknownArray(suite.suites)) {
      stack.push(...suite.suites);
    }
  }
  return statuses;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function runSlice(options: { scenario: Scenario }): Promise<unknown> {
  const workspace = await mkdtemp(join(checkRoot, '.tmp-thin-slice-'));
  temporaryDirectories.push(workspace);
  await cp(fixtureSource, workspace, { recursive: true });
  await symlink(
    join(checkRoot, 'node_modules'),
    join(workspace, 'node_modules'),
  );

  const env = {
    ...process.env,
    GITHUB_WORKSPACE: workspace,
    GITHUB_REPOSITORY: 'acme/checkout',
    GITHUB_SHA: revision,
    GITHUB_RUN_ID: '123456789',
    GITHUB_RUN_ATTEMPT: '1',
  };
  const grepByScenario: Readonly<Record<Scenario, string>> = {
    pass: 'passes$',
    'missing-producer': 'passes$',
    absent: 'passes$',
    'runtime-skipped': 'runtime skips$',
    'retry-masked': 'passes after retry$',
    'selection-mismatch': 'passes$',
    'active-disabled': '(passes$|disabled$)',
  };
  const grep = grepByScenario[options.scenario];
  const playwrightArguments = `--project=chromium\n--grep=${grep}`;

  const reconcile = async (): Promise<unknown> => {
    const reconcilePort = new TestActionsPort({
      operation: 'reconcile',
      producers: 'e2e=1',
      artifacts: 'proofline',
      mode: 'report-only',
      out: 'reconciliation.json',
      summary: 'true',
    });
    await dispatchAction(reconcilePort, undefined, testRuntime(env));
    expect(reconcilePort.failures).toEqual([]);
    return readJson(join(workspace, 'reconciliation.json'));
  };

  if (options.scenario === 'missing-producer') {
    await mkdir(join(workspace, 'proofline'));
    return reconcile();
  }

  const planPort = new TestActionsPort({
    operation: 'plan',
    producer: 'e2e',
    shard: '1/1',
    'playwright-args': playwrightArguments,
    config: 'playwright.config.ts',
    repository: 'acme/checkout',
    revision,
  });
  await dispatchAction(planPort, undefined, testRuntime(env));
  expect(planPort.failures).toEqual([]);

  if (options.scenario === 'active-disabled') {
    const cliPath = fileURLToPath(import.meta.resolve('@playwright/test/cli'));
    const listExecution = spawnSync(
      process.execPath,
      [
        cliPath,
        'test',
        '--list',
        '--config=playwright.config.ts',
        '--project=chromium',
        `--grep=${grep}`,
        '--reporter=json',
      ],
      {
        cwd: workspace,
        encoding: 'utf8',
        env: {
          ...env,
          PLAYWRIGHT_JSON_OUTPUT_FILE: join(
            workspace,
            'proofline/raw-list.json',
          ),
        },
      },
    );
    expect(
      listExecution.status,
      listExecution.stderr || listExecution.stdout,
    ).toBe(0);
    return {
      plan: await readJson(join(workspace, 'proofline/plan.json')),
      plannedActiveOutput: planPort.outputs.get('planned-active'),
      rawStatuses: collectRawTestStatuses(
        await readJson(join(workspace, 'proofline/raw-list.json')),
      ),
    };
  }

  const cliPath = fileURLToPath(import.meta.resolve('@playwright/test/cli'));
  const execution = spawnSync(
    process.execPath,
    [
      cliPath,
      'test',
      '--config=playwright.config.ts',
      `--project=${
        options.scenario === 'selection-mismatch' ? 'firefox' : 'chromium'
      }`,
      `--grep=${grep}`,
      '--reporter=json',
    ],
    {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        ...env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: join(workspace, 'proofline/report.json'),
      },
    },
  );
  expect(execution.status, execution.stderr || execution.stdout).toBe(0);

  if (options.scenario === 'absent') {
    const report = await readJson(join(workspace, 'proofline/report.json'));
    removeSpecs(report);
    await writeFile(
      join(workspace, 'proofline/report.json'),
      `${JSON.stringify(report, undefined, 2)}\n`,
    );
  }

  const collectPort = new TestActionsPort({
    operation: 'collect',
    producer: 'e2e',
    shard: '1/1',
    report: 'proofline/report.json',
  });
  await dispatchAction(collectPort, undefined, testRuntime(env));
  if (options.scenario === 'selection-mismatch') {
    return {
      envelope: await readJson(join(workspace, 'proofline/envelope.json')),
      failures: collectPort.failures,
    };
  }
  expect(collectPort.failures).toEqual([]);
  return reconcile();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Proofline thin vertical slice', () => {
  it('reconciles one real passing Playwright test as complete', async () => {
    await expect(runSlice({ scenario: 'pass' })).resolves.toMatchObject({
      status: 'complete',
      counts: { plannedActive: 1, executedAsExpected: 1 },
    });
  });

  it('detects a planned identity removed from a real report', async () => {
    await expect(runSlice({ scenario: 'absent' })).resolves.toMatchObject({
      status: 'evidence_gaps',
      counts: { absent: 1 },
    });
  });

  it('reports a missing producer without inventing test identities', async () => {
    await expect(
      runSlice({ scenario: 'missing-producer' }),
    ).resolves.toMatchObject({
      status: 'evidence_gaps',
      topology: [
        {
          producer: { id: 'e2e', shard: { current: 1, total: 1 } },
          status: 'missing',
        },
      ],
      tests: [],
      counts: { producerGaps: 1, knownTestGaps: 0 },
    });
  });

  it('classifies a body-level conditional skip as runtime_skipped', async () => {
    await expect(
      runSlice({ scenario: 'runtime-skipped' }),
    ).resolves.toMatchObject({
      status: 'evidence_gaps',
      counts: { runtimeSkipped: 1, knownTestGaps: 1 },
      tests: [{ classification: 'runtime_skipped' }],
    });
  });

  it('classifies a fail-then-pass retry as retry_masked', async () => {
    await expect(runSlice({ scenario: 'retry-masked' })).resolves.toMatchObject(
      {
        status: 'complete',
        counts: { retryMasked: 1, knownTestGaps: 0 },
        tests: [{ classification: 'retry_masked' }],
      },
    );
  });

  it('writes selection mismatch evidence before returning a tool error', async () => {
    await expect(
      runSlice({ scenario: 'selection-mismatch' }),
    ).resolves.toMatchObject({
      envelope: {
        selectionCheck: {
          status: 'mismatch',
          differences: [{ field: 'cli' }],
        },
      },
      failures: [expect.stringContaining('selection_mismatch')],
    });
  });

  it('uses expectedStatus to preserve the list-mode active/disabled split', async () => {
    const result = await runSlice({ scenario: 'active-disabled' });
    if (
      !isRecord(result) ||
      !isRecord(result.plan) ||
      !isUnknownArray(result.plan.tests) ||
      !isUnknownArray(result.rawStatuses)
    ) {
      throw new Error('expected active-disabled scenario evidence');
    }
    const plannedStatuses = result.plan.tests.map((test) => {
      if (!isRecord(test)) {
        throw new Error('expected a planned test object');
      }
      return test.expectedStatus;
    });
    expect(plannedStatuses).toEqual(['passed', 'skipped']);
    expect(result.plannedActiveOutput).toBe(1);
    expect(result.rawStatuses).toEqual([
      { status: 'skipped', expectedStatus: 'passed' },
      { status: 'skipped', expectedStatus: 'skipped' },
    ]);
  });
});
