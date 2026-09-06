import type {
  Classification,
  PlannedExpectedStatus,
} from '@proofline/evidence-model';

import type { PlaywrightResult, PlaywrightTest } from './playwright-json.js';

export interface ObservedOutcomeInput {
  status: PlaywrightTest['status'];
  attempts: readonly PlaywrightResult['status'][];
  plannedExpectedStatus: PlannedExpectedStatus;
}

export function deriveObservedOutcome(
  test: ObservedOutcomeInput,
): Classification {
  if (test.attempts.includes('interrupted')) {
    return 'incomplete';
  }
  if (test.attempts.length === 0 && test.plannedExpectedStatus !== 'skipped') {
    return 'incomplete';
  }
  if (test.status === 'skipped') {
    return 'runtime_skipped';
  }
  if (test.status === 'expected') {
    return 'executed_as_expected';
  }
  if (test.status === 'flaky') {
    return 'retry_masked';
  }
  return 'failed';
}
