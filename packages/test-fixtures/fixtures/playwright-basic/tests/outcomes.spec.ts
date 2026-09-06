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
