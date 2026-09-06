import * as core from '@actions/core';
import {
  ProoflineToolError,
  collectEvidence,
  createPlan,
  reconcileEvidence,
  renderGitHubSummary,
  resolveInputDirectory,
} from '@proofline/playwright-evidence';

import {
  type ActionsPort,
  assertSupportedNodeVersion,
  readActionInputs,
} from './inputs.js';

export type { ActionsPort } from './inputs.js';

export interface DomainOperations {
  createPlan: typeof createPlan;
  collectEvidence: typeof collectEvidence;
  reconcileEvidence: typeof reconcileEvidence;
  renderGitHubSummary: typeof renderGitHubSummary;
  resolveInputDirectory: typeof resolveInputDirectory;
}

export interface ActionRuntime {
  env: NodeJS.ProcessEnv;
  nodeVersion: string;
  setExitCode(code: 1 | 2): void;
}

const domainOperations: DomainOperations = {
  createPlan,
  collectEvidence,
  reconcileEvidence,
  renderGitHubSummary,
  resolveInputDirectory,
};

const processRuntime: ActionRuntime = {
  env: process.env,
  nodeVersion: process.versions.node,
  setExitCode: (code) => {
    process.exitCode = code;
  },
};

function requiredEnvironment(runtime: ActionRuntime, name: string): string {
  const value = runtime.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function environmentNumber(runtime: ActionRuntime, name: string): number {
  const value = requiredEnvironment(runtime, name);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function setReconciliationOutputs(
  port: ActionsPort,
  report: Awaited<ReturnType<typeof reconcileEvidence>>,
  reportPath: string,
): void {
  port.setOutput('status', report.status);
  port.setOutput('planned-active', report.counts.plannedActive);
  port.setOutput('producer-gaps', report.counts.producerGaps);
  port.setOutput('known-test-gaps', report.counts.knownTestGaps);
  port.setOutput('not-executed', report.counts.notExecuted);
  port.setOutput('retry-masked', report.counts.retryMasked);
  port.setOutput('failed', report.counts.failed);
  port.setOutput('unexpected', report.counts.unexpected);
  port.setOutput(
    'selection-mismatch',
    String(report.exitDecision.reasonCodes.includes('selection_mismatch')),
  );
  port.setOutput('report-path', reportPath);
}

async function dispatch(
  port: ActionsPort,
  operations: DomainOperations,
  runtime: ActionRuntime,
): Promise<void> {
  const inputs = readActionInputs(port);
  const repositoryWorkspace = requiredEnvironment(runtime, 'GITHUB_WORKSPACE');
  const workspace = await operations.resolveInputDirectory(
    repositoryWorkspace,
    inputs.workingDirectory,
  );
  if (inputs.operation === 'plan') {
    const plan = await operations.createPlan({
      workspace,
      producer: inputs.producer,
      playwrightArguments: inputs.playwrightArguments,
      ...(inputs.config === undefined ? {} : { config: inputs.config }),
      ...(inputs.repository === undefined
        ? {}
        : { repository: inputs.repository }),
      ...(inputs.revision === undefined ? {} : { revision: inputs.revision }),
      env: runtime.env,
      out: inputs.out,
    });
    port.setOutput(
      'planned-active',
      plan.tests.filter((test) => test.expectedStatus !== 'skipped').length,
    );
    return;
  }
  if (inputs.operation === 'collect') {
    await operations.collectEvidence({
      workspace,
      producer: inputs.producer,
      report: inputs.report,
      plan: inputs.plan,
      out: inputs.out,
      env: runtime.env,
    });
    return;
  }

  const report = await operations.reconcileEvidence({
    workspace,
    artifacts: inputs.artifacts,
    producers: inputs.producers,
    mode: inputs.mode,
    out: inputs.out,
    repository: requiredEnvironment(runtime, 'GITHUB_REPOSITORY'),
    revision: requiredEnvironment(runtime, 'GITHUB_SHA'),
    runId: requiredEnvironment(runtime, 'GITHUB_RUN_ID'),
    runAttempt: environmentNumber(runtime, 'GITHUB_RUN_ATTEMPT'),
  });
  setReconciliationOutputs(port, report, inputs.out);
  if (inputs.summary) {
    await port.writeSummary(operations.renderGitHubSummary(report));
  }
  if (report.exitDecision.code === 1) runtime.setExitCode(1);
  if (report.exitDecision.code === 2) {
    port.setFailed(report.exitDecision.reasonCodes.join(', '));
    runtime.setExitCode(2);
  }
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ProoflineToolError) return error.code;
  if (!(error instanceof Error)) return 'unknown Proofline error';
  if (
    /^(Input required|unsupported operation|invalid |unsafe path|input is not a directory|input symlink escapes workspace|GITHUB_|Proofline requires)/u.test(
      error.message,
    )
  ) {
    return error.message;
  }
  return 'Proofline tool error';
}

export async function dispatchAction(
  port: ActionsPort,
  operations: DomainOperations = domainOperations,
  runtime: ActionRuntime = processRuntime,
): Promise<void> {
  try {
    assertSupportedNodeVersion(runtime.nodeVersion);
    await dispatch(port, operations, runtime);
  } catch (error) {
    port.setFailed(safeErrorMessage(error));
    runtime.setExitCode(2);
  }
}

const corePort: ActionsPort = {
  getInput: (name, options) => core.getInput(name, options),
  setOutput: (name, value) => {
    core.setOutput(name, value);
  },
  setFailed: (message) => {
    core.setFailed(message);
  },
  writeSummary: async (markdown) => {
    await core.summary.addRaw(markdown).write();
  },
};

export async function runDefaultAction(): Promise<void> {
  await dispatchAction(corePort);
}
