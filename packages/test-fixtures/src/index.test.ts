import { expect, test } from 'vitest';

import { fixtureMarker } from './index.js';

test('exports the deterministic fixture marker', () => {
  expect(fixtureMarker).toBe('proofline-test-fixtures');
});
