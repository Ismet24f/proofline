import type {
  PlanArtifact,
  ReconciliationReport,
  ResultEnvelope,
} from '@proofline/evidence-model';
import { describe, expect, it, vi } from 'vitest';

import {
  type ActionRuntime,
  type ActionsPort,
  type DomainOperations,
  dispatchAction,
} from './main.js';

const revision = 'a'.repeat(40);
const producer = { id: 'e2e', shard: { current: 1, total: 1 } } as const;

class TestPort implements ActionsPort {
  readonly outputs = new Map<string, string | number>();
  readonly failures: string[] = [];
  readonly summaries: string[] = [];

  constructor(private readonly inputs: Readonly<Record<string, string>>) {}

  getInput(name: string, options?: { required?: boolean }): string {
    const value = this.inputs[name] ?? '';
    if (options?.required === true && value.length === 0) {
      throw new Error(`missing ${name}`);
    }
    return value;
  }

  setOutput(name: string, value: string | number): void {
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

function plan(): PlanArtifact {
  return {
    schemaVersion: 1,
    repository: 'acme/checkout',
    revision,
    producer,
    selection: {
      configFile: 'playwright.config.ts',
      rootDir: 'tests',
      playwrightVersion: '1.62.1',
      shard: producer.shard,
      cli: [],
      configuredProjects: ['chromium'],
    },
    generatedAt: '2026-01-01T00:00:00.000Z',
    tests: [
      {
        identity: {
          key: '["chromium","test-id"]',
          projectName: 'chromium',
          playwrightTestId: 'test-id',
          file: 'checkout.spec.ts',
          line: 1,
          column: 1,
          titlePath: ['checkout'],
        },
        expectedStatus: 'passed',
      },
    ],
    digest: 'b'.repeat(64),
  };
}

function envelope(): ResultEnvelope {
  return {
    schemaVersion: 1,
    repository: 'acme/checkout',
    revision,
    runId: '123',
    runAttempt: 1,
    producer,
    planDigest: 'b'.repeat(64),
    reportPath: 'report.json',
    reportDigest: 'c'.repeat(64),
    collectedAt: '2026-01-01T00:01:00.000Z',
    selectionCheck: { status: 'match' },
  };
}

function reconciliation(exitCode: 0 | 1 | 2): ReconciliationReport {
  const toolError = exitCode === 2;
  const gap = exitCode === 1;
  return {
    schemaVersion: 1,
    toolVersion: '0.1.0',
    repository: 'acme/checkout',
    revision,
    runId: '123',
    runAttempt: 1,
    mode: gap ? 'enforce-evidence' : 'report-only',
    generatedAt: '2026-01-01T00:02:00.000Z',
    evaluatedAt: '2026-01-01T00:02:00.000Z',
    manifest: { schemaVersion: 1, producers: [producer] },
    topology: [
      {
        producer,
        status: toolError ? 'invalid' : gap ? 'missing' : 'received',
        reasonCodes: toolError
          ? ['selection_mismatch']
          : gap
            ? ['producer_plan_missing']
            : [],
      },
    ],
    tests: [],
    unexpectedTests: [],
    counts: {
      plannedActive: 7,
      plannedDisabled: 2,
      executedAsExpected: 0,
      retryMasked: 3,
      failed: 4,
      runtimeSkipped: 0,
      incomplete: 0,
      absent: 0,
      noEvidence: 0,
      producerGaps: gap || toolError ? 1 : 0,
      knownTestGaps: 5,
      notExecuted: 5,
      unexpected: 6,
      toolErrors: toolError ? 1 : 0,
    },
    status: toolError ? 'tool_error' : gap ? 'evidence_gaps' : 'complete',
    exitDecision: {
      code: exitCode,
      reasonCodes: toolError
        ? ['selection_mismatch']
        : gap
          ? ['known_test_gap']
          : [],
    },
  };
}

function harness(result = reconciliation(0)) {
  const operations: DomainOperations = {
    createPlan: vi.fn(() => Promise.resolve(plan())),
    collectEvidence: vi.fn(() => Promise.resolve(envelope())),
    reconcileEvidence: vi.fn(() => Promise.resolve(result)),
    renderGitHubSummary: vi.fn(() => 'rendered summary'),
  };
  const exitCodes: number[] = [];
  const runtime: ActionRuntime = {
    env: {
      GITHUB_WORKSPACE: '/workspace',
      GITHUB_REPOSITORY: 'acme/checkout',
      GITHUB_SHA: revision,
      GITHUB_RUN_ID: '123',
      GITHUB_RUN_ATTEMPT: '1',
    },
    nodeVersion: '24.20.0',
    setExitCode: (code) => exitCodes.push(code),
  };
  return { operations, runtime, exitCodes };
}

describe('dispatchAction', () => {
  it('dispatches plan exactly once and maps its count output', async () => {
    const port = new TestPort({ operation: 'plan', producer: 'e2e' });
    const { operations, runtime } = harness();

    await dispatchAction(port, operations, runtime);

    expect(operations.createPlan).toHaveBeenCalledOnce();
    expect(operations.collectEvidence).not.toHaveBeenCalled();
    expect(operations.reconcileEvidence).not.toHaveBeenCalled();
    expect(port.outputs.get('planned-active')).toBe(1);
  });

  it('dispatches collect exactly once', async () => {
    const port = new TestPort({
      operation: 'collect',
      producer: 'e2e',
      report: 'proofline/report.json',
    });
    const { operations, runtime } = harness();

    await dispatchAction(port, operations, runtime);

    expect(operations.collectEvidence).toHaveBeenCalledOnce();
    expect(operations.createPlan).not.toHaveBeenCalled();
    expect(operations.reconcileEvidence).not.toHaveBeenCalled();
  });

  it('maps every reconcile count and writes its summary', async () => {
    const port = new TestPort({
      operation: 'reconcile',
      producers: 'e2e=1',
      artifacts: 'artifacts',
    });
    const { operations, runtime } = harness();

    await dispatchAction(port, operations, runtime);

    expect(operations.reconcileEvidence).toHaveBeenCalledOnce();
    expect(port.outputs).toEqual(
      new Map<string, string | number>([
        ['status', 'complete'],
        ['planned-active', 7],
        ['producer-gaps', 0],
        ['known-test-gaps', 5],
        ['not-executed', 5],
        ['retry-masked', 3],
        ['failed', 4],
        ['unexpected', 6],
        ['selection-mismatch', 'false'],
        ['report-path', 'proofline-reconciliation.json'],
      ]),
    );
    expect(port.summaries).toEqual(['rendered summary']);
  });

  it('uses exit 1 without setFailed for product evidence gaps', async () => {
    const port = new TestPort({
      operation: 'reconcile',
      producers: 'e2e=1',
      artifacts: 'artifacts',
      mode: 'enforce-evidence',
    });
    const { operations, runtime, exitCodes } = harness(reconciliation(1));

    await dispatchAction(port, operations, runtime);

    expect(exitCodes).toEqual([1]);
    expect(port.failures).toEqual([]);
  });

  it('uses setFailed and exit 2 for tool errors', async () => {
    const port = new TestPort({
      operation: 'reconcile',
      producers: 'e2e=1',
      artifacts: 'artifacts',
    });
    const { operations, runtime, exitCodes } = harness(reconciliation(2));

    await dispatchAction(port, operations, runtime);

    expect(exitCodes).toEqual([2]);
    expect(port.failures).toEqual(['selection_mismatch']);
    expect(port.outputs.get('selection-mismatch')).toBe('true');
  });
});
