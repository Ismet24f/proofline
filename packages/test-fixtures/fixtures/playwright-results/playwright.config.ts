import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  retries: 1,
  projects: [{ name: 'chromium' }],
});
