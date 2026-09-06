import { expect, test } from '@playwright/test';

test('pass', () => {
  expect(true).toBe(true);
});

test('declared failure', () => {
  test.fail();
  expect(false).toBe(true);
});

test('unexpected pass under declared failure', () => {
  test.fail();
  expect(true).toBe(true);
});

test('terminal failure', () => {
  expect(false).toBe(true);
});

test('timeout', async () => {
  test.setTimeout(50);
  await new Promise((resolve) => setTimeout(resolve, 500));
});

test('runtime skip', () => {
  test.skip();
});

test.skip('static skip', () => {
  expect(false).toBe(true);
});

test('retry pass', () => {
  expect(test.info().retry).toBe(1);
});
