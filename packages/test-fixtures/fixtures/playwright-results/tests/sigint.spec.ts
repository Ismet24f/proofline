import { expect, test } from '@playwright/test';

test('runtime skip before signal', () => {
  test.skip();
});

test('in flight at signal', async () => {
  process.stdout.write('PROOFLINE_IN_FLIGHT\n');
  await new Promise((resolve) => setTimeout(resolve, 60_000));
});

test('never started', () => {
  expect(true).toBe(true);
});
