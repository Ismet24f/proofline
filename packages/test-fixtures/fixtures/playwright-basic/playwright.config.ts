import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  retries: 1,
  projects: [{ name: 'chromium' }, { name: 'firefox' }],
});
