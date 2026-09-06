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

test.skip('disabled', () => {
  expect(true).toBe(false);
});

test.fixme('fixme', () => {
  expect(true).toBe(false);
});

for (const value of ['alpha', 'beta']) {
  test(`parameterized ${value}`, () => {
    expect(value.length).toBeGreaterThan(0);
  });
}
