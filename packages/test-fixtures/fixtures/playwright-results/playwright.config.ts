import { defineConfig } from '@playwright/test';

if (process.env.PROOFLINE_DELAY_COMPILE === 'true') {
  process.stdout.write('PROOFLINE_COMPILING\n');
  await new Promise((resolve) => setTimeout(resolve, 60_000));
}

export default defineConfig({
  testDir: './tests',
  workers: 1,
  retries: 1,
  projects: [{ name: 'chromium' }],
});
