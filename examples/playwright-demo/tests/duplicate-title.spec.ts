import { appendFileSync } from 'node:fs';

import { test } from '@playwright/test';

test('duplicate human-readable title', () => {
  const marker = process.env['PROOFLINE_EXECUTION_MARKER'];
  if (marker) appendFileSync(marker, 'executed\n');
});
