import { appendFileSync } from 'node:fs';

import { test } from '@playwright/test';

function markExecuted(): void {
  const marker = process.env['PROOFLINE_EXECUTION_MARKER'];
  if (marker) appendFileSync(marker, 'executed\n');
}

test(
  'discovers annotated checkout',
  {
    tag: '@critical',
    annotation: [
      { type: 'proofline.id', description: 'PL-T-00001' },
      { type: 'proofline.capability', description: 'checkout' },
      { type: 'proofline.risk', description: 'payment-loss' },
      { type: 'proofline.requirement', description: 'REQ-CHECKOUT-1' },
    ],
  },
  () => {
    markExecuted();
  },
);

test.skip('discovers a statically skipped test', () => {
  markExecuted();
});

for (const row of [1, 2]) {
  test(`discovers parameterized row ${row}`, () => {
    markExecuted();
  });
}

test('duplicate human-readable title', () => {
  markExecuted();
});
