import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { runCommand } from '../dist/index.js';

const report = process.argv[2];
if (report === undefined) {
  throw new Error('usage: node run-interrupted-playwright.mjs <report-file>');
}

const workspace = process.cwd();
const require = createRequire(resolve(workspace, 'package.json'));
const cli = require.resolve('@playwright/test/cli');
const result = await runCommand({
  cwd: workspace,
  command: process.execPath,
  args: [
    cli,
    'test',
    '--config=packages/test-fixtures/fixtures/playwright-results/playwright.config.ts',
    'packages/test-fixtures/fixtures/playwright-results/tests/sigint.spec.ts',
    '--project=chromium',
    '--reporter=line,json',
  ],
  env: {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(report),
  },
  signalAfterMs: 1_500,
});

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.code !== 130 || result.signal !== null) {
  throw new Error(
    `expected Playwright exit code 130 without a terminating signal; received code=${String(result.code)} signal=${String(result.signal)}`,
  );
}
if (!result.stdout.includes('PROOFLINE_IN_FLIGHT')) {
  throw new Error(
    'Playwright was interrupted before the in-flight test started',
  );
}
