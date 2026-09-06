import type { Classification } from '@proofline/evidence-model';

import type { PlaywrightTest } from './playwright-json.js';

export function deriveObservedOutcome(test: PlaywrightTest): Classification {
  if (test.status === 'expected') {
    return 'executed_as_expected';
  }
  if (test.status === 'skipped') {
    return 'runtime_skipped';
  }
  if (test.status === 'flaky') {
    return 'retry_masked';
  }
  throw new Error(
    `unsupported Playwright outcome in thin slice: ${test.status}`,
  );
}
