import {
  collectEvidence,
  createPlan,
  reconcileEvidence,
  renderThinSummary,
} from '@proofline/playwright-evidence';

import {
  type ActionsPort,
  producerFrom,
  reconciliationMode,
  requiredInput,
} from './inputs.js';

export type { ActionsPort } from './inputs.js';

function workspace(port: ActionsPort): string {
  const value = port.env.GITHUB_WORKSPACE;
  if (value === undefined || value.length === 0) {
    throw new Error('GITHUB_WORKSPACE is required');
  }
  return value;
}

function environmentNumber(port: ActionsPort, name: string): number {
  const value = port.env[name];
  const parsed = Number(value);
  if (value === undefined || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

async function dispatch(port: ActionsPort): Promise<void> {
  const operation = requiredInput(port, 'operation');
  if (operation === 'plan') {
    const plan = await createPlan({
      workspace: workspace(port),
      producer: producerFrom(port),
      playwrightArguments: port.getInput('playwright-args'),
      ...(port.getInput('config').length === 0
        ? {}
        : { config: port.getInput('config') }),
      ...(port.getInput('repository').length === 0
        ? {}
        : { repository: port.getInput('repository') }),
      ...(port.getInput('revision').length === 0
        ? {}
        : { revision: port.getInput('revision') }),
      env: port.env,
      out: port.getInput('out') || 'proofline/plan.json',
    });
    port.setOutput(
      'planned-active',
      String(
        plan.tests.filter((test) => test.expectedStatus !== 'skipped').length,
      ),
    );
    return;
  }

  if (operation === 'collect') {
    await collectEvidence({
      workspace: workspace(port),
      producer: producerFrom(port),
      report: requiredInput(port, 'report'),
      plan: port.getInput('plan') || 'proofline/plan.json',
      out: port.getInput('out') || 'proofline/envelope.json',
      env: port.env,
    });
    return;
  }

  if (operation === 'reconcile') {
    const report = await reconcileEvidence({
      workspace: workspace(port),
      artifacts: requiredInput(port, 'artifacts'),
      producers: requiredInput(port, 'producers'),
      mode: reconciliationMode(port.getInput('mode')),
      out: port.getInput('out') || 'proofline-reconciliation.json',
      repository: requiredEnvironment(port, 'GITHUB_REPOSITORY'),
      revision: requiredEnvironment(port, 'GITHUB_SHA'),
      runId: requiredEnvironment(port, 'GITHUB_RUN_ID'),
      runAttempt: environmentNumber(port, 'GITHUB_RUN_ATTEMPT'),
    });
    port.setOutput('status', report.status);
    port.setOutput('planned-active', String(report.counts.plannedActive));
    port.setOutput('producer-gaps', String(report.counts.producerGaps));
    port.setOutput('known-test-gaps', String(report.counts.knownTestGaps));
    port.setOutput('not-executed', String(report.counts.notExecuted));
    port.setOutput('retry-masked', String(report.counts.retryMasked));
    port.setOutput('failed', String(report.counts.failed));
    port.setOutput('unexpected', String(report.counts.unexpected));
    port.setOutput(
      'report-path',
      port.getInput('out') || 'proofline-reconciliation.json',
    );
    if (port.getInput('summary') !== 'false') {
      port.appendSummary(renderThinSummary(report));
    }
    if (report.exitDecision.code !== 0) {
      port.setFailed(report.exitDecision.reasonCodes.join(', '));
    }
    return;
  }

  throw new Error(`unsupported operation: ${operation}`);
}

function requiredEnvironment(port: ActionsPort, name: string): string {
  const value = port.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export async function dispatchAction(port: ActionsPort): Promise<void> {
  try {
    await dispatch(port);
  } catch (error) {
    port.setFailed(
      error instanceof Error ? error.message : 'unknown Proofline error',
    );
  }
}
