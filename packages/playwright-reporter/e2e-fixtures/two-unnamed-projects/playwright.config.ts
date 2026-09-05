import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.pw.ts',
  metadata: {
    proofline: {
      repository: 'proofline/two-unnamed-projects',
      revision: '0123456789abcdef0123456789abcdef01234567',
    },
  },
  projects: [{}, {}],
});
