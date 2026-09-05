import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  metadata: {
    proofline: {
      repository: 'proofline/playwright-demo',
      revision: '0123456789abcdef0123456789abcdef01234567',
    },
  },
  projects: [{ name: 'chromium' }, { name: 'firefox' }],
});
