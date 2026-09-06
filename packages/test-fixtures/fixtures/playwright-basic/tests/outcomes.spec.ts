import { expect, test } from '@playwright/test';

test('passes', () => {
  expect(true).toBe(true);
});

test('runtime skips', () => {
  test.skip();
});

test('passes after retry', () => {
  expect(test.info().retry).toBe(1);
});

test.skip('is statically disabled', () => {
  expect(true).toBe(false);
});
