import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 1,
  repeatEach: process.env.PROOFLINE_REPEAT_EACH === '2' ? 2 : 1,
  reporter:
    process.env.PROOFLINE_CONFIG_REPORTERS === 'true'
      ? [['line'], ['json']]
      : undefined,
  projects: [{ name: 'chromium' }, { name: 'firefox' }],
});
